from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ThreatCountsPoint(BaseModel):
    period_start: datetime
    blocked: int = Field(ge=0)
    redacted: int = Field(ge=0)
    clean: int = Field(ge=0)
    total: int = Field(ge=0)


class ThreatCountsResponse(BaseModel):
    granularity: str
    start_time: datetime
    end_time: datetime
    series: list[ThreatCountsPoint]

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "granularity": "daily",
                    "start_time": "2026-03-01T00:00:00Z",
                    "end_time": "2026-03-08T00:00:00Z",
                    "series": [
                        {"period_start": "2026-03-01T00:00:00Z", "blocked": 3, "redacted": 2, "clean": 20, "total": 25}
                    ],
                }
            ]
        }
    }
