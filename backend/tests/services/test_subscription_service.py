from datetime import datetime, timedelta

import pytest

from app.models.member_subscription import MemberSubscription
from app.models.subscription_plan import SubscriptionPlan
from app.services.subscription import SubscriptionService


@pytest.fixture
async def plans(db_session):
    f = SubscriptionPlan(
        name="Freemium", tier_level="freemium", price_monthly=0, price_yearly=0,
        search_limit_daily=10, detail_view_limit_daily=20, download_limit_monthly=0,
        is_sales_led=False, is_active=True, features=[], sort_order=0, trial_days=0,
    )
    p = SubscriptionPlan(
        name="Personal", tier_level="personal", price_monthly=15, price_yearly=149,
        search_limit_daily=0, detail_view_limit_daily=0, download_limit_monthly=0,
        is_sales_led=False, is_active=True, features=[], sort_order=1, trial_days=14,
    )
    db_session.add_all([f, p])
    await db_session.commit()
    await db_session.refresh(f)
    await db_session.refresh(p)
    return {"freemium": f, "personal": p}


async def _make_member(db_session, email="subsvc@test-member.com"):
    from app.models.member import Member
    from app.core.security import hash_password
    m = Member(email=email, password_hash=hash_password("test123456"), name="Sub Svc")
    db_session.add(m)
    await db_session.commit()
    await db_session.refresh(m)
    return m


@pytest.mark.asyncio
async def test_resolve_effective_plan_no_subscription_returns_freemium(db_session, plans):
    m = await _make_member(db_session, "nofreemium@test-member.com")
    tier, limits = await SubscriptionService(db_session).resolve_effective_plan(m.id)
    assert tier == "freemium"
    assert limits["search_limit_daily"] == 10
    assert limits["detail_view_limit_daily"] == 20


@pytest.mark.asyncio
async def test_resolve_effective_plan_trialing_uses_snapshot(db_session, plans):
    m = await _make_member(db_session, "trialing@test-member.com")
    sub = MemberSubscription(
        member_id=m.id, plan_id=plans["personal"].id, status="trialing",
        trial_start=datetime.utcnow(), trial_end=datetime.utcnow() + timedelta(days=14),
        snapshot_search_limit=0, snapshot_detail_limit=0, snapshot_download_limit=0,
    )
    db_session.add(sub)
    await db_session.commit()
    tier, limits = await SubscriptionService(db_session).resolve_effective_plan(m.id)
    assert tier == "personal"
    assert limits["search_limit_daily"] == 0  # unlimited snapshot


@pytest.mark.asyncio
async def test_resolve_effective_plan_expired_trial_downgrades(db_session, plans):
    m = await _make_member(db_session, "expiredtrial@test-member.com")
    sub = MemberSubscription(
        member_id=m.id, plan_id=plans["personal"].id, status="trialing",
        trial_start=datetime.utcnow() - timedelta(days=20),
        trial_end=datetime.utcnow() - timedelta(days=6),
        snapshot_search_limit=0, snapshot_detail_limit=0, snapshot_download_limit=0,
    )
    db_session.add(sub)
    await db_session.commit()
    tier, limits = await SubscriptionService(db_session).resolve_effective_plan(m.id)
    assert tier == "freemium"
    assert limits["search_limit_daily"] == 10
    await db_session.refresh(sub)
    assert sub.status == "expired"


@pytest.mark.asyncio
async def test_resolve_effective_plan_cancelled_before_period_end_keeps_limits(db_session, plans):
    m = await _make_member(db_session, "cancelledactive@test-member.com")
    sub = MemberSubscription(
        member_id=m.id, plan_id=plans["personal"].id, status="cancelled",
        current_period_start=datetime.utcnow() - timedelta(days=10),
        current_period_end=datetime.utcnow() + timedelta(days=20),
        cancelled_at=datetime.utcnow(),
        snapshot_search_limit=0, snapshot_detail_limit=0, snapshot_download_limit=0,
    )
    db_session.add(sub)
    await db_session.commit()
    tier, limits = await SubscriptionService(db_session).resolve_effective_plan(m.id)
    assert tier == "personal"
    assert limits["search_limit_daily"] == 0
