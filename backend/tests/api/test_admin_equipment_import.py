"""Tests for admin equipment import endpoints: validate, commit, FK error, unauthorized."""
import io
import json
import uuid

import pytest


def _fetch_category_id(client):
    res = client.get("/api/equipment-categories")
    if res.status_code != 200:
        return None
    cats = res.json()
    if not cats:
        return None
    for c in cats:
        if c.get("children"):
            return c["children"][0]["id"]
    return cats[0]["id"]


def _admin_csv_rows(client, n=2, manufacturer_id="em-1"):
    cat_id = _fetch_category_id(client)
    if not cat_id:
        return None
    header = "id,model,slug,manufacturer_id,category_id\n"
    rows = []
    for i in range(n):
        eq_id = f"adm-eq-{uuid.uuid4().hex[:8]}"
        slug = f"adm-model-{i}-{uuid.uuid4().hex[:6]}"
        rows.append(f"{eq_id},Adm-Model-{i},{slug},{manufacturer_id},{cat_id}")
    return header + "\n".join(rows)


def test_admin_equipment_import_validate_csv(client, admin_headers):
    csv_content = _admin_csv_rows(client, n=2)
    if csv_content is None:
        pytest.skip("No equipment categories seeded")
    res = client.post(
        "/api/admin/equipment/import/validate",
        headers=admin_headers,
        files={"file": ("eq.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code == 200, f"Validate failed: {res.text}"
    assert res.json()["valid_count"] >= 1


def test_admin_equipment_import_commit(client, admin_headers, db_session):
    csv_content = _admin_csv_rows(client, n=1)
    if csv_content is None:
        pytest.skip("No equipment categories seeded")
    res = client.post(
        "/api/admin/equipment/import/commit",
        headers=admin_headers,
        files={"file": ("eq.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code == 200, f"Commit failed: {res.text}"
    assert res.json()["created_count"] == 1


def test_admin_equipment_import_validate_manufacturer_id(client, admin_headers):
    """Non-existent manufacturer_id -> row marked error (FK check)."""
    cat_id = _fetch_category_id(client)
    if not cat_id:
        pytest.skip("No equipment categories seeded")
    csv_content = (
        "id,model,slug,manufacturer_id,category_id\n"
        f"bad-{uuid.uuid4().hex[:8]},Bad-Model,bad-slug-{uuid.uuid4().hex[:6]},nonexistent-mfr,{cat_id}\n"
    )
    res = client.post(
        "/api/admin/equipment/import/validate",
        headers=admin_headers,
        files={"file": ("bad.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code == 200
    p = res.json()
    assert p["error_count"] == 1
    assert p["valid_count"] == 0


def test_admin_equipment_import_unauthorized(client, cable_manager_headers):
    """Non-operator (cable_manager) -> 403. cable_manager_headers is a portal token,
    which is rejected by admin routes (no admin_token)."""
    csv_content = (
        "id,model,slug,manufacturer_id,category_id\n"
        f"x1,M,s,em-1,some-cat\n"
    )
    res = client.post(
        "/api/admin/equipment/import/validate",
        headers=cable_manager_headers,
        files={"file": ("eq.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code in (401, 403), f"Expected 401 or 403, got {res.status_code}: {res.text}"
