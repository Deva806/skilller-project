
import uuid
from datetime import datetime

from sqlalchemy import (
    String,
    Boolean,
    Integer,
    DateTime,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from db.session import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    email: Mapped[str] = mapped_column(
        String,
        unique=True,
        nullable=False,
        index=True,
    )

    username: Mapped[str] = mapped_column(
        String,
        unique=True,
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    password_hash: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    bio: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )

    avatar_url: Mapped[str] = mapped_column(
        String,
        default="",
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String,
        default="student",
        nullable=False,
    )

    xp: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    streak: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    badges: Mapped[list[str]] = mapped_column(
        ARRAY(String),
        default=list,
        nullable=False,
    )

    email_verified: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    referral_code: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    referred_by: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    plan: Mapped[str] = mapped_column(
        String,
        default="trial",
        nullable=False,
    )

    premium_until: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    last_login_date: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    # Increment to invalidate previously issued JWT access tokens.
    token_version: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default="0",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
