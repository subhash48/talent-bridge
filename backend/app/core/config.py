"""Runtime settings from the environment and backend/.env (ARCHITECTURE.md 6.8, 18).

Every setting has a safe default, so the app boots with no .env and no database.
"""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:54322/postgres"
    supabase_url: str = "http://localhost:54321"
    supabase_secret_key: str | None = None
    supabase_jwks_url: str = "http://localhost:54321/auth/v1/.well-known/jwks.json"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    ai_provider: Literal["anthropic", "openai", "template"] = "template"
    ai_model: str = "claude-opus-5-5"
    ai_model_chat: str | None = None
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    openai_model: str | None = None

    demo_mode: bool = False
    internal_cron_secret: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
