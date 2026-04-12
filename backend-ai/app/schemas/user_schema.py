from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128
PASSWORD_POLICY_MESSAGE = (
    "Password must be 12-128 characters long and include at least one uppercase letter, one lowercase letter, and one number."
)


def normalize_password(value: str) -> str:
    return value.strip()


def validate_password_strength(value: str) -> str:
    password = normalize_password(value)
    if len(password) < PASSWORD_MIN_LENGTH or len(password) > PASSWORD_MAX_LENGTH:
        raise ValueError(PASSWORD_POLICY_MESSAGE)

    checks = [
        re.search(r"[A-Z]", password),
        re.search(r"[a-z]", password),
        re.search(r"\d", password),
    ]
    if not all(checks):
        raise ValueError(PASSWORD_POLICY_MESSAGE)
    return password


class UserBase(BaseModel):
    email: str
    name: str | None = Field(default=None, max_length=120)

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class SignupRequest(UserBase):
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        return validate_password_strength(value)


class LoginRequest(UserBase):
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("password")
    @classmethod
    def normalize_password_value(cls, value: str) -> str:
        password = normalize_password(value)
        if not password:
            raise ValueError("Password is required.")
        return password


class UserResponse(UserBase):
    id: str
    tier: Literal["FREE", "PRO", "BUSINESS"] = "FREE"
    role: Literal["user", "admin"] = "user"
    organization_name: str | None = None
    is_active: bool = True
    is_verified: bool = False
    email_verified_at: datetime | None = None
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


# Backwards-compatible alias for older imports in the repo.
UserCreate = SignupRequest
