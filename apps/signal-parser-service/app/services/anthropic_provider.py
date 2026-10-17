import anthropic

from app.core.logging import get_logger
from app.services.llm_provider import LLMProvider

logger = get_logger(__name__)


class AnthropicProvider(LLMProvider):
    """Calls Anthropic Claude via the official SDK."""

    def __init__(self, api_key: str, model: str) -> None:
        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model

    async def complete(self, system: str, user: str, max_tokens: int = 512) -> str | None:
        try:
            response = self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return response.content[0].text.strip()
        except anthropic.APIError as exc:
            logger.error("anthropic_api_error", error=str(exc))
            return None
        except Exception as exc:
            logger.error("anthropic_unexpected_error", error=str(exc))
            return None
