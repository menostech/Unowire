from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_member
from app.core.database import get_db
from app.models.inquiry import Inquiry
from app.models.member import Member
from app.models.subscription_plan import SubscriptionPlan
from app.schemas.member_subscription import (
    CancelResponse,
    CheckoutRequest,
    CheckoutResponse,
    EnterpriseInquiryCreate,
    SubscriptionRead,
    TrialRequest,
)
from app.schemas.inquiry import InquiryRead
from app.services.subscription import SubscriptionService
from app.services.usage import UsageService

router = APIRouter(prefix="/api/member", tags=["member-subscription"])


def _to_subscription_read(sub, plan: SubscriptionPlan) -> SubscriptionRead:
    return SubscriptionRead(
        id=sub.id,
        plan_id=sub.plan_id,
        plan_name=plan.name,
        tier_level=plan.tier_level,
        status=sub.status,
        billing_cycle=sub.billing_cycle,
        trial_start=sub.trial_start,
        trial_end=sub.trial_end,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        cancelled_at=sub.cancelled_at,
        search_limit_daily=sub.snapshot_search_limit,
        detail_view_limit_daily=sub.snapshot_detail_limit,
        download_limit_monthly=sub.snapshot_download_limit,
        gateway=sub.gateway,
        gateway_subscription_id=sub.gateway_subscription_id,
        grace_period_end=sub.grace_period_end,
    )


async def _load_plan(db: AsyncSession, plan_id: int) -> SubscriptionPlan:
    plan = await db.get(SubscriptionPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=500, detail={"code": 500, "message": "Plan missing"})
    return plan


@router.get("/subscription", response_model=SubscriptionRead)
async def get_subscription(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    svc = SubscriptionService(db)
    sub = await svc.get_active_subscription(member.id)
    if sub is None:
        # Implicit freemium: synthesize a read from the freemium plan.
        plan = await svc._get_plan_by_tier("freemium")
        return SubscriptionRead(
            id=0, plan_id=plan.id, plan_name=plan.name, tier_level=plan.tier_level,
            status="active", billing_cycle=None, trial_start=None, trial_end=None,
            current_period_start=None, current_period_end=None, cancelled_at=None,
            search_limit_daily=plan.search_limit_daily,
            detail_view_limit_daily=plan.detail_view_limit_daily,
            download_limit_monthly=plan.download_limit_monthly,
        )
    sub = await svc.check_and_expire_trial(sub)
    plan = await _load_plan(db, sub.plan_id)
    return _to_subscription_read(sub, plan)


@router.get("/usage")
async def get_usage(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    svc = SubscriptionService(db)
    tier, limits = await svc.resolve_effective_plan(member.id)
    summary = await UsageService(db).get_usage_summary(member.id, limits, tier)
    return summary


@router.post("/subscription/trial", response_model=SubscriptionRead, status_code=201)
async def start_trial(
    body: TrialRequest,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    plan = await SubscriptionService(db)._get_plan_by_tier("personal")
    sub = await SubscriptionService(db).start_trial(
        member.id, plan.id, plan.trial_days, body.billing_cycle
    )
    return _to_subscription_read(sub, plan)


@router.post("/subscription/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    """Create a paid subscription checkout session at the chosen gateway.

    Returns {redirect_url, order_id}. The frontend redirects to redirect_url.
    """
    svc = SubscriptionService(db)
    result = await svc.create_checkout_session(
        gateway=body.gateway,
        member_id=member.id,
        plan_id=body.plan_id,
        billing_cycle=body.billing_cycle,
    )
    return CheckoutResponse(**result)


@router.post("/subscription/cancel", response_model=CancelResponse)
async def cancel(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    sub = await SubscriptionService(db).cancel_subscription(member.id)
    return CancelResponse(
        status=sub.status,
        current_period_end=sub.current_period_end,
        message="Subscription cancelled; access retained until period end.",
    )


# Enterprise inquiry lives under /api/inquiries to match the design-doc URL.
enterprise_router = APIRouter(prefix="/api/inquiries", tags=["member-subscription"])


@enterprise_router.post("/enterprise", response_model=InquiryRead, status_code=201)
async def create_enterprise_inquiry(
    body: EnterpriseInquiryCreate,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    inquiry = Inquiry(
        sender_id=member.id,
        recipient_type="enterprise_sales",
        recipient_id="enterprise_sales",
        subject="Enterprise Subscription Inquiry",
        body=f"Company: {body.company_name}\n\nUse case:\n{body.use_case}",
    )
    db.add(inquiry)
    await db.commit()
    await db.refresh(inquiry)
    inquiry.recipient_name = "Enterprise Sales"
    return inquiry
