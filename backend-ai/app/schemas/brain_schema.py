from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class BrainAnalyzeRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=20000)
    image_data: str | None = None
    context: dict[str, Any] | None = None


class BrainAnalyzeResponse(BaseModel):
    status: str
    analysis: Any


class BrainInsightsRequest(BaseModel):
    days: int = Field(default=7, ge=1, le=365)


class BrainInsightsResponse(BaseModel):
    summary: str
    insights: dict[str, Any]
