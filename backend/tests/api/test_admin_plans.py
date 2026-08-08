import asyncio

import pytest
from sqlalchemy import text
from app.core.database import async_session


@pytest.fixture(scope="session", autouse=True)
def _ensure_plans():
    """Idempotently seed the 3 subscription plans.

    Autouse fixtures defined in a test module only apply to that module, so this
    mirrors the session fixture in test_plans_public.py. Without it, these tests
    run (alphabetically) before test_plans_public.py and find an empty table.
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


def test_public_plans_returns_three_active(client):
    res = client.get("/api/plans")
    assert res.status_code == 200, res.text
    tiers = {p["tier_level"] for p in res.json()}
    assert tiers == {"freemium", "personal", "enterprise"}


def test_admin_list_plans_includes_inactive(client, admin_headers):
    res = client.get("/api/admin/plans", headers=admin_headers)
    assert res.status_code == 200, res.text
    assert isinstance(res.json(), list)


def test_admin_update_plan_changes_quota(client, admin_headers):
    plans = client.get("/api/admin/plans", headers=admin_headers).json()
    freemium = next(p for p in plans if p["tier_level"] == "freemium")
    res = client.put(
        f"/api/admin/plans/{freemium['id']}",
        json={"search_limit_daily": 25},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["search_limit_daily"] == 25
    # Restore
    client.put(f"/api/admin/plans/{freemium['id']}", json={"search_limit_daily": 10}, headers=admin_headers)


def test_admin_create_plan(client, admin_headers):
    res = client.post(
        "/api/admin/plans",
        json={
            "name": "Pro", "tier_level": "pro", "price_monthly": 29,
            "price_yearly": 290, "search_limit_daily": 100,
            "detail_view_limit_daily": 200, "download_limit_monthly": 50,
            "is_sales_led": False, "is_active": True, "features": ["x"], "sort_order": 5, "trial_days": 7,
        },
        headers=admin_headers,
    )
    assert res.status_code == 201, res.text
    assert res.json()["tier_level"] == "pro"
    # cleanup
    client.delete(f"/api/admin/plans/{res.json()['id']}", headers=admin_headers)


def test_admin_delete_plan_soft_deletes(client, admin_headers):
    res = client.post(
        "/api/admin/plans",
        json={"name": "Tmp", "tier_level": "tmp_del", "price_monthly": 0,
              "price_yearly": 0, "search_limit_daily": 1, "detail_view_limit_daily": 1,
              "download_limit_monthly": 0, "is_sales_led": False, "is_active": True,
              "features": [], "sort_order": 99, "trial_days": 0},
        headers=admin_headers,
    )
    pid = res.json()["id"]
    dele = client.delete(f"/api/admin/plans/{pid}", headers=admin_headers)
    assert dele.status_code == 204, dele.text
    # Not in public list...
    public = {p["tier_level"] for p in client.get("/api/plans").json()}
    assert "tmp_del" not in public


def test_admin_create_enterprise_subscription(client, admin_headers):
    import asyncio
    from datetime import datetime, timedelta
    from sqlalchemy import text
    from app.core.database import async_session

    async def _c():
        async with async_session() as s:
            await s.execute(text(
                "INSERT INTO members (email, password_hash, name, is_active, is_verified, created_at, updated_at) "
                "VALUES ('entadmin@test-member.com', 'x', 'Ent Admin', true, true, NOW(), NOW()) "
                "ON CONFLICT (email) DO NOTHING"
            ))
            await s.commit()
    asyncio.run(_c())
    members = client.get("/api/admin/members?q=entadmin", headers=admin_headers).json()
    mid = members["items"][0]["id"] if isinstance(members, dict) else members[0]["id"]
    res = client.post(
        f"/api/admin/members/{mid}/subscription",
        json={"period_end": (datetime.utcnow() + timedelta(days=365)).isoformat()},
        headers=admin_headers,
    )
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "active"


def test_admin_subscriptions_list(client, admin_headers):
    res = client.get("/api/admin/subscriptions", headers=admin_headers)
    assert res.status_code == 200, res.text
    assert isinstance(res.json(), list)


def test_admin_usage_analytics(client, admin_headers):
    res = client.get("/api/admin/usage-analytics", headers=admin_headers)
    assert res.status_code == 200, res.text
    assert isinstance(res.json(), list)
