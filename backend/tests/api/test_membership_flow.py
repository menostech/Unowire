"""End-to-end: register -> freemium -> trial -> cancel -> (lazy) downgrade."""
import asyncio

import pytest
from sqlalchemy import text
from app.core.database import async_session, engine


@pytest.fixture(scope="session", autouse=True)
def _ensure_plans():
    """Idempotically seed the 3 subscription plans.

    The conftest ``db_session`` fixture DELETEs subscription_plans before each
    test that uses it (membership/subscription isolation). When this module's
    tests run after such tests, the plans are gone. This session-scoped fixture
    runs lazily (first test in this module) and re-seeds with ON CONFLICT DO
    NOTHING so the e2e flow has the personal/freemium/enterprise plans it needs.
    """

    async def _c():
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO subscription_plans (name, tier_level, price_monthly, price_yearly, currency,
                    search_limit_daily, detail_view_limit_daily, download_limit_monthly,
                    is_sales_led, is_active, features, sort_order, trial_days, created_at, updated_at)
                VALUES
                    ('Freemium', 'freemium', 0, 0, 'USD', 10, 20, 0, false, true, '[]'::jsonb, 0, 0, NOW(), NOW()),
                    ('Personal', 'personal', 15.00, 149.00, 'USD', NULL, NULL, NULL, false, true, '[]'::jsonb, 1, 14, NOW(), NOW()),
                    ('Enterprise', 'enterprise', 0, 0, 'USD', NULL, NULL, NULL, true, true, '[]'::jsonb, 2, 0, NOW(), NOW())
                ON CONFLICT (tier_level) DO NOTHING
            """))

    asyncio.run(_c())


def _login(client, email):
    res = client.post("/api/member/login", json={"email": email, "password": "test123456"})
    assert res.status_code == 200, res.text
    token = res.json().get("token") or res.cookies.get("member_token")
    return {"Authorization": f"Bearer {token}"}


def test_full_membership_flow(client):
    email = "flow@test-member.com"
    client.post("/api/member/register", json={
        "email": email, "password": "test123456", "name": "Flow",
    })
    # Verify the member so login succeeds (email verification is not part of the
    # membership-flow under test; the register endpoint leaves is_verified=False).
    async def _verify():
        async with async_session() as s:
            await s.execute(text("UPDATE members SET is_verified = true WHERE email = :e"), {"e": email})
            await s.commit()
    asyncio.run(_verify())
    h = _login(client, email)

    # Default freemium (auto-assigned at registration by Task 11).
    sub = client.get("/api/member/subscription", headers=h).json()
    assert sub["tier_level"] == "freemium"
    assert sub["status"] == "active"

    # Cancel freemium to make way for a personal trial (start_trial rejects
    # when an active/trialing subscription already exists).
    cancel_free = client.post("/api/member/subscription/cancel", headers=h)
    assert cancel_free.status_code == 200

    # Start trial.
    trial = client.post("/api/member/subscription/trial", json={"billing_cycle": "monthly"}, headers=h)
    assert trial.status_code == 201
    assert trial.json()["status"] == "trialing"

    # Cannot start a second trial while one is active.
    dup = client.post("/api/member/subscription/trial", json={"billing_cycle": "monthly"}, headers=h)
    assert dup.status_code == 409

    # Cancel.
    cancel = client.post("/api/member/subscription/cancel", headers=h)
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "cancelled"

    # Usage endpoint still works post-cancel.
    usage = client.get("/api/member/usage", headers=h)
    assert usage.status_code == 200

    # Cleanup.
    async def _del():
        async with async_session() as s:
            await s.execute(text("DELETE FROM usage_records WHERE member_id IN (SELECT id FROM members WHERE email=:e)"), {"e": email})
            await s.execute(text("DELETE FROM member_subscriptions WHERE member_id IN (SELECT id FROM members WHERE email=:e)"), {"e": email})
            await s.execute(text("DELETE FROM members WHERE email=:e"), {"e": email})
            await s.commit()
    asyncio.run(_del())
