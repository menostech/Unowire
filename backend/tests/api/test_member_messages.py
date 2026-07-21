"""Tests for member system message endpoints."""
import asyncio

from app.core.database import async_session
from app.models.member import Member
from sqlalchemy import select


def _register_and_verify_member(client, email: str) -> dict:
    """Register + verify a member, return Authorization headers."""
    client.post(
        "/api/member/register",
        json={
            "email": email,
            "password": "password123",
            "name": email.split("@")[0],
        },
    )

    async def get_token():
        async with async_session() as db:
            result = await db.execute(select(Member).where(Member.email == email))
            m = result.scalar_one()
            return m.verification_token

    token = asyncio.run(get_token())
    client.post("/api/member/verify", json={"token": token})
    client.post("/api/member/login", json={"email": email, "password": "password123"})
    member_token = client.cookies.get("member_token")
    return {"Authorization": f"Bearer {member_token}"}


def _create_message_as_admin(client, admin_headers, title: str, body: str) -> int:
    res = client.post(
        "/api/admin/messages",
        json={"title": title, "body": body},
        headers=admin_headers,
    )
    return res.json()["id"]


def test_member_list_messages_requires_auth(client):
    res = client.get("/api/member/messages")
    assert res.status_code == 401


def test_member_list_messages(client, admin_headers):
    member_headers = _register_and_verify_member(
        client, "msg-list@test-member.com"
    )
    msg_id = _create_message_as_admin(
        client, admin_headers, "List Title", "Body"
    )
    res = client.get("/api/member/messages", headers=member_headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert any(m["id"] == msg_id for m in data["items"])
    # New message should be unread
    item = next(m for m in data["items"] if m["id"] == msg_id)
    assert item["is_read"] is False
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_member_unread_count_initial(client, admin_headers):
    member_headers = _register_and_verify_member(
        client, "msg-cnt@test-member.com"
    )
    msg_id = _create_message_as_admin(
        client, admin_headers, "Count Msg", "Body"
    )
    res = client.get(
        "/api/member/messages/unread-count", headers=member_headers
    )
    assert res.status_code == 200
    assert res.json()["unread"] >= 1
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_member_get_message_marks_read(client, admin_headers):
    member_headers = _register_and_verify_member(
        client, "msg-read@test-member.com"
    )
    msg_id = _create_message_as_admin(
        client, admin_headers, "Read Me", "Body"
    )
    # Initially unread
    res_count_before = client.get(
        "/api/member/messages/unread-count", headers=member_headers
    ).json()["unread"]
    # View detail
    res = client.get(
        f"/api/member/messages/{msg_id}", headers=member_headers
    )
    assert res.status_code == 200
    assert res.json()["is_read"] is True  # Response shows it's read
    # After view, unread count decreases
    res_count_after = client.get(
        "/api/member/messages/unread-count", headers=member_headers
    ).json()["unread"]
    assert res_count_after == res_count_before - 1
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_member_get_message_idempotent(client, admin_headers):
    """Second GET on the same message does not error and stays read."""
    member_headers = _register_and_verify_member(
        client, "msg-idem@test-member.com"
    )
    msg_id = _create_message_as_admin(
        client, admin_headers, "Idempotent", "Body"
    )
    # First view
    res1 = client.get(
        f"/api/member/messages/{msg_id}", headers=member_headers
    )
    assert res1.status_code == 200
    # Second view
    res2 = client.get(
        f"/api/member/messages/{msg_id}", headers=member_headers
    )
    assert res2.status_code == 200
    assert res2.json()["is_read"] is True
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_member_get_message_not_found(client, admin_headers):
    member_headers = _register_and_verify_member(
        client, "msg-404@test-member.com"
    )
    res = client.get(
        "/api/member/messages/999999", headers=member_headers
    )
    assert res.status_code == 404


def test_member_inactive_account(client, admin_headers):
    from app.core.database import async_session
    from app.models.member import Member
    from sqlalchemy import select
    import asyncio

    # Register + verify + login a member
    client.post(
        "/api/member/register",
        json={
            "email": "inactive-msg@test-member.com",
            "password": "password123",
            "name": "Inactive",
        },
    )

    async def get_token_and_deactivate():
        async with async_session() as db:
            result = await db.execute(select(Member).where(Member.email == "inactive-msg@test-member.com"))
            m = result.scalar_one()
            token = m.verification_token
            m.is_active = False
            await db.commit()
            return token

    token = asyncio.run(get_token_and_deactivate())
    client.post("/api/member/verify", json={"token": token})

    # Login should fail or token should be invalid for inactive member
    client.post("/api/member/login", json={"email": "inactive-msg@test-member.com", "password": "password123"})
    member_token = client.cookies.get("member_token")

    res = client.get(
        "/api/member/messages",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert res.status_code == 401
