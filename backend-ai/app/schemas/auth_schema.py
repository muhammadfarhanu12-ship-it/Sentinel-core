from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.schemas.user_schema import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, UserResponse, validate_password_strength


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str | None = None
    refresh_token: str | None = None
    user: UserResponse | None = None

class TokenData(BaseModel):
    email: str | None = None
    user_id: str | None = None
    token_type: str | None = None
    jti: str | None = None
    claims: dict[str, Any] = Field(default_factory=dict)


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=32)


class LogoutRequest(BaseModel):
    refresh_token: str | None = Field(default=None, min_length=32)


class ForgotPasswordRequest(BaseModel):
    email: str


class ResendVerificationRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=32)
    new_password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("new_password")
    @classmethod
    def validate_new_password_strength(cls, value: str) -> str:
        return validate_password_strength(value)


class VerifyEmailRequest(BaseModel):
    token: str


class MessageResponse(BaseModel):
    message: str
    email: str | None = None
    email_sent: bool | None = None


class TestEmailRequest(BaseModel):
    email: str


class TestAuthFlowRequest(BaseModel):
    email: str
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("password")
    @classmethod
    def validate_test_password_strength(cls, value: str) -> str:
        return validate_password_strength(value)
