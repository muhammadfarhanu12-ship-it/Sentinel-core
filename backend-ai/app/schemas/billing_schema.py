from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class BillingPlanResponse(BaseModel):
    tier: str
    monthly_limit: int
    status: str


class InvoiceResponse(BaseModel):
    id: int
    invoice_number: str
    amount: Decimal
    currency: str
    status: str
    issued_at: datetime

    class Config:
        from_attributes = True


class SubscribeRequest(BaseModel):
    plan_name: str


class CancelSubscriptionResponse(BaseModel):
    status: str
    message: str
