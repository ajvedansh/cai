import httpx

from app.core.logging import get_logger
from app.services.llm_provider import LLMProvider

logger = get_logger(__name__)


class OllamaProvider(LLMProvider):
    """
    Calls a local Ollama instance via its /api/chat REST endpoint.
    Ollama must be running on the host with the target model pulled.
    Docker containers reach the host at http://host.docker.internal:11434.
    """

    def __init__(self, base_url: str, model: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model

    async def complete(self, system: str, user: str, max_tokens: int = 512) -> str | None:
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self._base_url}/api/chat",
                    json={
                        "model": self._model,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": user},
                        ],
                        "stream": False,
                        "options": {"num_predict": max_tokens},
                    },
                )
                response.raise_for_status()
                data = response.json()
                content: str = data["message"]["content"].strip()
                return content
        except httpx.ConnectError:
            logger.error(
                "ollama_connect_error",
                base_url=self._base_url,
                hint="Make sure Ollama is running: `ollama serve`",
            )
            return None
        except httpx.HTTPStatusError as exc:
            logger.error("ollama_http_error", status=exc.response.status_code, error=str(exc))
            return None
        except Exception as exc:
            logger.error("ollama_unexpected_error", error=str(exc))
            return None
