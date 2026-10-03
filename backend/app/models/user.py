from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import UserRole
from app.models.base import Base, Timestamps, UUIDPrimaryKey, db_enum


class User(UUIDPrimaryKey, Timestamps, Base):
    """A person who signs in: recruiters and admins now, candidates once the portal ships."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(Text, unique=True)
    full_name: Mapped[str] = mapped_column(Text)
    role: Mapped[UserRole] = mapped_column(db_enum(UserRole, "user_role"), default=UserRole.RECRUITER)
