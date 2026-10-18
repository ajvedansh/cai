from app.core.config import Settings
from app.core.logging import get_logger
from app.services.llm_provider import LLMProvider
from app.services.anthropic_provider import AnthropicProvider
from app.services.groq_provider import GroqProvider
from app.services.ollama_provider import OllamaProvider

logger = get_logger(__name__)


def create_llm_provider(settings: Settings) -> LLMProvider:
    """
    Provider priority: Groq > Anthropic > Ollama (local).
    - Groq:      USE_GROQ=true  + GROQ_API_KEY      (free cloud, recommended for Render)
    - Anthropic: USE_ANTHROPIC=true + ANTHROPIC_API_KEY
    - Ollama:    default for local development
    """
    if settings.use_groq and settings.groq_api_key:
        logger.info(
            "llm_provider_selected",
            provider="groq",
            model=settings.groq_model,
        )
        return GroqProvider(settings.groq_api_key, settings.groq_model)

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
