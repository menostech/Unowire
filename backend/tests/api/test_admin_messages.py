"""Tests for admin system message endpoints."""


def test_list_messages_requires_auth(client):
    res = client.get("/api/admin/messages")
    assert res.status_code == 401


def test_list_messages_returns_all(client, admin_headers):
    # Create a message first
    client.post(
        "/api/admin/messages",
        json={"title": "Test Message", "body": "Hello members"},
        headers=admin_headers,
    )
    res = client.get("/api/admin/messages", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1
    last = data["items"][0]
    assert last["title"] == "Test Message"
    assert last["body"] == "Hello members"
    assert "created_by_email" in last


def test_get_message_by_id(client, admin_headers):
    create_res = client.post(
        "/api/admin/messages",
        json={"title": "Get Me", "body": "Body content"},
        headers=admin_headers,
    )
    msg_id = create_res.json()["id"]
    res = client.get(f"/api/admin/messages/{msg_id}", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["id"] == msg_id
    assert res.json()["title"] == "Get Me"


def test_get_message_not_found(client, admin_headers):
    res = client.get("/api/admin/messages/999999", headers=admin_headers)
    assert res.status_code == 404


def test_create_message(client, admin_headers):
    res = client.post(
        "/api/admin/messages",
        json={"title": "New Message", "body": "Body text"},
        headers=admin_headers,
    )
    assert res.status_code == 201
    assert res.json()["id"] > 0
    assert res.json()["title"] == "New Message"
    # Cleanup
    client.delete(f"/api/admin/messages/{res.json()['id']}", headers=admin_headers)


def test_create_message_invalid_payload(client, admin_headers):
    res = client.post(
        "/api/admin/messages",
        json={"title": "", "body": ""},
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_delete_message(client, admin_headers):
    create_res = client.post(
        "/api/admin/messages",
        json={"title": "To Delete", "body": "Bye"},
        headers=admin_headers,
    )
    msg_id = create_res.json()["id"]
    res = client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)
    assert res.status_code == 204
    # Verify gone
    get_res = client.get(f"/api/admin/messages/{msg_id}", headers=admin_headers)
    assert get_res.status_code == 404


def test_delete_message_not_found(client, admin_headers):
    res = client.delete("/api/admin/messages/999999", headers=admin_headers)
    assert res.status_code == 404


def test_list_messages_without_permission(client):
    # A member token (not admin) should be forbidden from admin endpoints
    client.post(
        "/api/member/register",
        json={
            "email": "msg-noperm@test-member.com",
            "password": "password123",
            "name": "NoPerm",
        },
    )
    # Member login sets member_token cookie, but admin endpoints need admin_token
    client.post("/api/member/login", json={"email": "msg-noperm@test-member.com", "password": "password123"})
    member_token = client.cookies.get("member_token")
    res = client.get(
        "/api/admin/messages",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert res.status_code in (401, 403)


def test_delete_message_cascades_reads(client, admin_headers):
    from app.core.database import async_session
    from app.models.member import Member
    from app.models.system_message import SystemMessageRead
    from sqlalchemy import select
    import asyncio

    # Create a message
    create_res = client.post(
        "/api/admin/messages",
        json={"title": "Cascade Test", "body": "Will be deleted"},
        headers=admin_headers,
    )
    msg_id = create_res.json()["id"]

    # Register a member, verify email, and login so we can mark the message read
    client.post(
        "/api/member/register",
        json={
            "email": "cascade@test-member.com",
            "password": "password123",
            "name": "Cascade",
        },
    )

    async def get_verification_token():
        async with async_session() as db:
            result = await db.execute(
                select(Member).where(Member.email == "cascade@test-member.com")
            )
            m = result.scalar_one()
            return m.verification_token

    verify_token = asyncio.run(get_verification_token())
    client.post("/api/member/verify", json={"token": verify_token})
    client.post(
        "/api/member/login",
        json={"email": "cascade@test-member.com", "password": "password123"},
    )
    member_token = client.cookies.get("member_token")

    # Mark the message as read by viewing it
    client.get(
        f"/api/member/messages/{msg_id}",
        headers={"Authorization": f"Bearer {member_token}"},
    )

    # Verify read record exists
    async def get_read_count():
        async with async_session() as db:
            result = await db.execute(
                select(SystemMessageRead).where(
                    SystemMessageRead.message_id == msg_id
                )
            )
            return len(result.all())

    count_before = asyncio.run(get_read_count())
    assert count_before == 1

    # Delete the message as admin
    res = client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)
    assert res.status_code == 204

    # Verify read record is gone (cascade)
    count_after = asyncio.run(get_read_count())
    assert count_after == 0


def test_create_broadcast_message_defaults(client, admin_headers):
    """POST with no recipient_type defaults to broadcast."""
    res = client.post(
        "/api/admin/messages",
        json={"title": "Broadcast Default", "body": "Body"},
        headers=admin_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["recipient_type"] == "broadcast"
    assert data["recipient_targets"] is None
    # Cleanup
    client.delete(f"/api/admin/messages/{data['id']}", headers=admin_headers)


def test_create_targeted_message_multiple_groups(client, admin_headers):
    """POST targeted with multiple groups succeeds."""
    res = client.post(
        "/api/admin/messages",
        json={
            "title": "Targeted Multi",
            "body": "Body",
            "recipient_type": "targeted",
            "recipient_targets": [
                {"kind": "group", "value": "cable_managers"},
                {"kind": "group", "value": "equipment_managers"},
            ],
        },
        headers=admin_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["recipient_type"] == "targeted"
    assert len(data["recipient_targets"]) == 2
    # Cleanup
    client.delete(f"/api/admin/messages/{data['id']}", headers=admin_headers)


def test_create_targeted_message_empty_targets_returns_422(client, admin_headers):
    """POST targeted with empty recipient_targets returns 422."""
    res = client.post(
        "/api/admin/messages",
        json={
            "title": "Bad Targeted",
            "body": "Body",
            "recipient_type": "targeted",
            "recipient_targets": [],
        },
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_create_targeted_message_invalid_group_returns_422(client, admin_headers):
    """POST targeted with invalid group value returns 422."""
    res = client.post(
        "/api/admin/messages",
        json={
            "title": "Bad Group",
            "body": "Body",
            "recipient_type": "targeted",
            "recipient_targets": [{"kind": "group", "value": "admins"}],
        },
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_create_broadcast_with_non_null_targets_returns_422(client, admin_headers):
    """POST broadcast with non-null recipient_targets returns 422."""
    res = client.post(
        "/api/admin/messages",
        json={
            "title": "Bad Broadcast",
            "body": "Body",
            "recipient_type": "broadcast",
            "recipient_targets": [{"kind": "group", "value": "members"}],
        },
        headers=admin_headers,
    )
    assert res.status_code == 422
