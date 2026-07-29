"""Tests for the public portal claim submission endpoint (POST /api/portal/claim).

These endpoints are public (no auth) so prospective manufacturers can submit
a claim request without logging in.
"""
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


def test_submit_claim_cable_manufacturer_success(client):
    """Submitting a claim for an existing cable manufacturer returns 201 with an id."""
    res = client.post("/api/portal/claim", json={
        "manufacturer_type": "cable",
        "manufacturer_id": "mfr-claim-test",
        "contact_name": "Cable Claimant",
        "contact_email": "cable-claimant@test.com",
        "contact_phone": "555-0100",
        "proof_description": "I am the authorized representative for Claim Test Cable Co.",
    })
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
    data = res.json()
    assert "id" in data
    assert data["id"]


def test_submit_claim_equipment_manufacturer_success(client):
    """Submitting a claim for an existing equipment manufacturer returns 201 with an id."""
    res = client.post("/api/portal/claim", json={
        "manufacturer_type": "equipment",
        "manufacturer_id": "em-claim-test",
        "contact_name": "Equipment Claimant",
        "contact_email": "equip-claimant@test.com",
        "proof_description": "I am the authorized representative for Claim Test Equipment Co.",
    })
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
    data = res.json()
    assert "id" in data
    assert data["id"]


def test_submit_claim_nonexistent_manufacturer_404(client):
    """Submitting a claim for a nonexistent manufacturer returns 404."""
    res = client.post("/api/portal/claim", json={
        "manufacturer_type": "cable",
        "manufacturer_id": "nonexistent-mfr-xxx-12345",
        "contact_name": "Ghost Claimant",
        "contact_email": "ghost@test.com",
        "proof_description": "This manufacturer does not exist.",
    })
    assert res.status_code == 404, f"Expected 404, got {res.status_code}: {res.text}"


def test_submit_claim_missing_fields_422(client):
    """Submitting a claim with missing required fields returns 422 validation error."""
    res = client.post("/api/portal/claim", json={
        "manufacturer_type": "cable",
    })
    assert res.status_code == 422, f"Expected 422, got {res.status_code}: {res.text}"


def test_submit_claim_no_auth_required(client):
    """The claim submission endpoint is public; calling without auth returns 201, not 401."""
    res = client.post("/api/portal/claim", json={
        "manufacturer_type": "cable",
        "manufacturer_id": "mfr-claim-test",
        "contact_name": "No Auth Claimant",
        "contact_email": "noauth@test.com",
        "proof_description": "Claim submitted without an Authorization header.",
    })
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
    assert res.status_code != 401
