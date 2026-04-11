from sqlalchemy.orm import Session

from app.models.billing import BillingInvoice, BillingSubscription
from app.models.user import User


def get_billing_plan(db: Session, user: User):
    subscription = (
        db.query(BillingSubscription)
        .filter(BillingSubscription.user_id == user.id)
        .order_by(BillingSubscription.created_at.desc())
        .first()
    )
    tier = getattr(user.tier, "value", user.tier) or "FREE"
    return {
        "tier": subscription.plan_name if subscription else str(tier),
        "monthly_limit": user.monthly_limit,
        "status": subscription.status if subscription else "active",
    }


def list_billing_invoices(db: Session, user: User):
    return (
        db.query(BillingInvoice)
        .filter(BillingInvoice.user_id == user.id)
        .order_by(BillingInvoice.issued_at.desc())
        .all()
    )


def subscribe_user(db: Session, user: User, plan_name: str):
    subscription = BillingSubscription(user_id=user.id, plan_name=plan_name.upper(), status="active")
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return subscription


def cancel_subscription(db: Session, user: User):
    subscription = (
        db.query(BillingSubscription)
        .filter(BillingSubscription.user_id == user.id, BillingSubscription.status == "active")
        .order_by(BillingSubscription.created_at.desc())
        .first()
    )
    if subscription:
        subscription.status = "cancelled"
        db.commit()
        db.refresh(subscription)
    return {
        "status": "cancelled",
        "message": "Subscription cancelled successfully",
    }
