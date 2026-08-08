from datetime import date

import pytest

from app.models.member import Member
from app.models.subscription_plan import SubscriptionPlan
from app.models.usage_record import UsageRecord
from app.core.security import hash_password


async def _seed_freemium_member(db_session, email="quota@test-member.com", used_search=0):
    m = Member(email=email, password_hash=hash_password("test123456"), name="Quota", is_verified=True)
    db_session.add(m)
    await db_session.commit()
    await db_session.refresh(m)
    # Backfill an active freemium subscription (limits 10/20/0) as the migration would.
    from app.models.member_subscription import MemberSubscription
    import sqlalchemy
    plan = await db_session.execute(
        sqlalchemy.select(SubscriptionPlan).where(SubscriptionPlan.tier_level == "freemium")
    )
    plan = plan.scalar_one_or_none()
    if plan is None:
        plan = SubscriptionPlan(
            name="Freemium", tier_level="freemium", price_monthly=0, price_yearly=0,
            search_limit_daily=10, detail_view_limit_daily=20, download_limit_monthly=0,
            is_sales_led=False, is_active=True, features=[], sort_order=0, trial_days=0,
        )
        db_session.add(plan)
        await db_session.commit()
        await db_session.refresh(plan)
    db_session.add(MemberSubscription(
        member_id=m.id, plan_id=plan.id, status="active",
        snapshot_search_limit=10, snapshot_detail_limit=20, snapshot_download_limit=0,
    ))
    if used_search:
        db_session.add(UsageRecord(member_id=m.id, record_date=date.today(), search_count=used_search))
    await db_session.commit()
    return m


def test_require_quota_allows_anonymous(client):
    """Anonymous requests pass through unmetered (public-site preservation)."""
    res = client.get("/api/cables?page_size=1")
    # Public list endpoint still works for anonymous users.
    assert res.status_code == 200


def test_require_quota_blocks_member_over_limit(client, db_session):
    import asyncio
    m = asyncio.run(_seed_freemium_member(db_session, "overlimit@test-member.com", used_search=10))
    # Log in as the member.
    res = client.post("/api/member/login", json={"email": "overlimit@test-member.com", "password": "test123456"})
    assert res.status_code == 200
    token = res.json().get("token") or res.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {token}"}
    # 11th search should be blocked.
    blocked = client.get("/api/cables?page_size=1", headers=headers)
    assert blocked.status_code == 429
    assert blocked.headers.get("X-RateLimit-Remaining") == "0"
    assert "Daily search limit exceeded" in blocked.json()["message"]


def test_require_quota_allows_member_under_limit(client, db_session):
    import asyncio
    asyncio.run(_seed_freemium_member(db_session, "underlimit@test-member.com", used_search=2))
    res = client.post("/api/member/login", json={"email": "underlimit@test-member.com", "password": "test123456"})
    token = res.json().get("token") or res.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {token}"}
    ok = client.get("/api/cables?page_size=1", headers=headers)
    assert ok.status_code == 200


def test_detail_view_quota_blocks_member(client, db_session):
    import asyncio
    from datetime import date
    from app.models.member import Member
    from app.models.member_subscription import MemberSubscription
    from app.models.subscription_plan import SubscriptionPlan
    from app.models.usage_record import UsageRecord
    from app.core.security import hash_password
    from sqlalchemy import select

    async def _c():
        m = Member(email="dvquota@test-member.com", password_hash=hash_password("test123456"),
                   name="DV", is_verified=True)
        db_session.add(m)
        await db_session.commit()
        await db_session.refresh(m)
        plan = (await db_session.execute(select(SubscriptionPlan).where(SubscriptionPlan.tier_level == "freemium"))).scalar_one_or_none()
        if plan is None:
            plan = SubscriptionPlan(name="Freemium", tier_level="freemium", price_monthly=0, price_yearly=0,
                search_limit_daily=10, detail_view_limit_daily=20, download_limit_monthly=0,
                is_sales_led=False, is_active=True, features=[], sort_order=0, trial_days=0)
            db_session.add(plan)
            await db_session.commit()
            await db_session.refresh(plan)
        db_session.add(MemberSubscription(member_id=m.id, plan_id=plan.id, status="active",
            snapshot_search_limit=10, snapshot_detail_limit=1, snapshot_download_limit=0))
        db_session.add(UsageRecord(member_id=m.id, record_date=date.today(), detail_view_count=1))
        await db_session.commit()
        return m
    asyncio.run(_c())
    res = client.post("/api/member/login", json={"email": "dvquota@test-member.com", "password": "test123456"})
    token = res.json().get("token") or res.cookies.get("member_token")
    h = {"Authorization": f"Bearer {token}"}
    # Fetch a real cable from the public list (anonymous, unmetered).
    cables_res = client.get("/api/cables?page_size=1")
    cable = cables_res.json()["items"][0] if cables_res.json().get("items") else None
    if cable:
        mfr = cable.get("manufacturer") or {}
        mfr_slug = mfr.get("slug")
        cable_slug = cable.get("slug")
        if mfr_slug and cable_slug:
            # by-url endpoint has require_quota("detail_view"); member is at limit -> 429.
            blocked = client.get(f"/api/cables/by-url/{mfr_slug}/{cable_slug}", headers=h)
            assert blocked.status_code == 429


def test_download_quota_unlimited_for_freemium(client, db_session):
    import asyncio
    from app.models.member import Member
    from app.models.member_subscription import MemberSubscription
    from app.models.subscription_plan import SubscriptionPlan
    from app.core.security import hash_password
    from sqlalchemy import select

    async def _c():
        m = Member(email="dlfree@test-member.com", password_hash=hash_password("test123456"),
                   name="DL", is_verified=True)
        db_session.add(m)
        await db_session.commit()
        await db_session.refresh(m)
        plan = (await db_session.execute(select(SubscriptionPlan).where(SubscriptionPlan.tier_level == "freemium"))).scalar_one_or_none()
        if plan is None:
            plan = SubscriptionPlan(name="Freemium", tier_level="freemium", price_monthly=0, price_yearly=0,
                search_limit_daily=10, detail_view_limit_daily=20, download_limit_monthly=0,
                is_sales_led=False, is_active=True, features=[], sort_order=0, trial_days=0)
            db_session.add(plan)
            await db_session.commit()
            await db_session.refresh(plan)
        db_session.add(MemberSubscription(member_id=m.id, plan_id=plan.id, status="active",
            snapshot_search_limit=10, snapshot_detail_limit=20, snapshot_download_limit=0))
        await db_session.commit()
    asyncio.run(_c())
    res = client.post("/api/member/login", json={"email": "dlfree@test-member.com", "password": "test123456"})
    token = res.json().get("token") or res.cookies.get("member_token")
    h = {"Authorization": f"Bearer {token}"}
    # Freemium download limit is 0 (unlimited) -> never blocked, but still counted.
    resources = client.get("/api/resources?page_size=1").json().get("items", [])
    if resources:
        dl = client.get(f"/api/resources/{resources[0]['id']}/download", headers=h)
        # 200 (download served) or 404 (no file) — but NOT 429.
        assert dl.status_code != 429
