from app.core.config import Settings
from app.core.logging import get_logger
from app.services.llm_provider import LLMProvider
from app.services.anthropic_provider import AnthropicProvider
from app.services.ollama_provider import OllamaProvider

logger = get_logger(__name__)


def create_llm_provider(settings: Settings) -> LLMProvider:
    """
    Returns AnthropicProvider when USE_ANTHROPIC=true and ANTHROPIC_API_KEY is set,
    otherwise returns OllamaProvider for local LLaMA inference.
    """
    if settings.use_anthropic and settings.anthropic_api_key:
        logger.info(
            "llm_provider_selected",
            provider="anthropic",
            model=settings.anthropic_model,
        )
        return AnthropicProvider(settings.anthropic_api_key, settings.anthropic_model)

    logger.info(
        "llm_provider_selected",
        provider="ollama",
        model=settings.ollama_model,
        base_url=settings.ollama_base_url,
    )
    return OllamaProvider(settings.ollama_base_url, settings.ollama_model)
