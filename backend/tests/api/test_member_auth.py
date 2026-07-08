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
