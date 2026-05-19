from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


SecuritySource = Literal[
    "user_input",
    "external_content",
    "webpage",
    "email",
    "social_post",
    "document",
    "tool_output",
]
SecurityOperation = Literal["chat", "tool_call", "financial_action", "code_execution", "data_access"]


class SecurityContext(BaseModel):
    source: SecuritySource = "user_input"
    trusted: bool = True
    operation: SecurityOperation = "chat"
    user_confirmed: bool = False


class TextSecurityRequest(BaseModel):
    text: str | None = Field(default=None, max_length=120_000)
    prompt: str | None = Field(default=None, max_length=120_000)
    context: SecurityContext | None = None

    def content(self) -> str:
        return str(self.text if self.text is not None else self.prompt or "")

    @field_validator("text", "prompt")
    @classmethod
    def validate_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not str(value).strip():
            raise ValueError("text must not be empty")
        return value


class FinancialGuardrailRequest(TextSecurityRequest):
    user_confirmed: bool | None = None
    two_factor_code: str | None = Field(default=None, max_length=32)


class ToolSimulationRequest(TextSecurityRequest):
    tool_name: str = Field(..., min_length=1, max_length=128)
    tool_args: dict[str, Any] = Field(default_factory=dict)
    two_factor_code: str | None = Field(default=None, max_length=32)


class TelemetryQuery(BaseModel):
    limit: int = Field(default=100, ge=1, le=500)
    session_id: str | None = Field(default=None, max_length=128)
    correlation_id: str | None = Field(default=None, max_length=128)
