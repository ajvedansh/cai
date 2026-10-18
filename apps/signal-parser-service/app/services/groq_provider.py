import httpx

from app.core.logging import get_logger
from app.services.llm_provider import LLMProvider

logger = get_logger(__name__)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


class GroqProvider(LLMProvider):
    """
    Calls the Groq cloud API using its OpenAI-compatible /chat/completions endpoint.
    Free tier: 14,400 requests/day. Set GROQ_API_KEY and USE_GROQ=true to activate.
    """

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    async def complete(self, system: str, user: str, max_tokens: int = 512) -> str | None:
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{GROQ_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self._model,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": user},
                        ],
                        "max_tokens": max_tokens,
                        "temperature": 0.1,
                    },
                )
                response.raise_for_status()
                data = response.json()
                content: str = data["choices"][0]["message"]["content"].strip()
                return content
        except httpx.HTTPStatusError as exc:
            logger.error("groq_http_error", status=exc.response.status_code, error=str(exc))
            return None
        except Exception as exc:
            logger.error("groq_unexpected_error", error=str(exc))
            return None
