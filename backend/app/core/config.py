"""Runtime settings from the environment and backend/.env.

Every setting has a safe default, so the API boots with no .env at all: a local SQLite file
instead of Supabase, the mock AI provider instead of Gemini or Groq, and no Ashby connection.
Secrets are SecretStr so they never show up in logs or reprs, and none of them are ever sent
to the frontend.
"""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine import make_url

API_PREFIX = "/api/v1"
SQLITE_DEV_URL = "sqlite+aiosqlite:///./talent_bridge.db"


def normalize_database_url(raw: str) -> str:
    """Accept a connection string exactly as Supabase shows it and select the async driver."""
    url = make_url(raw)
    if url.drivername in {"postgres", "postgresql", "postgresql+psycopg", "postgresql+psycopg2"}:
        url = url.set(drivername="postgresql+asyncpg")
    elif url.drivername == "sqlite":
        url = url.set(drivername="sqlite+aiosqlite")
    if url.drivername == "postgresql+asyncpg" and "sslmode" in url.query:
        # asyncpg spells libpq's sslmode as ssl.
        query = dict(url.query)
        query["ssl"] = query.pop("sslmode")
        url = url.set(query=query)
    return url.render_as_string(hide_password=False)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    app_name: str = "Talent Bridge API"
    environment: Literal["development", "test", "production"] = "development"
    organization_name: str = "Encord"

    # Supabase Postgres connection string (Project Settings > Database). Empty: local SQLite.
    database_url: str = SQLITE_DEV_URL
    database_echo: bool = False
    # Load the demo pipeline into an empty database on startup.
    seed_demo_data: bool = True

    # Server-side only. The frontend never receives these.
    supabase_url: str | None = None
    supabase_service_role_key: SecretStr | None = None

    frontend_url: str = "http://localhost:3000"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    # Every request acts as this recruiter until Supabase Auth is added (see core/security.py).
    default_user_email: str = "alex.chen@encord.example"

    ai_provider: str = "mock"  # mock | gemini | groq
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-2.5-flash"
    groq_api_key: SecretStr | None = None
    groq_model: str = "llama-3.3-70b-versatile"
    ai_timeout_seconds: float = 30.0

    ashby_api_key: SecretStr | None = None
    ashby_webhook_secret: SecretStr | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("database_url")
    @classmethod
    def _async_driver(cls, value: str) -> str:
        return normalize_database_url(value)

    @field_validator("ai_provider")
    @classmethod
    def _lowercase_provider(cls, value: str) -> str:
        return value.strip().lower()

    @property
    def allowed_origins(self) -> list[str]:
        """CORS origins: CORS_ORIGINS plus FRONTEND_URL, without duplicates."""
        origins = [*self.cors_origins, self.frontend_url]
        return list(dict.fromkeys(origin.rstrip("/") for origin in origins if origin))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
