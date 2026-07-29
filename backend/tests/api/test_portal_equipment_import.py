"""Tests for portal equipment import endpoints: validate, commit, security, limits, dup detection."""
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


def _valid_csv_rows(client, n=2):
    cat_id = _fetch_category_id(client)
    if not cat_id:
        return None
    header = "id,model,slug,manufacturer_id,category_id\n"
    rows = []
    for i in range(n):
        eq_id = f"eq-{uuid.uuid4().hex[:8]}"
        slug = f"model-{i}-{uuid.uuid4().hex[:6]}"
        # manufacturer_id is a placeholder — portal route will overwrite with em-1
        rows.append(f"{eq_id},Model-{i},{slug},00000000-0000-0000-0000-000000000000,{cat_id}")
    return header + "\n".join(rows)


# --- validate CSV ---
def test_portal_equipment_import_validate_csv(client, equipment_manager_headers):
    csv_content = _valid_csv_rows(client, n=2)
    if csv_content is None:
        pytest.skip("No equipment categories seeded")
    res = client.post(
        "/api/portal/equipment/import/validate",
        headers=equipment_manager_headers,
        files={"file": ("eq.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code == 200, f"Validate failed: {res.text}"
    preview = res.json()
    assert preview["valid_count"] >= 1
    assert preview["error_count"] == 0


# --- validate JSON with nested applicable_specs ---
def test_portal_equipment_import_validate_json(client, equipment_manager_headers):
    cat_id = _fetch_category_id(client)
    if not cat_id:
        pytest.skip("No equipment categories seeded")
    payload = [
        {
            "id": f"j1-{uuid.uuid4().hex[:8]}",
            "model": "JSON-Equipment-A",
            "slug": f"json-equipment-a-{uuid.uuid4().hex[:6]}",
            "manufacturer_id": "00000000-0000-0000-0000-000000000000",  # overwritten
            "category_id": cat_id,
            "applicable_specs": [{"spec_key": "power", "label": "Power", "allowed_values": ["100kVA"]}],
        }
    ]
    res = client.post(
        "/api/portal/equipment/import/validate",
        headers=equipment_manager_headers,
        files={"file": ("eq.json", io.BytesIO(json.dumps(payload).encode()), "application/json")},
        data={"format": "json"},
    )
    assert res.status_code == 200, f"Validate failed: {res.text}"
    assert res.json()["valid_count"] >= 1


# --- commit creates records ---
def test_portal_equipment_import_commit(client, equipment_manager_headers, db_session):
    csv_content = _valid_csv_rows(client, n=2)
    if csv_content is None:
        pytest.skip("No equipment categories seeded")
    import asyncio
    from sqlalchemy import text
    from app.core.database import async_session

    async def _count(scope_id):
        async with async_session() as db:
            result = await db.execute(
                text("SELECT COUNT(*) FROM recommended_equipments WHERE manufacturer_id = :sid"),
                {"sid": scope_id},
            )
            return result.scalar_one()

    before = asyncio.run(_count("em-1"))
    res = client.post(
        "/api/portal/equipment/import/commit",
        headers=equipment_manager_headers,
        files={"file": ("eq.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code == 200, f"Commit failed: {res.text}"
    assert res.json()["created_count"] == 2
    after = asyncio.run(_count("em-1"))
    assert after == before + 2


# --- force_manufacturer_id security ---
def test_portal_equipment_import_force_manufacturer_id(client, equipment_manager_headers, db_session):
    cat_id = _fetch_category_id(client)
    if not cat_id:
        pytest.skip("No equipment categories seeded")
    unique = uuid.uuid4().hex[:8]
    model_name = f"Model-Evil-{unique}"
    slug_name = f"model-evil-{unique}"
    csv_content = (
        "id,model,slug,manufacturer_id,category_id\n"
        f"eq-evil-{unique},{model_name},{slug_name},em-evil,{cat_id}\n"
    )
    res = client.post(
        "/api/portal/equipment/import/commit",
        headers=equipment_manager_headers,
        files={"file": ("evil.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code == 200, f"Commit failed: {res.text}"
    assert res.json()["created_count"] == 1

    import asyncio
    from sqlalchemy import text
    from app.core.database import async_session

    async def _fetch_mid():
        async with async_session() as db:
            result = await db.execute(
                text("SELECT manufacturer_id FROM recommended_equipments WHERE model = :m"),
                {"m": model_name},
            )
            row = result.first()
            return str(row[0]) if row else None

    assert asyncio.run(_fetch_mid()) == "em-1"  # forced, NOT "em-evil"


# --- too many rows -> 400 ---
def test_portal_equipment_import_too_many_rows(client, equipment_manager_headers):
    cat_id = _fetch_category_id(client)
    if not cat_id:
        pytest.skip("No equipment categories seeded")
    header = "id,model,slug,manufacturer_id,category_id\n"
    rows = "\n".join(
        f"r{i},Model-{i},model-{i},00000000-0000-0000-0000-000000000000,{cat_id}"
        for i in range(501)
    )
    res = client.post(
        "/api/portal/equipment/import/validate",
        headers=equipment_manager_headers,
        files={"file": ("big.csv", io.BytesIO((header + rows).encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code in (400, 422), f"Expected 400/422, got {res.status_code}: {res.text}"


# --- cable manufacturer -> 403 ---
def test_portal_equipment_import_cross_scope_403(client, cable_manager_headers):
    csv_content = (
        "id,model,slug,manufacturer_id,category_id\n"
        f"c1,Model-A,model-a,00000000-0000-0000-0000-000000000000,some-cat\n"
    )
    for path in ("/api/portal/equipment/import/validate", "/api/portal/equipment/import/commit"):
        res = client.post(
            path,
            headers=cable_manager_headers,
            files={"file": ("eq.csv", io.BytesIO(csv_content.encode()), "text/csv")},
            data={"format": "csv"},
        )
        assert res.status_code == 403, f"{path} got {res.status_code}: {res.text}"


# --- duplicate detection (id + slug, file + DB) ---
def test_portal_equipment_import_dup_detection(client, equipment_manager_headers, db_session):
    cat_id = _fetch_category_id(client)
    if not cat_id:
        pytest.skip("No equipment categories seeded")
    import asyncio
    from sqlalchemy import text
    from app.core.database import async_session

    # Seed an existing equipment row directly in DB. Only its `id` is a collision
    # target; its slug (`db_slug`) is NOT reused by any file row.
    eq_id = f"dup-{uuid.uuid4().hex[:8]}"
    db_slug = f"dup-db-slug-{uuid.uuid4().hex[:6]}"
    async def _seed():
        async with async_session() as db:
            await db.execute(text(
                "INSERT INTO recommended_equipments (id, model, slug, manufacturer_id, category_id, applicable_specs, created_at, updated_at) "
                "VALUES (:id, :model, :slug, 'em-1', :cat, '[]'::jsonb, NOW(), NOW()) ON CONFLICT DO NOTHING"
            ), {"id": eq_id, "model": "Dup-Existing", "slug": db_slug, "cat": cat_id})
            await db.commit()
    asyncio.run(_seed())

    # File rows:
    #   row1 = id in DB (eq_id)         -> skipped (DB id collision)
    #   row2 = slug == row1 file slug   -> error   (intra-file slug collision)
    #   row3 = brand new                -> valid
    file_slug = f"file-slug-{uuid.uuid4().hex[:6]}"
    new_id = f"new-{uuid.uuid4().hex[:8]}"
    csv_content = (
        "id,model,slug,manufacturer_id,category_id\n"
        f"{eq_id},Dup-DB,{file_slug},em-1,{cat_id}\n"
        f"{eq_id}-2,Dup-IntraFile,{file_slug},em-1,{cat_id}\n"
        f"{new_id},Dup-New,new-slug-{uuid.uuid4().hex[:6]},em-1,{cat_id}\n"
    )
    res = client.post(
        "/api/portal/equipment/import/validate",
        headers=equipment_manager_headers,
        files={"file": ("dup.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code == 200, f"Validate failed: {res.text}"
    p = res.json()
    # row1 skipped (id in DB), row2 error (intra-file slug dup), row3 valid
    assert p["valid_count"] == 1
    assert p["skipped_count"] == 1
    assert p["error_count"] == 1
