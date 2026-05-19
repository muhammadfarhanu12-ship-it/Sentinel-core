from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class BillingStatusEnum(str, Enum):
    ACTIVE = "ACTIVE"
    TRIALING = "TRIALING"
    PAST_DUE = "PAST_DUE"
    CANCELED = "CANCELED"
    UNPAID = "UNPAID"


class InvoiceStatusEnum(str, Enum):
    DRAFT = "DRAFT"
    OPEN = "OPEN"
    PAID = "PAID"
    VOID = "VOID"
    UNCOLLECTIBLE = "UNCOLLECTIBLE"


class BillingSubscription(BaseModel):
    """Legacy SQL-style compatibility DTO used by admin maintenance tests/tools."""

    id: str | int = Field(default_factory=lambda: uuid4().hex)
    user_id: str | int
    plan_name: str = "FREE"
    status: BillingStatusEnum = BillingStatusEnum.ACTIVE
    stripe_subscription_id: str | None = None
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = False
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class BillingInvoice(BaseModel):
    """Legacy SQL-style compatibility DTO used by admin maintenance tests/tools."""

    id: str | int = Field(default_factory=lambda: uuid4().hex)
    user_id: str | int
    invoice_number: str
    amount: Decimal = Decimal("0.00")
    currency: str = "USD"
    status: InvoiceStatusEnum = InvoiceStatusEnum.OPEN
    stripe_invoice_id: str | None = None
    hosted_invoice_url: str | None = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
