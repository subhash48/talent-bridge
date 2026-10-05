"""Runtime settings from the environment and backend/.env.

Every setting has a safe default, so the API boots with no .env at all: a local SQLite file
instead of Supabase, the mock AI provider instead of Gemini or Groq, and no Ashby connection.
Sign-in is the exception: without SUPABASE_URL no access token can be verified, so every route
except /health refuses the request. Secrets are SecretStr so they never show up in logs or reprs, and none of them are ever sent
to the frontend.
"""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine import make_url

from app.core.enums import ApplicationStage

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

    # Supabase Auth. Access tokens are verified with the project's public signing keys (JWKS), so
    # sign-in needs no secret. SUPABASE_JWKS_URL defaults to SUPABASE_URL's.
    supabase_url: str | None = None
    supabase_jwks_url: str | None = None

    frontend_url: str = "http://localhost:3000"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    # Company-approved facts the candidate assistant may share. It never invents company details.
    organization_overview: str = (
        "Encord builds the data development platform AI teams use to curate, annotate and evaluate "
        "multimodal training data, from images and video to documents and 3D sensor data."
    )

    ai_provider: str = "mock"  # mock | gemini | groq
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-2.5-flash"
    groq_api_key: SecretStr | None = None
    groq_model: str = "llama-3.3-70b-versatile"
    # Speech to text for the recruiter assistant's voice input (Groq only). Without it, the workspace
    # uses the browser's own speech recognition where there is one.
    groq_transcription_model: str = "whisper-large-v3-turbo"
    ai_timeout_seconds: float = 30.0

    # Supabase Auth admin access, for candidate portal invitations only. Server-side; never sent to
    # the browser. Either name works (the dashboard calls it the secret or the service role key).
    supabase_secret_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY")
    )
    # Invite Ashby applicants to the candidate portal at the email they applied with.
    portal_invites_enabled: bool = True

    ashby_api_key: SecretStr | None = None
    ashby_webhook_secret: SecretStr | None = None
    ashby_api_url: str = "https://api.ashbyhq.com"
    ashby_timeout_seconds: float = 20.0
    # Ask the AI for an analysis of each application Ashby submits. It never blocks the import.
    ashby_auto_analyze: bool = True
    # The reconciliation sync invites applicants it finds only if they applied this recently, so a
    # first sync never emails a backlog of past candidates.
    ashby_sync_invite_max_age_days: int = 14
    # Custom Ashby stage titles to Talent Bridge stages, as JSON: {"Take-home": "screening"}.
    # Stages not listed map by their Ashby type (integrations/ashby/mapping.py).
    ashby_stage_title_map: dict[str, ApplicationStage] = {}
    # Development only: recruiter-created demo jobs and the public demo careers site (/demo/careers),
    # whose applications reach Talent Bridge through the Ashby simulator. Every demo route answers 404
    # unless this is true, and always when ENVIRONMENT=production.
    enable_ashby_demo: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("ashby_stage_title_map")
    @classmethod
    def _normalize_titles(cls, value: dict[str, ApplicationStage]) -> dict[str, ApplicationStage]:
        return {title.strip().lower(): stage for title, stage in value.items() if title.strip()}

    @field_validator("database_url")
    @classmethod
    def _async_driver(cls, value: str) -> str:
        return normalize_database_url(value)

    @field_validator("ai_provider")
    @classmethod
    def _lowercase_provider(cls, value: str) -> str:
        return value.strip().lower()

    @property
    def jwt_issuer(self) -> str | None:
        """Supabase Auth's issuer (iss claim): https://<project>.supabase.co/auth/v1."""
        if self.supabase_url:
            return f"{self.supabase_url.rstrip('/')}/auth/v1"
        if self.supabase_jwks_url:
            return self.supabase_jwks_url.removesuffix("/.well-known/jwks.json").rstrip("/")
        return None

    @property
    def jwks_url(self) -> str | None:
        if self.supabase_jwks_url:
            return self.supabase_jwks_url
        return f"{self.jwt_issuer}/.well-known/jwks.json" if self.jwt_issuer else None

    @property
    def portal_invite_redirect_url(self) -> str:
        """Where Supabase sends an invited candidate once it has verified the invitation link.

        Supabase's default invitation email links to its own /auth/v1/verify, which redirects here
        with the new session in the URL fragment (#access_token=...). Only the browser can read a
        fragment, so this is a page, not a server route: it keeps the session, clears the tokens
        from the address bar and continues to /welcome to choose a password. A customised template
        that appends &token_hash=...&type=invite also works: the page hands those to /auth/confirm.
        """
        return f"{self.frontend_url.rstrip('/')}/auth/callback?next=/welcome"

    @property
    def ashby_demo_enabled(self) -> bool:
        """Demo jobs and the demo careers site are on: ENABLE_ASHBY_DEMO=true, outside production."""
        return self.enable_ashby_demo and self.environment != "production"

    @property
    def allowed_origins(self) -> list[str]:
        """CORS origins: CORS_ORIGINS plus FRONTEND_URL, without duplicates."""
        origins = [*self.cors_origins, self.frontend_url]
        return list(dict.fromkeys(origin.rstrip("/") for origin in origins if origin))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
