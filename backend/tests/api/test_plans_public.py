import asyncio

import pytest
from sqlalchemy import text
from app.core.security import hash_password
from app.core.database import async_session


@pytest.fixture(scope="session", autouse=True)
def _ensure_plans():
    """Idempotently seed the 3 subscription plans.

    The membership migration (m1n2o3p4q5r6) seeds these once at DB creation,
    but conftest's `db_session` fixture DELETEs subscription_plans before each
    test that uses it (for membership/subscription test isolation). A prior
    service-test run therefore leaves the table empty, and these API tests —
    which only use the `client` fixture — rely on the plans existing. Re-seed
    with ON CONFLICT DO NOTHING so this is a no-op when plans are already present.
    """
    async def _seed():
        async with async_session() as s:
            await s.execute(text(
                "INSERT INTO subscription_plans "
                "(name, tier_level, price_monthly, price_yearly, currency, "
                " search_limit_daily, detail_view_limit_daily, download_limit_monthly, "
                " is_sales_led, is_active, features, sort_order, trial_days, created_at, updated_at) "
                "VALUES "
                "  ('Freemium', 'freemium', 0, 0, 'USD', 10, 20, 0, false, true, "
                "   '[]'::jsonb, 0, 0, NOW(), NOW()), "
                "  ('Personal', 'personal', 15.00, 149.00, 'USD', 0, 0, 0, false, true, "
                "   '[]'::jsonb, 1, 14, NOW(), NOW()), "
                "  ('Enterprise', 'enterprise', 0, 0, 'USD', 0, 0, 0, true, true, "
                "   '[]'::jsonb, 2, 0, NOW(), NOW()) "
                "ON CONFLICT (tier_level) DO NOTHING"
            ))
            await s.commit()
    asyncio.run(_seed())


def _create_member(email):
    async def _c():
        async with async_session() as s:
            await s.execute(
                text(
                    "INSERT INTO members (email, password_hash, name, is_active, is_verified, created_at, updated_at) "
                    "VALUES (:e, :p, 'API Member', true, true, NOW(), NOW()) ON CONFLICT (email) DO UPDATE "
                    "SET password_hash = EXCLUDED.password_hash, is_verified = true RETURNING id"
                ),
                {"e": email, "p": hash_password("test123456")},
            )
            await s.commit()
    asyncio.run(_c())


def _login_cookie(client, email):
    res = client.post("/api/member/login", json={"email": email, "password": "test123456"})
    assert res.status_code == 200, res.text
    # get_current_member reads the token via OAuth2PasswordBearer (Authorization
    # Bearer header), not the cookie jar — match the codebase-wide member-test
    # convention (see tests/api/test_member_inquiries.py).
    return {"Authorization": f"Bearer {res.cookies.get('member_token')}"}


def test_member_usage_returns_freemium_limits(client):
    _create_member("usageapi@test-member.com")
    h = _login_cookie(client, "usageapi@test-member.com")
    res = client.get("/api/member/usage", headers=h)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["plan"] == "freemium"
    assert body["today"]["search"]["limit"] == 10
    assert body["today"]["detail_view"]["limit"] == 20
    assert body["this_month"]["download"]["limit"] == 0


def test_member_subscription_status_default_freemium(client):
    _create_member("substatus@test-member.com")
    h = _login_cookie(client, "substatus@test-member.com")
    res = client.get("/api/member/subscription", headers=h)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["tier_level"] == "freemium"
    assert body["status"] == "active"


def test_start_personal_trial(client):
    _create_member("trialapi@test-member.com")
    h = _login_cookie(client, "trialapi@test-member.com")
    res = client.post("/api/member/subscription/trial", json={"billing_cycle": "monthly"}, headers=h)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "trialing"
    assert body["tier_level"] == "personal"
    assert body["trial_end"] is not None


def test_cancel_subscription(client):
    _create_member("cancelapi@test-member.com")
    h = _login_cookie(client, "cancelapi@test-member.com")
    client.post("/api/member/subscription/trial", json={"billing_cycle": "monthly"}, headers=h)
    res = client.post("/api/member/subscription/cancel", headers=h)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "cancelled"


def test_enterprise_inquiry_creates_inquiry(client):
    _create_member("entinq@test-member.com")
    h = _login_cookie(client, "entinq@test-member.com")
    res = client.post(
        "/api/inquiries/enterprise",
        json={"company_name": "Acme Corp", "use_case": "Bulk spec access for 50 engineers"},
        headers=h,
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["recipient_type"] == "enterprise_sales"
    assert body["subject"] == "Enterprise Subscription Inquiry"


def test_public_plans_returns_three_active(client):
    res = client.get("/api/plans")
    assert res.status_code == 200, res.text
    tiers = {p["tier_level"] for p in res.json()}
    assert tiers == {"freemium", "personal", "enterprise"}
