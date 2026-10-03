import uuid
from datetime import datetime

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import UserRole
from app.models.base import Base, Timestamps, UUIDPrimaryKey, db_enum


class User(UUIDPrimaryKey, Timestamps, Base):
    """A person who signs in. Their role is decided here, never by the sign-in token or the browser."""

    __tablename__ = "users"

    # auth.users.id of their Supabase Auth account (the token's subject). Null until linked.
    auth_user_id: Mapped[uuid.UUID | None] = mapped_column(unique=True)
    email: Mapped[str] = mapped_column(Text, unique=True)
    full_name: Mapped[str] = mapped_column(Text)
    role: Mapped[UserRole] = mapped_column(db_enum(UserRole, "user_role"), default=UserRole.RECRUITER)
    disabled_at: Mapped[datetime | None]  # set to revoke access at once, without touching Supabase Auth
