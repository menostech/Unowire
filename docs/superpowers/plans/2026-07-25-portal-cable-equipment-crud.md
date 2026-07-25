---
change: portal-cable-equipment-crud
design-doc: docs/superpowers/specs/2026-07-25-portal-cable-equipment-crud-design.md
base-ref: 47a6eb485000b09037afa8b1aef1aef43fe32030
archived_with: 2026-07-25
archived_status: archived
---

# Portal Cable & Equipment CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full create/delete capabilities (scope-enforced) for portal cables and equipment, expand the edit forms to surface all editable fields, expand the list pages with additional columns, and add delete confirmation dialogs — all building on the foundation from change 1 (`portal-foundation-refactor`).

**Architecture:** Backend adds portal-specific create schemas (`PortalCableCreate` / `PortalEquipmentCreate`) that omit `id` (server-generated) and `manufacturer_id` (server-forced to `scope_id`). POST routes auto-generate IDs via `{manufacturer_slug}-{record_slug}` with UUID collision fallback. DELETE routes reuse existing `_check_*_ownership` helpers. Frontend adds BFF POST/DELETE routes, `portalApiClient` create/remove methods, shared form-field sub-components, create/edit form components, delete buttons with a shared confirmation dialog, and expanded list/detail pages. Taxonomy data for cable forms comes from the public `GET /api/taxonomy` endpoint; equipment categories from `GET /api/equipment-categories`.

**Tech Stack:** Next.js 15 App Router (Server + Client Components), TypeScript, FastAPI (async/await), Pydantic, PostgreSQL, SQLAlchemy 2.0 async. No new npm/pip dependencies — uses `uuid4` from Python stdlib.

**Design Doc:** `docs/superpowers/specs/2026-07-25-portal-cable-equipment-crud-design.md`

## Global Constraints

- No database schema changes — no migrations, no new tables/columns.
- No new npm or pip dependencies. Use `uuid4` from `uuid` (Python stdlib) for ID collision fallback.
- Frontend has NO automated tests — do NOT write frontend test files. Frontend verification is `tsc --noEmit` + `next build` + manual smoke tests.
- Backend uses pytest with existing `cable_manager_headers` (scoped to `mfr-1`, `manufacturer` scope) and `equipment_manager_headers` (scoped to `em-1`, `equipment_manufacturer` scope) fixtures from `backend/tests/conftest.py`.
- Taxonomy endpoints (`GET /api/taxonomy`, `GET /api/equipment-categories`) are public — no auth, no BFF proxy needed. Server components fetch them directly via `INTERNAL_API_BASE`.
- `portalApiClient.ts`, `frontend/lib/types/portal.ts`, and BFF route conventions from change 1 are the foundation — extend, do not rewrite.
- All code, comments, and docs in English.
- `build_mode: subagent-driven-development` — each task is independently executable by a background implementer subagent.
- `manufacturer_id` is ALWAYS forced to `user.scope_id` on create (never trusted from client). `id` is ALWAYS server-generated.
- `_check_cable_ownership` / `_check_equipment_ownership` return 404 (not 403) for both not-found and out-of-scope — no information leakage.
- Cable `CableVariant.cable_id` and `SpecItem.cable_id` FKs have `ondelete="CASCADE"` — delete cascades automatically.

## Implementation Notes

### Equipment Relation Loading (Important)

`RecommendedEquipment.manufacturer` and `RecommendedEquipment.category` relationships use default `lazy="select"` (NOT `selectin`). In async SQLAlchemy, accessing these without explicit loading raises `MissingGreenlet`. The existing portal equipment GET detail route uses `crud_equipment.get` (from `CRUDBase.get` → `db.get`) which does NOT load relations — but existing tests only test 404 cases, so this latent bug was never caught.

**For the DELETE route**, we MUST use `crud_equipment.get_with_relations` (which uses `selectinload`) to load relations before deletion, so the returned `RecommendedEquipmentRead` can serialize `manufacturer` and `category`. Do NOT use `crud_equipment.get` or `crud_equipment.remove` directly (they don't load relations).

Cable model uses `lazy="selectin"` on all relationships, so `db.get(Cable, id)` auto-loads them — `crud_cable.get_detail` and `crud_cable.remove` both work fine.

### Equipment Slug Uniqueness

`RecommendedEquipment.slug` has a global `unique=True` constraint (unlike cables which have composite `(manufacturer_id, slug)`). Slug collisions on equipment return 409 from the `IntegrityError` catch.

---

## File Structure

**New backend files:** none (modify existing).

**New frontend files:**
- `frontend/app/api/portal/cables/route.ts` — BFF POST handler.
- `frontend/app/api/portal/equipment/route.ts` — BFF POST handler.
- `frontend/components/portal/form/CableFormFields.tsx` — shared controlled cable form fields.
- `frontend/components/portal/form/CableCreateForm.tsx` — cable create form.
- `frontend/components/portal/form/EquipmentFormFields.tsx` — shared controlled equipment form fields.
- `frontend/components/portal/form/EquipmentCreateForm.tsx` — equipment create form.
- `frontend/components/portal/form/DeleteConfirmDialog.tsx` — shared confirmation modal.
- `frontend/components/portal/form/CableDeleteButton.tsx` — cable delete button + dialog.
- `frontend/components/portal/form/EquipmentDeleteButton.tsx` — equipment delete button + dialog.
- `frontend/app/portal/cables/new/page.tsx` — cable create page (server component).
- `frontend/app/portal/equipment/new/page.tsx` — equipment create page (server component).

**Modified backend files:**
- `backend/app/schemas/cable.py` — add `PortalCableCreate`.
- `backend/app/schemas/equipment.py` — add `PortalEquipmentCreate`.
- `backend/app/api/routes/portal_cables.py` — add POST, DELETE, `_generate_cable_id` helper.
- `backend/app/api/routes/portal_equipment.py` — add POST, DELETE, `_generate_equipment_id` helper.
- `backend/tests/api/test_portal_cables.py` — add create/delete tests.
- `backend/tests/api/test_portal_equipment.py` — add create/delete tests.

**Modified frontend files:**
- `frontend/lib/types/portal.ts` — add `PortalCableCreate`, `PortalEquipmentCreate`; widen `PortalCableUpdate`, `PortalEquipmentUpdate`; add taxonomy/equipment-category types.
- `frontend/lib/portalApiClient.ts` — add `cables.create/remove`, `equipment.create/remove`.
- `frontend/app/api/portal/cables/[id]/route.ts` — add DELETE handler.
- `frontend/app/api/portal/equipment/[id]/route.ts` — add DELETE handler.
- `frontend/components/portal/form/CableEditForm.tsx` — expand fields, wrap `CableFormFields`.
- `frontend/components/portal/form/EquipmentEditForm.tsx` — expand fields, wrap `EquipmentFormFields`.
- `frontend/app/portal/cables/page.tsx` — add columns + New Cable button.
- `frontend/app/portal/cables/[id]/page.tsx` — fetch taxonomy, pass to form, render delete button.
- `frontend/app/portal/equipment/page.tsx` — add Category column + New Equipment button.
- `frontend/app/portal/equipment/[id]/page.tsx` — fetch categories, pass to form, render delete button.

---

## Section 1: Backend Schemas

### Task 1.1: Add `PortalCableCreate` schema

**Files:**
- Modify: `backend/app/schemas/cable.py` (append after `CableUpdate` class, ~line 159)

**Depends on:** none

**Produces:** `PortalCableCreate` class importable from `app.schemas.cable`

- [ ] **Step 1: Add the schema**

Add to `backend/app/schemas/cable.py` after the `CableUpdate` class:

```python
from typing import Literal


class PortalCableCreate(BaseModel):
    """Portal-specific cable create schema.

    Omits `id` (server-generated) and `manufacturer_id` (server-forced to scope_id).
    Excludes `common_specs` and `variants` (portal create is intentionally minimal).
    """
    product_type_id: str
    industry_id: str
    category_id: str
    model: str
    slug: str
    size_system: Literal["awg", "mm2", "kcmil", "none"]
    base_description: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    image_url: str | None = None
    category_ids: list[str] = []

    model_config = {"from_attributes": True}
```

Add `from typing import Literal` to the imports at the top of the file if not already present.

- [ ] **Step 2: Verify import works**

Run: `cd backend && python -c "from app.schemas.cable import PortalCableCreate; print(PortalCableCreate.model_fields.keys())"`
Expected: prints field names including `product_type_id`, `model`, `slug`, `size_system`, etc.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/cable.py
git commit -m "feat(portal): add PortalCableCreate schema"
```

**Acceptance:** `PortalCableCreate` is importable, has all specified fields, omits `id`/`manufacturer_id`/`common_specs`/`variants`, uses `Literal` for `size_system`.

---

### Task 1.2: Add `PortalEquipmentCreate` schema

**Files:**
- Modify: `backend/app/schemas/equipment.py` (append after `RecommendedEquipmentUpdate` class, ~line 151)

**Depends on:** none

**Produces:** `PortalEquipmentCreate` class importable from `app.schemas.equipment`

- [ ] **Step 1: Add the schema**

Add to `backend/app/schemas/equipment.py` after the `RecommendedEquipmentUpdate` class:

```python
class PortalEquipmentCreate(BaseModel):
    """Portal-specific equipment create schema.

    Omits `id` (server-generated) and `manufacturer_id` (server-forced to scope_id).
    Excludes `applicable_specs` (complex rule editor; deferred).
    """
    category_id: str
    model: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    external_url: str | None = None
    sort_order: int = 0

    model_config = {"from_attributes": True}
```

Note: `sort_order` defaults to `0` (not `None`) to match the model's `default=0` and avoid NULL violation.

- [ ] **Step 2: Verify import works**

Run: `cd backend && python -c "from app.schemas.equipment import PortalEquipmentCreate; print(PortalEquipmentCreate.model_fields.keys())"`
Expected: prints `category_id`, `model`, `slug`, `description`, `image_url`, `external_url`, `sort_order`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/equipment.py
git commit -m "feat(portal): add PortalEquipmentCreate schema"
```

**Acceptance:** `PortalEquipmentCreate` is importable, has all specified fields, omits `id`/`manufacturer_id`/`applicable_specs`.

---

### Task 1.3: Verify schemas match existing field types

**Files:** none (verification only)

**Depends on:** Task 1.1, Task 1.2

- [ ] **Step 1: Cross-check field types against `CableCreate` and `RecommendedEquipmentCreate`**

Verify that `PortalCableCreate` field types match `CableCreate` (in `backend/app/schemas/cable.py`):
- `product_type_id: str` ✓ (matches `CableCreate.product_type_id: str`)
- `industry_id: str` ✓
- `category_id: str` ✓
- `model: str` ✓
- `slug: str` ✓
- `size_system: Literal[...]` — stricter than `CableCreate.size_system: str` but valid (DB check constraint enforces same values)
- `base_description: str | None = None` ✓
- `meta_title: str | None = None` ✓
- `meta_description: str | None = None` ✓
- `image_url: str | None = None` ✓
- `category_ids: list[str] = []` ✓

Verify `PortalEquipmentCreate` against `RecommendedEquipmentCreate`:
- All field types match. `sort_order: int = 0` matches. ✓

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** All field types are consistent. No discrepancies found.

---

## Section 2: Backend Portal Cable Routes (POST + DELETE)

### Task 2.1: Add `POST /api/portal/cables` with `_generate_cable_id` helper

**Files:**
- Modify: `backend/app/api/routes/portal_cables.py`

**Depends on:** Task 1.1

**Consumes:**
- `PortalCableCreate` from `app.schemas.cable`
- `CableRead` from `app.schemas.cable` (already imported)
- `require_factory_module("cables")` from `app.api.deps` (already imported)
- `crud_manufacturer.get(db, id=...)` from `app.crud.manufacturer`
- `Cable` model from `app.models.cable`

**Produces:** `POST /api/portal/cables` endpoint returning `201` with `CableRead`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/api/test_portal_cables.py`:

```python
def test_portal_create_cable_success(client, cable_manager_headers):
    """Manufacturer can create a cable within their scope."""
    # First fetch taxonomy to get valid IDs
    tax_res = client.get("/api/taxonomy")
    assert tax_res.status_code == 200
    industries = tax_res.json()
    if not industries or not industries[0].get("categories"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    if not category.get("product_types"):
        pytest.skip("No product types seeded")
    product_type = category["product_types"][0]

    res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "Test Portal Cable",
        "slug": "test-portal-cable",
        "size_system": "awg",
    })
    assert res.status_code == 201, f"Create failed: {res.text}"
    data = res.json()
    assert data["model"] == "Test Portal Cable"
    assert data["manufacturer_id"] == "mfr-1"  # forced to scope_id
    assert data["id"]  # auto-generated
    assert data["id"] != "test-portal-cable"  # includes manufacturer slug prefix
    assert data["slug"] == "test-portal-cable"


def test_portal_create_cable_missing_fields_422(client, cable_manager_headers):
    """Missing required fields returns 422."""
    res = client.post("/api/portal/cables", headers=cable_manager_headers, json={"model": "X"})
    assert res.status_code == 422


def test_portal_create_cable_cross_scope_403(client, equipment_manager_headers):
    """Equipment manufacturer cannot create cables (403)."""
    res = client.post("/api/portal/cables", headers=equipment_manager_headers, json={
        "product_type_id": "pt-1", "industry_id": "ind-1", "category_id": "cat-1",
        "model": "X", "slug": "x", "size_system": "awg",
    })
    assert res.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/api/test_portal_cables.py::test_portal_create_cable_success tests/api/test_portal_cables.py::test_portal_create_cable_missing_fields_422 tests/api/test_portal_cables.py::test_portal_create_cable_cross_scope_403 -v`
Expected: FAIL (404 or 405 — POST route doesn't exist yet)

- [ ] **Step 3: Implement the POST route and ID generation helper**

Add imports at the top of `backend/app/api/routes/portal_cables.py`:

```python
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.crud.manufacturer import crud_manufacturer
from app.models.cable import Cable as CableModel
from app.schemas.cable import PortalCableCreate
```

Add the `_generate_cable_id` helper after `_check_cable_ownership`:

```python
async def _generate_cable_id(db: AsyncSession, manufacturer_slug: str, cable_slug: str) -> str:
    """Generate a unique cable ID: {manufacturer_slug}-{cable_slug} with UUID fallback."""
    base = f"{manufacturer_slug}-{cable_slug}".lower()[:92]  # leave 8 chars for suffix
    existing = await db.execute(select(CableModel.id).where(CableModel.id == base))
    if not existing.scalar_one_or_none():
        return base
    suffix = uuid4().hex[:8]
    return f"{base}-{suffix}"
```

Add the POST route after the existing PUT route:

```python
@router.post("", response_model=CableRead, status_code=201)
async def portal_create_cable(
    obj_in: PortalCableCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("cables")),
):
    manufacturer = await crud_manufacturer.get(db, id=user.scope_id)
    if not manufacturer:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})

    cable_id = await _generate_cable_id(db, manufacturer.slug, obj_in.slug)
    cable_data = obj_in.model_dump()
    cable_data["id"] = cable_id
    cable_data["manufacturer_id"] = user.scope_id  # server-forced, ignore client input

    cable = CableModel(**cable_data)
    db.add(cable)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "A cable with this slug already exists"})
    await db.refresh(cable)
    return cable
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/api/test_portal_cables.py::test_portal_create_cable_success tests/api/test_portal_cables.py::test_portal_create_cable_missing_fields_422 tests/api/test_portal_cables.py::test_portal_create_cable_cross_scope_403 -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/portal_cables.py backend/tests/api/test_portal_cables.py
git commit -m "feat(portal): add POST /api/portal/cables with auto-generated ID"
```

**Acceptance:** POST route creates cable with server-forced `manufacturer_id` and auto-generated `id`. Missing fields return 422. Cross-scope returns 403.

---

### Task 2.2: Add `DELETE /api/portal/cables/{cable_id}`

**Files:**
- Modify: `backend/app/api/routes/portal_cables.py`

**Depends on:** Task 2.1

**Consumes:**
- `_check_cable_ownership` (already defined in this file)
- `crud_cable.get_detail` and `crud_cable.remove` (already imported)

**Produces:** `DELETE /api/portal/cables/{cable_id}` endpoint returning `200` with `CableRead`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/api/test_portal_cables.py`:

```python
def test_portal_delete_cable_success(client, cable_manager_headers):
    """Manufacturer can delete their own cable."""
    # Create a cable first
    tax_res = client.get("/api/taxonomy")
    industries = tax_res.json()
    if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    product_type = category["product_types"][0]

    create_res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "Delete Me Cable",
        "slug": "delete-me-cable",
        "size_system": "awg",
    })
    assert create_res.status_code == 201
    cable_id = create_res.json()["id"]

    # Delete it
    del_res = client.delete(f"/api/portal/cables/{cable_id}", headers=cable_manager_headers)
    assert del_res.status_code == 200
    assert del_res.json()["id"] == cable_id

    # Verify it's gone
    get_res = client.get(f"/api/portal/cables/{cable_id}", headers=cable_manager_headers)
    assert get_res.status_code == 404


def test_portal_delete_cable_out_of_scope_404(client, cable_manager_headers):
    """Deleting a non-existent or out-of-scope cable returns 404."""
    res = client.delete("/api/portal/cables/nonexistent-cable-id", headers=cable_manager_headers)
    assert res.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/api/test_portal_cables.py::test_portal_delete_cable_success tests/api/test_portal_cables.py::test_portal_delete_cable_out_of_scope_404 -v`
Expected: FAIL (405 — DELETE route doesn't exist yet)

- [ ] **Step 3: Implement the DELETE route**

Add to `backend/app/api/routes/portal_cables.py` after the POST route:

```python
@router.delete("/{cable_id}", response_model=CableRead)
async def portal_delete_cable(
    cable_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("cables")),
):
    cable = await crud_cable.get_detail(db, id=cable_id)
    _check_cable_ownership(user, cable)  # raises 404 if None or out-of-scope
    deleted = await crud_cable.remove(db, id=cable_id)
    await db.commit()
    return deleted
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/api/test_portal_cables.py::test_portal_delete_cable_success tests/api/test_portal_cables.py::test_portal_delete_cable_out_of_scope_404 -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/portal_cables.py backend/tests/api/test_portal_cables.py
git commit -m "feat(portal): add DELETE /api/portal/cables/{id}"
```

**Acceptance:** DELETE route removes cable + cascades variants/specs. Out-of-scope and non-existent return 404.

---

### Task 2.3: Verify ID collision handling

**Files:** none (verification only — collision logic is already in `_generate_cable_id` from Task 2.1)

**Depends on:** Task 2.1

- [ ] **Step 1: Review the `_generate_cable_id` implementation**

The helper in Task 2.1 does:
1. Build base ID: `{manufacturer_slug}-{cable_slug}`.lower(), truncated to 92 chars.
2. Pre-check: `SELECT Cable.id WHERE Cable.id == base`. If not found, return base.
3. Collision: append `-` + 8-char UUID hex suffix.
4. `IntegrityError` catch in the POST route handles race conditions → 409.

This covers both pre-check and race-condition fallback.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** ID collision is handled via pre-check SELECT + IntegrityError → 409 fallback.

---

### Task 2.4: Run full backend cable test suite

**Files:** none (verification only)

**Depends on:** Task 2.1, Task 2.2

- [ ] **Step 1: Run all portal cable tests**

Run: `cd backend && python -m pytest tests/api/test_portal_cables.py -v`
Expected: All tests PASS (existing 5 + new 5 = 10 tests)

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** All portal cable tests pass including existing list/detail/scope tests.

---

## Section 3: Backend Portal Equipment Routes (POST + DELETE)

### Task 3.1: Add `POST /api/portal/equipment` with `_generate_equipment_id` helper

**Files:**
- Modify: `backend/app/api/routes/portal_equipment.py`

**Depends on:** Task 1.2

**Consumes:**
- `PortalEquipmentCreate` from `app.schemas.equipment`
- `RecommendedEquipmentRead` from `app.schemas.equipment` (already imported)
- `require_factory_module("equipment")` from `app.api.deps` (already imported)
- `crud_manufacturer.get` from `app.crud.manufacturer` — but this is for `Manufacturer`, not `EquipmentManufacturer`. Equipment manufacturers are in a separate table. Need to use `crud_equipment_manufacturer.get` instead.

**Produces:** `POST /api/portal/equipment` endpoint returning `201` with `RecommendedEquipmentRead`

**Important:** Equipment manufacturers are in the `EquipmentManufacturer` table (not `Manufacturer`). Use `crud_equipment_manufacturer.get(db, id=user.scope_id)` to load the manufacturer and get its `slug`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/api/test_portal_equipment.py`:

```python
def test_portal_create_equipment_success(client, equipment_manager_headers):
    """Equipment manufacturer can create equipment within their scope."""
    # Fetch equipment categories to get a valid category_id
    cat_res = client.get("/api/equipment-categories")
    assert cat_res.status_code == 200
    categories = cat_res.json()
    if not categories:
        pytest.skip("No equipment categories seeded")
    # Use a child category if available, otherwise top-level
    category = categories[0]
    if category.get("children"):
        category = category["children"][0]

    res = client.post("/api/portal/equipment", headers=equipment_manager_headers, json={
        "category_id": category["id"],
        "model": "Test Portal Equipment",
        "slug": "test-portal-equipment",
    })
    assert res.status_code == 201, f"Create failed: {res.text}"
    data = res.json()
    assert data["model"] == "Test Portal Equipment"
    assert data["manufacturer_id"] == "em-1"  # forced to scope_id
    assert data["id"]  # auto-generated
    assert data["slug"] == "test-portal-equipment"


def test_portal_create_equipment_missing_fields_422(client, equipment_manager_headers):
    """Missing required fields returns 422."""
    res = client.post("/api/portal/equipment", headers=equipment_manager_headers, json={"model": "X"})
    assert res.status_code == 422


def test_portal_create_equipment_cross_scope_403(client, cable_manager_headers):
    """Cable manufacturer cannot create equipment (403)."""
    res = client.post("/api/portal/equipment", headers=cable_manager_headers, json={
        "category_id": "cat-1", "model": "X", "slug": "x",
    })
    assert res.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/api/test_portal_equipment.py::test_portal_create_equipment_success tests/api/test_portal_equipment.py::test_portal_create_equipment_missing_fields_422 tests/api/test_portal_equipment.py::test_portal_create_equipment_cross_scope_403 -v`
Expected: FAIL (404 or 405 — POST route doesn't exist yet)

- [ ] **Step 3: Implement the POST route and ID generation helper**

Add imports at the top of `backend/app/api/routes/portal_equipment.py`:

```python
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.crud.equipment import crud_equipment_manufacturer
from app.models.equipment import RecommendedEquipment as EquipmentModel
from app.schemas.equipment import PortalEquipmentCreate
```

Add the `_generate_equipment_id` helper after `_check_equipment_ownership`:

```python
async def _generate_equipment_id(db: AsyncSession, manufacturer_slug: str, equipment_slug: str) -> str:
    """Generate a unique equipment ID: {manufacturer_slug}-{equipment_slug} with UUID fallback."""
    base = f"{manufacturer_slug}-{equipment_slug}".lower()[:92]
    existing = await db.execute(select(EquipmentModel.id).where(EquipmentModel.id == base))
    if not existing.scalar_one_or_none():
        return base
    suffix = uuid4().hex[:8]
    return f"{base}-{suffix}"
```

Add the POST route after the existing PUT route:

```python
@router.post("", response_model=RecommendedEquipmentRead, status_code=201)
async def portal_create_equipment(
    obj_in: PortalEquipmentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("equipment")),
):
    manufacturer = await crud_equipment_manufacturer.get(db, id=user.scope_id)
    if not manufacturer:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment manufacturer not found"})

    equipment_id = await _generate_equipment_id(db, manufacturer.slug, obj_in.slug)
    equipment_data = obj_in.model_dump()
    equipment_data["id"] = equipment_id
    equipment_data["manufacturer_id"] = user.scope_id  # server-forced

    equipment = EquipmentModel(**equipment_data)
    db.add(equipment)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Equipment with this slug already exists"})
    await db.refresh(equipment)
    return equipment
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/api/test_portal_equipment.py::test_portal_create_equipment_success tests/api/test_portal_equipment.py::test_portal_create_equipment_missing_fields_422 tests/api/test_portal_equipment.py::test_portal_create_equipment_cross_scope_403 -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/portal_equipment.py backend/tests/api/test_portal_equipment.py
git commit -m "feat(portal): add POST /api/portal/equipment with auto-generated ID"
```

**Acceptance:** POST route creates equipment with server-forced `manufacturer_id` and auto-generated `id`. Missing fields return 422. Cross-scope returns 403.

---

### Task 3.2: Add `DELETE /api/portal/equipment/{equipment_id}`

**Files:**
- Modify: `backend/app/api/routes/portal_equipment.py`

**Depends on:** Task 3.1

**Consumes:**
- `_check_equipment_ownership` (already defined in this file)
- `crud_equipment.get_with_relations` from `app.crud.equipment` (loads `manufacturer` + `category` via `selectinload`)

**Produces:** `DELETE /api/portal/equipment/{equipment_id}` endpoint returning `200` with `RecommendedEquipmentRead`

**Important:** Do NOT use `crud_equipment.get` or `crud_equipment.remove` — they don't load relations and the async session will raise `MissingGreenlet` when serializing `RecommendedEquipmentRead`. Use `crud_equipment.get_with_relations` + `db.delete` + `db.commit` instead.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/api/test_portal_equipment.py`:

```python
def test_portal_delete_equipment_success(client, equipment_manager_headers):
    """Equipment manufacturer can delete their own equipment."""
    # Create equipment first
    cat_res = client.get("/api/equipment-categories")
    categories = cat_res.json()
    if not categories:
        pytest.skip("No equipment categories seeded")
    category = categories[0]
    if category.get("children"):
        category = category["children"][0]

    create_res = client.post("/api/portal/equipment", headers=equipment_manager_headers, json={
        "category_id": category["id"],
        "model": "Delete Me Equipment",
        "slug": "delete-me-equipment",
    })
    assert create_res.status_code == 201
    equipment_id = create_res.json()["id"]

    # Delete it
    del_res = client.delete(f"/api/portal/equipment/{equipment_id}", headers=equipment_manager_headers)
    assert del_res.status_code == 200
    assert del_res.json()["id"] == equipment_id

    # Verify it's gone
    get_res = client.get(f"/api/portal/equipment/{equipment_id}", headers=equipment_manager_headers)
    assert get_res.status_code == 404


def test_portal_delete_equipment_out_of_scope_404(client, equipment_manager_headers):
    """Deleting non-existent or out-of-scope equipment returns 404."""
    res = client.delete("/api/portal/equipment/nonexistent-id", headers=equipment_manager_headers)
    assert res.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/api/test_portal_equipment.py::test_portal_delete_equipment_success tests/api/test_portal_equipment.py::test_portal_delete_equipment_out_of_scope_404 -v`
Expected: FAIL (405 — DELETE route doesn't exist yet)

- [ ] **Step 3: Implement the DELETE route**

Add to `backend/app/api/routes/portal_equipment.py` after the POST route:

```python
@router.delete("/{equipment_id}", response_model=RecommendedEquipmentRead)
async def portal_delete_equipment(
    equipment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("equipment")),
):
    equipment = await crud_equipment.get_with_relations(db, id=equipment_id)
    _check_equipment_ownership(user, equipment)  # raises 404 if None or out-of-scope
    await db.delete(equipment)
    await db.commit()
    return equipment
```

Note: `crud_equipment` is already imported. We use `get_with_relations` (which uses `selectinload`) to load `manufacturer` + `category` before deletion. After `db.delete` + `db.commit`, with `expire_on_commit=False`, the cached relation values are still accessible for serialization.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/api/test_portal_equipment.py::test_portal_delete_equipment_success tests/api/test_portal_equipment.py::test_portal_delete_equipment_out_of_scope_404 -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/portal_equipment.py backend/tests/api/test_portal_equipment.py
git commit -m "feat(portal): add DELETE /api/portal/equipment/{id}"
```

**Acceptance:** DELETE route removes equipment. Out-of-scope and non-existent return 404. Response includes `manufacturer` and `category` relations.

---

### Task 3.3: Verify ID collision handling

**Files:** none (verification only)

**Depends on:** Task 3.1

- [ ] **Step 1: Review the `_generate_equipment_id` implementation**

Same algorithm as `_generate_cable_id` (Task 2.3): pre-check SELECT + UUID suffix + IntegrityError → 409 fallback.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** ID collision is handled via pre-check SELECT + IntegrityError → 409 fallback.

---

### Task 3.4: Run full backend equipment test suite

**Files:** none (verification only)

**Depends on:** Task 3.1, Task 3.2

- [ ] **Step 1: Run all portal equipment tests**

Run: `cd backend && python -m pytest tests/api/test_portal_equipment.py -v`
Expected: All tests PASS (existing 4 + new 5 = 9 tests)

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** All portal equipment tests pass including existing list/detail/scope tests.

---

## Section 4: Frontend Types

### Task 4.1: Add `PortalCableCreate` interface and widen `PortalCableUpdate`

**Files:**
- Modify: `frontend/lib/types/portal.ts`

**Depends on:** Task 1.1

**Produces:** `PortalCableCreate` interface, widened `PortalCableUpdate` interface

- [ ] **Step 1: Add `PortalCableCreate` and widen `PortalCableUpdate`**

In `frontend/lib/types/portal.ts`, replace the existing `PortalCableUpdate` interface (lines 70-73) and add `PortalCableCreate` before it:

```typescript
// Portal-specific cable create payload (omits id, manufacturer_id, common_specs, variants).
export interface PortalCableCreate {
  product_type_id: string;
  industry_id: string;
  category_id: string;
  model: string;
  slug: string;
  size_system: 'awg' | 'mm2' | 'kcmil' | 'none';
  base_description?: string;
  meta_title?: string;
  meta_description?: string;
  image_url?: string;
  category_ids?: string[];
}

// Cable update payload — widened to cover all editable fields.
export interface PortalCableUpdate {
  model?: string;
  slug?: string;
  size_system?: 'awg' | 'mm2' | 'kcmil' | 'none';
  base_description?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  image_url?: string | null;
  industry_id?: string;
  category_id?: string;
  product_type_id?: string;
}
```

Also add taxonomy types at the end of the file (needed by form components in later tasks):

```typescript
// Matches backend ProductTypeRead (backend/app/schemas/taxonomy.py).
export interface TaxonomyProductType {
  id: string;
  label: string;
  slug: string;
  size_system: string;
  sort_order: number;
  image_url: string | null;
}

// Matches backend CategoryRead.
export interface TaxonomyCategory {
  id: string;
  industry_id: string;
  label: string;
  slug: string;
  description: string | null;
  product_types: TaxonomyProductType[];
  sort_order: number;
  image_url: string | null;
}

// Matches backend IndustryRead.
export interface TaxonomyIndustry {
  id: string;
  label: string;
  slug: string;
  description: string | null;
  categories: TaxonomyCategory[];
  sort_order: number;
  image_url: string | null;
}

// Matches backend EquipmentCategoryTreeRead (backend/app/schemas/equipment.py).
export interface EquipmentCategoryChild {
  id: string;
  parent_id: string | null;
  label: string;
  slug: string;
  description: string | null;
  sort_order: number;
  image_url: string | null;
}

export interface EquipmentCategoryTree {
  id: string;
  parent_id: string | null;
  label: string;
  slug: string;
  description: string | null;
  sort_order: number;
  image_url: string | null;
  children: EquipmentCategoryChild[];
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types/portal.ts
git commit -m "feat(portal): add PortalCableCreate type, widen PortalCableUpdate, add taxonomy types"
```

**Acceptance:** `PortalCableCreate` matches backend schema. `PortalCableUpdate` widened with all editable fields. Taxonomy types added. `tsc --noEmit` passes.

---

### Task 4.2: Add `PortalEquipmentCreate` interface and widen `PortalEquipmentUpdate`

**Files:**
- Modify: `frontend/lib/types/portal.ts`

**Depends on:** Task 1.2

**Produces:** `PortalEquipmentCreate` interface, widened `PortalEquipmentUpdate` interface

- [ ] **Step 1: Add `PortalEquipmentCreate` and widen `PortalEquipmentUpdate`**

In `frontend/lib/types/portal.ts`, replace the existing `PortalEquipmentUpdate` interface (lines 94-97) and add `PortalEquipmentCreate` before it:

```typescript
// Portal-specific equipment create payload (omits id, manufacturer_id, applicable_specs).
export interface PortalEquipmentCreate {
  category_id: string;
  model: string;
  slug: string;
  description?: string;
  image_url?: string;
  external_url?: string;
  sort_order?: number;
}

// Equipment update payload — widened to cover all editable fields.
export interface PortalEquipmentUpdate {
  model?: string;
  slug?: string;
  description?: string | null;
  image_url?: string | null;
  external_url?: string | null;
  sort_order?: number;
  category_id?: string;
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types/portal.ts
git commit -m "feat(portal): add PortalEquipmentCreate type, widen PortalEquipmentUpdate"
```

**Acceptance:** `PortalEquipmentCreate` matches backend schema. `PortalEquipmentUpdate` widened with all editable fields. `tsc --noEmit` passes.

---

## Section 5: Frontend BFF Routes

### Task 5.1: Create `frontend/app/api/portal/cables/route.ts` (POST)

**Files:**
- Create: `frontend/app/api/portal/cables/route.ts`

**Depends on:** none (BFF route is independent of backend — just forwards)

**Produces:** `POST /api/portal/cables` BFF route

- [ ] **Step 1: Create the BFF route**

Create `frontend/app/api/portal/cables/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('portal_token')?.value;
  if (!token) {
    return NextResponse.json({ code: 401, message: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.text();
  const res = await fetch(`${API_BASE}/api/portal/cables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/portal/cables/route.ts
git commit -m "feat(portal): add BFF POST route for cable creation"
```

**Acceptance:** BFF route forwards POST body + `portal_token` cookie as Bearer token to backend.

---

### Task 5.2: Add DELETE handler to `frontend/app/api/portal/cables/[id]/route.ts`

**Files:**
- Modify: `frontend/app/api/portal/cables/[id]/route.ts`

**Depends on:** none

**Produces:** `DELETE /api/portal/cables/[id]` BFF route (alongside existing PUT)

- [ ] **Step 1: Add the DELETE handler**

Append to `frontend/app/api/portal/cables/[id]/route.ts` (after the existing PUT handler):

```typescript
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get('portal_token')?.value;
  if (!token) {
    return NextResponse.json({ code: 401, message: 'Unauthorized' }, { status: 401 });
  }
  const res = await fetch(`${API_BASE}/api/portal/cables/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/portal/cables/[id]/route.ts
git commit -m "feat(portal): add BFF DELETE route for cable deletion"
```

**Acceptance:** BFF route forwards DELETE + `portal_token` cookie to backend. Existing PUT handler unchanged.

---

### Task 5.3: Create `frontend/app/api/portal/equipment/route.ts` (POST)

**Files:**
- Create: `frontend/app/api/portal/equipment/route.ts`

**Depends on:** none

**Produces:** `POST /api/portal/equipment` BFF route

- [ ] **Step 1: Create the BFF route**

Create `frontend/app/api/portal/equipment/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('portal_token')?.value;
  if (!token) {
    return NextResponse.json({ code: 401, message: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.text();
  const res = await fetch(`${API_BASE}/api/portal/equipment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/portal/equipment/route.ts
git commit -m "feat(portal): add BFF POST route for equipment creation"
```

**Acceptance:** BFF route forwards POST body + `portal_token` cookie as Bearer token to backend.

---

### Task 5.4: Add DELETE handler to `frontend/app/api/portal/equipment/[id]/route.ts`

**Files:**
- Modify: `frontend/app/api/portal/equipment/[id]/route.ts`

**Depends on:** none

**Produces:** `DELETE /api/portal/equipment/[id]` BFF route (alongside existing PUT)

- [ ] **Step 1: Add the DELETE handler**

Append to `frontend/app/api/portal/equipment/[id]/route.ts` (after the existing PUT handler):

```typescript
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get('portal_token')?.value;
  if (!token) {
    return NextResponse.json({ code: 401, message: 'Unauthorized' }, { status: 401 });
  }
  const res = await fetch(`${API_BASE}/api/portal/equipment/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/portal/equipment/[id]/route.ts
git commit -m "feat(portal): add BFF DELETE route for equipment deletion"
```

**Acceptance:** BFF route forwards DELETE + `portal_token` cookie to backend. Existing PUT handler unchanged.

---

### Task 5.5: Verify taxonomy endpoints are public (no BFF needed)

**Files:** none (verification only)

**Depends on:** none

- [ ] **Step 1: Verify `GET /api/taxonomy` requires no auth**

Run: `cd backend && python -c "
from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)
res = client.get('/api/taxonomy')
print(f'Status: {res.status_code}')
print(f'Has auth dep: {\"Depends\" not in \"public\"}')
"`
Expected: Status 200 (no auth required)

- [ ] **Step 2: Verify `GET /api/equipment-categories` requires no auth**

Run: `cd backend && python -c "
from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)
res = client.get('/api/equipment-categories')
print(f'Status: {res.status_code}')
"`
Expected: Status 200 (no auth required)

- [ ] **Step 3: No commit needed (verification only)**

**Acceptance:** Both taxonomy endpoints are public — server components can fetch them directly via `INTERNAL_API_BASE` without BFF proxy or auth tokens.

---

## Section 6: Frontend portalApiClient Methods

### Task 6.1: Add `cables.create` method

**Files:**
- Modify: `frontend/lib/portalApiClient.ts`

**Depends on:** Task 4.1, Task 5.1

**Consumes:** `PortalCableCreate` from `@/lib/types/portal`

**Produces:** `portalApiClient.cables.create(data)` method

- [ ] **Step 1: Add the method**

In `frontend/lib/portalApiClient.ts`, add `PortalCableCreate` to the import from `@/lib/types/portal`, then add `create` to the `cables` object (before `update`):

```typescript
async create(data: PortalCableCreate): Promise<PortalCable> {
  const res = await bffFetch('/api/portal/cables', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
},
```

The full import line becomes:
```typescript
import type {
  PortalCable,
  PortalCableCreate,
  PortalCableUpdate,
  PortalEquipment,
  PortalEquipmentCreate,
  PortalEquipmentUpdate,
  PortalInquiry,
} from '@/lib/types/portal';
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/portalApiClient.ts
git commit -m "feat(portal): add portalApiClient.cables.create method"
```

**Acceptance:** `cables.create(data)` POSTs to `/api/portal/cables` and returns `PortalCable`.

---

### Task 6.2: Add `cables.remove` method

**Files:**
- Modify: `frontend/lib/portalApiClient.ts`

**Depends on:** Task 5.2

**Produces:** `portalApiClient.cables.remove(id)` method

- [ ] **Step 1: Add the method**

Add `remove` to the `cables` object (after `update`):

```typescript
async remove(id: string): Promise<void> {
  await bffFetch(`/api/portal/cables/${id}`, { method: 'DELETE' });
},
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/portalApiClient.ts
git commit -m "feat(portal): add portalApiClient.cables.remove method"
```

**Acceptance:** `cables.remove(id)` sends DELETE to `/api/portal/cables/{id}`.

---

### Task 6.3: Add `equipment.create` method

**Files:**
- Modify: `frontend/lib/portalApiClient.ts`

**Depends on:** Task 4.2, Task 5.3

**Consumes:** `PortalEquipmentCreate` from `@/lib/types/portal`

**Produces:** `portalApiClient.equipment.create(data)` method

- [ ] **Step 1: Add the method**

Add `create` to the `equipment` object (before `update`):

```typescript
async create(data: PortalEquipmentCreate): Promise<PortalEquipment> {
  const res = await bffFetch('/api/portal/equipment', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
},
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/portalApiClient.ts
git commit -m "feat(portal): add portalApiClient.equipment.create method"
```

**Acceptance:** `equipment.create(data)` POSTs to `/api/portal/equipment` and returns `PortalEquipment`.

---

### Task 6.4: Add `equipment.remove` method

**Files:**
- Modify: `frontend/lib/portalApiClient.ts`

**Depends on:** Task 5.4

**Produces:** `portalApiClient.equipment.remove(id)` method

- [ ] **Step 1: Add the method**

Add `remove` to the `equipment` object (after `update`):

```typescript
async remove(id: string): Promise<void> {
  await bffFetch(`/api/portal/equipment/${id}`, { method: 'DELETE' });
},
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/portalApiClient.ts
git commit -m "feat(portal): add portalApiClient.equipment.remove method"
```

**Acceptance:** `equipment.remove(id)` sends DELETE to `/api/portal/equipment/{id}`.

---

### Task 6.5: Verify error handling is sufficient

**Files:** none (verification only)

**Depends on:** Task 6.1–6.4

- [ ] **Step 1: Review `bffFetch` error handling**

The existing `bffFetch` in `portalApiClient.ts` already:
1. Checks `!res.ok`
2. Parses `{code, message, field_errors}` from error response
3. Throws `PortalApiError` with `status`, `code`, `message`, `fieldErrors`

This covers 409 (slug collision), 422 (validation), 403 (scope), 404 (not found). No additional error handling needed.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** `bffFetch` already handles all error cases. `PortalApiError.fieldErrors` is available for form field-level error display.

---

## Section 7: Cable Edit Form Expansion

### Task 7.1: Create shared `CableFormFields` component

**Files:**
- Create: `frontend/components/portal/form/CableFormFields.tsx`

**Depends on:** Task 4.1 (for `PortalCable`, `TaxonomyIndustry` types)

**Produces:** `CableFormFields` component reusable by both `CableEditForm` and `CableCreateForm`

- [ ] **Step 1: Create the shared component**

Create `frontend/components/portal/form/CableFormFields.tsx`:

```tsx
'use client';

import type { TaxonomyIndustry } from '@/lib/types/portal';

export interface CableFormState {
  model: string;
  slug: string;
  size_system: 'awg' | 'mm2' | 'kcmil' | 'none';
  base_description: string;
  meta_title: string;
  meta_description: string;
  image_url: string;
  industry_id: string;
  category_id: string;
  product_type_id: string;
}

interface CableFormFieldsProps {
  value: CableFormState;
  onChange: (patch: Partial<CableFormState>) => void;
  errors: Record<string, string>;
  taxonomy: TaxonomyIndustry[];
}

export function CableFormFields({ value, onChange, errors, taxonomy }: CableFormFieldsProps) {
  // Derive filtered categories and product types from current selections
  const selectedIndustry = taxonomy.find((i) => i.id === value.industry_id);
  const categories = selectedIndustry?.categories ?? [];
  const selectedCategory = categories.find((c) => c.id === value.category_id);
  const productTypes = selectedCategory?.product_types ?? [];

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Model</label>
        <input
          value={value.model}
          onChange={(e) => onChange({ model: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {errors.model && <p className="mt-1 text-sm text-red-600">{errors.model}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Slug</label>
        <input
          value={value.slug}
          onChange={(e) => onChange({ slug: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {errors.slug && <p className="mt-1 text-sm text-red-600">{errors.slug}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Size System</label>
        <select
          value={value.size_system}
          onChange={(e) => onChange({ size_system: e.target.value as CableFormState['size_system'] })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="awg">AWG</option>
          <option value="mm2">mm²</option>
          <option value="kcmil">kcmil</option>
          <option value="none">None</option>
        </select>
        {errors.size_system && <p className="mt-1 text-sm text-red-600">{errors.size_system}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Industry</label>
        <select
          value={value.industry_id}
          onChange={(e) => onChange({ industry_id: e.target.value, category_id: '', product_type_id: '' })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select industry…</option>
          {taxonomy.map((ind) => (
            <option key={ind.id} value={ind.id}>{ind.label}</option>
          ))}
        </select>
        {errors.industry_id && <p className="mt-1 text-sm text-red-600">{errors.industry_id}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
        <select
          value={value.category_id}
          onChange={(e) => onChange({ category_id: e.target.value, product_type_id: '' })}
          disabled={!categories.length}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select category…</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </select>
        {errors.category_id && <p className="mt-1 text-sm text-red-600">{errors.category_id}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Product Type</label>
        <select
          value={value.product_type_id}
          onChange={(e) => onChange({ product_type_id: e.target.value })}
          disabled={!productTypes.length}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select product type…</option>
          {productTypes.map((pt) => (
            <option key={pt.id} value={pt.id}>{pt.label}</option>
          ))}
        </select>
        {errors.product_type_id && <p className="mt-1 text-sm text-red-600">{errors.product_type_id}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Base Description</label>
        <textarea
          value={value.base_description}
          onChange={(e) => onChange({ base_description: e.target.value })}
          rows={4}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Meta Title</label>
        <input
          value={value.meta_title}
          onChange={(e) => onChange({ meta_title: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Meta Description</label>
        <textarea
          value={value.meta_description}
          onChange={(e) => onChange({ meta_description: e.target.value })}
          rows={2}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Image URL</label>
        <input
          value={value.image_url}
          onChange={(e) => onChange({ image_url: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="https://…"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/components/portal/form/CableFormFields.tsx
git commit -m "feat(portal): add shared CableFormFields component"
```

**Acceptance:** `CableFormFields` renders all cable fields with cascading taxonomy dropdowns. Industry change resets category + product_type. Category change resets product_type.

---

### Task 7.2: Expand `CableEditForm` to use `CableFormFields` with taxonomy

**Files:**
- Modify: `frontend/components/portal/form/CableEditForm.tsx`

**Depends on:** Task 7.1, Task 4.1, Task 6.1

**Consumes:** `CableFormFields`, `CableFormState` from `./CableFormFields`; `TaxonomyIndustry`, `PortalCable` from `@/lib/types/portal`; `portalApiClient.cables.update`

- [ ] **Step 1: Rewrite `CableEditForm` to wrap `CableFormFields`**

Replace the entire content of `frontend/components/portal/form/CableEditForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import type { PortalCable, TaxonomyIndustry } from '@/lib/types/portal';
import { CableFormFields, type CableFormState } from './CableFormFields';

interface CableEditFormProps {
  cable: PortalCable;
  taxonomy: TaxonomyIndustry[];
}

export function CableEditForm({ cable, taxonomy }: CableEditFormProps) {
  const [form, setForm] = useState<CableFormState>({
    model: cable.model ?? '',
    slug: cable.slug ?? '',
    size_system: (cable.size_system as CableFormState['size_system']) ?? 'awg',
    base_description: cable.base_description ?? '',
    meta_title: cable.meta_title ?? '',
    meta_description: cable.meta_description ?? '',
    image_url: cable.image_url ?? '',
    industry_id: cable.industry_id ?? '',
    category_id: cable.category_id ?? '',
    product_type_id: cable.product_type_id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleChange(patch: Partial<CableFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.model.trim()) e.model = 'Model is required';
    if (!form.slug.trim()) e.slug = 'Slug is required';
    if (!form.size_system) e.size_system = 'Size system is required';
    if (!form.industry_id) e.industry_id = 'Industry is required';
    if (!form.category_id) e.category_id = 'Category is required';
    if (!form.product_type_id) e.product_type_id = 'Product type is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      await portalApiClient.cables.update(cable.id, form);
      setMessage('Saved');
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else if (err instanceof PortalApiError) setMessage(err.message);
      else setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4 rounded-lg bg-white p-6 shadow-sm">
      <CableFormFields value={form} onChange={handleChange} errors={errors} taxonomy={taxonomy} />
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/components/portal/form/CableEditForm.tsx
git commit -m "feat(portal): expand CableEditForm with all editable fields and taxonomy"
```

**Acceptance:** `CableEditForm` accepts `taxonomy` prop, pre-fills all fields from `cable`, submits all fields via PUT, shows inline validation errors. Cascading taxonomy dropdowns work.

---

### Task 7.3: Update cable detail page to fetch taxonomy and pass to form

**Files:**
- Modify: `frontend/app/portal/cables/[id]/page.tsx`

**Depends on:** Task 7.2

**Consumes:** `portalApi.cables.getById` (existing), `GET /api/taxonomy` (public endpoint)

- [ ] **Step 1: Update the detail page to fetch taxonomy**

Replace `frontend/app/portal/cables/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { CableEditForm } from '@/components/portal/form/CableEditForm';
import type { TaxonomyIndustry } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function PortalCableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let cable: any;
  try {
    cable = await portalApi.cables.getById(id);
  } catch {
    notFound();
  }

  // Fetch taxonomy tree (public endpoint, no auth needed)
  let taxonomy: TaxonomyIndustry[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/taxonomy`, { cache: 'no-store' });
    if (res.ok) taxonomy = await res.json();
  } catch {
    // taxonomy fetch failure is non-fatal — form will show empty dropdowns
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{cable.model || cable.slug || 'Cable'}</h1>
      <CableEditForm cable={cable} taxonomy={taxonomy} />
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/app/portal/cables/[id]/page.tsx
git commit -m "feat(portal): fetch taxonomy on cable detail page and pass to edit form"
```

**Acceptance:** Cable detail page fetches taxonomy tree from public endpoint and passes it to `CableEditForm`. Form pre-selects existing taxonomy values from the cable record.

---

### Task 7.4: Verify cable edit form PUT submission includes all fields

**Files:** none (verification only)

**Depends on:** Task 7.2

- [ ] **Step 1: Review the PUT submission**

The `handleSave` function in Task 7.2 calls `portalApiClient.cables.update(cable.id, form)` where `form` is the full `CableFormState`. The `PortalCableUpdate` type (widened in Task 4.1) accepts all these fields. The backend PUT route already accepts `CableUpdate` with all fields optional. The PUT handler in `portal_cables.py` uses `body.model_dump(exclude_unset=True, exclude={"common_specs", "variants"})` so only modified fields are applied.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** PUT submission includes model, slug, size_system, base_description, meta_title, meta_description, image_url, industry_id, category_id, product_type_id.

---

### Task 7.5: Verify inline validation for cable edit form

**Files:** none (verification only)

**Depends on:** Task 7.2

- [ ] **Step 1: Review the `validate` function**

The `validate` function in Task 7.2 checks: model, slug, size_system, industry_id, category_id, product_type_id (all required). Empty values show inline errors below each field via `CableFormFields` error display.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** All required fields have inline validation. Form does not submit if validation fails.

---

## Section 8: Equipment Edit Form Expansion

### Task 8.1: Create shared `EquipmentFormFields` component

**Files:**
- Create: `frontend/components/portal/form/EquipmentFormFields.tsx`

**Depends on:** Task 4.2 (for `PortalEquipment`, `EquipmentCategoryTree` types)

**Produces:** `EquipmentFormFields` component reusable by both `EquipmentEditForm` and `EquipmentCreateForm`

- [ ] **Step 1: Create the shared component**

Create `frontend/components/portal/form/EquipmentFormFields.tsx`:

```tsx
'use client';

import type { EquipmentCategoryTree } from '@/lib/types/portal';

export interface EquipmentFormState {
  model: string;
  slug: string;
  description: string;
  image_url: string;
  external_url: string;
  sort_order: string; // string for input control; converted to number on submit
  category_id: string;
}

interface EquipmentFormFieldsProps {
  value: EquipmentFormState;
  onChange: (patch: Partial<EquipmentFormState>) => void;
  errors: Record<string, string>;
  categories: EquipmentCategoryTree[];
}

export function EquipmentFormFields({ value, onChange, errors, categories }: EquipmentFormFieldsProps) {
  // Flatten categories: include both top-level and children
  const flatCategories: { id: string; label: string }[] = [];
  for (const parent of categories) {
    flatCategories.push({ id: parent.id, label: parent.label });
    for (const child of parent.children ?? []) {
      flatCategories.push({ id: child.id, label: `${parent.label} — ${child.label}` });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Model</label>
        <input
          value={value.model}
          onChange={(e) => onChange({ model: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {errors.model && <p className="mt-1 text-sm text-red-600">{errors.model}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Slug</label>
        <input
          value={value.slug}
          onChange={(e) => onChange({ slug: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {errors.slug && <p className="mt-1 text-sm text-red-600">{errors.slug}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
        <select
          value={value.category_id}
          onChange={(e) => onChange({ category_id: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select category…</option>
          {flatCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </select>
        {errors.category_id && <p className="mt-1 text-sm text-red-600">{errors.category_id}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={4}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Image URL</label>
        <input
          value={value.image_url}
          onChange={(e) => onChange({ image_url: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="https://…"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">External URL</label>
        <input
          value={value.external_url}
          onChange={(e) => onChange({ external_url: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="https://…"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Sort Order</label>
        <input
          type="number"
          value={value.sort_order}
          onChange={(e) => onChange({ sort_order: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {errors.sort_order && <p className="mt-1 text-sm text-red-600">{errors.sort_order}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/components/portal/form/EquipmentFormFields.tsx
git commit -m "feat(portal): add shared EquipmentFormFields component"
```

**Acceptance:** `EquipmentFormFields` renders all equipment fields including category dropdown (flattened tree), sort_order (numeric input).

---

### Task 8.2: Expand `EquipmentEditForm` to use `EquipmentFormFields` with categories

**Files:**
- Modify: `frontend/components/portal/form/EquipmentEditForm.tsx`

**Depends on:** Task 8.1, Task 4.2, Task 6.3

**Consumes:** `EquipmentFormFields`, `EquipmentFormState` from `./EquipmentFormFields`; `EquipmentCategoryTree`, `PortalEquipment` from `@/lib/types/portal`; `portalApiClient.equipment.update`

- [ ] **Step 1: Rewrite `EquipmentEditForm` to wrap `EquipmentFormFields`**

Replace the entire content of `frontend/components/portal/form/EquipmentEditForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import type { PortalEquipment, EquipmentCategoryTree } from '@/lib/types/portal';
import { EquipmentFormFields, type EquipmentFormState } from './EquipmentFormFields';

interface EquipmentEditFormProps {
  equipment: PortalEquipment;
  categories: EquipmentCategoryTree[];
}

export function EquipmentEditForm({ equipment, categories }: EquipmentEditFormProps) {
  const [form, setForm] = useState<EquipmentFormState>({
    model: equipment.model ?? '',
    slug: equipment.slug ?? '',
    description: equipment.description ?? '',
    image_url: equipment.image_url ?? '',
    external_url: equipment.external_url ?? '',
    sort_order: String(equipment.sort_order ?? 0),
    category_id: equipment.category_id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleChange(patch: Partial<EquipmentFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.model.trim()) e.model = 'Model is required';
    if (!form.slug.trim()) e.slug = 'Slug is required';
    if (!form.category_id) e.category_id = 'Category is required';
    if (form.sort_order && isNaN(Number(form.sort_order))) e.sort_order = 'Sort order must be numeric';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      await portalApiClient.equipment.update(equipment.id, {
        model: form.model,
        slug: form.slug,
        description: form.description,
        image_url: form.image_url,
        external_url: form.external_url,
        sort_order: Number(form.sort_order),
        category_id: form.category_id,
      });
      setMessage('Saved');
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else if (err instanceof PortalApiError) setMessage(err.message);
      else setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4 rounded-lg bg-white p-6 shadow-sm">
      <EquipmentFormFields value={form} onChange={handleChange} errors={errors} categories={categories} />
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/components/portal/form/EquipmentEditForm.tsx
git commit -m "feat(portal): expand EquipmentEditForm with all editable fields and category"
```

**Acceptance:** `EquipmentEditForm` accepts `categories` prop, pre-fills all fields from `equipment`, submits all fields via PUT, shows inline validation errors. `sort_order` is converted from string to number on submit.

---

### Task 8.3: Update equipment detail page to fetch categories and pass to form

**Files:**
- Modify: `frontend/app/portal/equipment/[id]/page.tsx`

**Depends on:** Task 8.2

**Consumes:** `portalApi.equipment.getById` (existing), `GET /api/equipment-categories` (public endpoint)

- [ ] **Step 1: Update the detail page to fetch equipment categories**

Replace `frontend/app/portal/equipment/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { EquipmentEditForm } from '@/components/portal/form/EquipmentEditForm';
import type { EquipmentCategoryTree } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function PortalEquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let equipment: any;
  try {
    equipment = await portalApi.equipment.getById(id);
  } catch {
    notFound();
  }

  // Fetch equipment categories (public endpoint, no auth needed)
  let categories: EquipmentCategoryTree[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/equipment-categories`, { cache: 'no-store' });
    if (res.ok) categories = await res.json();
  } catch {
    // categories fetch failure is non-fatal
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{equipment.model || 'Equipment'}</h1>
      <EquipmentEditForm equipment={equipment} categories={categories} />
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/app/portal/equipment/[id]/page.tsx
git commit -m "feat(portal): fetch equipment categories on detail page and pass to edit form"
```

**Acceptance:** Equipment detail page fetches categories from public endpoint and passes to `EquipmentEditForm`. Form pre-selects existing category from the equipment record.

---

### Task 8.4: Verify equipment edit form PUT submission includes all fields

**Files:** none (verification only)

**Depends on:** Task 8.2

- [ ] **Step 1: Review the PUT submission**

The `handleSave` function in Task 8.2 calls `portalApiClient.equipment.update(equipment.id, {...})` with model, slug, description, image_url, external_url, sort_order (converted to Number), category_id. The backend PUT route accepts `RecommendedEquipmentUpdate` with all these fields optional.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** PUT submission includes all editable fields. `sort_order` is converted from string to number.

---

### Task 8.5: Verify inline validation for equipment edit form

**Files:** none (verification only)

**Depends on:** Task 8.2

- [ ] **Step 1: Review the `validate` function**

The `validate` function in Task 8.2 checks: model (required), slug (required), category_id (required), sort_order (numeric if provided).

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** All required fields have inline validation. `sort_order` validates numeric input.

---

## Section 9: Cable List Page Expansion

### Task 9.1: Add Category, Product Type, Size System columns to cable list

**Files:**
- Modify: `frontend/app/portal/cables/page.tsx`

**Depends on:** Task 4.1 (for `TaxonomyIndustry` type)

**Consumes:** `portalApi.cables.all()` (existing), `GET /api/taxonomy` (public)

- [ ] **Step 1: Update the cable list page**

Replace `frontend/app/portal/cables/page.tsx`:

```tsx
import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';
import type { PortalCable, TaxonomyIndustry } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function PortalCablesPage() {
  let cables: PortalCable[] = [];
  try {
    cables = await portalApi.cables.all();
  } catch {
    // empty state
  }

  // Fetch taxonomy to resolve category/product type labels
  let taxonomy: TaxonomyIndustry[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/taxonomy`, { cache: 'no-store' });
    if (res.ok) taxonomy = await res.json();
  } catch {
    // non-fatal
  }

  // Build lookup maps for category and product type labels
  const categoryMap = new Map<string, string>();
  const productTypeMap = new Map<string, string>();
  for (const ind of taxonomy) {
    for (const cat of ind.categories ?? []) {
      categoryMap.set(cat.id, cat.label);
      for (const pt of cat.product_types ?? []) {
        productTypeMap.set(pt.id, pt.label);
      }
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Cables</h1>
        <Link
          href="/portal/cables/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Cable
        </Link>
      </div>
      {cables.length === 0 ? (
        <p className="empty-state text-sm text-gray-500">No cables in your scope yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Manufacturer</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Product Type</th>
                <th className="px-4 py-3">Size System</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cables.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/portal/cables/${c.id}`} className="text-blue-600 hover:underline">
                      {c.model || c.slug || c.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.manufacturer?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{categoryMap.get(c.category_id) ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{productTypeMap.get(c.product_type_id) ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.size_system ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/app/portal/cables/page.tsx
git commit -m "feat(portal): expand cable list with Category, Product Type, Size System columns + New Cable button"
```

**Acceptance:** Cable list shows 6 columns: Name, Manufacturer, Category, Product Type, Size System, Created. "New Cable" button links to `/portal/cables/new`. Category and Product Type show human-readable labels resolved from taxonomy.

---

### Task 9.2: Verify readable taxonomy labels on cable list

**Files:** none (verification only)

**Depends on:** Task 9.1

- [ ] **Step 1: Review the label resolution logic**

The cable list page in Task 9.1 builds `categoryMap` and `productTypeMap` from the taxonomy tree, then resolves IDs to labels via `categoryMap.get(c.category_id)` and `productTypeMap.get(c.product_type_id)`. Falls back to `'—'` if not found.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** Category and Product Type columns show human-readable labels, not raw IDs.

---

### Task 9.3: Verify New Cable button

**Files:** none (verification only)

**Depends on:** Task 9.1

- [ ] **Step 1: Review the button**

The "New Cable" button is a `<Link href="/portal/cables/new">` in the page header, styled as a blue button.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** "New Cable" button is displayed and links to `/portal/cables/new`.

---

## Section 10: Equipment List Page Expansion

### Task 10.1: Add Category column to equipment list

**Files:**
- Modify: `frontend/app/portal/equipment/page.tsx`

**Depends on:** Task 4.2 (for `PortalEquipment` type)

- [ ] **Step 1: Update the equipment list page**

Replace `frontend/app/portal/equipment/page.tsx`:

```tsx
import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';
import type { PortalEquipment } from '@/lib/types/portal';

export default async function PortalEquipmentPage() {
  let equipment: PortalEquipment[] = [];
  try {
    equipment = await portalApi.equipment.all();
  } catch {
    // empty state
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Equipment</h1>
        <Link
          href="/portal/equipment/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Equipment
        </Link>
      </div>
      {equipment.length === 0 ? (
        <p className="empty-state text-sm text-gray-500">No equipment in your scope yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {equipment.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/portal/equipment/${e.id}`} className="text-blue-600 hover:underline">
                      {e.model || e.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.category?.label ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {e.created_at ? new Date(e.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/app/portal/equipment/page.tsx
git commit -m "feat(portal): expand equipment list with Category column + New Equipment button"
```

**Acceptance:** Equipment list shows 3 columns: Name, Category, Created. "New Equipment" button links to `/portal/equipment/new`.

---

### Task 10.2: Verify category label display on equipment list

**Files:** none (verification only)

**Depends on:** Task 10.1

- [ ] **Step 1: Review the category label source**

The equipment list uses `e.category?.label` directly from the `PortalEquipment.category` relation, which is populated by the backend list endpoint (`crud_equipment.list_by_manufacturer`). Falls back to `'—'` if null.

**Note:** The existing `crud_equipment.list_by_manufacturer` does NOT use `selectinload` for the `category` relation (it uses `lazy="select"` default). This may cause a `MissingGreenlet` error in async context. If the list endpoint returns equipment without the `category` relation loaded, the `category` field will be `null` in the JSON response (Pydantic serializes inaccessible lazy relations as `None` or raises an error).

**If this issue occurs during smoke testing**, fix `crud_equipment.list_by_manufacturer` in `backend/app/crud/equipment.py` to add `.options(selectinload(RecommendedEquipment.category), selectinload(RecommendedEquipment.manufacturer))` to the select statement. This is a minimal backend fix, not a schema change.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** Category column shows the category label from the equipment's `category` relation. If the relation is not loaded by the backend, the fix is to add `selectinload` to `list_by_manufacturer`.

---

### Task 10.3: Verify New Equipment button

**Files:** none (verification only)

**Depends on:** Task 10.1

- [ ] **Step 1: Review the button**

The "New Equipment" button is a `<Link href="/portal/equipment/new">` in the page header.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** "New Equipment" button is displayed and links to `/portal/equipment/new`.

---

## Section 11: Cable Create Page & Form

### Task 11.1: Create cable create page (server component)

**Files:**
- Create: `frontend/app/portal/cables/new/page.tsx`

**Depends on:** Task 11.2 (form component must exist for import — implement in parallel or before)

**Consumes:** `GET /api/taxonomy` (public endpoint), `CableCreateForm` component

- [ ] **Step 1: Create the page**

Create `frontend/app/portal/cables/new/page.tsx`:

```tsx
import Link from 'next/link';
import { CableCreateForm } from '@/components/portal/form/CableCreateForm';
import type { TaxonomyIndustry } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function NewCablePage() {
  let taxonomy: TaxonomyIndustry[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/taxonomy`, { cache: 'no-store' });
    if (res.ok) taxonomy = await res.json();
  } catch {
    // taxonomy fetch failure is non-fatal — form will show empty dropdowns
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">New Cable</h1>
        <Link href="/portal/cables" className="text-sm text-blue-600 hover:underline">
          ← Back to cables
        </Link>
      </div>
      <CableCreateForm taxonomy={taxonomy} />
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile** (requires Task 11.2 to be complete)

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit** (commit together with Task 11.2)

```bash
git add frontend/app/portal/cables/new/page.tsx
git commit -m "feat(portal): add cable create page"
```

**Acceptance:** Page fetches taxonomy tree from public endpoint and renders `CableCreateForm`.

---

### Task 11.2: Create `CableCreateForm` component

**Files:**
- Create: `frontend/components/portal/form/CableCreateForm.tsx`

**Depends on:** Task 7.1 (for `CableFormFields`), Task 6.1 (for `portalApiClient.cables.create`), Task 4.1

**Consumes:** `CableFormFields`, `CableFormState` from `./CableFormFields`; `TaxonomyIndustry`, `PortalCableCreate` from `@/lib/types/portal`; `portalApiClient.cables.create`

**Produces:** `CableCreateForm` component with auto-slug derivation, inline validation, server error handling

- [ ] **Step 1: Create the component**

Create `frontend/components/portal/form/CableCreateForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import type { TaxonomyIndustry } from '@/lib/types/portal';
import { CableFormFields, type CableFormState } from './CableFormFields';

function deriveSlug(model: string): string {
  return model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function CableCreateForm({ taxonomy }: { taxonomy: TaxonomyIndustry[] }) {
  const router = useRouter();
  const [form, setForm] = useState<CableFormState>({
    model: '',
    slug: '',
    size_system: 'awg',
    base_description: '',
    meta_title: '',
    meta_description: '',
    image_url: '',
    industry_id: '',
    category_id: '',
    product_type_id: '',
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleChange(patch: Partial<CableFormState>) {
    if (patch.model !== undefined && !slugTouched) {
      patch.slug = deriveSlug(patch.model);
    }
    if (patch.slug !== undefined) {
      setSlugTouched(true);
    }
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.model.trim()) e.model = 'Model is required';
    if (!form.slug.trim()) e.slug = 'Slug is required';
    if (!form.size_system) e.size_system = 'Size system is required';
    if (!form.industry_id) e.industry_id = 'Industry is required';
    if (!form.category_id) e.category_id = 'Category is required';
    if (!form.product_type_id) e.product_type_id = 'Product type is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleCreate() {
    if (!validate()) return;
    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      const cable = await portalApiClient.cables.create({
        model: form.model,
        slug: form.slug,
        size_system: form.size_system,
        industry_id: form.industry_id,
        category_id: form.category_id,
        product_type_id: form.product_type_id,
        base_description: form.base_description || undefined,
        meta_title: form.meta_title || undefined,
        meta_description: form.meta_description || undefined,
        image_url: form.image_url || undefined,
      });
      router.push(`/portal/cables/${cable.id}`);
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else if (err instanceof PortalApiError) setMessage(err.message);
      else setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4 rounded-lg bg-white p-6 shadow-sm">
      <CableFormFields value={form} onChange={handleChange} errors={errors} taxonomy={taxonomy} />
      <button
        onClick={handleCreate}
        disabled={saving}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Creating…' : 'Create Cable'}
      </button>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/components/portal/form/CableCreateForm.tsx
git commit -m "feat(portal): add CableCreateForm with auto-slug derivation and validation"
```

**Acceptance:** `CableCreateForm` auto-derives slug from model until user edits slug. Validates all required fields. On submit, calls `portalApiClient.cables.create()` and redirects to the new cable's detail page. Server errors (409, 422) are displayed without losing form values.

---

### Task 11.3: Verify cable create form inline validation

**Files:** none (verification only)

**Depends on:** Task 11.2

- [ ] **Step 1: Review the `validate` function**

The `validate` function in Task 11.2 checks: model, slug, size_system, industry_id, category_id, product_type_id (all required). Empty values show inline errors via `CableFormFields`.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** All required fields have inline validation. Form does not submit if validation fails.

---

### Task 11.4: Verify cable create form submit + redirect

**Files:** none (verification only)

**Depends on:** Task 11.2

- [ ] **Step 1: Review the submit flow**

`handleCreate` in Task 11.2: validates → calls `portalApiClient.cables.create(data)` → on success, `router.push('/portal/cables/${cable.id}')`. The `cable.id` comes from the backend's 201 response (auto-generated).

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** On successful create, user is redirected to the new cable's detail page.

---

### Task 11.5: Verify cable create form server error handling

**Files:** none (verification only)

**Depends on:** Task 11.2

- [ ] **Step 1: Review error handling**

`handleCreate` in Task 11.2 catches `PortalApiError`:
- If `err.fieldErrors` exists (422 validation): sets field-level errors via `setErrors`
- Otherwise (409 slug collision, 403 scope): sets `message` via `setMessage`
- Network errors: sets "Network error" message

Form values are preserved because `form` state is not cleared on error.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** Server errors are displayed without losing entered form values. 409 slug collision shows error message. 422 validation shows field-level errors.

---

## Section 12: Equipment Create Page & Form

### Task 12.1: Create equipment create page (server component)

**Files:**
- Create: `frontend/app/portal/equipment/new/page.tsx`

**Depends on:** Task 12.2 (form component must exist for import)

**Consumes:** `GET /api/equipment-categories` (public endpoint), `EquipmentCreateForm` component

- [ ] **Step 1: Create the page**

Create `frontend/app/portal/equipment/new/page.tsx`:

```tsx
import Link from 'next/link';
import { EquipmentCreateForm } from '@/components/portal/form/EquipmentCreateForm';
import type { EquipmentCategoryTree } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function NewEquipmentPage() {
  let categories: EquipmentCategoryTree[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/equipment-categories`, { cache: 'no-store' });
    if (res.ok) categories = await res.json();
  } catch {
    // non-fatal
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">New Equipment</h1>
        <Link href="/portal/equipment" className="text-sm text-blue-600 hover:underline">
          ← Back to equipment
        </Link>
      </div>
      <EquipmentCreateForm categories={categories} />
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile** (requires Task 12.2)

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit** (together with Task 12.2)

```bash
git add frontend/app/portal/equipment/new/page.tsx
git commit -m "feat(portal): add equipment create page"
```

**Acceptance:** Page fetches equipment categories from public endpoint and renders `EquipmentCreateForm`.

---

### Task 12.2: Create `EquipmentCreateForm` component

**Files:**
- Create: `frontend/components/portal/form/EquipmentCreateForm.tsx`

**Depends on:** Task 8.1 (for `EquipmentFormFields`), Task 6.3 (for `portalApiClient.equipment.create`), Task 4.2

**Consumes:** `EquipmentFormFields`, `EquipmentFormState` from `./EquipmentFormFields`; `EquipmentCategoryTree`, `PortalEquipmentCreate` from `@/lib/types/portal`; `portalApiClient.equipment.create`

- [ ] **Step 1: Create the component**

Create `frontend/components/portal/form/EquipmentCreateForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import type { EquipmentCategoryTree } from '@/lib/types/portal';
import { EquipmentFormFields, type EquipmentFormState } from './EquipmentFormFields';

function deriveSlug(model: string): string {
  return model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function EquipmentCreateForm({ categories }: { categories: EquipmentCategoryTree[] }) {
  const router = useRouter();
  const [form, setForm] = useState<EquipmentFormState>({
    model: '',
    slug: '',
    description: '',
    image_url: '',
    external_url: '',
    sort_order: '0',
    category_id: '',
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleChange(patch: Partial<EquipmentFormState>) {
    if (patch.model !== undefined && !slugTouched) {
      patch.slug = deriveSlug(patch.model);
    }
    if (patch.slug !== undefined) {
      setSlugTouched(true);
    }
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.model.trim()) e.model = 'Model is required';
    if (!form.slug.trim()) e.slug = 'Slug is required';
    if (!form.category_id) e.category_id = 'Category is required';
    if (form.sort_order && isNaN(Number(form.sort_order))) e.sort_order = 'Sort order must be numeric';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleCreate() {
    if (!validate()) return;
    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      const equipment = await portalApiClient.equipment.create({
        model: form.model,
        slug: form.slug,
        category_id: form.category_id,
        description: form.description || undefined,
        image_url: form.image_url || undefined,
        external_url: form.external_url || undefined,
        sort_order: form.sort_order ? Number(form.sort_order) : undefined,
      });
      router.push(`/portal/equipment/${equipment.id}`);
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else if (err instanceof PortalApiError) setMessage(err.message);
      else setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4 rounded-lg bg-white p-6 shadow-sm">
      <EquipmentFormFields value={form} onChange={handleChange} errors={errors} categories={categories} />
      <button
        onClick={handleCreate}
        disabled={saving}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Creating…' : 'Create Equipment'}
      </button>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/components/portal/form/EquipmentCreateForm.tsx
git commit -m "feat(portal): add EquipmentCreateForm with auto-slug derivation and validation"
```

**Acceptance:** `EquipmentCreateForm` auto-derives slug from model. Validates required fields. On submit, calls `portalApiClient.equipment.create()` and redirects to the new equipment's detail page. Server errors are displayed without losing form values.

---

### Task 12.3: Verify equipment create form inline validation

**Files:** none (verification only)

**Depends on:** Task 12.2

- [ ] **Step 1: Review the `validate` function**

Checks: model (required), slug (required), category_id (required), sort_order (numeric if provided).

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** All required fields have inline validation.

---

### Task 12.4: Verify equipment create form submit + redirect

**Files:** none (verification only)

**Depends on:** Task 12.2

- [ ] **Step 1: Review the submit flow**

`handleCreate`: validates → calls `portalApiClient.equipment.create(data)` → on success, `router.push('/portal/equipment/${equipment.id}')`.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** On successful create, user is redirected to the new equipment's detail page.

---

### Task 12.5: Verify equipment create form server error handling

**Files:** none (verification only)

**Depends on:** Task 12.2

- [ ] **Step 1: Review error handling**

Same pattern as cable create form (Task 11.5): `PortalApiError.fieldErrors` for 422, `message` for 409/403, "Network error" for network failures. Form values preserved.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** Server errors are displayed without losing entered form values.

---

## Section 13: Delete Confirmation Dialog & Delete Buttons

### Task 13.1: Create `DeleteConfirmDialog` shared component

**Files:**
- Create: `frontend/components/portal/form/DeleteConfirmDialog.tsx`

**Depends on:** none

**Produces:** `DeleteConfirmDialog` reusable modal component

- [ ] **Step 1: Create the component**

Create `frontend/components/portal/form/DeleteConfirmDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';

interface DeleteConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteConfirmDialog({ open, title, message, onCancel, onConfirm }: DeleteConfirmDialogProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function handleConfirm() {
    setConfirming(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mb-4 text-sm text-gray-600">{message}</p>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={confirming}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {confirming ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/components/portal/form/DeleteConfirmDialog.tsx
git commit -m "feat(portal): add shared DeleteConfirmDialog component"
```

**Acceptance:** `DeleteConfirmDialog` renders a modal overlay with title, message, Cancel and Delete buttons. Delete button shows loading state during async `onConfirm`. Errors are displayed inline.

---

### Task 13.2: Create `CableDeleteButton` and add to cable detail page

**Files:**
- Create: `frontend/components/portal/form/CableDeleteButton.tsx`
- Modify: `frontend/app/portal/cables/[id]/page.tsx`

**Depends on:** Task 13.1, Task 6.2

**Consumes:** `DeleteConfirmDialog` from `./DeleteConfirmDialog`; `portalApiClient.cables.remove`

- [ ] **Step 1: Create `CableDeleteButton`**

Create `frontend/components/portal/form/CableDeleteButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalApiClient } from '@/lib/portalApiClient';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface CableDeleteButtonProps {
  cableId: string;
  cableName: string;
}

export function CableDeleteButton({ cableId, cableName }: CableDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleConfirm() {
    await portalApiClient.cables.remove(cableId);
    router.push('/portal/cables');
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-red-600 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
      <DeleteConfirmDialog
        open={open}
        title="Delete Cable"
        message={`Are you sure you want to delete "${cableName}"? This action cannot be undone.`}
        onCancel={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
```

- [ ] **Step 2: Add `CableDeleteButton` to the cable detail page**

Update `frontend/app/portal/cables/[id]/page.tsx` — add the import and render the button below the form. The page should now look like:

```tsx
import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { CableEditForm } from '@/components/portal/form/CableEditForm';
import { CableDeleteButton } from '@/components/portal/form/CableDeleteButton';
import type { TaxonomyIndustry } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function PortalCableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let cable: any;
  try {
    cable = await portalApi.cables.getById(id);
  } catch {
    notFound();
  }

  let taxonomy: TaxonomyIndustry[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/taxonomy`, { cache: 'no-store' });
    if (res.ok) taxonomy = await res.json();
  } catch {
    // non-fatal
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{cable.model || cable.slug || 'Cable'}</h1>
      <CableEditForm cable={cable} taxonomy={taxonomy} />
      <div className="mt-6 max-w-xl border-t pt-4">
        <CableDeleteButton cableId={cable.id} cableName={cable.model || cable.slug || cable.id} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/components/portal/form/CableDeleteButton.tsx frontend/app/portal/cables/[id]/page.tsx
git commit -m "feat(portal): add cable delete button with confirmation dialog on detail page"
```

**Acceptance:** Cable detail page shows a "Delete" button below the edit form. Clicking it opens a confirmation dialog. Confirming calls `portalApiClient.cables.remove(id)` and redirects to `/portal/cables`. Canceling closes the dialog without action.

---

### Task 13.3: Create `EquipmentDeleteButton` and add to equipment detail page

**Files:**
- Create: `frontend/components/portal/form/EquipmentDeleteButton.tsx`
- Modify: `frontend/app/portal/equipment/[id]/page.tsx`

**Depends on:** Task 13.1, Task 6.4

**Consumes:** `DeleteConfirmDialog` from `./DeleteConfirmDialog`; `portalApiClient.equipment.remove`

- [ ] **Step 1: Create `EquipmentDeleteButton`**

Create `frontend/components/portal/form/EquipmentDeleteButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalApiClient } from '@/lib/portalApiClient';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface EquipmentDeleteButtonProps {
  equipmentId: string;
  equipmentName: string;
}

export function EquipmentDeleteButton({ equipmentId, equipmentName }: EquipmentDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleConfirm() {
    await portalApiClient.equipment.remove(equipmentId);
    router.push('/portal/equipment');
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-red-600 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
      <DeleteConfirmDialog
        open={open}
        title="Delete Equipment"
        message={`Are you sure you want to delete "${equipmentName}"? This action cannot be undone.`}
        onCancel={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
```

- [ ] **Step 2: Add `EquipmentDeleteButton` to the equipment detail page**

Update `frontend/app/portal/equipment/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { EquipmentEditForm } from '@/components/portal/form/EquipmentEditForm';
import { EquipmentDeleteButton } from '@/components/portal/form/EquipmentDeleteButton';
import type { EquipmentCategoryTree } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function PortalEquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let equipment: any;
  try {
    equipment = await portalApi.equipment.getById(id);
  } catch {
    notFound();
  }

  let categories: EquipmentCategoryTree[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/equipment-categories`, { cache: 'no-store' });
    if (res.ok) categories = await res.json();
  } catch {
    // non-fatal
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{equipment.model || 'Equipment'}</h1>
      <EquipmentEditForm equipment={equipment} categories={categories} />
      <div className="mt-6 max-w-xl border-t pt-4">
        <EquipmentDeleteButton equipmentId={equipment.id} equipmentName={equipment.model || equipment.id} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/components/portal/form/EquipmentDeleteButton.tsx frontend/app/portal/equipment/[id]/page.tsx
git commit -m "feat(portal): add equipment delete button with confirmation dialog on detail page"
```

**Acceptance:** Equipment detail page shows a "Delete" button below the edit form. Clicking it opens a confirmation dialog. Confirming calls `portalApiClient.equipment.remove(id)` and redirects to `/portal/equipment`.

---

### Task 13.4: Verify delete error handling

**Files:** none (verification only)

**Depends on:** Task 13.2, Task 13.3

- [ ] **Step 1: Review error handling in delete flow**

The `DeleteConfirmDialog` component (Task 13.1) catches errors from `onConfirm` and displays them inline in the dialog. If the delete API returns 404 (already deleted) or 403 (scope), `bffFetch` throws `PortalApiError` with the server message. The dialog displays this message without closing.

The `CableDeleteButton.handleConfirm` and `EquipmentDeleteButton.handleConfirm` do NOT catch errors — they let the `DeleteConfirmDialog` handle them. If the delete succeeds, `router.push` redirects to the list page.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** Delete API errors (404, 403) are displayed in the confirmation dialog without closing it. The user can cancel and remain on the detail page.

---

## Section 14: Verification

### Task 14.1: Run `tsc --noEmit` — 0 type errors

**Files:** none (verification only)

**Depends on:** All frontend tasks (Sections 4–13)

- [ ] **Step 1: Run TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors. If errors appear, fix them before proceeding.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** `tsc --noEmit` passes with 0 type errors.

---

### Task 14.2: Run backend tests — all pass

**Files:** none (verification only)

**Depends on:** All backend tasks (Sections 1–3)

- [ ] **Step 1: Run portal cable tests**

Run: `cd backend && python -m pytest tests/api/test_portal_cables.py -v`
Expected: All tests PASS (10 tests: 5 existing + 5 new)

- [ ] **Step 2: Run portal equipment tests**

Run: `cd backend && python -m pytest tests/api/test_portal_equipment.py -v`
Expected: All tests PASS (9 tests: 4 existing + 5 new)

- [ ] **Step 3: Run full backend test suite (regression check)**

Run: `cd backend && python -m pytest tests/ -v --tb=short`
Expected: All tests PASS. No regressions in existing tests.

- [ ] **Step 4: No commit needed (verification only)**

**Acceptance:** All backend tests pass including new create/delete tests and existing list/detail/scope tests.

---

### Task 14.3: Run `next build` — succeeds

**Files:** none (verification only)

**Depends on:** All frontend tasks

- [ ] **Step 1: Run Next.js build**

Run: `cd frontend && npm run build`
Expected: Build succeeds. No type errors, no build errors.

- [ ] **Step 2: No commit needed (verification only)**

**Acceptance:** `next build` completes successfully.

---

### Task 14.4: Smoke test — cable manufacturer create/list/edit/delete

**Files:** none (manual testing only)

**Depends on:** Task 14.1, Task 14.2, Task 14.3

- [ ] **Step 1: Start the dev environment**

Ensure backend and frontend are running.

- [ ] **Step 2: Log in as a cable manufacturer**

Navigate to `/portal` and log in as `cable_manager@test.com` / `test123456`.

- [ ] **Step 3: Create a cable**

Navigate to `/portal/cables`. Click "New Cable". Fill in:
- Model: "Smoke Test Cable"
- Slug: auto-derived (verify it fills in "smoke-test-cable")
- Size System: select "AWG"
- Industry: select any
- Category: select any (verify it filters by industry)
- Product Type: select any (verify it filters by category)
- Base Description: "Test description"
Click "Create Cable". Verify redirect to the new cable's detail page.

- [ ] **Step 4: Verify cable appears in list with expanded columns**

Navigate to `/portal/cables`. Verify the new cable appears in the table with:
- Name: "Smoke Test Cable"
- Manufacturer: shows manufacturer name
- Category: shows human-readable category label
- Product Type: shows human-readable product type label
- Size System: "awg"
- Created: shows date

- [ ] **Step 5: Edit the cable's new fields**

On the cable detail page, modify:
- Meta Title: "Smoke Test Meta Title"
- Meta Description: "Smoke test meta description"
- Image URL: "https://example.com/image.png"
Click "Save". Verify "Saved" message appears.

- [ ] **Step 6: Delete the cable with confirmation**

Click "Delete". Verify confirmation dialog appears with message "Are you sure you want to delete 'Smoke Test Cable'? This action cannot be undone." Click "Delete" in the dialog. Verify redirect to `/portal/cables`. Verify the cable no longer appears in the list.

- [ ] **Step 7: No commit needed (verification only)**

**Acceptance:** Full cable CRUD flow works: create → list with expanded columns → edit new fields → delete with confirmation → verify gone.

---

### Task 14.5: Smoke test — equipment manufacturer create/list/edit/delete

**Files:** none (manual testing only)

**Depends on:** Task 14.1, Task 14.2, Task 14.3

- [ ] **Step 1: Log in as an equipment manufacturer**

Navigate to `/portal` and log in as `equip_manager@test.com` / `test123456`.

- [ ] **Step 2: Create equipment**

Navigate to `/portal/equipment`. Click "New Equipment". Fill in:
- Model: "Smoke Test Equipment"
- Slug: auto-derived
- Category: select any
- Description: "Test description"
- Sort Order: 5
Click "Create Equipment". Verify redirect to the new equipment's detail page.

- [ ] **Step 3: Verify equipment appears in list with Category column**

Navigate to `/portal/equipment`. Verify the new equipment appears with:
- Name: "Smoke Test Equipment"
- Category: shows category label
- Created: shows date

- [ ] **Step 4: Edit the equipment's new fields**

On the detail page, modify:
- Image URL: "https://example.com/equip.png"
- External URL: "https://example.com"
- Sort Order: 10
Click "Save". Verify "Saved" message.

- [ ] **Step 5: Delete the equipment with confirmation**

Click "Delete". Verify confirmation dialog. Confirm. Verify redirect to `/portal/equipment`. Verify equipment gone from list.

- [ ] **Step 6: No commit needed (verification only)**

**Acceptance:** Full equipment CRUD flow works: create → list with category column → edit new fields → delete with confirmation → verify gone.

---

### Task 14.6: Smoke test — scope enforcement (DELETE out-of-scope returns 404)

**Files:** none (manual testing only)

**Depends on:** Task 14.2

- [ ] **Step 1: Attempt to DELETE a cable outside scope via direct API call**

Run (using curl or similar):
```bash
# Log in as cable_manager, then attempt to delete a non-existent or out-of-scope cable
curl -X DELETE http://localhost:8000/api/portal/cables/nonexistent-id \
  -H "Authorization: Bearer <cable_manager_token>"
```
Expected: 404 Not Found

- [ ] **Step 2: Attempt to DELETE equipment outside scope**

```bash
curl -X DELETE http://localhost:8000/api/portal/equipment/nonexistent-id \
  -H "Authorization: Bearer <equipment_manager_token>"
```
Expected: 404 Not Found

- [ ] **Step 3: No commit needed (verification only)**

**Acceptance:** DELETE out-of-scope returns 404 (no information leakage about record existence).

---

### Task 14.7: Smoke test — cross-module (POST equipment as cable manufacturer returns 403)

**Files:** none (manual testing only)

**Depends on:** Task 14.2

- [ ] **Step 1: Attempt to POST equipment as a cable manufacturer**

```bash
curl -X POST http://localhost:8000/api/portal/equipment \
  -H "Authorization: Bearer <cable_manager_token>" \
  -H "Content-Type: application/json" \
  -d '{"category_id":"cat-1","model":"X","slug":"x"}'
```
Expected: 403 Forbidden

- [ ] **Step 2: Attempt to POST cable as an equipment manufacturer**

```bash
curl -X POST http://localhost:8000/api/portal/cables \
  -H "Authorization: Bearer <equipment_manager_token>" \
  -H "Content-Type: application/json" \
  -d '{"product_type_id":"pt-1","industry_id":"ind-1","category_id":"cat-1","model":"X","slug":"x","size_system":"awg"}'
```
Expected: 403 Forbidden

- [ ] **Step 3: No commit needed (verification only)**

**Acceptance:** Cross-module POST returns 403 — `require_factory_module` enforces scope-type-based module access.

---

## Self-Review Checklist

### Spec Coverage (portal-cable-crud)

- [x] Portal create cable with required fields → Task 2.1
- [x] Create enforces scope-based manufacturer_id → Task 2.1 (server-forced)
- [x] Create requires all mandatory fields (422) → Task 2.1 (test `test_portal_create_cable_missing_fields_422`)
- [x] Non-manufacturer cannot create (403) → Task 2.1 (test `test_portal_create_cable_cross_scope_403`)
- [x] Portal delete own cable → Task 2.2
- [x] Delete out-of-scope returns 404 → Task 2.2 (test `test_portal_delete_cable_out_of_scope_404`)
- [x] Delete non-existent returns 404 → Task 2.2 (same test)
- [x] Delete requires confirmation dialog → Task 13.2
- [x] Confirm delete redirects to list → Task 13.2
- [x] Cancel delete does nothing → Task 13.1 (dialog closes)
- [x] Edit form exposes all editable fields → Task 7.2
- [x] Taxonomy dropdowns are cascading → Task 7.1
- [x] Edit form pre-fills existing taxonomy values → Task 7.2
- [x] List page shows expanded columns → Task 9.1
- [x] List page includes New Cable button → Task 9.1
- [x] List page shows readable taxonomy labels → Task 9.1
- [x] Create form submits required fields → Task 11.2
- [x] Create form validates required fields → Task 11.2
- [x] Create form handles server errors → Task 11.2
- [x] Create via portalApiClient → Task 6.1
- [x] Delete via portalApiClient → Task 6.2
- [x] BFF route forwards token for create → Task 5.1
- [x] BFF route forwards token for delete → Task 5.2

### Spec Coverage (portal-equipment-crud)

- [x] Portal create equipment with required fields → Task 3.1
- [x] Create enforces scope-based manufacturer_id → Task 3.1
- [x] Create requires all mandatory fields (422) → Task 3.1
- [x] Non-equipment-manufacturer cannot create (403) → Task 3.1
- [x] Portal delete own equipment → Task 3.2
- [x] Delete out-of-scope returns 404 → Task 3.2
- [x] Delete non-existent returns 404 → Task 3.2
- [x] Delete requires confirmation dialog → Task 13.3
- [x] Confirm delete redirects to list → Task 13.3
- [x] Cancel delete does nothing → Task 13.1
- [x] Edit form exposes all editable fields → Task 8.2
- [x] Edit form pre-fills existing category → Task 8.2
- [x] Sort order accepts numeric input → Task 8.1, Task 8.2
- [x] List page shows Category column → Task 10.1
- [x] List page includes New Equipment button → Task 10.1
- [x] List page shows readable category labels → Task 10.1
- [x] Create form submits required fields → Task 12.2
- [x] Create form validates required fields → Task 12.2
- [x] Create form handles server errors → Task 12.2
- [x] Create via portalApiClient → Task 6.3
- [x] Delete via portalApiClient → Task 6.4
- [x] BFF route forwards token for create → Task 5.3
- [x] BFF route forwards token for delete → Task 5.4

### Dependency Order Verification

1. Backend schemas (1.x) → Backend routes (2.x, 3.x) → Frontend types (4.x) → BFF routes (5.x) → portalApiClient (6.x) → Form components (7.x, 8.x) → List pages (9.x, 10.x) → Create pages (11.x, 12.x) → Delete components (13.x) → Verification (14.x) ✓
