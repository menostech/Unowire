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


def test_list_inquiries_includes_recipient_name(client, admin_headers):
    """Member list endpoint should populate recipient_name from the JOIN."""
    client.post(
        "/api/manufacturers",
        json={"id": "mfr-name-list", "name": "Name List Factory", "slug": "mfr-name-list"},
        headers=admin_headers,
    )
    _create_verified_member(client, "name-list@test-member.com")
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    client.post(
        "/api/member/inquiries",
        json={"recipient_type": "manufacturer", "recipient_id": "mfr-name-list", "subject": "NameListQ", "body": "B"},
        headers=headers,
    )

    res = client.get("/api/member/inquiries", headers=headers)
    assert res.status_code == 200
    items = res.json()
    matched = [i for i in items if i.get("subject") == "NameListQ"]
    assert len(matched) == 1
    assert matched[0]["recipient_name"] == "Name List Factory"

    # Cleanup
    client.delete("/api/manufacturers/mfr-name-list", headers=admin_headers)


def test_get_inquiry_includes_recipient_name(client, admin_headers):
    """Member detail endpoint should populate recipient_name."""
    client.post(
        "/api/manufacturers",
        json={"id": "mfr-name-get", "name": "Name Get Factory", "slug": "mfr-name-get"},
        headers=admin_headers,
    )
    _create_verified_member(client, "name-get@test-member.com")
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    create_res = client.post(
        "/api/member/inquiries",
        json={"recipient_type": "manufacturer", "recipient_id": "mfr-name-get", "subject": "NameGetQ", "body": "B"},
        headers=headers,
    )
    inquiry_id = create_res.json()["id"]

    res = client.get(f"/api/member/inquiries/{inquiry_id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["recipient_name"] == "Name Get Factory"

    # Cleanup
    client.delete("/api/manufacturers/mfr-name-get", headers=admin_headers)


def test_inquiry_to_equipment_manufacturer_resolves_name(client, admin_headers):
    """recipient_type='equipment_manufacturer' should resolve via the EquipmentManufacturer JOIN branch."""
    # NOTE: substitute the actual equipment-manufacturer API path if different (see Task 5 Step 1).
    client.post(
        "/api/equipment-manufacturers",
        json={"id": "em-name-test", "name": "Equip Name Factory", "slug": "em-name-test"},
        headers=admin_headers,
    )
    _create_verified_member(client, "em-name@test-member.com")
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    create_res = client.post(
        "/api/member/inquiries",
        json={
            "recipient_type": "equipment_manufacturer",
            "recipient_id": "em-name-test",
            "subject": "EquipNameQ",
            "body": "B",
        },
        headers=headers,
    )
    assert create_res.status_code == 201, create_res.text
    inquiry_id = create_res.json()["id"]

    res = client.get(f"/api/member/inquiries/{inquiry_id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["recipient_name"] == "Equip Name Factory"


def test_inquiry_to_deleted_manufacturer_returns_none_name(client, admin_headers):
    """If the manufacturer is deleted, recipient_name should be None (no 500)."""
    client.post(
        "/api/manufacturers",
        json={"id": "mfr-del-test", "name": "Will Be Deleted", "slug": "mfr-del-test"},
        headers=admin_headers,
    )
    _create_verified_member(client, "del-name@test-member.com")
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    create_res = client.post(
        "/api/member/inquiries",
        json={"recipient_type": "manufacturer", "recipient_id": "mfr-del-test", "subject": "DelQ", "body": "B"},
        headers=headers,
    )
    inquiry_id = create_res.json()["id"]

    # Delete the manufacturer via admin API
    client.delete("/api/manufacturers/mfr-del-test", headers=admin_headers)

    # Re-query — should NOT 500, recipient_name should be None
    res = client.get(f"/api/member/inquiries/{inquiry_id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["recipient_name"] is None


def test_create_inquiry_response_includes_recipient_name(client, admin_headers):
    """POST /api/member/inquiries response should include recipient_name (re-query path)."""
    client.post(
        "/api/manufacturers",
        json={"id": "mfr-create-name", "name": "Create Name Factory", "slug": "mfr-create-name"},
        headers=admin_headers,
    )
    _create_verified_member(client, "create-name@test-member.com")
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    res = client.post(
        "/api/member/inquiries",
        json={"recipient_type": "manufacturer", "recipient_id": "mfr-create-name", "subject": "CreateNameQ", "body": "B"},
        headers=headers,
    )
    assert res.status_code == 201
    assert res.json()["recipient_name"] == "Create Name Factory"

    # Cleanup
    client.delete("/api/manufacturers/mfr-create-name", headers=admin_headers)
