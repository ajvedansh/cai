from fastapi import APIRouter, Request, Response
from redis.asyncio import Redis

from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Liveness check")
async def health(request: Request) -> dict:
    """Return service status and Redis connectivity."""
    redis_status = "error"
    try:
        redis_client: Redis = request.app.state.redis
        await redis_client.ping()
        redis_status = "connected"
    except Exception as exc:
        logger.warning("health_check_redis_error", error=str(exc))

    return {
        "status": "ok",
        "service": "signal-parser-service",
        "version": "1.0.0",
        "redis": redis_status,
    }


@router.get("/health/ready", summary="Readiness check")
async def readiness(request: Request, response: Response) -> dict:
    """Return 200 if Redis is reachable, 503 otherwise."""
    try:
        redis_client: Redis = request.app.state.redis
        await redis_client.ping()
        return {"status": "ready"}
    except Exception as exc:
        logger.warning("readiness_check_failed", error=str(exc))
        response.status_code = 503
        return {"status": "not_ready", "error": str(exc)}
