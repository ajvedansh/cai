import json
from redis.asyncio import Redis

from app.core.config import Settings
from app.core.logging import get_logger
from app.models.events import TradeCallCreatedEvent, NeedsReviewEvent

logger = get_logger(__name__)


class RedisStreamPublisher:
    """Publishes structured events to Redis Streams."""

    def __init__(self, redis_client: Redis, settings: Settings) -> None:
        self._redis = redis_client
        self._stream_trade_call = settings.stream_trade_call_created
        self._stream_needs_review = settings.stream_needs_review

    async def publish_trade_call_created(self, event: TradeCallCreatedEvent) -> str:
        """
        Publish a trade_call.created event to the trade call stream.

        Returns:
            The Redis message ID assigned to the published message.
        """
        payload = event.model_dump_json()
        msg_id: bytes = await self._redis.xadd(
            self._stream_trade_call,
            {"event": payload},
        )
        result = msg_id.decode() if isinstance(msg_id, bytes) else str(msg_id)
        logger.info(
            "published_trade_call_created",
            stream=self._stream_trade_call,
            msg_id=result,
            instrument=event.payload.instrument,
        )
        return result

    async def publish_needs_review(self, event: NeedsReviewEvent) -> str:
        """
        Publish a message.needs_review event to the review stream.

        Returns:
            The Redis message ID assigned to the published message.
        """
        payload = event.model_dump_json()
        msg_id: bytes = await self._redis.xadd(
            self._stream_needs_review,
            {"event": payload},
        )
        result = msg_id.decode() if isinstance(msg_id, bytes) else str(msg_id)
        logger.info(
            "published_needs_review",
            stream=self._stream_needs_review,
            msg_id=result,
            reason=event.payload.reason,
        )
        return result

    async def get_stream_info(self) -> dict:
        """Return lengths of both output streams for health/status checks."""
        try:
            trade_call_len = await self._redis.xlen(self._stream_trade_call)
            needs_review_len = await self._redis.xlen(self._stream_needs_review)
            return {
                "trade_call_created_stream_length": trade_call_len,
                "needs_review_stream_length": needs_review_len,
            }
        except Exception as exc:
            logger.error("get_stream_info_error", error=str(exc))
            return {
                "trade_call_created_stream_length": -1,
                "needs_review_stream_length": -1,
                "error": str(exc),
            }
