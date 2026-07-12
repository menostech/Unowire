"""Tests for admin inquiry endpoints."""
import asyncio

from app.core.database import async_session
from app.models.member import Member
from sqlalchemy import select


def _setup_member_with_inquiry(client, admin_headers, email: str, mfr_id: str):
    """Helper: create manufacturer, register+verify member, send inquiry."""
    client.post(
        "/api/manufacturers",
        json={"id": mfr_id, "name": mfr_id.title(), "slug": mfr_id},
        headers=admin_headers,
    )
    # Register + verify member
    client.post("/api/member/register", json={"email": email, "password": "password123", "name": email.split("@")[0]})
    async def get_token():
        async with async_session() as db:
            result = await db.execute(select(Member).where(Member.email == email))
            m = result.scalar_one()
            return m.verification_token
    token = asyncio.run(get_token())
    client.post("/api/member/verify", json={"token": token})
    client.post("/api/member/login", json={"email": email, "password": "password123"})
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}
    # Send inquiry
    res = client.post(
        "/api/member/inquiries",
        json={"recipient_type": "manufacturer", "recipient_id": mfr_id, "subject": "Test", "body": "Hello"},
        headers=headers,
    )
    return res.json()["id"]


def test_admin_list_inquiries(client, admin_headers):
    inquiry_id = _setup_member_with_inquiry(client, admin_headers, "adm-inq@test-member.com", "mfr-adm-inq")
    res = client.get("/api/admin/inquiries", headers=admin_headers)
    assert res.status_code == 200
    ids = [i["id"] for i in res.json()]
    assert inquiry_id in ids
    # Cleanup
    client.delete(f"/api/manufacturers/mfr-adm-inq", headers=admin_headers)


def test_admin_get_inquiry_marks_read(client, admin_headers):
    inquiry_id = _setup_member_with_inquiry(client, admin_headers, "adm-get@test-member.com", "mfr-adm-get")
    res = client.get(f"/api/admin/inquiries/{inquiry_id}", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["is_read"] is True
    # Cleanup
    client.delete("/api/manufacturers/mfr-adm-get", headers=admin_headers)


def test_admin_reply_inquiry(client, admin_headers):
    inquiry_id = _setup_member_with_inquiry(client, admin_headers, "adm-rep@test-member.com", "mfr-adm-rep")
    res = client.post(
        f"/api/admin/inquiries/{inquiry_id}/reply",
        json={"reply_body": "Thank you for your inquiry."},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["reply_body"] == "Thank you for your inquiry."
    assert res.json()["replied_at"] is not None
    # Cleanup
    client.delete("/api/manufacturers/mfr-adm-rep", headers=admin_headers)


def test_admin_reply_twice_fails(client, admin_headers):
    inquiry_id = _setup_member_with_inquiry(client, admin_headers, "adm-rep2@test-member.com", "mfr-adm-rep2")
    client.post(
        f"/api/admin/inquiries/{inquiry_id}/reply",
        json={"reply_body": "First reply"},
        headers=admin_headers,
    )
    res = client.post(
        f"/api/admin/inquiries/{inquiry_id}/reply",
        json={"reply_body": "Second reply"},
        headers=admin_headers,
    )
    assert res.status_code == 400
    # Cleanup
    client.delete("/api/manufacturers/mfr-adm-rep2", headers=admin_headers)


def test_admin_unread_count(client, admin_headers):
    initial = client.get("/api/admin/inquiries/unread-count", headers=admin_headers).json()["count"]
    inquiry_id = _setup_member_with_inquiry(client, admin_headers, "adm-cnt@test-member.com", "mfr-adm-cnt")
    after = client.get("/api/admin/inquiries/unread-count", headers=admin_headers).json()["count"]
    assert after == initial + 1
    # Cleanup
    client.delete("/api/manufacturers/mfr-adm-cnt", headers=admin_headers)
