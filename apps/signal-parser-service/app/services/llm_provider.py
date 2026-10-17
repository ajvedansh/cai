from abc import ABC, abstractmethod


class LLMProvider(ABC):
    """Abstract interface for all LLM backends."""

    @abstractmethod
    async def complete(self, system: str, user: str, max_tokens: int = 512) -> str | None:
        """
        Send a system+user prompt and return the model's text response.
        Returns None on any error so callers can handle gracefully.
        """
