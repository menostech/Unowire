"""Tests for member inquiry endpoints."""
import asyncio

from app.core.database import async_session
from app.models.member import Member
from sqlalchemy import select


def _create_verified_member(client, email: str, name: str = "Test") -> dict:
    """Helper: register + verify a member, return login response (with cookie)."""
    client.post(
        "/api/member/register",
        json={"email": email, "password": "password123", "name": name},
    )
    # Verify
    async def get_token():
        async with async_session() as db:
            result = await db.execute(select(Member).where(Member.email == email))
            m = result.scalar_one()
            return m.verification_token
    token = asyncio.run(get_token())
    client.post("/api/member/verify", json={"token": token})
    # Login
    res = client.post(
        "/api/member/login",
        json={"email": email, "password": "password123"},
    )
    return res.json()


def test_create_inquiry_requires_auth(client):
    res = client.post(
        "/api/member/inquiries",
        json={"recipient_type": "manufacturer", "recipient_id": "mfr-1", "subject": "Hi", "body": "Test"},
    )
    assert res.status_code == 401


def test_member_can_create_inquiry(client, admin_headers):
    # First, create a manufacturer via admin API
    res = client.post(
        "/api/manufacturers",
        json={"id": "mfr-test-inq", "name": "Test Mfr", "slug": "test-mfr-inq"},
        headers=admin_headers,
    )
    # Create member
    member_data = _create_verified_member(client, "inq1@test-member.com")
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    res = client.post(
        "/api/member/inquiries",
        json={
            "recipient_type": "manufacturer",
            "recipient_id": "mfr-test-inq",
            "subject": "Inquiry about cables",
            "body": "Do you have CAT6 cables?",
        },
        headers=headers,
    )
    assert res.status_code == 201
    assert res.json()["subject"] == "Inquiry about cables"

    # Cleanup
    client.delete("/api/manufacturers/mfr-test-inq", headers=admin_headers)


def test_create_inquiry_invalid_recipient(client):
    _create_verified_member(client, "inq2@test-member.com")
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    res = client.post(
        "/api/member/inquiries",
        json={
            "recipient_type": "manufacturer",
            "recipient_id": "nonexistent",
            "subject": "Hi",
            "body": "Test",
        },
        headers=headers,
    )
    assert res.status_code == 422


def test_list_my_inquiries(client, admin_headers):
    # Setup manufacturer
    client.post(
        "/api/manufacturers",
        json={"id": "mfr-test-list", "name": "Test Mfr 2", "slug": "test-mfr-list"},
        headers=admin_headers,
    )
    _create_verified_member(client, "inq3@test-member.com")
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    # Create 2 inquiries
    client.post("/api/member/inquiries", json={"recipient_type": "manufacturer", "recipient_id": "mfr-test-list", "subject": "Q1", "body": "B1"}, headers=headers)
    client.post("/api/member/inquiries", json={"recipient_type": "manufacturer", "recipient_id": "mfr-test-list", "subject": "Q2", "body": "B2"}, headers=headers)

    res = client.get("/api/member/inquiries", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 2

    # Cleanup
    client.delete("/api/manufacturers/mfr-test-list", headers=admin_headers)


def test_member_cannot_view_others_inquiry(client, admin_headers):
    client.post(
        "/api/manufacturers",
        json={"id": "mfr-test-own", "name": "Test Mfr 3", "slug": "test-mfr-own"},
        headers=admin_headers,
    )
    # Member A creates inquiry
    _create_verified_member(client, "owna@test-member.com")
    token_a = client.cookies.get("member_token")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    res = client.post(
        "/api/member/inquiries",
        json={"recipient_type": "manufacturer", "recipient_id": "mfr-test-own", "subject": "Hi", "body": "Test"},
        headers=headers_a,
    )
    inquiry_id = res.json()["id"]

    # Member B tries to view it
    _create_verified_member(client, "ownb@test-member.com")
    token_b = client.cookies.get("member_token")
    headers_b = {"Authorization": f"Bearer {token_b}"}
    res = client.get(f"/api/member/inquiries/{inquiry_id}", headers=headers_b)
    assert res.status_code == 404

    # Cleanup
    client.delete("/api/manufacturers/mfr-test-own", headers=admin_headers)
