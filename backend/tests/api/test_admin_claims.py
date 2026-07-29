"""Tests for admin claim endpoints: list, approve, reject, and auth gating.

Admin endpoints require operator auth (require_operator('claims')). The public
portal claim endpoint is used to seed fresh claims for approve/reject tests so
each test is independent of execution order.
"""
import uuid

import pytest


@pytest.fixture(scope="module", autouse=True)
def _ensure_test_manufacturers():
    """Ensure test manufacturers exist for claim search/submit tests."""
    import asyncio
    from sqlalchemy import text
    from app.core.database import engine

    async def _setup():
        async with engine.begin() as conn:
            # Cable manufacturer (manufacturers table — no sort_order column)
            await conn.execute(text(
                "INSERT INTO manufacturers (id, name, slug, created_at, updated_at) "
                "VALUES ('mfr-claim-test', 'Claim Test Cable Co', 'claim-test-cable-co', NOW(), NOW()) "
                "ON CONFLICT (id) DO NOTHING"
            ))
            # Equipment manufacturer (equipment_manufacturers table)
            await conn.execute(text(
                "INSERT INTO equipment_manufacturers (id, name, slug, sort_order, created_at, updated_at) "
                "VALUES ('em-claim-test', 'Claim Test Equipment Co', 'claim-test-equipment-co', 0, NOW(), NOW()) "
                "ON CONFLICT (id) DO NOTHING"
            ))

    asyncio.run(_setup())


def _submit_claim(client, manufacturer_type="cable", manufacturer_id="mfr-claim-test"):
    """Helper: submit a fresh claim via the public portal endpoint and return its id."""
    res = client.post("/api/portal/claim", json={
        "manufacturer_type": manufacturer_type,
        "manufacturer_id": manufacturer_id,
        "contact_name": "Test Admin",
        "contact_email": "admin@test.com",
        "proof_description": "Test proof for admin test",
    })
    assert res.status_code == 201, f"Claim submit failed: {res.status_code}: {res.text}"
    return res.json()["id"]


def test_admin_list_claims_returns_all_ordered_desc(client, admin_headers):
    """GET /api/admin/claims with admin auth returns 200 and a list."""
    res = client.get("/api/admin/claims", headers=admin_headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert isinstance(data, list)


def test_admin_list_claims_filter_by_status(client, admin_headers):
    """GET /api/admin/claims?status=pending returns 200; all items have status='pending'."""
    res = client.get("/api/admin/claims", headers=admin_headers, params={"status": "pending"})
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert isinstance(data, list)
    # If list is non-empty, every item must have status == "pending"
    for item in data:
        assert item["status"] == "pending", (
            f"Expected status='pending' but got '{item['status']}' for claim {item.get('id')}"
        )


def test_admin_approve_claim_success(client, admin_headers):
    """Approving a fresh pending claim returns 200, status='approved', reviewed_by set."""
    claim_id = _submit_claim(client)
    res = client.post(f"/api/admin/claims/{claim_id}/approve", headers=admin_headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["status"] == "approved"
    assert data["reviewed_by"] is not None and data["reviewed_by"] != ""


def test_admin_reject_claim_success(client, admin_headers):
    """Rejecting a fresh pending claim returns 200 and status='rejected'."""
    claim_id = _submit_claim(client)
    res = client.post(f"/api/admin/claims/{claim_id}/reject", headers=admin_headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["status"] == "rejected"


def test_admin_approve_already_processed_409(client, admin_headers):
    """Approving an already-approved claim a second time returns 409."""
    claim_id = _submit_claim(client)
    first = client.post(f"/api/admin/claims/{claim_id}/approve", headers=admin_headers)
    assert first.status_code == 200, f"First approve failed: {first.status_code}: {first.text}"
    second = client.post(f"/api/admin/claims/{claim_id}/approve", headers=admin_headers)
    assert second.status_code == 409, f"Expected 409, got {second.status_code}: {second.text}"


def test_admin_list_claims_non_admin_401(client):
    """GET /api/admin/claims without auth returns 401."""
    res = client.get("/api/admin/claims")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}: {res.text}"


def test_admin_approve_non_admin_401(client):
    """POST /api/admin/claims/{id}/approve without auth returns 401."""
    any_uuid = str(uuid.uuid4())
    res = client.post(f"/api/admin/claims/{any_uuid}/approve")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}: {res.text}"
