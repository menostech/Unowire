"""Service-level test fixtures.

Ensures a member row with id=1 exists for service tests that hardcode
`member_id=1` (e.g. the subscription checkout tests). The root `db_session`
fixture wipes `member_subscriptions` and `subscription_plans` before each test
but does not seed members, and the FK on `member_subscriptions.member_id`
requires a matching member row.
"""
import pytest
from sqlalchemy import text

from app.core.security import hash_password


@pytest.fixture(autouse=True)
async def _ensure_member_id_1(db_session):
    """Idempotently insert a member with id=1 and advance the id sequence.

    Using an explicit id=1 keeps the auto-increment sequence stale, so we
    bump it past MAX(id) to avoid conflicts when other tests create members
    via the ORM (auto-increment).
    """
    await db_session.execute(
        text(
            "INSERT INTO members (id, email, password_hash, name, is_active, is_verified, created_at, updated_at) "
            "VALUES (1, :email, :ph, 'Test Member 1', true, true, NOW(), NOW()) "
            "ON CONFLICT (id) DO UPDATE SET "
            "email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, "
            "name = EXCLUDED.name, is_active = true, is_verified = true"
        ),
        {"email": "member1@test-member.com", "ph": hash_password("test123456")},
    )
    await db_session.execute(
        text("SELECT setval('members_id_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM members), 1))")
    )
    await db_session.commit()
