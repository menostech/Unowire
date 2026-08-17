"""Subscription renewal reconciliation.

The gateways (Stripe and PayPal) perform auto-renewals on their side. This
module reconciles local state with the gateway state once per hour to catch
missed webhooks and to expire past_due grace windows.

Exported for testability; called from ``app.main._renewal_loop``.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member_subscription import MemberSubscription
from app.services.payment import PaymentService
from app.services.subscription import SubscriptionService

logger = logging.getLogger(__name__)

# Subscriptions with period_end within this window are reconciled.
RENEWAL_WINDOW = timedelta(hours=1)


async def reconcile_paid_subscriptions(db: AsyncSession, apply_grace: bool = True) -> int:
    """Reconcile paid subscriptions with the gateway and expire grace windows.

    Returns the count of grace-expiry downgrades performed.
    """
    now = datetime.utcnow()
    svc = SubscriptionService(db)
    payment_svc = PaymentService(db)

    # 1. Reconcile paid subscriptions nearing period_end
    stmt = (
        select(MemberSubscription)
        .where(MemberSubscription.status == "paid")
        .where(MemberSubscription.current_period_end.isnot(None))
        .where(MemberSubscription.current_period_end < now + RENEWAL_WINDOW)
    )
    result = await db.execute(stmt)
    for sub in result.scalars().all():
        if not sub.gateway_subscription_id or not sub.gateway:
            continue
        try:
            if sub.gateway == "stripe":
                info = await payment_svc._stripe_retrieve_subscription(sub.gateway_subscription_id)
            elif sub.gateway == "paypal":
                info = await payment_svc._paypal_retrieve_subscription(sub.gateway_subscription_id)
            else:
                continue
        except Exception:
            logger.exception("reconcile: gateway retrieve failed for sub %s", sub.id)
            continue

        gw_status = info.get("status", "").lower()
        period_end = info.get("current_period_end")
        if period_end is not None:
            if isinstance(period_end, (int, float)):
                sub.current_period_end = datetime.fromtimestamp(period_end)
            elif isinstance(period_end, str):
                try:
                    sub.current_period_end = datetime.fromisoformat(period_end.replace("Z", "+00:00")).replace(tzinfo=None)
                except ValueError:
                    pass
        if gw_status in ("past_due", "unpaid", "suspended"):
            await svc.mark_past_due(sub.id)
        db.add(sub)
    await db.commit()

    # 2. Expire past_due grace windows
    if apply_grace:
        return await svc.apply_grace_expiry()
    return 0
