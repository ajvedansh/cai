import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.queue.consumer import RedisStreamConsumer, create_redis_client
from app.queue.publisher import RedisStreamPublisher
from app.services.parser import SignalParser
from app.services.provider_factory import create_llm_provider
from app.api import health as health_router_module
from app.api import parse as parse_router_module

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    settings = get_settings()
    configure_logging(settings.app_env)
    logger.info(
        "service_starting",
        env=settings.app_env,
        port=settings.port,
        llm=settings.active_model_name,
    )

    llm_provider = create_llm_provider(settings)
    redis_client = await create_redis_client(settings.redis_url)
    publisher = RedisStreamPublisher(redis_client, settings)
    parser = SignalParser(settings, llm_provider)
    consumer = RedisStreamConsumer(redis_client, settings, parser, publisher)

    app.state.redis = redis_client
    app.state.publisher = publisher
    app.state.parser = parser
    app.state.consumer = consumer

    task = asyncio.create_task(consumer.start())
    app.state.task = task

    logger.info("service_ready")

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────────
    logger.info("service_shutting_down")
    consumer.stop()
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    await redis_client.aclose()
    logger.info("service_stopped")


app = FastAPI(
    title="CAI Signal Parser Service",
    description=(
        "Parses raw trade signal messages from social channels into structured "
        "TradeCall JSON using a configurable LLM (Ollama/local or Anthropic Claude)."
    ),
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("unhandled_exception", path=str(request.url), error=str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(health_router_module.router)
app.include_router(parse_router_module.router)
