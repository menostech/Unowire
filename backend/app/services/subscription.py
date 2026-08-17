from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member_subscription import MemberSubscription
from app.models.subscription_plan import SubscriptionPlan


GRACE_PERIOD_DAYS = 7


class SubscriptionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_active_subscription(self, member_id: int) -> MemberSubscription | None:
        """Return the member's most recent non-expired subscription, or None.
        A member with no row is implicitly freemium."""
        stmt = (
            select(MemberSubscription)
            .where(MemberSubscription.member_id == member_id)
            .where(MemberSubscription.status.in_(("active", "trialing", "cancelled", "paid", "past_due")))
            .order_by(MemberSubscription.created_at.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def resolve_effective_plan(self, member_id: int) -> tuple[str, dict]:
        """Resolve the effective tier + quota limits, applying lazy expiry.

        Returns (tier_level, {"search_limit_daily", "detail_view_limit_daily",
        "download_limit_monthly"}).
        """
        sub = await self.get_active_subscription(member_id)
        if sub is not None:
            sub = await self.check_and_expire_trial(sub)
            now = datetime.utcnow()
            if sub.status in ("active", "trialing", "paid"):
                return (await self._tier_for_plan(sub.plan_id), self._snapshot_limits(sub))
            if sub.status == "past_due" and sub.grace_period_end and sub.grace_period_end > now:
                return (await self._tier_for_plan(sub.plan_id), self._snapshot_limits(sub))
            if sub.status == "cancelled" and sub.current_period_end and sub.current_period_end > now:
                return (await self._tier_for_plan(sub.plan_id), self._snapshot_limits(sub))
        return await self._freemium_limits()

    async def check_and_expire_trial(self, subscription: MemberSubscription) -> MemberSubscription:
        """Lazy expiry: trialing past trial_end, or cancelled past current_period_end,
        downgrades to freemium. 'Downgrade' = mark old subscription expired and create
        a new active freemium subscription."""
        now = datetime.utcnow()
        expired = False
        if subscription.status == "trialing" and subscription.trial_end and subscription.trial_end < now:
            expired = True
        if subscription.status == "cancelled" and subscription.current_period_end and subscription.current_period_end < now:
            expired = True
        if not expired:
            return subscription

        subscription.status = "expired"
        self.db.add(subscription)
        await self.db.flush()

        freemium = await self._get_plan_by_tier("freemium")
        new_sub = MemberSubscription(
            member_id=subscription.member_id,
            plan_id=freemium.id,
            status="active",
            snapshot_search_limit=freemium.search_limit_daily,
            snapshot_detail_limit=freemium.detail_view_limit_daily,
            snapshot_download_limit=freemium.download_limit_monthly,
        )
        self.db.add(new_sub)
        await self.db.commit()
        await self.db.refresh(new_sub)
        return new_sub

    async def start_trial(self, member_id: int, plan_id: int, trial_days: int, billing_cycle: str | None) -> MemberSubscription:
        existing = await self.get_active_subscription(member_id)
        if existing is not None and existing.status in ("active", "trialing"):
            from fastapi import HTTPException
            raise HTTPException(status_code=409, detail={"code": 409, "message": "Active subscription already exists"})
        plan = await self.db.get(SubscriptionPlan, plan_id)
        if plan is None or not plan.is_active:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Plan not found"})
        if plan.is_sales_led:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail={"code": 400, "message": "Plan is sales-led; contact sales"})
        now = datetime.utcnow()
        sub = MemberSubscription(
            member_id=member_id,
            plan_id=plan_id,
            status="trialing",
            billing_cycle=billing_cycle,
            trial_start=now,
            trial_end=now + timedelta(days=trial_days) if trial_days > 0 else None,
            snapshot_search_limit=plan.search_limit_daily,
            snapshot_detail_limit=plan.detail_view_limit_daily,
            snapshot_download_limit=plan.download_limit_monthly,
        )
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def cancel_subscription(self, member_id: int) -> MemberSubscription:
        sub = await self.get_active_subscription(member_id)
        if sub is None or sub.status not in ("active", "trialing", "paid", "past_due"):
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail={"code": 400, "message": "No active subscription to cancel"})
        if sub.status in ("paid", "past_due"):
            return await self.cancel_until_period_end(member_id)
        now = datetime.utcnow()
        sub.status = "cancelled"
        sub.cancelled_at = now
        # A trialing subscription with no current_period_end should still grant
        # access until trial_end; ensure current_period_end is set so the
        # cancelled-still-active rule in resolve_effective_plan works.
        if sub.current_period_end is None:
            sub.current_period_end = sub.trial_end if sub.trial_end else now
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def create_checkout_session(
        self, gateway: str, member_id: int, plan_id: int, billing_cycle: str
    ) -> dict:
        """Create a paid subscription checkout session at the chosen gateway.

        Validates: plan is not sales-led; member has no active paid/past_due
        subscription; billing_cycle in {monthly, yearly}. Persists an Order row,
        returns {"redirect_url": str, "order_id": int}.
        """
        from fastapi import HTTPException

        if billing_cycle not in ("monthly", "yearly"):
            raise HTTPException(status_code=400, detail={"code": 400, "message": "billing_cycle must be monthly or yearly"})
        plan = await self.db.get(SubscriptionPlan, plan_id)
        if plan is None or not plan.is_active:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Plan not found"})
        if plan.is_sales_led:
            raise HTTPException(status_code=400, detail={"code": 400, "message": "Plan is sales-led; contact sales"})
        existing = await self.get_active_subscription(member_id)
        if existing is not None and existing.status in ("paid", "past_due"):
            raise HTTPException(status_code=409, detail={"code": 409, "message": "Active paid subscription already exists"})

        # Lazy import to avoid circular import (PaymentService imports models that import nothing problematic,
        # but keep it lazy for safety)
        from app.services.payment import PaymentService
        payment_svc = PaymentService(self.db)
        result = await payment_svc.create_subscription_checkout(
            gateway=gateway,
            member_id=member_id,
            plan_id=plan_id,
            billing_cycle=billing_cycle,
            plan=plan,
        )
        return result

    async def activate_paid_subscription(
        self,
        member_id: int,
        gateway: str,
        gateway_subscription_id: str,
        current_period_end: datetime,
    ) -> MemberSubscription:
        """Idempotently activate a paid subscription from a webhook event.

        If a MemberSubscription with this gateway_subscription_id already exists,
        return it unchanged. Otherwise, mark any prior trialing subscription for
        the member as expired, create a new MemberSubscription(status=paid).
        """
        # Idempotency: already activated?
        stmt = (
            select(MemberSubscription)
            .where(MemberSubscription.gateway_subscription_id == gateway_subscription_id)
            .limit(1)
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing is not None:
            return existing

        # Expire any prior trialing/active subscription for this member
        prior = await self.get_active_subscription(member_id)
        if prior is not None and prior.status in ("trialing", "active"):
            prior.status = "expired"
            self.db.add(prior)
            await self.db.flush()

        plan = await self._get_plan_by_tier("personal")
        now = datetime.utcnow()
        sub = MemberSubscription(
            member_id=member_id,
            plan_id=plan.id,
            status="paid",
            billing_cycle=None,  # set by webhook if available
            current_period_start=now,
            current_period_end=current_period_end,
            gateway=gateway,
            gateway_subscription_id=gateway_subscription_id,
            snapshot_search_limit=plan.search_limit_daily,
            snapshot_detail_limit=plan.detail_view_limit_daily,
            snapshot_download_limit=plan.download_limit_monthly,
        )
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def mark_past_due(self, subscription_id: int, grace_days: int = GRACE_PERIOD_DAYS) -> MemberSubscription:
        """Mark a paid subscription as past_due and start the grace window."""
        from fastapi import HTTPException
        sub = await self.db.get(MemberSubscription, subscription_id)
        if sub is None:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Subscription not found"})
        sub.status = "past_due"
        sub.grace_period_end = datetime.utcnow() + timedelta(days=grace_days)
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def apply_grace_expiry(self) -> int:
        """Batch-downgrade past_due subscriptions whose grace period has elapsed.

        Marks each as expired and creates a new freemium subscription for the
        member. Returns the count downgraded.
        """
        now = datetime.utcnow()
        stmt = (
            select(MemberSubscription)
            .where(MemberSubscription.status == "past_due")
            .where(MemberSubscription.grace_period_end < now)
        )
        result = await self.db.execute(stmt)
        count = 0
        for sub in result.scalars().all():
            sub.status = "expired"
            self.db.add(sub)
            await self.db.flush()

            freemium = await self._get_plan_by_tier("freemium")
            new_sub = MemberSubscription(
                member_id=sub.member_id,
                plan_id=freemium.id,
                status="active",
                snapshot_search_limit=freemium.search_limit_daily,
                snapshot_detail_limit=freemium.detail_view_limit_daily,
                snapshot_download_limit=freemium.download_limit_monthly,
            )
            self.db.add(new_sub)
            count += 1
        if count > 0:
            await self.db.commit()
        return count

    async def cancel_until_period_end(self, member_id: int) -> MemberSubscription:
        """Cancel a paid subscription at the gateway; retain access until period_end.

        Calls the gateway API (Stripe subscriptions.cancel with prorate=False,
        PayPal subscriptions.suspend) then marks the local subscription cancelled.
        """
        from fastapi import HTTPException
        from app.services.payment import PaymentService

        sub = await self.get_active_subscription(member_id)
        if sub is None or sub.status not in ("paid", "past_due"):
            raise HTTPException(status_code=400, detail={"code": 400, "message": "No paid subscription to cancel"})
        if sub.gateway_subscription_id and sub.gateway:
            payment_svc = PaymentService(self.db)
            await payment_svc.cancel_gateway_subscription(sub.gateway, sub.gateway_subscription_id)
        now = datetime.utcnow()
        sub.status = "cancelled"
        sub.cancelled_at = now
        if sub.current_period_end is None:
            sub.current_period_end = now
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def create_enterprise_subscription(self, member_id: int, plan_id: int, period_end: datetime) -> MemberSubscription:
        plan = await self.db.get(SubscriptionPlan, plan_id)
        if plan is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Plan not found"})
        now = datetime.utcnow()
        sub = MemberSubscription(
            member_id=member_id,
            plan_id=plan_id,
            status="active",
            billing_cycle=None,
            current_period_start=now,
            current_period_end=period_end,
            snapshot_search_limit=plan.search_limit_daily,
            snapshot_detail_limit=plan.detail_view_limit_daily,
            snapshot_download_limit=plan.download_limit_monthly,
        )
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def expire_trials_batch(self) -> int:
        """Bulk-expire trialing subscriptions past trial_end and cancelled past period_end.
        Used by the scheduled background task. Returns number downgraded."""
        now = datetime.utcnow()
        stmt = (
            select(MemberSubscription)
            .where(
                ((MemberSubscription.status == "trialing") & (MemberSubscription.trial_end < now))
                | ((MemberSubscription.status == "cancelled") & (MemberSubscription.current_period_end < now))
            )
        )
        result = await self.db.execute(stmt)
        count = 0
        for sub in result.scalars().all():
            await self.check_and_expire_trial(sub)
            count += 1
        return count

    def _snapshot_limits(self, sub: MemberSubscription) -> dict:
        return {
            "search_limit_daily": sub.snapshot_search_limit,
            "detail_view_limit_daily": sub.snapshot_detail_limit,
            "download_limit_monthly": sub.snapshot_download_limit,
        }

    async def _tier_for_plan(self, plan_id: int) -> str:
        plan = await self.db.get(SubscriptionPlan, plan_id)
        return plan.tier_level if plan else "freemium"

    async def _get_plan_by_tier(self, tier_level: str) -> SubscriptionPlan:
        result = await self.db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.tier_level == tier_level)
        )
        return result.scalar_one()

    async def _freemium_limits(self) -> tuple[str, dict]:
        plan = await self._get_plan_by_tier("freemium")
        return (
            plan.tier_level,
            {
                "search_limit_daily": plan.search_limit_daily,
                "detail_view_limit_daily": plan.detail_view_limit_daily,
                "download_limit_monthly": plan.download_limit_monthly,
            },
        )
