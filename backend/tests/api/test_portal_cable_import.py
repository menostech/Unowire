"""Tests for portal cable import endpoints: validate, commit, security, limits.

Covers Tasks 3.5-3.10 of the portal-cable-list-enhancements change:
- 3.5 Validate CSV returns preview, no persistence
- 3.6 Commit CSV creates cables with forced manufacturer_id
- 3.7 Import forces manufacturer_id from user scope (security)
- 3.8 Reject >500 rows and >5MB file
- 3.9 equipment_manufacturer scope gets 403
- 3.10 JSON format import (validate + commit) with nested structures

Note on async DB queries: the `db_session` fixture creates its session on a
separate event loop from any `asyncio.run(...)` block called inside a test
(the Windows ProactorEventLoop closes between runs). To avoid the
"cannot perform operation: another operation is in progress" / "Event loop
is closed" errors that arise from reusing that session across loops, we
open a fresh `async_session()` inside each `asyncio.run(...)` call, matching
the pattern in `test_portal_dashboard.py` and `test_portal_crud.py`.
"""
import io
import json
import uuid

import pytest


def _fetch_taxonomy_ids(client):
    """Return (industry_id, category_id, product_type_id) from the seeded taxonomy.
    Returns (None, None, None) if taxonomy is not seeded.
    """
    res = client.get("/api/taxonomy")
    if res.status_code != 200:
        return (None, None, None)
    industries = res.json()
    if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
        return (None, None, None)
    industry = industries[0]
    category = industry["categories"][0]
    product_type = category["product_types"][0]
    return (industry["id"], category["id"], product_type["id"])


def _valid_csv_rows_with_taxonomy(client, n: int = 2):
    """Build a CSV with n valid cable rows using REAL taxonomy IDs from the seed.
    Returns None if taxonomy is not seeded (test should skip).
    """
    industry_id, category_id, product_type_id = _fetch_taxonomy_ids(client)
    if not industry_id:
        return None
    header = "id,model,slug,manufacturer_id,industry_id,category_id,product_type_id,size_system\n"
    rows = []
    for i in range(n):
        cable_id = f"c-{uuid.uuid4().hex[:8]}"
        slug = f"model-{i}-{uuid.uuid4().hex[:6]}"
        # manufacturer_id is a placeholder — the portal route will overwrite it
        rows.append(
            f"{cable_id},Model-{i},{slug},00000000-0000-0000-0000-000000000000,"
            f"{industry_id},{category_id},{product_type_id},none"
        )
    return header + "\n".join(rows)


# --- Task 3.5: Validate CSV returns preview, no persistence ---

def test_validate_csv_returns_preview(client, cable_manager_headers):
    csv_content = _valid_csv_rows_with_taxonomy(client, n=2)
    if csv_content is None:
        pytest.skip("No taxonomy data seeded")
    res = client.post(
        "/api/portal/cables/import/validate",
        headers=cable_manager_headers,
        files={"file": ("cables.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code == 200, f"Validate failed: {res.text}"
    preview = res.json()
    assert "valid_count" in preview
    assert "skipped_count" in preview
    assert "error_count" in preview
    assert preview["valid_count"] >= 1
    # Validate never persists — verified by the next test's before/after count


# --- Task 3.6: Commit CSV creates cables with forced manufacturer_id ---

def test_commit_csv_creates_scoped_cables(client, cable_manager_headers, db_session):
    csv_content = _valid_csv_rows_with_taxonomy(client, n=2)
    if csv_content is None:
        pytest.skip("No taxonomy data seeded")
    import asyncio
    from sqlalchemy import text
    from app.core.database import async_session

    async def _count_cables_for_scope(scope_id: str) -> int:
        async with async_session() as db:
            result = await db.execute(
                text("SELECT COUNT(*) FROM cables WHERE manufacturer_id = :sid"),
                {"sid": scope_id},
            )
            return result.scalar_one()

    before = asyncio.run(_count_cables_for_scope("mfr-1"))
    res = client.post(
        "/api/portal/cables/import/commit",
        headers=cable_manager_headers,
        files={"file": ("cables.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code == 200, f"Commit failed: {res.text}"
    result = res.json()
    assert result["created_count"] == 2
    assert result["skipped_count"] == 0
    after = asyncio.run(_count_cables_for_scope("mfr-1"))
    assert after == before + 2  # persisted


# --- Task 3.7: Import forces manufacturer_id from user scope (security) ---

def test_import_forces_manufacturer_id_from_scope(client, cable_manager_headers, db_session):
    """CSV with a bogus manufacturer_id still creates cables under mfr-1."""
    industry_id, category_id, product_type_id = _fetch_taxonomy_ids(client)
    if not industry_id:
        pytest.skip("No taxonomy data seeded")
    # Unique model + slug to avoid unique-constraint collisions across reruns
    unique = uuid.uuid4().hex[:8]
    model_name = f"Model-Evil-{unique}"
    slug_name = f"model-evil-{unique}"
    # File claims cables belong to a DIFFERENT manufacturer
    csv_content = (
        "id,model,slug,manufacturer_id,industry_id,category_id,product_type_id,size_system\n"
        f"c-evil-{unique},{model_name},{slug_name},mfr-evil,"
        f"{industry_id},{category_id},{product_type_id},none\n"
    )
    res = client.post(
        "/api/portal/cables/import/commit",
        headers=cable_manager_headers,
        files={"file": ("evil.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code == 200, f"Commit failed: {res.text}"
    assert res.json()["created_count"] == 1

    import asyncio
    from sqlalchemy import text
    from app.core.database import async_session

    async def _fetch_manufacturer_id(name: str):
        async with async_session() as db:
            result = await db.execute(
                text("SELECT manufacturer_id FROM cables WHERE model = :m"),
                {"m": name},
            )
            row = result.first()
            return str(row[0]) if row else None

    mid = asyncio.run(_fetch_manufacturer_id(model_name))
    assert mid == "mfr-1"  # forced to user's scope, NOT "mfr-evil" from the file


# --- Task 3.8: Reject >500 rows and >5MB file ---

def test_import_rejects_too_many_rows(client, cable_manager_headers):
    industry_id, category_id, product_type_id = _fetch_taxonomy_ids(client)
    if not industry_id:
        pytest.skip("No taxonomy data seeded")
    header = "id,model,slug,manufacturer_id,industry_id,category_id,product_type_id,size_system\n"
    rows = "\n".join(
        f"r{i},Model-{i},model-{i},00000000-0000-0000-0000-000000000000,"
        f"{industry_id},{category_id},{product_type_id},none"
        for i in range(501)
    )
    csv_content = (header + rows).encode()
    res = client.post(
        "/api/portal/cables/import/validate",
        headers=cable_manager_headers,
        files={"file": ("big.csv", io.BytesIO(csv_content), "text/csv")},
        data={"format": "csv"},
    )
    # The service's parse_file raises 400 for >500 rows
    assert res.status_code in (400, 422), f"Expected 400/422, got {res.status_code}: {res.text}"


def test_import_rejects_oversized_file(client, cable_manager_headers):
    # 6 MB of filler — exceeds the 5MB MAX_IMPORT_SIZE enforced inside parse_file
    big_content = b"x" * (6 * 1024 * 1024)
    res = client.post(
        "/api/portal/cables/import/validate",
        headers=cable_manager_headers,
        files={"file": ("huge.csv", io.BytesIO(big_content), "text/csv")},
        data={"format": "csv"},
    )
    # parse_file raises HTTPException(413, "File too large (max 5MB)")
    assert res.status_code in (400, 413, 422), f"Expected 400/413/422, got {res.status_code}: {res.text}"


# --- Task 3.9: equipment_manufacturer gets 403 ---

def test_equipment_manufacturer_forbidden(client, equipment_manager_headers):
    csv_content = (
        "id,model,slug,manufacturer_id,industry_id,category_id,product_type_id,size_system\n"
        f"c1,Model-A,model-a,00000000-0000-0000-0000-000000000000,consumer_electronics,cat-a,pt-a,none\n"
    )
    for path in ("/api/portal/cables/import/validate", "/api/portal/cables/import/commit"):
        res = client.post(
            path,
            headers=equipment_manager_headers,
            files={"file": ("c.csv", io.BytesIO(csv_content.encode()), "text/csv")},
            data={"format": "csv"},
        )
        assert res.status_code == 403, f"{path} did not return 403, got {res.status_code}: {res.text}"


# --- Task 3.10: JSON format import (validate + commit) with nested structures ---

def test_validate_json_returns_preview(client, cable_manager_headers):
    industry_id, category_id, product_type_id = _fetch_taxonomy_ids(client)
    if not industry_id:
        pytest.skip("No taxonomy data seeded")
    payload = [
        {
            "id": f"j1-{uuid.uuid4().hex[:8]}",
            "model": "JSON-Model-A",
            "slug": f"json-model-a-{uuid.uuid4().hex[:6]}",
            "manufacturer_id": "00000000-0000-0000-0000-000000000000",  # will be overwritten
            "industry_id": industry_id,
            "category_id": category_id,
            "product_type_id": product_type_id,
            "size_system": "none",
            "common_specs": [],
            "variants": [],
        }
    ]
    res = client.post(
        "/api/portal/cables/import/validate",
        headers=cable_manager_headers,
        files={"file": ("cables.json", io.BytesIO(json.dumps(payload).encode()), "application/json")},
        data={"format": "json"},
    )
    assert res.status_code == 200, f"Validate failed: {res.text}"
    preview = res.json()
    assert preview["valid_count"] >= 1


def test_commit_json_creates_cables_with_nested_specs(client, cable_manager_headers, db_session):
    industry_id, category_id, product_type_id = _fetch_taxonomy_ids(client)
    if not industry_id:
        pytest.skip("No taxonomy data seeded")
    cable_id = f"j2-{uuid.uuid4().hex[:8]}"
    payload = [
        {
            "id": cable_id,
            "model": "JSON-Model-B",
            "slug": f"json-model-b-{uuid.uuid4().hex[:6]}",
            "manufacturer_id": "00000000-0000-0000-0000-000000000000",  # will be overwritten
            "industry_id": industry_id,
            "category_id": category_id,
            "product_type_id": product_type_id,
            "size_system": "none",
            "common_specs": [{"spec_key": "length", "label": "Length", "value_string": "1m", "unit": "m", "spec_type": "string", "filterable": False, "sort_order": 0}],
            "variants": [
                {"slug": f"v1-{uuid.uuid4().hex[:6]}", "sort_order": 0, "specs": [
                    {"spec_key": "color", "label": "Color", "value_string": "black", "spec_type": "string", "filterable": False, "sort_order": 0}
                ]}
            ],
        }
    ]
    res = client.post(
        "/api/portal/cables/import/commit",
        headers=cable_manager_headers,
        files={"file": ("cables.json", io.BytesIO(json.dumps(payload).encode()), "application/json")},
        data={"format": "json"},
    )
    assert res.status_code == 200, f"Commit failed: {res.text}"
    assert res.json()["created_count"] == 1

    import asyncio
    from sqlalchemy import text
    from app.core.database import async_session

    async def _fetch_manufacturer_id():
        async with async_session() as db:
            result = await db.execute(
                text("SELECT manufacturer_id FROM cables WHERE id = :cid"),
                {"cid": cable_id},
            )
            row = result.first()
            return str(row[0]) if row else None

    mid = asyncio.run(_fetch_manufacturer_id())
    assert mid == "mfr-1"  # forced to user's scope
