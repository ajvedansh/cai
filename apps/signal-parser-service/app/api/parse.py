import uuid

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from typing import Optional

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.models.trade_call import ParseRequest, ParseResponse
from app.queue.publisher import RedisStreamPublisher
from app.services.parser import SignalParser

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/parse", tags=["Parse"])


def _verify_api_key(
    x_api_key: Optional[str] = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    """Simple static API key check."""
    if x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@router.post(
    "/test",
    response_model=ParseResponse,
    summary="Manually parse a trade signal",
    description=(
        "Submit raw signal text and receive the structured ParsedTradeCall "
        "or a needs_review response. Useful for local testing without Redis."
    ),
)
async def parse_test(
    body: ParseRequest,
    request: Request,
    _: None = Depends(_verify_api_key),
) -> ParseResponse:
    parser: SignalParser = request.app.state.parser
    raw_message_id = body.raw_message_id or str(uuid.uuid4())

    result = await parser.parse(
        raw_text=body.raw_text,
        raw_message_id=raw_message_id,
        source_channel=body.source_channel,
    )

    if result.is_complete and result.trade_call is not None:
        return ParseResponse(
            success=True,
            data=result.trade_call,
            needs_review=False,
            reason=None,
            confidence=result.confidence,
            model_version=parser.model_version,
        )
    else:
        return ParseResponse(
            success=False,
            data=result.trade_call,       # partial data included even for review
            needs_review=result.reason != "not_a_trade_signal",
            reason=result.reason,
            confidence=result.confidence,
            model_version=parser.model_version,
        )


@router.get(
    "/queue-status",
    summary="Stream length info",
    description="Returns the current length of the input and output Redis Streams.",
)
async def queue_status(
    request: Request,
    _: None = Depends(_verify_api_key),
) -> dict:
    from redis.asyncio import Redis

    redis_client: Redis = request.app.state.redis
    settings: Settings = get_settings()

    try:
        input_len = await redis_client.xlen(settings.stream_message_received)
        group_info_raw = await redis_client.xinfo_groups(settings.stream_message_received)
        group_info = []
        for g in group_info_raw:
            # Redis returns bytes; decode for JSON serialisation
            decoded = {
                (k.decode() if isinstance(k, bytes) else k): (
                    v.decode() if isinstance(v, bytes) else v
                )
                for k, v in g.items()
            }
            group_info.append(decoded)
    except Exception:
        input_len = -1
        group_info = []

    publisher: RedisStreamPublisher = request.app.state.publisher
    output_info = await publisher.get_stream_info()

    return {
        "input_stream": {
            "name": settings.stream_message_received,
            "length": input_len,
            "consumer_groups": group_info,
        },
        "output_streams": output_info,
    }
