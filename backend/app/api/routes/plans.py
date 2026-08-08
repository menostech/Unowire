from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.core.database import get_db
from app.models.member import Member
from app.models.member_subscription import MemberSubscription
from app.models.subscription_plan import SubscriptionPlan
from app.models.usage_record import UsageRecord
from app.models.user import User
from app.schemas.member_subscription import EnterpriseSubscriptionCreate, SubscriptionRead
from app.schemas.subscription_plan import (
    SubscriptionPlanCreate,
    SubscriptionPlanRead,
    SubscriptionPlanUpdate,
)
from app.services.subscription import SubscriptionService

router = APIRouter(tags=["plans"])


# --- Public ---


@router.get("/api/plans", response_model=list[SubscriptionPlanRead])
async def list_public_plans(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SubscriptionPlan)
        .where(SubscriptionPlan.is_active == True)
        .order_by(SubscriptionPlan.sort_order)
    )
    return list(result.scalars().all())


# --- Admin plan CRUD ---


@router.get("/api/admin/plans", response_model=list[SubscriptionPlanRead])
async def admin_list_plans(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("plans")),
):
    result = await db.execute(select(SubscriptionPlan).order_by(SubscriptionPlan.sort_order))
    return list(result.scalars().all())


@router.post("/api/admin/plans", response_model=SubscriptionPlanRead, status_code=201)
async def admin_create_plan(
    body: SubscriptionPlanCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("plans")),
):
    plan = SubscriptionPlan(**body.model_dump())
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.put("/api/admin/plans/{plan_id}", response_model=SubscriptionPlanRead)
async def admin_update_plan(
    plan_id: int,
    body: SubscriptionPlanUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("plans")),
):
    plan = await db.get(SubscriptionPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Plan not found"})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/api/admin/plans/{plan_id}", status_code=204)
async def admin_delete_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("plans")),
):
    plan = await db.get(SubscriptionPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Plan not found"})
    plan.is_active = False  # soft delete
    db.add(plan)
    await db.commit()
    return None


# --- Admin enterprise subscription management ---


@router.post("/api/admin/members/{member_id}/subscription", response_model=SubscriptionRead, status_code=201)
async def admin_create_enterprise_subscription(
    member_id: int,
    body: EnterpriseSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("subscriptions")),
):
    member = await db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Member not found"})
    plan = await SubscriptionService(db)._get_plan_by_tier("enterprise")
    sub = await SubscriptionService(db).create_enterprise_subscription(
        member_id, plan.id, body.period_end
    )
    return SubscriptionRead(
        id=sub.id, plan_id=plan.id, plan_name=plan.name, tier_level=plan.tier_level,
        status=sub.status, billing_cycle=None, trial_start=None, trial_end=None,
        current_period_start=sub.current_period_start, current_period_end=sub.current_period_end,
        cancelled_at=None,
        search_limit_daily=sub.snapshot_search_limit,
        detail_view_limit_daily=sub.snapshot_detail_limit,
        download_limit_monthly=sub.snapshot_download_limit,
    )


@router.get("/api/admin/subscriptions")
async def admin_list_subscriptions(
    plan: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("subscriptions")),
):
    stmt = (
        select(MemberSubscription, SubscriptionPlan, Member)
        .join(SubscriptionPlan, MemberSubscription.plan_id == SubscriptionPlan.id)
        .join(Member, MemberSubscription.member_id == Member.id)
        .order_by(MemberSubscription.created_at.desc())
    )
    if plan:
        stmt = stmt.where(SubscriptionPlan.tier_level == plan)
    if status:
        stmt = stmt.where(MemberSubscription.status == status)
    result = await db.execute(stmt)
    return [
        {
            "id": sub.id,
            "member_id": sub.member_id,
            "member_email": member.email,
            "member_name": member.name,
            "plan": plan_model.tier_level,
            "status": sub.status,
            "billing_cycle": sub.billing_cycle,
            "trial_end": sub.trial_end,
            "current_period_end": sub.current_period_end,
            "created_at": sub.created_at,
        }
        for sub, plan_model, member in result.all()
    ]


@router.get("/api/admin/usage-analytics")
async def admin_usage_analytics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("subscriptions")),
):
    """Aggregate usage per plan tier (sum of today's counts grouped by member plan)."""
    today = datetime.utcnow().date()
    stmt = (
        select(
            SubscriptionPlan.tier_level,
            func.count(func.distinct(UsageRecord.member_id)),
            func.coalesce(func.sum(UsageRecord.search_count), 0),
            func.coalesce(func.sum(UsageRecord.detail_view_count), 0),
            func.coalesce(func.sum(UsageRecord.download_count), 0),
        )
        .select_from(UsageRecord)
        .join(MemberSubscription, UsageRecord.member_id == MemberSubscription.member_id)
        .join(SubscriptionPlan, MemberSubscription.plan_id == SubscriptionPlan.id)
        .where(UsageRecord.record_date == today)
        .group_by(SubscriptionPlan.tier_level)
    )
    result = await db.execute(stmt)
    return [
        {
            "tier": tier,
            "active_members_today": int(members),
            "search": int(searches),
            "detail_view": int(views),
            "download": int(downloads),
        }
        for tier, members, searches, views, downloads in result.all()
    ]
