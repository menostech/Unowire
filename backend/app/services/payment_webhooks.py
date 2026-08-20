"""Webhook handlers for paid subscription lifecycle events.

Registers handlers for Stripe and PayPal events via the module-level
``register_webhook_handler`` API in ``app.services.payment``. The route
layer in ``app.api.routes/payments.py`` is unchanged — handlers are
dispatched by ``dispatch_webhook_event``.

All handlers are idempotent: ``activate_paid_subscription`` keys on
``gateway_subscription_id``, and the payments table deduplicates on
``gateway_event_id`` before dispatch.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member_subscription import MemberSubscription
from app.services.payment import PaymentService, register_webhook_handler
from app.services.subscription import SubscriptionService

logger = logging.getLogger(__name__)


def _to_datetime(value) -> datetime | None:
    """Convert a Stripe (unix epoch) or PayPal (ISO 8601) timestamp to datetime."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).replace(tzinfo=None)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None
    return None


async def _find_subscription_by_gateway_id(
    db: AsyncSession, gateway_subscription_id: str
) -> MemberSubscription | None:
    stmt = (
        select(MemberSubscription)
        .where(MemberSubscription.gateway_subscription_id == gateway_subscription_id)
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Stripe handlers
# ---------------------------------------------------------------------------

async def _handle_stripe_checkout_completed(event: dict, raw_payload: dict, db: AsyncSession) -> None:
    """checkout.session.completed -> activate_paid_subscription."""
    obj = event.get("data", {}).get("object", {})
    member_id_str = obj.get("client_reference_id")
    gateway_subscription_id = obj.get("subscription")
    if not member_id_str or not gateway_subscription_id:
        logger.warning("stripe checkout.session.completed missing member_id or subscription id")
        return
    try:
        member_id = int(member_id_str)
    except ValueError:
        logger.warning("stripe checkout.session.completed client_reference_id not int: %s", member_id_str)
        return

    payment_svc = PaymentService(db)
    sub_info = await payment_svc._stripe_retrieve_subscription(gateway_subscription_id)
    period_end_ts = sub_info.get("current_period_end")
    period_end = _to_datetime(period_end_ts)
    if period_end is None:
        from datetime import timedelta
        period_end = datetime.utcnow() + timedelta(days=30)

    svc = SubscriptionService(db)
    await svc.activate_paid_subscription(
        member_id=member_id,
        gateway="stripe",
        gateway_subscription_id=gateway_subscription_id,
        current_period_end=period_end,
    )


async def _handle_stripe_payment_succeeded(event: dict, raw_payload: dict, db: AsyncSession) -> None:
    """invoice.payment_succeeded -> extend period_end, clear past_due."""
    obj = event.get("data", {}).get("object", {})
    gateway_subscription_id = obj.get("subscription")
    period_end_ts = obj.get("period_end")
    if not gateway_subscription_id:
        return
    sub = await _find_subscription_by_gateway_id(db, gateway_subscription_id)
    if sub is None:
        logger.warning("stripe payment_succeeded for unknown subscription %s", gateway_subscription_id)
        return
    period_end = _to_datetime(period_end_ts)
    if period_end is not None:
        sub.current_period_end = period_end
    if sub.status == "past_due":
        sub.status = "paid"
        sub.grace_period_end = None
    db.add(sub)
    await db.commit()

    # --- Invoice generation (best-effort, never fails the webhook) ---
    try:
        from app.services.invoice import InvoiceService
        order_id_str = (obj.get("metadata") or {}).get("order_id")
        if order_id_str:
            order_id = int(order_id_str)
            await InvoiceService(db).create_from_order(order_id)
    except Exception:
        logger.exception("invoice generation failed for stripe event")


async def _handle_stripe_payment_failed(event: dict, raw_payload: dict, db: AsyncSession) -> None:
    """invoice.payment_failed -> mark past_due."""
    obj = event.get("data", {}).get("object", {})
    gateway_subscription_id = obj.get("subscription")
    if not gateway_subscription_id:
        return
    sub = await _find_subscription_by_gateway_id(db, gateway_subscription_id)
    if sub is None:
        logger.warning("stripe payment_failed for unknown subscription %s", gateway_subscription_id)
        return
    svc = SubscriptionService(db)
    await svc.mark_past_due(sub.id)


# ---------------------------------------------------------------------------
# PayPal handlers
# ---------------------------------------------------------------------------

async def _handle_paypal_subscription_activated(event: dict, raw_payload: dict, db: AsyncSession) -> None:
    """BILLING.SUBSCRIPTION.ACTIVATED -> activate_paid_subscription."""
    resource = event.get("resource", {})
    member_id_str = resource.get("custom_id")
    gateway_subscription_id = resource.get("id")
    if not member_id_str or not gateway_subscription_id:
        return
    try:
        member_id = int(member_id_str)
    except ValueError:
        return
    next_billing = (resource.get("billing_info") or {}).get("next_billing_time")
    period_end = _to_datetime(next_billing)
    if period_end is None:
        from datetime import timedelta
        period_end = datetime.utcnow() + timedelta(days=30)

    svc = SubscriptionService(db)
    await svc.activate_paid_subscription(
        member_id=member_id,
        gateway="paypal",
        gateway_subscription_id=gateway_subscription_id,
        current_period_end=period_end,
    )


async def _handle_paypal_payment_completed(event: dict, raw_payload: dict, db: AsyncSession) -> None:
    """PAYMENT.SALE.COMPLETED -> extend period_end, clear past_due."""
    resource = event.get("resource", {})
    gateway_subscription_id = resource.get("billing_agreement_id") or resource.get("id")
    if not gateway_subscription_id:
        return
    sub = await _find_subscription_by_gateway_id(db, gateway_subscription_id)
    if sub is None:
        return
    payment_svc = PaymentService(db)
    try:
        sub_info = await payment_svc._paypal_retrieve_subscription(gateway_subscription_id)
        period_end = _to_datetime(sub_info.get("current_period_end"))
        if period_end is not None:
            sub.current_period_end = period_end
    except Exception:
        logger.exception("paypal retrieve_subscription failed for %s", gateway_subscription_id)
    if sub.status == "past_due":
        sub.status = "paid"
        sub.grace_period_end = None
    db.add(sub)
    await db.commit()

    # --- Invoice generation (best-effort, never fails the webhook) ---
    try:
        from app.services.invoice import InvoiceService
        order_id_str = resource.get("custom_id")
        if order_id_str:
            order_id = int(order_id_str)
            await InvoiceService(db).create_from_order(order_id)
    except Exception:
        logger.exception("invoice generation failed for paypal event")


async def _handle_paypal_subscription_cancelled(event: dict, raw_payload: dict, db: AsyncSession) -> None:
    """BILLING.SUBSCRIPTION.CANCELLED -> mark cancelled, retain access until period_end."""
    resource = event.get("resource", {})
    gateway_subscription_id = resource.get("id")
    if not gateway_subscription_id:
        return
    sub = await _find_subscription_by_gateway_id(db, gateway_subscription_id)
    if sub is None:
        return
    if sub.status in ("paid", "past_due"):
        sub.status = "cancelled"
        sub.cancelled_at = datetime.utcnow()
        db.add(sub)
        await db.commit()


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

def register_all() -> None:
    """Register all webhook handlers with the module-level registry.

    Called from app.main lifespan startup.
    """
    register_webhook_handler("stripe", "checkout.session.completed", _handle_stripe_checkout_completed)
    register_webhook_handler("stripe", "invoice.payment_succeeded", _handle_stripe_payment_succeeded)
    register_webhook_handler("stripe", "invoice.payment_failed", _handle_stripe_payment_failed)
    register_webhook_handler("paypal", "BILLING.SUBSCRIPTION.ACTIVATED", _handle_paypal_subscription_activated)
    register_webhook_handler("paypal", "PAYMENT.SALE.COMPLETED", _handle_paypal_payment_completed)
    register_webhook_handler("paypal", "BILLING.SUBSCRIPTION.CANCELLED", _handle_paypal_subscription_cancelled)
