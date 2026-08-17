import os
import sys
from pathlib import Path

# Add backend to path so tests can import app
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# asyncpg + SQLAlchemy's AsyncAdaptedQueuePool + Starlette TestClient are
# incompatible: pooled asyncpg connections end up in a stuck protocol state
# between in-process requests ("cannot perform operation: another operation is
# in progress"). Switching the test engine to NullPool (no connection reuse)
# eliminates the stale-connection problem without touching production code.
# `get_db` resolves `async_session` as a module global at call time, so
# reassigning it here is picked up by every route that depends on get_db.
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.core.database as _db_module
from app.core.config import settings

_test_engine = create_async_engine(settings.database_url, poolclass=NullPool)
_db_module.engine = _test_engine
_db_module.async_session = async_sessionmaker(
    _test_engine, class_=AsyncSession, expire_on_commit=False
)

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_data():
    """Clean up test-created data before the test session to avoid 409 conflicts
    from previous test runs (tests don't clean up after themselves)."""
    import asyncio
    from sqlalchemy import text

    async def _cleanup():
        async with _test_engine.begin() as conn:
            # Truncate page_views (per-test cleanup also runs, but this ensures
            # cross-session isolation for the page_views table)
            await conn.execute(text("TRUNCATE TABLE page_views"))
            # Clean up test pages
            await conn.execute(text("DELETE FROM pages WHERE id LIKE 'page-test-%' OR slug LIKE 'test-%'"))
            # Clean up test site menu items
            await conn.execute(text("DELETE FROM site_menu_items WHERE id LIKE 'test-%'"))
            # Clean up test-scoped media folders + uploads (scoped media folders feature)
            await conn.execute(text(
                "DELETE FROM uploads WHERE folder_id IN (SELECT id FROM media_folders "
                "WHERE scope_id IN ('mfr-1', 'em-1', 'mfr-test-provision', 'mfr-test-idem', "
                "'mfr-test-delete', 'mfr-test-rename'))"
            ))
            await conn.execute(text(
                "DELETE FROM media_folders WHERE scope_id IN "
                "('mfr-1', 'em-1', 'mfr-test-provision', 'mfr-test-idem', "
                "'mfr-test-delete', 'mfr-test-rename')"
            ))
            # Clean up test manufacturers created by test_media_scope.py
            await conn.execute(text(
                "DELETE FROM manufacturers WHERE id IN "
                "('mfr-test-provision', 'mfr-test-idem', 'mfr-test-delete', 'mfr-test-rename')"
            ))
            # Delete non-admin users BEFORE roles (users.role_id -> roles.id FK is ON DELETE RESTRICT)
            await conn.execute(text(
                "DELETE FROM users WHERE email != 'admin@unowire.com'"
            ))
            await conn.execute(text(
                "DELETE FROM role_permissions WHERE role_id IN "
                "('viewer', 'editor_v2', 'temp', 'bad', 'cable_manager_test', 'equip_manager_test')"
            ))
            await conn.execute(text(
                "DELETE FROM roles WHERE id IN "
                "('viewer', 'editor_v2', 'temp', 'bad', 'cable_manager_test', 'equip_manager_test')"
            ))
            await conn.execute(text("DELETE FROM usage_records WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-member.com')"))
            await conn.execute(text("DELETE FROM member_subscriptions WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-member.com')"))
            await conn.execute(text("DELETE FROM subscription_plans WHERE tier_level IN ('pro','tmp_del')"))
            await conn.execute(text("DELETE FROM inquiries WHERE sender_id IN (SELECT id FROM members WHERE email LIKE '%@test-member.com')"))
            await conn.execute(text("DELETE FROM members WHERE email LIKE '%@test-member.com'"))

    asyncio.run(_cleanup())


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    """Yields a short-lived async DB session and ensures factory test users are seeded.

    Used as an unused parameter in some tests (e.g., portal login tests) to
    express the dependency on cable_manager@test.com / equip_manager@test.com
    existing in the DB before login. The seeding is idempotent — duplicates the
    INSERT...ON CONFLICT logic from cable_manager_headers/equipment_manager_headers
    so tests that don't depend on those header fixtures still have the users.
    """
    import asyncio
    from sqlalchemy import text
    from app.core.security import hash_password
    from app.core.database import async_session
    from app.crud.folder import crud_folder

    async def _seed():
        async with _test_engine.begin() as conn:
            # Membership/subscription test isolation: tests commit (no per-test
            # rollback) and the seed migration pre-populates subscription_plans
            # (freemium/personal/enterprise) plus a freemium member_subscriptions
            # row per member. That collides with the `plans` fixture's INSERT on
            # the tier_level unique constraint both with seeded data and across
            # tests in the same session. Wipe both tables before each test.
            await conn.execute(text("DELETE FROM member_subscriptions"))
            await conn.execute(text("DELETE FROM subscription_plans"))
            # cable_manager@test.com (manufacturer scope)
            await conn.execute(text(
                "INSERT INTO roles (id, name, scope_type, is_system) "
                "VALUES ('cable_manager_test', 'Cable Manager Test', 'manufacturer', false) "
                "ON CONFLICT (id) DO NOTHING"
            ))
            for mod in ("media", "manufacturers"):
                await conn.execute(text(
                    "INSERT INTO role_permissions (role_id, module) "
                    "VALUES ('cable_manager_test', :mod) ON CONFLICT DO NOTHING"
                ), {"mod": mod})
            await conn.execute(text(
                "INSERT INTO users (email, password_hash, role_id, scope_id, is_active, created_at, updated_at) "
                "VALUES ('cable_manager@test.com', :ph, 'cable_manager_test', 'mfr-1', true, NOW(), NOW()) "
                "ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash"
            ), {"ph": hash_password("test123456")})
            # equip_manager@test.com (equipment_manufacturer scope)
            await conn.execute(text(
                "INSERT INTO roles (id, name, scope_type, is_system) "
                "VALUES ('equip_manager_test', 'Equipment Manager Test', 'equipment_manufacturer', false) "
                "ON CONFLICT (id) DO NOTHING"
            ))
            for mod in ("media", "equipment_mfrs"):
                await conn.execute(text(
                    "INSERT INTO role_permissions (role_id, module) "
                    "VALUES ('equip_manager_test', :mod) ON CONFLICT DO NOTHING"
                ), {"mod": mod})
            await conn.execute(text(
                "INSERT INTO users (email, password_hash, role_id, scope_id, is_active, created_at, updated_at) "
                "VALUES ('equip_manager@test.com', :ph, 'equip_manager_test', 'em-1', true, NOW(), NOW()) "
                "ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash"
            ), {"ph": hash_password("test123456")})
        # Ensure media folders exist for both scopes (idempotent)
        async with async_session() as s:
            await crud_folder.provision_for_manufacturer(
                s, scope_type="manufacturer", scope_id="mfr-1", name="Test Cable Mfr"
            )
            await crud_folder.provision_for_manufacturer(
                s, scope_type="equipment_manufacturer", scope_id="em-1", name="Test Equip Mfr"
            )

    asyncio.run(_seed())

    async def _make():
        return async_session()

    session = asyncio.run(_make())
    try:
        yield session
    finally:
        # When this sync fixture is used from an async test (pytest-asyncio),
        # the session's connection binds to pytest-asyncio's event loop, which
        # is closed by the time teardown runs — so `asyncio.run(session.close())`
        # raises against a closed loop. NullPool means no connection reuse, so
        # abandoning the close here is safe and keeps teardown pristine.
        try:
            asyncio.run(session.close())
        except Exception:
            pass


@pytest.fixture
def admin_headers(client):
    """Login as admin and return auth headers."""
    res = client.post(
        "/api/auth/login",
        json={"email": "admin@unowire.com", "password": "admin123456"},
    )
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def cable_manager_headers(client):
    """Login as a cable_manager (scoped to mfr-1) and return auth headers.
    Creates the role + user + media folders if they don't exist (idempotent).
    """
    import asyncio
    from sqlalchemy import text
    from app.core.security import hash_password
    from app.core.database import async_session
    from app.crud.folder import crud_folder

    async def _setup():
        async with _test_engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO roles (id, name, scope_type, is_system) "
                "VALUES ('cable_manager_test', 'Cable Manager Test', 'manufacturer', false) "
                "ON CONFLICT (id) DO NOTHING"
            ))
            for mod in ("media", "manufacturers"):
                await conn.execute(text(
                    "INSERT INTO role_permissions (role_id, module) "
                    "VALUES ('cable_manager_test', :mod) ON CONFLICT DO NOTHING"
                ), {"mod": mod})
            await conn.execute(text(
                "INSERT INTO users (email, password_hash, role_id, scope_id, is_active, created_at, updated_at) "
                "VALUES ('cable_manager@test.com', :ph, 'cable_manager_test', 'mfr-1', true, NOW(), NOW()) "
                "ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash"
            ), {"ph": hash_password("test123456")})
        # Ensure media folders exist for this scope (idempotent)
        async with async_session() as s:
            await crud_folder.provision_for_manufacturer(
                s, scope_type="manufacturer", scope_id="mfr-1", name="Test Cable Mfr"
            )

    asyncio.run(_setup())
    res = client.post(
        "/api/portal/auth/login",
        json={"email": "cable_manager@test.com", "password": "test123456"},
    )
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def equipment_manager_headers(client):
    """Login as an equipment_manager (scoped to em-1) and return auth headers."""
    import asyncio
    from sqlalchemy import text
    from app.core.security import hash_password
    from app.core.database import async_session
    from app.crud.folder import crud_folder

    async def _setup():
        async with _test_engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO roles (id, name, scope_type, is_system) "
                "VALUES ('equip_manager_test', 'Equipment Manager Test', 'equipment_manufacturer', false) "
                "ON CONFLICT (id) DO NOTHING"
            ))
            for mod in ("media", "equipment_mfrs"):
                await conn.execute(text(
                    "INSERT INTO role_permissions (role_id, module) "
                    "VALUES ('equip_manager_test', :mod) ON CONFLICT DO NOTHING"
                ), {"mod": mod})
            await conn.execute(text(
                "INSERT INTO users (email, password_hash, role_id, scope_id, is_active, created_at, updated_at) "
                "VALUES ('equip_manager@test.com', :ph, 'equip_manager_test', 'em-1', true, NOW(), NOW()) "
                "ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash"
            ), {"ph": hash_password("test123456")})
        # Ensure media folders exist for this scope (idempotent)
        async with async_session() as s:
            await crud_folder.provision_for_manufacturer(
                s, scope_type="equipment_manufacturer", scope_id="em-1", name="Test Equip Mfr"
            )

    asyncio.run(_setup())
    res = client.post(
        "/api/portal/auth/login",
        json={"email": "equip_manager@test.com", "password": "test123456"},
    )
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def factory_user_headers(cable_manager_headers):
    """Alias for cable_manager_headers — factory user with manufacturer scope."""
    return cable_manager_headers


@pytest.fixture
def equipment_factory_user_headers(equipment_manager_headers):
    """Alias for equipment_manager_headers — factory user with equipment_manufacturer scope."""
    return equipment_manager_headers


# ---------------------------------------------------------------------------
# Subscription plan fixtures
#
# Used by service-level tests that need a Personal or Freemium plan row
# pre-inserted. The `db_session` fixture wipes `subscription_plans` before each
# test, so each test re-inserts the plan(s) it needs.
# ---------------------------------------------------------------------------
@pytest.fixture
async def freemium_plan(db_session):
    from app.models.subscription_plan import SubscriptionPlan

    plan = SubscriptionPlan(
        name="Freemium",
        tier_level="freemium",
        price_monthly=0,
        price_yearly=0,
        search_limit_daily=10,
        detail_view_limit_daily=20,
        download_limit_monthly=0,
        is_sales_led=False,
        is_active=True,
        features=[],
        sort_order=0,
        trial_days=0,
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan


@pytest.fixture
async def personal_plan(db_session):
    from app.models.subscription_plan import SubscriptionPlan

    plan = SubscriptionPlan(
        name="Personal",
        tier_level="personal",
        price_monthly=15,
        price_yearly=149,
        search_limit_daily=None,
        detail_view_limit_daily=None,
        download_limit_monthly=None,
        is_sales_led=False,
        is_active=True,
        features=[],
        sort_order=1,
        trial_days=14,
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan


@pytest.fixture
async def enterprise_plan(db_session):
    from app.models.subscription_plan import SubscriptionPlan

    plan = SubscriptionPlan(
        name="Enterprise",
        tier_level="enterprise",
        price_monthly=0,
        price_yearly=0,
        search_limit_daily=None,
        detail_view_limit_daily=None,
        download_limit_monthly=None,
        is_sales_led=True,
        is_active=True,
        features=[],
        sort_order=3,
        trial_days=0,
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan


@pytest.fixture
def member_token(client, db_session, personal_plan):
    """Register a unique test member, verify them via raw SQL, log in, and
    return the JWT token string (not a dict)."""
    import asyncio
    import uuid
    from sqlalchemy import text
    from app.core.database import async_session

    email = f"checkout-{uuid.uuid4().hex[:8]}@test-member.com"
    res = client.post("/api/member/register", json={
        "email": email, "password": "test123456", "name": "Checkout Test",
    })
    assert res.status_code == 200, f"Register failed: {res.text}"

    async def _verify():
        async with async_session() as s:
            await s.execute(text("UPDATE members SET is_verified = true WHERE email = :e"), {"e": email})
            await s.commit()

    asyncio.run(_verify())

    res = client.post("/api/member/login", json={"email": email, "password": "test123456"})
    assert res.status_code == 200, f"Login failed: {res.text}"
    # The login endpoint sets the token in an httponly cookie (member_token),
    # not in the JSON body (which only contains the member profile).
    token = res.json().get("token") or res.cookies.get("member_token")
    assert token, f"No token in login response: {res.text}"
    return token


@pytest.fixture
async def paid_subscription(member_token, personal_plan, db_session):
    """Insert a MemberSubscription with status=paid for the authenticated member.

    Decodes the member_id from the token (member_token returns only the token
    string) and inserts via the test's ``db_session`` so the returned object
    stays attached to that session — letting service-level tests call
    ``db_session.refresh(sub)`` after a handler mutation.
    """
    from datetime import datetime, timedelta
    from app.core.security import decode_member_token
    from app.models.member_subscription import MemberSubscription

    payload = decode_member_token(member_token)
    member_id = int(payload["sub"])

    sub = MemberSubscription(
        member_id=member_id,
        plan_id=personal_plan.id,
        status="paid",
        billing_cycle="monthly",
        current_period_end=datetime.utcnow() + timedelta(days=30),
        snapshot_search_limit=personal_plan.search_limit_daily,
        snapshot_detail_limit=personal_plan.detail_view_limit_daily,
        snapshot_download_limit=personal_plan.download_limit_monthly,
        gateway="stripe",
        gateway_subscription_id=f"sub_test_{member_id}",
    )
    db_session.add(sub)
    await db_session.commit()
    await db_session.refresh(sub)
    return sub


@pytest.fixture
async def past_due_subscription(member_token, personal_plan, db_session):
    """Insert a MemberSubscription with status=past_due for the authenticated member.

    Mirrors the ``paid_subscription`` fixture pattern: inserts via the test's
    ``db_session`` so the returned object stays attached. Used by webhook
    handler tests that exercise the payment_succeeded rollback path
    (past_due -> paid).
    """
    from datetime import datetime, timedelta
    from app.core.security import decode_member_token
    from app.models.member_subscription import MemberSubscription

    payload = decode_member_token(member_token)
    member_id = int(payload["sub"])

    sub = MemberSubscription(
        member_id=member_id,
        plan_id=personal_plan.id,
        status="past_due",
        billing_cycle="monthly",
        current_period_end=datetime.utcnow() + timedelta(days=20),
        grace_period_end=datetime.utcnow() + timedelta(days=5),
        snapshot_search_limit=personal_plan.search_limit_daily,
        snapshot_detail_limit=personal_plan.detail_view_limit_daily,
        snapshot_download_limit=personal_plan.download_limit_monthly,
        gateway="stripe",
        gateway_subscription_id=f"sub_pd_{member_id}",
    )
    db_session.add(sub)
    await db_session.commit()
    await db_session.refresh(sub)
    return sub
