"""Tests for portal cable list endpoint: search, filters, combined, backward-compat.

Covers Tasks 3.1-3.4 of the portal-cable-list-enhancements change:
- 3.1 Search by model keyword (case-insensitive, scoped, no-match)
- 3.2 Filter by industry_id / category_id / product_type_id
- 3.3 Combined search + taxonomy filters
- 3.4 Backward-compat: no params returns scoped cables sorted by created_at desc
"""
import uuid

import pytest


@pytest.fixture
def scoped_cables(client, cable_manager_headers):
    """Create 3 cables in mfr-1 scope via the portal API.
    Returns the list of created cable dicts.
    Models: 'AWG-100', 'AWG-200', 'HDMI-1'.
    Skips if taxonomy is not seeded.
    """
    tax_res = client.get("/api/taxonomy")
    if tax_res.status_code != 200:
        pytest.skip("Taxonomy endpoint failed")
    industries = tax_res.json()
    if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    product_type = category["product_types"][0]

    created = []
    for model in ("AWG-100", "AWG-200", "HDMI-1"):
        slug = f"test-scoped-{model.lower()}-{uuid.uuid4().hex[:8]}"
        res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
            "product_type_id": product_type["id"],
            "industry_id": industry["id"],
            "category_id": category["id"],
            "model": model,
            "slug": slug,
            "size_system": "awg",
        })
        if res.status_code == 201:
            created.append(res.json())
    if len(created) < 3:
        pytest.skip("Could not create 3 scoped cables")
    return created


@pytest.fixture
def other_manufacturer_cables(client, db_session):
    """Create 1 cable owned by a DIFFERENT manufacturer (mfr-other) directly in the DB.
    Returns a list with one dict (model, manufacturer_id, id).
    """
    import asyncio
    from sqlalchemy import text

    async def _seed():
        # Ensure the other manufacturer exists (schema has no scope_type/is_active)
        async with db_session.bind.begin() as conn:
            await conn.execute(text(
                "INSERT INTO manufacturers (id, slug, name, created_at, updated_at) "
                "VALUES ('mfr-other', 'mfr-other', 'Other Mfr', NOW(), NOW()) "
                "ON CONFLICT (id) DO NOTHING"
            ))
        # Fetch valid taxonomy IDs
        tax_res = client.get("/api/taxonomy")
        industries = tax_res.json()
        if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
            return []
        industry = industries[0]
        category = industry["categories"][0]
        product_type = category["product_types"][0]
        cable_id = "test-other-awg-999"
        async with db_session.begin():
            await db_session.execute(text(
                "INSERT INTO cables (id, model, slug, manufacturer_id, industry_id, category_id, product_type_id, size_system, created_at, updated_at) "
                "VALUES (:id, 'AWG-999', 'test-other-awg-999', 'mfr-other', :ind, :cat, :pt, 'awg', NOW(), NOW()) "
                "ON CONFLICT (id) DO NOTHING"
            ), {"id": cable_id, "ind": industry["id"], "cat": category["id"], "pt": product_type["id"]})
        return [{"id": cable_id, "model": "AWG-999", "manufacturer_id": "mfr-other"}]

    result = asyncio.run(_seed())
    if not result:
        pytest.skip("Could not seed other_manufacturer_cables")
    return result


# --- Task 3.1: Search tests ---

def test_search_by_model_keyword(client, cable_manager_headers, scoped_cables):
    res = client.get("/api/portal/cables?search=AWG", headers=cable_manager_headers)
    assert res.status_code == 200
    items = res.json()
    # scoped_cables creates AWG-100, AWG-200, HDMI-1; other tests may have created more
    awg_items = [c for c in items if "AWG" in c.get("model", "")]
    assert len(awg_items) >= 2
    assert all("AWG" in c["model"] for c in awg_items)


def test_search_is_case_insensitive(client, cable_manager_headers, scoped_cables):
    res = client.get("/api/portal/cables?search=awg", headers=cable_manager_headers)
    assert res.status_code == 200
    awg_items = [c for c in res.json() if "AWG" in c.get("model", "")]
    assert len(awg_items) >= 2


def test_search_no_matches_returns_empty(client, cable_manager_headers, scoped_cables):
    res = client.get(
        "/api/portal/cables?search=NONEXISTENT_KEYWORD_XYZ",
        headers=cable_manager_headers,
    )
    assert res.status_code == 200
    assert res.json() == []


def test_search_scoped_to_manufacturer(client, cable_manager_headers, scoped_cables, other_manufacturer_cables):
    res = client.get("/api/portal/cables?search=AWG", headers=cable_manager_headers)
    assert res.status_code == 200
    models = [c["model"] for c in res.json()]
    assert "AWG-999" not in models  # other manufacturer's cable must not leak


# --- Task 3.2: Filter tests ---

def test_filter_by_industry_id(client, cable_manager_headers, scoped_cables):
    target_industry = scoped_cables[0]["industry_id"]
    res = client.get(
        f"/api/portal/cables?industry_id={target_industry}",
        headers=cable_manager_headers,
    )
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 1
    assert all(c["industry_id"] == target_industry for c in items)


def test_filter_by_category_id(client, cable_manager_headers, scoped_cables):
    target_category = scoped_cables[0]["category_id"]
    res = client.get(
        f"/api/portal/cables?category_id={target_category}",
        headers=cable_manager_headers,
    )
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 1
    assert all(c["category_id"] == target_category for c in items)


def test_filter_by_product_type_id(client, cable_manager_headers, scoped_cables):
    target_pt = scoped_cables[0]["product_type_id"]
    res = client.get(
        f"/api/portal/cables?product_type_id={target_pt}",
        headers=cable_manager_headers,
    )
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 1
    assert all(c["product_type_id"] == target_pt for c in items)


# --- Task 3.3: Combined filter test ---

def test_combine_search_and_all_taxonomy_filters(client, cable_manager_headers, scoped_cables):
    target = scoped_cables[0]
    res = client.get(
        f"/api/portal/cables?search={target['model']}"
        f"&industry_id={target['industry_id']}"
        f"&category_id={target['category_id']}"
        f"&product_type_id={target['product_type_id']}",
        headers=cable_manager_headers,
    )
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 1
    assert all(c["industry_id"] == target["industry_id"] for c in items)
    assert all(c["category_id"] == target["category_id"] for c in items)
    assert all(c["product_type_id"] == target["product_type_id"] for c in items)
    assert all(target["model"] in c["model"] for c in items)


# --- Task 3.4: Backward-compat test ---

def test_no_params_backward_compat(client, cable_manager_headers, scoped_cables, other_manufacturer_cables):
    res = client.get("/api/portal/cables", headers=cable_manager_headers)
    assert res.status_code == 200
    items = res.json()
    assert len(items) <= 50
    # All returned cables belong to mfr-1 (user's scope)
    assert all(c["manufacturer_id"] == "mfr-1" for c in items)
    # No leak from other manufacturer
    other_models = {c["model"] for c in other_manufacturer_cables}
    assert not any(c["model"] in other_models for c in items)
    # Sorted by created_at descending
    created = [c["created_at"] for c in items if c.get("created_at")]
    assert created == sorted(created, reverse=True)
