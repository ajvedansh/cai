import structlog
import logging


def configure_logging(env: str = "development") -> None:
    level = logging.DEBUG if env == "development" else logging.INFO
    logging.basicConfig(level=level)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer()
            if env == "development"
            else structlog.processors.JSONRenderer(),
        ],
        logger_factory=structlog.PrintLoggerFactory(),
    )


def get_logger(name: str):
    return structlog.get_logger(name)
