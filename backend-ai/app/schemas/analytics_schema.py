from pydantic import BaseModel


class ThreatPoint(BaseModel):
    date: str
    clean: int
    blocked: int


class UsageVsLimit(BaseModel):
    used: int
    limit: int


class AnalyticsResponse(BaseModel):
    totalThreatsBlocked: int
    promptInjectionsDetected: int
    dataLeaksPrevented: int
    apiRequestsToday: int
    securityScore: int
    threatsOverTime: list[ThreatPoint]
    usageVsLimit: UsageVsLimit
