from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    port: int = 3003

    redis_url: str = "redis://localhost:6379"
    confidence_threshold: float = 0.85

    # LLM provider switch — priority: Groq > Anthropic > Ollama (local)
    # Groq (free cloud LLM): set USE_GROQ=true and GROQ_API_KEY
    use_groq: bool = False
    groq_api_key: str = ""
    groq_model: str = "llama3-8b-8192"

    # Anthropic (Claude): set USE_ANTHROPIC=true and ANTHROPIC_API_KEY
    use_anthropic: bool = False
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-5-haiku-20241022"

    # Ollama (local LLM) — default for local development
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    stream_message_received: str = "cai:message.received"
    stream_trade_call_created: str = "cai:trade_call.created"
    stream_needs_review: str = "cai:message.needs_review"
    consumer_group: str = "signal-parser-group"
    consumer_name: str = "signal-parser-1"

    api_key: str = "dev-api-key-change-in-prod"

    @property
    def active_model_name(self) -> str:
        """Human-readable name of the active LLM (used for tracing)."""
        if self.use_groq and self.groq_api_key:
            return f"groq/{self.groq_model}"
        if self.use_anthropic and self.anthropic_api_key:
            return self.anthropic_model
        return f"ollama/{self.ollama_model}"


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
