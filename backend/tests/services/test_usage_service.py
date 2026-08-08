from datetime import date, datetime, timedelta

import pytest

from app.services.usage import UsageService


async def _make_member(db_session, email="usage@test-member.com"):
    from app.models.member import Member
    from app.core.security import hash_password
    m = Member(email=email, password_hash=hash_password("test123456"), name="Usage")
    db_session.add(m)
    await db_session.commit()
    await db_session.refresh(m)
    return m


@pytest.mark.asyncio
async def test_increment_and_check_within_limit(db_session):
    m = await _make_member(db_session, "within@test-member.com")
    svc = UsageService(db_session)
    assert await svc.increment_and_check(m.id, "search", 2) is True
    assert await svc.increment_and_check(m.id, "search", 2) is True
    assert await svc.increment_and_check(m.id, "search", 2) is False  # 3rd blocked


@pytest.mark.asyncio
async def test_increment_usage_unconditional(db_session):
    m = await _make_member(db_session, "uncond@test-member.com")
    svc = UsageService(db_session)
    await svc.increment_usage(m.id, "detail_view")
    await svc.increment_usage(m.id, "detail_view")
    rec = await svc.get_today_usage(m.id)
    assert rec is not None
    assert rec.detail_view_count == 2


@pytest.mark.asyncio
async def test_get_monthly_download_count_sums_current_month(db_session):
    from app.models.usage_record import UsageRecord
    m = await _make_member(db_session, "monthly@test-member.com")
    today = date.today()
    first_of_month = today.replace(day=1)
    # One record today, one earlier this month, one last month (should be excluded).
    db_session.add_all([
        UsageRecord(member_id=m.id, record_date=today, download_count=3),
        UsageRecord(member_id=m.id, record_date=first_of_month, download_count=2),
        UsageRecord(member_id=m.id, record_date=first_of_month - timedelta(days=1), download_count=99),
    ])
    await db_session.commit()
    count = await UsageService(db_session).get_monthly_download_count(m.id)
    assert count == 5


@pytest.mark.asyncio
async def test_download_uses_monthly_aggregation(db_session):
    m = await _make_member(db_session, "dlmonth@test-member.com")
    svc = UsageService(db_session)
    # Monthly limit of 2: two downloads allowed, third blocked (counts across the month).
    assert await svc.increment_and_check(m.id, "download", 2) is True
    assert await svc.increment_and_check(m.id, "download", 2) is True
    assert await svc.increment_and_check(m.id, "download", 2) is False
