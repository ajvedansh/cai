import asyncio
import json
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import ResponseError

from app.core.config import Settings
from app.core.logging import get_logger
from app.models.events import (
    MessageReceivedEvent,
    TradeCallCreatedEvent,
    TradeCallCreatedPayload,
    NeedsReviewEvent,
    NeedsReviewPayload,
)
from app.queue.publisher import RedisStreamPublisher
from app.services.parser import SignalParser

logger = get_logger(__name__)

MAX_RETRIES = 3


class RedisStreamConsumer:
    """
    Async consumer for the cai:message.received Redis Stream.

    Reads messages from the consumer group, calls SignalParser,
    and routes results to the appropriate output stream.
    """

    def __init__(
        self,
        redis_client: Redis,
        settings: Settings,
        parser: SignalParser,
        publisher: RedisStreamPublisher,
    ) -> None:
        self._redis = redis_client
        self._settings = settings
        self._parser = parser
        self._publisher = publisher
        self._stream = settings.stream_message_received
        self._group = settings.consumer_group
        self._consumer_name = settings.consumer_name
        self._running = False

    async def _ensure_consumer_group(self) -> None:
        """Create the consumer group if it does not already exist."""
        try:
            await self._redis.xgroup_create(
                self._stream,
                self._group,
                id="$",
                mkstream=True,
            )
            logger.info(
                "consumer_group_created",
                stream=self._stream,
                group=self._group,
            )
        except ResponseError as exc:
            if "BUSYGROUP" in str(exc):
                logger.info(
                    "consumer_group_already_exists",
                    stream=self._stream,
                    group=self._group,
                )
            else:
                raise

    async def _process_message(
        self,
        stream_msg_id: str,
        fields: dict[str, Any],
    ) -> None:
        """Parse one stream message and route the result."""
        try:
            raw_event_str = fields.get("event", "{}")
            event_data = json.loads(raw_event_str)
            event = MessageReceivedEvent(**event_data)
            payload = event.payload

            result = await self._parser.parse(
                raw_text=payload.raw_text,
                raw_message_id=payload.raw_message_id,
                source_channel=payload.source_channel,
            )

            if result.is_complete and result.trade_call is not None:
                tc = result.trade_call
                # Full parsed snapshot — stored verbatim on the TradeCall document
                parsed_data: dict = {
                    "instrument": tc.instrument,
                    "segment": tc.segment.value,
                    "direction": tc.direction.value,
                    "entry_price": tc.entry_price,
                    "stop_loss": tc.stop_loss,
                    "targets": tc.targets,
                    "target_split": tc.target_split,
                    "trailing_sl": tc.trailing_sl,
                    "risk_pct": tc.risk_pct,
                    "confidence": tc.confidence,
                    "missing_fields": list(tc.missing_fields) if tc.missing_fields else [],
                    "model_version": self._parser.model_version,
                    "parsed_at": datetime.now(timezone.utc).isoformat(),
                }
                trade_event = TradeCallCreatedEvent(
                    payload=TradeCallCreatedPayload(
                        raw_message_id=payload.raw_message_id,
                        source_channel=payload.source_channel,
                        instrument=tc.instrument,
                        segment=tc.segment.value,
                        direction=tc.direction.value,
                        entry_price=tc.entry_price,
                        stop_loss=tc.stop_loss,
                        targets=tc.targets,
                        target_split=tc.target_split,
                        trailing_sl=tc.trailing_sl,
                        risk_pct=tc.risk_pct,
                        confidence=tc.confidence,
                        model_version=self._parser.model_version,
                        parsed_data=parsed_data,
                    )
                )
                await self._publisher.publish_trade_call_created(trade_event)
            elif result.reason != "not_a_trade_signal":
                # Partial parse or low confidence → review queue (with extracted data)
                review_event = NeedsReviewEvent(
                    payload=NeedsReviewPayload(
                        raw_message_id=payload.raw_message_id,
                        source_channel=payload.source_channel,
                        raw_text=payload.raw_text,
                        confidence=result.confidence,
                        reason=result.reason or "unknown",
                        partial_fields=result.partial_fields,
                    )
                )
                await self._publisher.publish_needs_review(review_event)
            # else: not_a_trade_signal → discard silently (ACK without publishing)

        except Exception as exc:
            logger.error(
                "message_processing_error",
                stream_msg_id=stream_msg_id,
                error=str(exc),
            )
            # Still ACK so the message is not retried indefinitely
            # (dead-letter handling could be added here)

        finally:
            await self._redis.xack(self._stream, self._group, stream_msg_id)
            logger.debug("message_acked", stream_msg_id=stream_msg_id)

    async def start(self) -> None:
        """Blocking consumer loop. Call `stop()` from another coroutine to exit."""
        await self._ensure_consumer_group()
        self._running = True
        logger.info(
            "consumer_started",
            stream=self._stream,
            group=self._group,
            consumer=self._consumer_name,
        )

        while self._running:
            try:
                messages = await self._redis.xreadgroup(
                    groupname=self._group,
                    consumername=self._consumer_name,
                    streams={self._stream: ">"},
                    count=10,
                    block=2000,  # ms
                )

                if not messages:
                    continue

                for _stream_name, entries in messages:
                    for msg_id, fields in entries:
                        msg_id_str = (
                            msg_id.decode() if isinstance(msg_id, bytes) else msg_id
                        )
                        decoded_fields = {
                            (k.decode() if isinstance(k, bytes) else k): (
                                v.decode() if isinstance(v, bytes) else v
                            )
                            for k, v in fields.items()
                        }
                        await self._process_message(msg_id_str, decoded_fields)

            except asyncio.CancelledError:
                logger.info("consumer_cancelled")
                break
            except Exception as exc:
                logger.error("consumer_loop_error", error=str(exc))
                await asyncio.sleep(1)  # Brief back-off before retrying

        logger.info("consumer_stopped")

    def stop(self) -> None:
        """Signal the consumer loop to exit after the current batch."""
        self._running = False
        logger.info("consumer_stop_requested")


async def create_redis_client(redis_url: str) -> Redis:
    """Create and return a connected async Redis client."""
    import redis.asyncio as aioredis

    is_tls = redis_url.startswith("rediss://")
    client: Redis = aioredis.from_url(
        redis_url,
        decode_responses=False,
        socket_connect_timeout=15,
        socket_timeout=15,
        # Upstash TLS certificates are valid but from Docker the chain
        # may not verify — skip hostname check to avoid startup hang.
        ssl_cert_reqs="none" if is_tls else None,
    )
    # Ping with a hard timeout so startup never hangs forever
    await asyncio.wait_for(client.ping(), timeout=20)
    logger.info("redis_connected", url=redis_url.split("@")[-1])
    return client
