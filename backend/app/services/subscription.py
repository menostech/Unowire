from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member_subscription import MemberSubscription
from app.models.subscription_plan import SubscriptionPlan


class SubscriptionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_active_subscription(self, member_id: int) -> MemberSubscription | None:
        """Return the member's most recent non-expired subscription, or None.
        A member with no row is implicitly freemium."""
        stmt = (
            select(MemberSubscription)
            .where(MemberSubscription.member_id == member_id)
            .where(MemberSubscription.status.in_(("active", "trialing", "cancelled")))
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
            if sub.status in ("active", "trialing"):
                return (await self._tier_for_plan(sub.plan_id), self._snapshot_limits(sub))
            if sub.status == "cancelled" and sub.current_period_end and sub.current_period_end > datetime.utcnow():
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
        if sub is None or sub.status not in ("active", "trialing"):
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail={"code": 400, "message": "No active subscription to cancel"})
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
