"""Tests for member authentication endpoints."""


def test_register_member(client):
    res = client.post(
        "/api/member/register",
        json={
            "email": "alice@test-member.com",
            "password": "password123",
            "name": "Alice",
            "company": "ACME",
            "phone": "1234567890",
        },
    )
    assert res.status_code == 200
    assert "verify" in res.json()["message"].lower()


def test_register_duplicate_email(client):
    client.post(
        "/api/member/register",
        json={"email": "bob@test-member.com", "password": "password123", "name": "Bob"},
    )
    res = client.post(
        "/api/member/register",
        json={"email": "bob@test-member.com", "password": "password123", "name": "Bob2"},
    )
    assert res.status_code == 409


def test_login_unverified_member_fails(client):
    client.post(
        "/api/member/register",
        json={"email": "carol@test-member.com", "password": "password123", "name": "Carol"},
    )
    res = client.post(
        "/api/member/login",
        json={"email": "carol@test-member.com", "password": "password123"},
    )
    assert res.status_code == 403


def test_verify_and_login(client):
    # Register
    client.post(
        "/api/member/register",
        json={"email": "dave@test-member.com", "password": "password123", "name": "Dave"},
    )
    # Get token from DB directly (test helper)
    from app.core.database import async_session
    from app.models.member import Member
    from sqlalchemy import select
    import asyncio

    async def get_token():
        async with async_session() as db:
            result = await db.execute(select(Member).where(Member.email == "dave@test-member.com"))
            m = result.scalar_one()
            return m.verification_token

    token = asyncio.run(get_token())
    # Verify
    res = client.post("/api/member/verify", json={"token": token})
    assert res.status_code == 200
    # Login
    res = client.post(
        "/api/member/login",
        json={"email": "dave@test-member.com", "password": "password123"},
    )
    assert res.status_code == 200
    assert res.json()["member"]["email"] == "dave@test-member.com"


def test_login_invalid_password(client):
    client.post(
        "/api/member/register",
        json={"email": "eve@test-member.com", "password": "password123", "name": "Eve"},
    )
    # Verify first
    from app.core.database import async_session
    from app.models.member import Member
    from sqlalchemy import select
    import asyncio

    async def get_token():
        async with async_session() as db:
            result = await db.execute(select(Member).where(Member.email == "eve@test-member.com"))
            m = result.scalar_one()
            return m.verification_token

    token = asyncio.run(get_token())
    client.post("/api/member/verify", json={"token": token})

    res = client.post(
        "/api/member/login",
        json={"email": "eve@test-member.com", "password": "wrongpassword"},
    )
    assert res.status_code == 401


def test_member_token_cannot_access_admin_endpoint(client):
    """A member JWT must not authenticate admin endpoints (token confusion fix).

    Member tokens carry type='member'; decode_access_token must reject them so a
    member with id=1 cannot impersonate admin user id=1.
    """
    # Register + verify + login a member
    client.post(
        "/api/member/register",
        json={"email": "frank@test-member.com", "password": "password123", "name": "Frank"},
    )
    from app.core.database import async_session
    from app.models.member import Member
    from sqlalchemy import select
    import asyncio

    async def get_token():
        async with async_session() as db:
            result = await db.execute(select(Member).where(Member.email == "frank@test-member.com"))
            m = result.scalar_one()
            return m.verification_token

    token = asyncio.run(get_token())
    client.post("/api/member/verify", json={"token": token})

    res = client.post(
        "/api/member/login",
        json={"email": "frank@test-member.com", "password": "password123"},
    )
    assert res.status_code == 200
    # Extract the member JWT from the cookie set by login
    member_token = res.cookies.get("member_token")
    assert member_token is not None

    # Attempt to access an admin endpoint using the member token as a Bearer token.
    # Must be rejected with 401, not accepted as an admin user.
    res = client.get(
        "/api/admin/inquiries",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert res.status_code == 401


def test_register_assigns_freemium_subscription(client):
    import asyncio
    from sqlalchemy import text
    from app.core.database import async_session

    res = client.post("/api/member/register", json={
        "email": "newfreemium@test-member.com",
        "password": "test123456",
        "name": "New Free",
    })
    assert res.status_code == 200, res.text

    async def _c():
        async with async_session() as s:
            row = await s.execute(text(
                "SELECT ms.status, sp.tier_level FROM member_subscriptions ms "
                "JOIN subscription_plans sp ON sp.id = ms.plan_id "
                "JOIN members m ON m.id = ms.member_id "
                "WHERE m.email = 'newfreemium@test-member.com'"
            ))
            return row.first()
    row = asyncio.run(_c())
    assert row is not None
    assert row[0] == "active"
    assert row[1] == "freemium"

    # cleanup
    async def _del():
        async with async_session() as s:
            await s.execute(text("DELETE FROM member_subscriptions WHERE member_id IN (SELECT id FROM members WHERE email='newfreemium@test-member.com')"))
            await s.execute(text("DELETE FROM members WHERE email='newfreemium@test-member.com'"))
            await s.commit()
    asyncio.run(_del())
