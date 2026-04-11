from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ApiError(BaseModel):
    code: str = Field(..., max_length=64)
    message: str = Field(..., max_length=500)
    details: Any | None = None


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    error: ApiError | None = None


def ok(data: T) -> ApiResponse[T]:
    return ApiResponse(success=True, data=data, error=None)


def fail(*, code: str, message: str, details: Any | None = None, status_code: int | None = None) -> ApiResponse[None]:
    _ = status_code
    return ApiResponse(success=False, data=None, error=ApiError(code=code, message=message, details=details))

