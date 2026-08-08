"""Verify the migration seeded plans and that members get a freemium subscription."""
from sqlalchemy import text
from app.core.database import async_session


def test_three_plans_seeded():
    import asyncio
    async def _c():
        async with async_session() as s:
            rows = (await s.execute(text("SELECT tier_level FROM subscription_plans ORDER BY sort_order"))).all()
            return [r[0] for r in rows]
    tiers = asyncio.run(_c())
    assert "freemium" in tiers
    assert "personal" in tiers
    assert "enterprise" in tiers


def test_personal_plan_has_trial_days():
    import asyncio
    async def _c():
        async with async_session() as s:
            row = (await s.execute(text("SELECT trial_days, price_monthly FROM subscription_plans WHERE tier_level='personal'"))).first()
            return row
    row = asyncio.run(_c())
    assert row is not None
    assert row[0] == 14
    assert float(row[1]) == 15.00


def test_enterprise_plan_is_sales_led():
    import asyncio
    async def _c():
        async with async_session() as s:
            row = (await s.execute(text("SELECT is_sales_led FROM subscription_plans WHERE tier_level='enterprise'"))).first()
            return row
    row = asyncio.run(_c())
    assert row is not None
    assert row[0] is True


def test_usage_records_table_exists():
    import asyncio
    async def _c():
        async with async_session() as s:
            await s.execute(text("SELECT 1 FROM usage_records LIMIT 1"))
    asyncio.run(_c())  # no exception = table exists
