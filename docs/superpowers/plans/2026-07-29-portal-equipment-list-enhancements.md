---
change: portal-equipment-list-enhancements
design-doc: docs/superpowers/specs/2026-07-29-portal-equipment-list-enhancements-design.md
base-ref: a5637ea53d3c8f401121ecf2890f34b2e235e2ba
---

# Portal & Admin Equipment List Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring portal and admin equipment list pages to feature parity with their cable counterparts — list UI polish, search/filter, pagination, and a 3-stage CSV/JSON batch import flow on both sides, backed by a shared equipment import service.

**Architecture:** Backend mirrors the proven cable import architecture: a shared `app.services.equipment_import` module (parse → validate → preview/commit) called by both portal routes (manufacturer-scope-forced) and admin routes (operator-guarded). Frontend mirrors cable list/import pages and BFF proxy routes, reusing the cable `ImportPreviewTable` component and `clientCableImport` types. No database schema changes.

**Tech Stack:** Python 3 / FastAPI / SQLAlchemy 2 (async) / Pydantic v2 (backend); Next.js App Router / React / TypeScript (frontend); pytest (backend tests); `npx tsc --noEmit` + manual browser verification (frontend).

## Global Constraints

- **No database schema changes** — all features use existing tables/columns (`recommended_equipments`, `equipment_manufacturers`, `equipment_categories`).
- **No new external API consumers** — the portal equipment list endpoint response shape changes from `list[X]` to `PaginatedResponse[X]` (breaking), but only the frontend consumes it, updated in the same change.
- **CSV/JSON only** — no Excel/XLSX support (matches cable import).
- **Import limits:** `MAX_IMPORT_SIZE = 5 * 1024 * 1024` (5 MB), `MAX_ROWS = 500`.
- **CSV required columns:** `id, model, slug, manufacturer_id, category_id`. Optional: `description, image_url, external_url, sort_order, applicable_specs` (JSON string in CSV).
- **Duplicate detection checks BOTH `id` and `slug`** — DB collision → `skipped`; intra-file collision → `error`.
- **Portal import security:** `_force_manufacturer_id` MUST run AFTER `parse_file` and BEFORE `validate_rows` (overwrites any client-supplied `manufacturer_id` with `user.scope_id`).
- **Portal equipment scope is `em-1`** (equipment_manufacturer), distinct from cable's `mfr-1`. Tests use the `equipment_manager_headers` fixture.
- **Admin import path:** `/api/admin/equipment/import` (NOT `/api/recommended-equipments/import`). Existing CRUD path `/api/recommended-equipments` stays unchanged.
- **Reuse, don't fork:** cable's `ImportPreviewTable` component and `clientCableImport` types are reused directly.
- **Conventional commit messages** — `feat:`, `test:`, `chore:` prefixes, lowercase, scoped to the change.

## Plan Decisions (deviations from / clarifications of the design doc)

- **P1 — Reuse `app.schemas.cable_import` schemas, do NOT create `schemas/equipment_import.py`.** The design doc §3.1 mentions a new `schemas/equipment_import.py`, but `tasks.md` 2.3 explicitly says `build_preview` returns `ImportPreview`, and the cable `ImportPreview` / `ImportPreviewRow` / `ImportResult` schemas are fully generic (fields: `row_number`, `status`, `id`, `model`, `errors`). Creating duplicate `EquipmentImport*` schemas would violate DRY. Both portal and admin equipment import routes import `from app.schemas.cable_import import ImportPreview, ImportResult` — exactly as `portal_cable_import.py` and `cable_import.py` do.
- **P2 — `list_by_manufacturer` return type changes from `list` to `tuple[list, int]`.** This is the backend half of the breaking change (D1). The portal route handler adapts to build `PaginatedResponse`.
- **P3 — Existing test `test_portal_equipment_list` (asserts `isinstance(res.json(), list)`) MUST be updated** to expect a `PaginatedResponse` dict. This is called out in Task 1 and executed in Task 5.

## File Structure

### Backend (create / modify)

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/crud/equipment.py` | MODIFY | `list_by_manufacturer` accepts `search`/`category_id`, returns `(items, total)`; `get_all_with_relations` accepts `q`. |
| `backend/app/services/equipment_import.py` | CREATE | Shared import pipeline: `parse_file`, `validate_rows`, `build_preview`, `commit_valid_rows`, `_load_fk_sets`, `_load_existing_equipment_ids`, `_load_existing_equipment_slugs`. |
| `backend/app/api/routes/portal_equipment.py` | MODIFY | GET list endpoint accepts `search`/`category_id`/`page`/`page_size`, returns `PaginatedResponse`. |
| `backend/app/api/routes/equipment.py` | MODIFY | GET list endpoint accepts `q`, forwards to `get_all_with_relations`. |
| `backend/app/api/routes/portal_equipment_import.py` | CREATE | Self-prefixed `/api/portal/equipment/import`: validate/commit (scope-forced) + csv-template/json-example. |
| `backend/app/api/routes/equipment_import.py` | CREATE | Admin validate/commit (operator-guarded), no scope forcing. |
| `backend/app/api/routes/equipment_import_templates.py` | CREATE | Admin csv-template/json-example. |
| `backend/app/main.py` | MODIFY | Register 3 new routers. |
| `backend/tests/api/test_portal_equipment.py` | MODIFY | Update existing list test for paginated shape. |
| `backend/tests/api/test_portal_equipment_list.py` | CREATE | 5 list-filtering tests. |
| `backend/tests/api/test_portal_equipment_import.py` | CREATE | 7 portal import tests. |
| `backend/tests/api/test_admin_equipment_import.py` | CREATE | 4 admin import tests (3 new + note on auth). |

### Frontend (create / modify)

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/app/portal/equipment/page.tsx` | MODIFY | searchParams, toolbar, pagination, plain-text Name, Actions column, Import button. |
| `frontend/components/portal/equipment/EquipmentListToolbar.tsx` | CREATE | Search input + single category dropdown. |
| `frontend/app/portal/equipment/import/page.tsx` | CREATE | 3-stage import flow. |
| `frontend/app/api/portal/equipment/import/validate/route.ts` | CREATE | BFF proxy (portal_token). |
| `frontend/app/api/portal/equipment/import/commit/route.ts` | CREATE | BFF proxy (portal_token). |
| `frontend/lib/portalApiClient.ts` | MODIFY | Add `equipment.import.*` methods. |
| `frontend/lib/portalApi.ts` | MODIFY | `equipment.all()` accepts search/category/page params, returns paginated. |
| `frontend/app/admin/(dashboard)/equipment/page.tsx` | MODIFY | Add `q` param, EquipmentSearchBox, Import button. |
| `frontend/components/admin/list/EquipmentSearchBox.tsx` | CREATE | q-param search box. |
| `frontend/app/admin/(dashboard)/equipment/import/page.tsx` | CREATE | 3-stage import flow. |
| `frontend/app/api/admin/equipment/import/validate/route.ts` | CREATE | BFF proxy (admin_token). |
| `frontend/app/api/admin/equipment/import/commit/route.ts` | CREATE | BFF proxy (admin_token). |
| `frontend/lib/clientEquipmentImport.ts` | CREATE | Admin BFF client library. |

---

## Task 1: Backend — Equipment List Filtering (Portal + Admin)

**Files:**
- Modify: `backend/app/crud/equipment.py` (`CRUDEquipment.list_by_manufacturer` ~lines 76-96; `CRUDEquipment.get_all_with_relations` ~lines 54-74)
- Modify: `backend/app/api/routes/portal_equipment.py` (`list_equipment` ~lines 38-44)
- Modify: `backend/app/api/routes/equipment.py` (`list_equipment` ~lines 18-37)

**Interfaces:**
- Consumes: `app.schemas.common.PaginatedResponse`, `app.models.equipment.RecommendedEquipment`.
- Produces: `list_by_manufacturer(db, *, scope_id, skip, limit, search=None, category_id=None) -> tuple[list[RecommendedEquipment], int]`; `get_all_with_relations(db, page, page_size, q=None, category_id=None, manufacturer_id=None) -> tuple[list, int]`; portal GET returns `PaginatedResponse[RecommendedEquipmentRead]`.

- [ ] **Step 1: Extend `list_by_manufacturer` in `crud/equipment.py`**

Add `search` and `category_id` params and return a `(items, total)` tuple. Replace the existing method body (lines 76-96) with:

```python
async def list_by_manufacturer(
    self,
    db: AsyncSession,
    *,
    scope_id: str,
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    category_id: str | None = None,
) -> tuple[list[RecommendedEquipment], int]:
    """List equipment where manufacturer_id == scope_id. For portal routes.

    Eager-loads `manufacturer` and `category` to avoid async lazy-load
    (MissingGreenlet) errors during response serialization.
    Returns (items, total) so the route can build a PaginatedResponse.
    """
    stmt = select(RecommendedEquipment).where(RecommendedEquipment.manufacturer_id == scope_id)
    if search:
        stmt = stmt.where(RecommendedEquipment.model.ilike(f"%{search}%"))
    if category_id:
        stmt = stmt.where(RecommendedEquipment.category_id == category_id)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        stmt.options(
            selectinload(RecommendedEquipment.manufacturer),
            selectinload(RecommendedEquipment.category),
        )
        .order_by(RecommendedEquipment.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all()), total
```

Reference: `backend/app/crud/cable.py:250-286` (cable `list_by_manufacturer` applies `ilike` + equality filters the same way).

- [ ] **Step 2: Extend `get_all_with_relations` in `crud/equipment.py`**

Add a `q` param (ilike on `model`) to the admin list query. Update the signature (lines 54-61) to add `q: str | None = None` and insert the filter before the count subquery:

```python
async def get_all_with_relations(
    self,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    category_id: str | None = None,
    manufacturer_id: str | None = None,
    q: str | None = None,
) -> tuple[list[RecommendedEquipment], int]:
    stmt = select(RecommendedEquipment)
    if q:
        stmt = stmt.where(RecommendedEquipment.model.ilike(f"%{q}%"))
    if category_id is not None:
        stmt = stmt.where(RecommendedEquipment.category_id == category_id)
    if manufacturer_id is not None:
        stmt = stmt.where(RecommendedEquipment.manufacturer_id == manufacturer_id)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.options(
        selectinload(RecommendedEquipment.manufacturer),
        selectinload(RecommendedEquipment.category),
    ).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    return list(result.scalars().all()), total
```

- [ ] **Step 3: Update portal list route in `portal_equipment.py`**

Change the GET handler to accept `search`/`category_id`/`page`/`page_size` and return `PaginatedResponse`. Add the `PaginatedResponse` import. Replace lines 38-44:

```python
from app.schemas.common import PaginatedResponse
from app.schemas.equipment import RecommendedEquipmentRead
# (add PaginatedResponse to existing imports)

@router.get("", response_model=PaginatedResponse[RecommendedEquipmentRead])
async def list_equipment(
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    category_id: str | None = None,
    user: User = Depends(require_factory_module("equipment")),
    db: AsyncSession = Depends(get_db),
):
    items, total = await crud_equipment.list_by_manufacturer(
        db,
        scope_id=user.scope_id,
        skip=(page - 1) * page_size,
        limit=page_size,
        search=search,
        category_id=category_id,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}
```

Note: `user.scope_id` for equipment is `em-1` (string). The existing `_check_equipment_ownership` and other routes are unchanged.

- [ ] **Step 4: Update admin list route in `equipment.py`**

Add `q` param and forward to `get_all_with_relations`. Modify the handler (lines 18-37) signature to add `q: str | None = None,` and pass `q=q` into the call:

```python
@router.get("", response_model=PaginatedResponse[RecommendedEquipmentRead])
async def list_equipment(
    page: int = 1,
    page_size: int = 20,
    cable_id: str | None = None,
    q: str | None = None,
    category_id: str | None = None,
    manufacturer_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if cable_id:
        items = await crud_equipment.get_matching_cable(db, cable_id)
        return {"items": items, "total": len(items), "page": 1, "page_size": len(items)}
    items, total = await crud_equipment.get_all_with_relations(
        db,
        page=page,
        page_size=page_size,
        q=q,
        category_id=category_id,
        manufacturer_id=manufacturer_id,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}
```

- [ ] **Step 5: Smoke-test the existing portal equipment test to confirm the known break**

Run: `pytest backend/tests/api/test_portal_equipment.py::test_portal_equipment_list -v`
Expected: FAIL — `test_portal_equipment_list` asserts `isinstance(res.json(), list)` (line 33), but the response is now a dict (`{"items": [...], "total": ..., ...}`). This break is expected and will be fixed in Task 5. All other tests in `test_portal_equipment.py` (detail, create, scope isolation) should still pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/crud/equipment.py backend/app/api/routes/portal_equipment.py backend/app/api/routes/equipment.py
git commit -m "feat(equipment): add search/filter/pagination to equipment list endpoints"
```

---

## Task 2: Backend — Equipment Import Service (Shared)

**Files:**
- Create: `backend/app/services/equipment_import.py`

**Interfaces:**
- Consumes: `app.models.equipment.{EquipmentCategory, EquipmentManufacturer, RecommendedEquipment}`, `app.schemas.equipment.RecommendedEquipmentCreate`, `app.schemas.cable_import.{ImportPreview, ImportPreviewRow, ImportResult}` (reused — see P1), `app.core.database.async_session`.
- Produces: `parse_file(content, format) -> list[ParsedRow]`, `validate_rows(db, parsed_rows) -> list[ValidatedRow]`, `build_preview(validated, file_format) -> ImportPreview`, `commit_valid_rows(db, validated_rows) -> int`, constants `MAX_IMPORT_SIZE`, `MAX_ROWS`, `REQUIRED_CSV_COLUMNS`, `ParsedRow`, `ValidatedRow`.

**Reference:** `backend/app/services/cable_import.py` — mirror its structure. Key equipment differences: no industry/product_type/size_system/variants/common_specs; flat FK set (category + manufacturer only); duplicate detection on BOTH `id` and `slug`; `applicable_specs` is a JSON string in CSV (parse with `json.loads`, failure → error) and a native list in JSON.

- [ ] **Step 1: Create the service module skeleton with constants and dataclasses**

Create `backend/app/services/equipment_import.py`:

```python
import csv
import io
import json
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.equipment import EquipmentCategory, EquipmentManufacturer, RecommendedEquipment
from app.schemas.cable_import import ImportPreview, ImportPreviewRow, ImportResult
from app.schemas.equipment import RecommendedEquipmentCreate

MAX_IMPORT_SIZE = 5 * 1024 * 1024  # 5MB
MAX_ROWS = 500

REQUIRED_CSV_COLUMNS = {"id", "model", "slug", "manufacturer_id", "category_id"}


class ParsedRow:
    """Intermediate representation of a parsed row, before validation."""
    def __init__(self, row_number: int, data: dict[str, Any], parse_errors: list[str] | None = None):
        self.row_number = row_number
        self.data = data
        self.parse_errors = parse_errors or []


class ValidatedRow:
    """Result of validating a parsed row."""
    def __init__(
        self,
        row_number: int,
        status: Literal["valid", "skipped", "error"],
        id: str | None,
        model: str | None,
        errors: list[str] | None = None,
        equipment_create: RecommendedEquipmentCreate | None = None,
    ):
        self.row_number = row_number
        self.status = status
        self.id = id
        self.model = model
        self.errors = errors or []
        self.equipment_create = equipment_create  # Only set for valid rows
```

- [ ] **Step 2: Implement `parse_file`**

Append to the module (CSV + JSON decoding, identical control flow to cable's `parse_file`):

```python
def parse_file(content: bytes, format: Literal["csv", "json"]) -> list[ParsedRow]:
    """Parse file content into a list of ParsedRow. Does not validate against DB."""
    if not content:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(content) > MAX_IMPORT_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 5MB)")

    rows: list[ParsedRow] = []

    if format == "csv":
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        if reader.fieldnames is None:
            raise HTTPException(status_code=400, detail="CSV file has no header row")
        missing = REQUIRED_CSV_COLUMNS - set(reader.fieldnames)
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required columns: {', '.join(sorted(missing))}",
            )
        for idx, raw in enumerate(reader, start=1):
            if not raw or all((v is None or v == "") for v in raw.values()):
                continue
            rows.append(ParsedRow(row_number=idx, data=dict(raw)))

    elif format == "json":
        try:
            parsed = json.loads(content.decode("utf-8-sig"))
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {e.msg}")
        if not isinstance(parsed, list):
            raise HTTPException(status_code=400, detail="JSON must be an array")
        for idx, item in enumerate(parsed, start=1):
            if not isinstance(item, dict):
                rows.append(ParsedRow(row_number=idx, data={}, parse_errors=[f"Row {idx}: expected object"]))
                continue
            rows.append(ParsedRow(row_number=idx, data=item))
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")

    if len(rows) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")
    return rows
```

- [ ] **Step 3: Implement field validation helper `_validate_equipment_fields`**

This is Layer 2. `applicable_specs` is a JSON string in CSV (parse with `json.loads`; empty string → `[]`; failure → error) and a native list in JSON. Append:

```python
def _validate_equipment_fields(data: dict[str, Any], row_number: int) -> tuple[RecommendedEquipmentCreate | None, list[str]]:
    """Layer 2: validate equipment fields via Pydantic schema. Parse applicable_specs JSON string for CSV."""
    errors: list[str] = []

    eq_id = data.get("id")
    model = data.get("model")
    slug = data.get("slug")
    manufacturer_id = data.get("manufacturer_id")
    category_id = data.get("category_id")

    if not eq_id:
        errors.append(f"Row {row_number}: missing required field 'id'")
    if not model:
        errors.append(f"Row {row_number}: missing required field 'model'")
    if not slug:
        errors.append(f"Row {row_number}: missing required field 'slug'")
    if not manufacturer_id:
        errors.append(f"Row {row_number}: missing required field 'manufacturer_id'")
    if not category_id:
        errors.append(f"Row {row_number}: missing required field 'category_id'")

    # applicable_specs: CSV -> JSON string (parse); JSON -> native list
    specs_raw = data.get("applicable_specs", [])
    if isinstance(specs_raw, str):
        if specs_raw == "":
            applicable_specs = []
        else:
            try:
                parsed_specs = json.loads(specs_raw)
                if not isinstance(parsed_specs, list):
                    errors.append(f"Row {row_number}: applicable_specs must be a JSON array string")
                    applicable_specs = []
                else:
                    applicable_specs = parsed_specs
            except json.JSONDecodeError:
                errors.append(f"Row {row_number}: applicable_specs is not valid JSON")
                applicable_specs = []
    elif isinstance(specs_raw, list):
        applicable_specs = specs_raw
    elif specs_raw is None:
        applicable_specs = []
    else:
        errors.append(f"Row {row_number}: applicable_specs must be a JSON array string or list")
        applicable_specs = []

    if errors:
        return None, errors

    try:
        equipment_create = RecommendedEquipmentCreate(
            id=eq_id,
            model=model,
            slug=slug,
            manufacturer_id=manufacturer_id,
            category_id=category_id,
            applicable_specs=applicable_specs,
            description=data.get("description"),
            image_url=data.get("image_url"),
            external_url=data.get("external_url"),
            sort_order=int(data.get("sort_order", 0) or 0),
        )
        return equipment_create, []
    except Exception as e:
        return None, [f"Row {row_number}: invalid equipment data: {e}"]
```

- [ ] **Step 4: Implement FK preload helpers (Layer 3) + duplicate-detection preload (Layer 4)**

Equipment has only 2 FKs (manufacturer, category). Duplicate detection needs existing `id` set AND existing `slug` set (slug is globally unique per the model's `UniqueConstraint`). Append:

```python
async def _load_fk_sets(db: AsyncSession, rows: list[ParsedRow]) -> dict[str, set[str]]:
    """Layer 3: batch-load all FK target ids to avoid N+1 queries."""
    manufacturer_ids = {r.data.get("manufacturer_id") for r in rows if r.data.get("manufacturer_id")}
    category_ids = {r.data.get("category_id") for r in rows if r.data.get("category_id")}

    fk_sets: dict[str, set[str]] = {"manufacturers": set(), "categories": set()}
    if manufacturer_ids:
        result = await db.execute(select(EquipmentManufacturer.id).where(EquipmentManufacturer.id.in_(manufacturer_ids)))
        fk_sets["manufacturers"] = set(result.scalars().all())
    if category_ids:
        result = await db.execute(select(EquipmentCategory.id).where(EquipmentCategory.id.in_(category_ids)))
        fk_sets["categories"] = set(result.scalars().all())
    return fk_sets


async def _load_existing_equipment_ids(db: AsyncSession, ids: set[str]) -> set[str]:
    """Layer 4 (id): batch-load existing RecommendedEquipment ids from DB."""
    if not ids:
        return set()
    result = await db.execute(select(RecommendedEquipment.id).where(RecommendedEquipment.id.in_(ids)))
    return set(result.scalars().all())


async def _load_existing_equipment_slugs(db: AsyncSession, slugs: set[str]) -> set[str]:
    """Layer 4 (slug): batch-load existing RecommendedEquipment slugs from DB.

    `slug` is globally unique (model UniqueConstraint), so we do not need to
    scope by manufacturer_id.
    """
    if not slugs:
        return set()
    result = await db.execute(select(RecommendedEquipment.slug).where(RecommendedEquipment.slug.in_(slugs)))
    return set(result.scalars().all())
```

- [ ] **Step 5: Implement `validate_rows` (4 layers, dual duplicate detection)**

Append. Tracks `seen_ids` AND `seen_slugs` (dicts mapping value → first row_number). DB collision on either → `skipped`; intra-file collision on either → `error`.

```python
async def validate_rows(db: AsyncSession, parsed_rows: list[ParsedRow]) -> list[ValidatedRow]:
    """Run all 4 validation layers and return validated rows."""
    fk_sets = await _load_fk_sets(db, parsed_rows)

    all_ids = {r.data.get("id") for r in parsed_rows if r.data.get("id")}
    all_slugs = {r.data.get("slug") for r in parsed_rows if r.data.get("slug")}
    existing_ids = await _load_existing_equipment_ids(db, all_ids)
    existing_slugs = await _load_existing_equipment_slugs(db, all_slugs)

    seen_ids: dict[str, int] = {}
    seen_slugs: dict[str, int] = {}

    validated: list[ValidatedRow] = []

    for parsed in parsed_rows:
        row_number = parsed.row_number
        data = parsed.data

        # Layer 1: parse errors
        if parsed.parse_errors:
            validated.append(ValidatedRow(
                row_number=row_number, status="error",
                id=data.get("id"), model=data.get("model"), errors=parsed.parse_errors,
            ))
            continue

        # Layer 2: field validation
        equipment_create, field_errors = _validate_equipment_fields(data, row_number)
        if equipment_create is None:
            validated.append(ValidatedRow(
                row_number=row_number, status="error",
                id=data.get("id"), model=data.get("model"), errors=field_errors,
            ))
            continue

        # Layer 3: FK existence
        fk_errors: list[str] = []
        if equipment_create.manufacturer_id not in fk_sets["manufacturers"]:
            fk_errors.append(f"Row {row_number}: manufacturer_id '{equipment_create.manufacturer_id}' does not exist")
        if equipment_create.category_id not in fk_sets["categories"]:
            fk_errors.append(f"Row {row_number}: category_id '{equipment_create.category_id}' does not exist")
        if fk_errors:
            validated.append(ValidatedRow(
                row_number=row_number, status="error",
                id=equipment_create.id, model=equipment_create.model, errors=fk_errors,
            ))
            continue

        # Layer 4: duplicate detection (id AND slug)
        eq_id = equipment_create.id
        eq_slug = equipment_create.slug

        # Intra-file duplicate -> error
        if eq_id in seen_ids:
            validated.append(ValidatedRow(
                row_number=row_number, status="error", id=eq_id, model=equipment_create.model,
                errors=[f"Row {row_number}: duplicate id '{eq_id}' (first seen at row {seen_ids[eq_id]})"],
            ))
            continue
        if eq_slug in seen_slugs:
            validated.append(ValidatedRow(
                row_number=row_number, status="error", id=eq_id, model=equipment_create.model,
                errors=[f"Row {row_number}: duplicate slug '{eq_slug}' (first seen at row {seen_slugs[eq_slug]})"],
            ))
            continue

        # DB duplicate -> skipped (id or slug)
        if eq_id in existing_ids or eq_slug in existing_slugs:
            seen_ids[eq_id] = row_number
            seen_slugs[eq_slug] = row_number
            validated.append(ValidatedRow(
                row_number=row_number, status="skipped", id=eq_id, model=equipment_create.model,
                errors=[], equipment_create=equipment_create,
            ))
            continue

        seen_ids[eq_id] = row_number
        seen_slugs[eq_slug] = row_number
        validated.append(ValidatedRow(
            row_number=row_number, status="valid", id=eq_id, model=equipment_create.model,
            errors=[], equipment_create=equipment_create,
        ))

    return validated
```

- [ ] **Step 6: Implement `build_preview` and `commit_valid_rows`**

Append. `commit_valid_rows` is all-or-nothing (single `db.commit()`, rollback on any exception):

```python
def build_preview(validated: list[ValidatedRow], file_format: Literal["csv", "json"]) -> ImportPreview:
    """Build ImportPreview response from validated rows."""
    rows = [
        ImportPreviewRow(
            row_number=v.row_number, status=v.status, id=v.id, model=v.model, errors=v.errors,
        )
        for v in validated
    ]
    return ImportPreview(
        total_rows=len(validated),
        valid_count=sum(1 for v in validated if v.status == "valid"),
        skipped_count=sum(1 for v in validated if v.status == "skipped"),
        error_count=sum(1 for v in validated if v.status == "error"),
        rows=rows,
        file_format=file_format,
    )


async def commit_valid_rows(db: AsyncSession, validated_rows: list[ValidatedRow]) -> int:
    """Commit all valid rows in a single transaction.
    Any exception -> transaction rolls back, exception propagates.
    Returns created_count.
    """
    from app.models.equipment import RecommendedEquipment as EquipmentModel

    valid_rows = [v for v in validated_rows if v.status == "valid" and v.equipment_create is not None]
    created_count = 0
    try:
        for row in valid_rows:
            equipment = EquipmentModel(**row.equipment_create.model_dump())
            db.add(equipment)
            await db.flush()
            created_count += 1
        await db.commit()
        return created_count
    except Exception:
        await db.rollback()
        raise
```

- [ ] **Step 7: Verify the module imports cleanly**

Run: `python -c "from app.services.equipment_import import parse_file, validate_rows, build_preview, commit_valid_rows, MAX_ROWS, MAX_IMPORT_SIZE; print('ok')"`
Expected: prints `ok` (run from `backend/` dir, with the project venv active). If import fails, fix the import path / missing symbol before proceeding.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/equipment_import.py
git commit -m "feat(equipment): add shared equipment import service (parse/validate/commit)"
```

---

## Task 3: Backend — Portal Equipment Import Routes

**Files:**
- Create: `backend/app/api/routes/portal_equipment_import.py`
- Modify: `backend/app/main.py` (router import block ~line 12; registration block ~line 117)

**Interfaces:**
- Consumes: `app.services.equipment_import.{parse_file, validate_rows, build_preview, commit_valid_rows, MAX_ROWS}`, `app.api.deps.require_factory_module`, `app.schemas.cable_import.{ImportPreview, ImportResult}`.
- Produces: self-prefixed router at `/api/portal/equipment/import` with `POST /validate`, `POST /commit`, `GET /csv-template`, `GET /json-example`. All guarded by `require_factory_module("equipment")`.

**Reference:** `backend/app/api/routes/portal_cable_import.py` (mirror exactly; swap `cables`→`equipment`, `cable_import`→`equipment_import`). Security-critical: `_force_manufacturer_id` runs AFTER `parse_file`, BEFORE `validate_rows`.

- [ ] **Step 1: Create the portal import router with `_force_manufacturer_id` and validate/commit**

Create `backend/app/api/routes/portal_equipment_import.py`:

```python
"""Portal equipment import routes. Scope-forced: manufacturer_id = user.scope_id."""
import csv
import json
from io import StringIO
from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.models.user import User
from app.schemas.cable_import import ImportPreview, ImportResult
from app.services.equipment_import import (
    MAX_ROWS,
    build_preview,
    commit_valid_rows,
    parse_file,
    validate_rows,
)

router = APIRouter(prefix="/api/portal/equipment/import", tags=["portal-equipment-import"])


def _force_manufacturer_id(parsed_rows, scope_id: str) -> None:
    """Override manufacturer_id on every parsed row with the user's scope_id.
    SECURITY: this runs AFTER parsing and BEFORE validation, so any
    client-supplied manufacturer_id in the file is overwritten.
    """
    for row in parsed_rows:
        row.data["manufacturer_id"] = scope_id


@router.post("/validate", response_model=ImportPreview)
async def portal_validate_import(
    file: UploadFile,
    format: Literal["csv", "json"] = Form(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("equipment")),
):
    content = await file.read()
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")

    scope_id = str(user.scope_id)
    _force_manufacturer_id(parsed, scope_id)

    validated = await validate_rows(db, parsed)
    return build_preview(validated, format)


@router.post("/commit", response_model=ImportResult)
async def portal_commit_import(
    file: UploadFile,
    format: Literal["csv", "json"] = Form(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("equipment")),
):
    content = await file.read()
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")

    scope_id = str(user.scope_id)
    _force_manufacturer_id(parsed, scope_id)

    validated = await validate_rows(db, parsed)

    valid_rows = [v for v in validated if v.status == "valid"]
    skipped_count = sum(1 for v in validated if v.status == "skipped")

    if not valid_rows:
        return ImportResult(
            created_count=0,
            skipped_count=skipped_count,
            errors=["No valid rows to import"],
        )

    try:
        created = await commit_valid_rows(db, validated)
        return ImportResult(created_count=created, skipped_count=skipped_count, errors=[])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transaction failed: {str(e)}")
```

- [ ] **Step 2: Add template endpoints (csv-template + json-example) to the portal router**

Append to the same file. Portal template endpoints are guarded by `require_factory_module("equipment")` and live on the same self-prefixed router:

```python
CSV_TEMPLATE_HEADERS = [
    "id", "model", "slug", "manufacturer_id", "category_id",
    "description", "image_url", "external_url", "sort_order", "applicable_specs",
]

CSV_TEMPLATE_EXAMPLE = {
    "id": "em-1-transformer-100",
    "model": "Transformer 100",
    "slug": "transformer-100",
    "manufacturer_id": "em-1",
    "category_id": "power/transformers",
    "description": "100kVA distribution transformer",
    "image_url": "",
    "external_url": "",
    "sort_order": "0",
    "applicable_specs": '[{"spec_key":"power","label":"Power","allowed_values":["100kVA"]}]',
}


@router.get("/csv-template")
async def portal_download_csv_template(user: User = Depends(require_factory_module("equipment"))):
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_TEMPLATE_HEADERS)
    writer.writeheader()
    writer.writerow(CSV_TEMPLATE_EXAMPLE)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=equipment-import-template.csv"},
    )


@router.get("/json-example")
async def portal_download_json_example(user: User = Depends(require_factory_module("equipment"))):
    example = [
        {
            "id": "em-1-transformer-100",
            "model": "Transformer 100",
            "slug": "transformer-100",
            "manufacturer_id": "em-1",
            "category_id": "power/transformers",
            "description": "100kVA distribution transformer",
            "image_url": None,
            "external_url": None,
            "sort_order": 0,
            "applicable_specs": [
                {"spec_key": "power", "label": "Power", "allowed_values": ["100kVA"]}
            ],
        }
    ]
    content = json.dumps(example, indent=2)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=equipment-import-example.json"},
    )
```

- [ ] **Step 3: Register the portal import router in `main.py`**

In `backend/app/main.py`, add `portal_equipment_import` to the import block (line 12). The import currently ends with `portal_messages` — insert `portal_equipment_import` after `portal_equipment`:

```python
from app.api.routes import auth, cable_import, cable_import_templates, cables, categories, equipment, equipment_categories, equipment_manufacturers, folders, health, industries, manufacturers, pages, product_types, taxonomy, uploads, site_menu, admin_menu, admin_roles, admin_users, member, admin_inquiries, admin_email, admin_members, admin_messages, portal_auth, page_views, portal_dashboard, portal_cables, portal_cable_import, portal_equipment, portal_equipment_import, portal_inquiries, portal_media, portal_messages
```

Then register it (self-prefixed, so no `prefix=` kwarg). Add after the `portal_equipment.router` line (~line 117):

```python
app.include_router(portal_equipment.router)
app.include_router(portal_equipment_import.router)
app.include_router(portal_inquiries.router)
```

- [ ] **Step 4: Verify the router loads**

Run: `python -c "from app.main import app; print([r.path for r in app.routes if '/equipment/import' in getattr(r,'path','')])"`
Expected: prints 4 portal paths (`/api/portal/equipment/import/validate`, `/commit`, `/csv-template`, `/json-example`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/portal_equipment_import.py backend/app/main.py
git commit -m "feat(equipment): add portal equipment import routes (scope-forced)"
```

---

## Task 4: Backend — Admin Equipment Import Routes

**Files:**
- Create: `backend/app/api/routes/equipment_import.py` (validate + commit)
- Create: `backend/app/api/routes/equipment_import_templates.py` (csv-template + json-example)
- Modify: `backend/app/main.py` (register both admin routers under prefix)

**Interfaces:**
- Consumes: same service as Task 3; guard is `require_operator("equipment_list")` instead of `require_factory_module`.
- Produces: `equipment_import.router` (validate/commit) and `equipment_import_templates.router` (templates), both mounted at `{api_prefix}/admin/equipment/import`. NO `_force_manufacturer_id` — admin-supplied `manufacturer_id` is FK-validated but not scope-overridden.

**Reference:** `backend/app/api/routes/cable_import.py` (admin validate/commit, no scope forcing) and `backend/app/api/routes/cable_import_templates.py` (templates).

- [ ] **Step 1: Create admin validate/commit router**

Create `backend/app/api/routes/equipment_import.py` (mirror `cable_import.py`; swap guard to `equipment_list`):

```python
from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.models.user import User
from app.core.database import get_db
from app.schemas.cable_import import ImportPreview, ImportResult
from app.services.equipment_import import (
    MAX_ROWS,
    build_preview,
    commit_valid_rows,
    parse_file,
    validate_rows,
)

router = APIRouter()


@router.post("/validate", response_model=ImportPreview)
async def validate_import(
    file: UploadFile,
    format: Literal["csv", "json"] = Form(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("equipment_list")),
):
    content = await file.read()
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")
    validated = await validate_rows(db, parsed)
    return build_preview(validated, format)


@router.post("/commit", response_model=ImportResult)
async def commit_import(
    file: UploadFile,
    format: Literal["csv", "json"] = Form(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("equipment_list")),
):
    content = await file.read()
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")
    validated = await validate_rows(db, parsed)

    valid_rows = [v for v in validated if v.status == "valid"]
    skipped_count = sum(1 for v in validated if v.status == "skipped")

    if not valid_rows:
        return ImportResult(created_count=0, skipped_count=skipped_count, errors=["No valid rows to import"])

    try:
        created = await commit_valid_rows(db, validated)
        return ImportResult(created_count=created, skipped_count=skipped_count, errors=[])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transaction failed: {str(e)}")
```

- [ ] **Step 2: Create admin templates router**

Create `backend/app/api/routes/equipment_import_templates.py` (mirror `cable_import_templates.py`; guard `equipment_list`). Use the same headers/example as the portal templates (Task 3) for consistency:

```python
import csv
import json
from io import StringIO

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import require_operator
from app.models.user import User

router = APIRouter()

CSV_TEMPLATE_HEADERS = [
    "id", "model", "slug", "manufacturer_id", "category_id",
    "description", "image_url", "external_url", "sort_order", "applicable_specs",
]

CSV_TEMPLATE_EXAMPLE = {
    "id": "em-1-transformer-100",
    "model": "Transformer 100",
    "slug": "transformer-100",
    "manufacturer_id": "em-1",
    "category_id": "power/transformers",
    "description": "100kVA distribution transformer",
    "image_url": "",
    "external_url": "",
    "sort_order": "0",
    "applicable_specs": '[{"spec_key":"power","label":"Power","allowed_values":["100kVA"]}]',
}


@router.get("/csv-template")
async def download_csv_template(user: User = Depends(require_operator("equipment_list"))):
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_TEMPLATE_HEADERS)
    writer.writeheader()
    writer.writerow(CSV_TEMPLATE_EXAMPLE)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=equipment-import-template.csv"},
    )


@router.get("/json-example")
async def download_json_example(user: User = Depends(require_operator("equipment_list"))):
    example = [
        {
            "id": "em-1-transformer-100",
            "model": "Transformer 100",
            "slug": "transformer-100",
            "manufacturer_id": "em-1",
            "category_id": "power/transformers",
            "description": "100kVA distribution transformer",
            "image_url": None,
            "external_url": None,
            "sort_order": 0,
            "applicable_specs": [
                {"spec_key": "power", "label": "Power", "allowed_values": ["100kVA"]}
            ],
        }
    ]
    content = json.dumps(example, indent=2)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=equipment-import-example.json"},
    )
```

- [ ] **Step 3: Register both admin routers in `main.py`**

Add `equipment_import` and `equipment_import_templates` to the import block (line 12) of `backend/app/main.py`. Insert them after `equipment_categories` in the import list:

```python
from app.api.routes import auth, cable_import, cable_import_templates, cables, categories, equipment, equipment_categories, equipment_import, equipment_import_templates, equipment_manufacturers, folders, health, industries, manufacturers, pages, product_types, taxonomy, uploads, site_menu, admin_menu, admin_roles, admin_users, member, admin_inquiries, admin_email, admin_members, admin_messages, portal_auth, page_views, portal_dashboard, portal_cables, portal_cable_import, portal_equipment, portal_equipment_import, portal_inquiries, portal_media, portal_messages
```

Register both under the admin prefix (add after the `equipment_categories.router` line, ~line 94):

```python
app.include_router(equipment_categories.router, prefix=f"{settings.api_prefix}/equipment-categories", tags=["equipment-categories"])
app.include_router(equipment_import.router, prefix=f"{settings.api_prefix}/admin/equipment/import", tags=["equipment-import"])
app.include_router(equipment_import_templates.router, prefix=f"{settings.api_prefix}/admin/equipment/import", tags=["equipment-import"])
```

- [ ] **Step 4: Verify all 8 equipment import paths are registered**

Run: `python -c "from app.main import app; paths=sorted([r.path for r in app.routes if '/equipment/import' in getattr(r,'path','')]); print(len(paths)); [print(p) for p in paths]"`
Expected: 8 paths — 4 portal (`/api/portal/equipment/import/{validate,commit,csv-template,json-example}`) + 4 admin (`/api/admin/equipment/import/{validate,commit,csv-template,json-example}`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/equipment_import.py backend/app/api/routes/equipment_import_templates.py backend/app/main.py
git commit -m "feat(equipment): add admin equipment import routes (operator-guarded)"
```

---

## Task 5: Backend — Tests (15 pytest tests + 1 existing-test update)

**Files:**
- Modify: `backend/tests/api/test_portal_equipment.py` (update `test_portal_equipment_list` for paginated shape)
- Create: `backend/tests/api/test_portal_equipment_list.py` (5 list-filtering tests)
- Create: `backend/tests/api/test_portal_equipment_import.py` (7 portal import tests)
- Create: `backend/tests/api/test_admin_equipment_import.py` (4 admin import tests)

**Fixtures available** (from `backend/tests/conftest.py`): `client`, `db_session`, `admin_headers` (system admin → has `equipment_list` operator perm), `cable_manager_headers` (scope `mfr-1`, cable manufacturer), `equipment_manager_headers` (scope `em-1`, equipment manufacturer). The equipment manufacturer fixture seeds the `equipment_manufacturers` row `em-1` via the autouse fixture in `test_portal_equipment.py` (see lines 7-27) — mirror that pattern in new equipment test files.

**Reference patterns:** `backend/tests/api/test_portal_cable_list.py` (filtering tests) and `backend/tests/api/test_portal_cable_import.py` (import tests). Equipment uses `/api/equipment-categories` (flat list) instead of `/api/taxonomy` to fetch valid `category_id`. Portal equipment scope is `em-1` (not `mfr-1`).

### 5A. Update existing test for paginated response

- [ ] **Step 1: Update `test_portal_equipment_list` in `test_portal_equipment.py`**

The existing test (lines 30-33) asserts `isinstance(res.json(), list)`. Change it to expect a `PaginatedResponse` dict. Replace the test body:

```python
def test_portal_equipment_list(client, equipment_manager_headers):
    res = client.get("/api/portal/equipment", headers=equipment_manager_headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, dict)
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "page_size" in data
    assert isinstance(data["items"], list)
```

- [ ] **Step 2: Run the updated test**

Run: `pytest backend/tests/api/test_portal_equipment.py -v`
Expected: PASS (all tests in the file, including the updated list test).

### 5B. List filtering tests (5 tests)

- [ ] **Step 3: Create `test_portal_equipment_list.py` with a shared fixture and the 5 tests**

Create `backend/tests/api/test_portal_equipment_list.py`. Fetch a valid `category_id` from `/api/equipment-categories` (skip if none seeded). Create 3 scoped equipment rows via `POST /api/portal/equipment` with models `Transformer-100`, `Transformer-200`, `Generator-1`. Mirror the structure of `test_portal_cable_list.py`:

```python
"""Tests for portal equipment list endpoint: search, category filter, pagination, backward-compat."""
import uuid

import pytest


@pytest.fixture
def _ensure_em(client, equipment_manager_headers):
    """Ensure em-1 equipment_manufacturers row exists (mirror test_portal_equipment.py autouse)."""
    import asyncio
    from sqlalchemy import text
    from app.core.database import engine

    async def _setup():
        async with engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO equipment_manufacturers (id, name, slug, sort_order, created_at, updated_at) "
                "VALUES ('em-1', 'Test Equip Mfr', 'em-1', 0, NOW(), NOW()) "
                "ON CONFLICT (id) DO NOTHING"
            ))
    asyncio.run(_setup())


def _fetch_category_id(client):
    res = client.get("/api/equipment-categories")
    if res.status_code != 200:
        return None
    cats = res.json()
    if not cats:
        return None
    # Prefer a child category if present, else top-level
    for c in cats:
        if c.get("children"):
            return c["children"][0]["id"]
    return cats[0]["id"]


@pytest.fixture
def scoped_equipment(client, equipment_manager_headers, _ensure_em):
    cat_id = _fetch_category_id(client)
    if not cat_id:
        pytest.skip("No equipment categories seeded")
    created = []
    for model in ("Transformer-100", "Transformer-200", "Generator-1"):
        slug = f"test-eq-{model.lower()}-{uuid.uuid4().hex[:8]}"
        res = client.post("/api/portal/equipment", headers=equipment_manager_headers, json={
            "category_id": cat_id,
            "model": model,
            "slug": slug,
        })
        if res.status_code == 201:
            created.append(res.json())
    if len(created) < 3:
        pytest.skip("Could not create 3 scoped equipment rows")
    return created


def test_portal_equipment_list_with_search(client, equipment_manager_headers, scoped_equipment):
    res = client.get("/api/portal/equipment?search=Transformer", headers=equipment_manager_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    tf_items = [e for e in items if "Transformer" in e.get("model", "")]
    assert len(tf_items) >= 2
    assert all("Transformer" in e["model"] for e in tf_items)


def test_portal_equipment_list_with_category_filter(client, equipment_manager_headers, scoped_equipment):
    target_cat = scoped_equipment[0]["category_id"]
    res = client.get(f"/api/portal/equipment?category_id={target_cat}", headers=equipment_manager_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) >= 1
    assert all(e["category_id"] == target_cat for e in items)


def test_portal_equipment_list_without_filters(client, equipment_manager_headers, scoped_equipment):
    res = client.get("/api/portal/equipment", headers=equipment_manager_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["page"] == 1
    assert data["page_size"] == 20
    assert data["total"] >= 3
    assert all(e["manufacturer_id"] == "em-1" for e in data["items"])


def test_portal_equipment_list_pagination(client, equipment_manager_headers, scoped_equipment):
    res = client.get("/api/portal/equipment?page=1&page_size=2", headers=equipment_manager_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["page"] == 1
    assert data["page_size"] == 2
    assert len(data["items"]) <= 2
    assert data["total"] >= 3


def test_admin_equipment_list_with_q(client, admin_headers, scoped_equipment):
    res = client.get("/api/recommended-equipments?q=Transformer", headers=admin_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    tf_items = [e for e in items if "Transformer" in e.get("model", "")]
    assert len(tf_items) >= 2
    assert all("Transformer" in e["model"] for e in tf_items)
```

- [ ] **Step 4: Run the filtering tests**

Run: `pytest backend/tests/api/test_portal_equipment_list.py -v`
Expected: 5 PASS (or SKIP if no equipment categories seeded — that is acceptable only in a bare environment; with the seed data the tests must pass).

### 5C. Portal import tests (7 tests)

- [ ] **Step 5: Create `test_portal_equipment_import.py`**

Create `backend/tests/api/test_portal_equipment_import.py`. Mirror `test_portal_cable_import.py` but fetch `category_id` from `/api/equipment-categories` (no industry/product_type/size_system), use `equipment_manager_headers`, and assert `manufacturer_id` is forced to `em-1`. Equipment CSV header: `id,model,slug,manufacturer_id,category_id`.

```python
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

    # Seed an existing equipment row directly in DB (id + slug collision targets)
    eq_id = f"dup-{uuid.uuid4().hex[:8]}"
    slug = f"dup-slug-{uuid.uuid4().hex[:6]}"
    async def _seed():
        async with async_session() as db:
            await db.execute(text(
                "INSERT INTO recommended_equipments (id, model, slug, manufacturer_id, category_id, applicable_specs, created_at, updated_at) "
                "VALUES (:id, :model, :slug, 'em-1', :cat, '[]'::jsonb, NOW(), NOW()) ON CONFLICT DO NOTHING"
            ), {"id": eq_id, "model": "Dup-Existing", "slug": slug, "cat": cat_id})
            await db.commit()
    asyncio.run(_seed())

    # File contains: row1 = DB-existing id (skip), row2 = same slug as row1 (intra-file error),
    # row3 = brand new (valid)
    new_id = f"new-{uuid.uuid4().hex[:8]}"
    csv_content = (
        "id,model,slug,manufacturer_id,category_id\n"
        f"{eq_id},Dup-DB,dup-db-slug,em-1,{cat_id}\n"
        f"{eq_id}-2,Dup-IntraFile,{slug},em-1,{cat_id}\n"
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
    # row1 skipped (id in DB), row2 error (slug in DB), row3 valid
    assert p["valid_count"] == 1
    assert p["skipped_count"] == 1
    assert p["error_count"] == 1
```

- [ ] **Step 6: Run the portal import tests**

Run: `pytest backend/tests/api/test_portal_equipment_import.py -v`
Expected: 7 PASS (or SKIP if no equipment categories seeded). If `test_portal_equipment_import_dup_detection` fails, re-check the slug/id duplicate ordering in `validate_rows` (Task 2 Step 5).

### 5D. Admin import tests (4 tests)

- [ ] **Step 7: Create `test_admin_equipment_import.py`**

Create `backend/tests/api/test_admin_equipment_import.py`. Admin uses `admin_headers` (system admin → `require_operator("equipment_list")` passes). NO scope forcing: admin-supplied `manufacturer_id` is used as-is after FK validation.

```python
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
    assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
```

- [ ] **Step 8: Run the admin import tests**

Run: `pytest backend/tests/api/test_admin_equipment_import.py -v`
Expected: 4 PASS (or SKIP). If `test_admin_equipment_import_unauthorized` returns 401 instead of 403, that is also acceptable (portal token rejected by admin auth) — relax the assertion to `assert res.status_code in (401, 403)` and note it in the commit message.

- [ ] **Step 9: Run the full backend test suite for the change**

Run: `pytest backend/tests/api/test_portal_equipment.py backend/tests/api/test_portal_equipment_list.py backend/tests/api/test_portal_equipment_import.py backend/tests/api/test_admin_equipment_import.py -v`
Expected: all PASS (or SKIP where seed data is absent). Confirm no regressions in `test_portal_equipment.py` beyond the updated list test.

- [ ] **Step 10: Commit**

```bash
git add backend/tests/api/test_portal_equipment.py backend/tests/api/test_portal_equipment_list.py backend/tests/api/test_portal_equipment_import.py backend/tests/api/test_admin_equipment_import.py
git commit -m "test(equipment): add 15 equipment list/import tests + update list test for pagination"
```

---

## Task 6: Frontend — Portal Equipment List Page UI

**Files:**
- Modify: `frontend/app/portal/equipment/page.tsx`
- Modify: `frontend/lib/portalApi.ts` (`equipment.all()` — server-side client)
- Create: `frontend/components/portal/equipment/EquipmentListToolbar.tsx`

**Interfaces:**
- Consumes: `portalApi.equipment.all(params)` must return `{items, total, page, page_size}` (server-side client → backend `PaginatedResponse`).
- Produces: a portal equipment list page with toolbar, plain-text Name, Actions/Edit column, Import button, and Prev/Next pagination.

**Reference:** `frontend/components/portal/cable/CableListToolbar.tsx` (toolbar — but equipment uses a SINGLE category dropdown, not cascading). `frontend/app/portal/cables/page.tsx` for the list page pagination pattern.

- [ ] **Step 1: Extend `portalApi.equipment.all()` in `frontend/lib/portalApi.ts`**

The current method (lines 81-84) returns `PortalEquipment[]`. Change it to accept filter/pagination params and return a paginated shape. Update the type signature and body:

```typescript
equipment: {
    async all(params?: { search?: string; category_id?: string; page?: number; page_size?: number }): Promise<{ items: PortalEquipment[]; total: number; page: number; page_size: number }> {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.category_id) qs.set('category_id', params.category_id);
      if (params?.page != null) qs.set('page', String(params.page));
      if (params?.page_size != null) qs.set('page_size', String(params.page_size));
      const suffix = qs.toString() ? `?${qs}` : '';
      return portalGet<{ items: PortalEquipment[]; total: number; page: number; page_size: number }>(`/api/portal/equipment${suffix}`);
    },
    async getById(id: string): Promise<PortalEquipment> {
      return portalGet<PortalEquipment>(`/api/portal/equipment/${id}`);
    },
  },
```

Note: confirm `PortalEquipment` type in `frontend/lib/types/portal.ts` already includes `manufacturer_id`, `category_id`, `model`, `slug`, `created_at`, and `category?.label`. If `category` is missing, add it as `category?: { id: string; label: string } | null`.

- [ ] **Step 2: Create `EquipmentListToolbar.tsx`**

Create `frontend/components/portal/equipment/EquipmentListToolbar.tsx` — mirror `CableListToolbar.tsx` but with a SINGLE category `<select>` (no industry/product_type cascading). Props take a flat categories array:

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

interface Props {
  categories: { id: string; label: string; parent_label?: string | null }[];
}

export function EquipmentListToolbar({ categories }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [search, setSearch] = useState(sp.get('search') ?? '');
  const selectedCategory = sp.get('category_id') ?? '';

  function pushParams(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(sp.toString());
    mutator(params);
    for (const key of [...params.keys()]) {
      if (!params.get(key)) params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? `/portal/equipment?${qs}` : '/portal/equipment');
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    pushParams((p) => p.set('search', search.trim()));
  }

  function handleCategoryChange(value: string) {
    pushParams((p) => {
      if (value) p.set('category_id', value);
      else p.delete('category_id');
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by model…"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button type="submit" className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Search
        </button>
      </form>
      <select
        value={selectedCategory}
        onChange={(e) => handleCategoryChange(e.target.value)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">All Categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.parent_label ? `${c.parent_label} — ${c.label}` : c.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite the portal equipment list page**

Replace `frontend/app/portal/equipment/page.tsx` to: await `searchParams`, call `portalApi.equipment.all({ search, category_id, page, page_size: 20 })`, fetch categories for the toolbar, render the toolbar, render Name as plain text, add an Actions column with an Edit button, add an Import button in the header, and add Prev/Next pagination:

```tsx
import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';
import { EquipmentListToolbar } from '@/components/portal/equipment/EquipmentListToolbar';
import type { PortalEquipment } from '@/lib/types/portal';

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{ search?: string; category_id?: string; page?: string }>;
}

export default async function PortalEquipmentPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1', 10);
  let equipment: PortalEquipment[] = [];
  let total = 0;
  try {
    const result = await portalApi.equipment.all({
      search: sp.search,
      category_id: sp.category_id,
      page,
      page_size: PAGE_SIZE,
    });
    equipment = result.items;
    total = result.total;
  } catch {
    // empty state
  }

  // Fetch categories for the toolbar dropdown (flat list).
  let categories: { id: string; label: string; parent_label?: string | null }[] = [];
  try {
    const tree = await portalApi.equipmentCategories?.all?.() ?? [];
    categories = tree.flatMap((parent: any) => {
      const self = { id: parent.id, label: parent.label, parent_label: null as string | null };
      const children = (parent.children ?? []).map((child: any) => ({
        id: child.id, label: child.label, parent_label: parent.label,
      }));
      return [self, ...children];
    });
  } catch {
    // empty categories
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(p: number): string {
    const params = new URLSearchParams({ page: String(p) });
    if (sp.search) params.set('search', sp.search);
    if (sp.category_id) params.set('category_id', sp.category_id);
    return `/portal/equipment?${params.toString()}`;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Equipment</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/portal/equipment/import"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Import
          </Link>
          <Link
            href="/portal/equipment/new"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Equipment
          </Link>
        </div>
      </div>

      <EquipmentListToolbar categories={categories} />

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
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {equipment.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{e.model || e.id}</td>
                  <td className="px-4 py-3 text-gray-600">{e.category?.label ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {e.created_at ? new Date(e.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/portal/equipment/${e.id}`} className="text-blue-600 hover:underline">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        {page > 1 ? (
          <Link href={buildPageHref(page - 1)} className="text-blue-600 hover:underline">← Prev</Link>
        ) : (
          <span className="text-gray-300">← Prev</span>
        )}
        <span className="text-gray-600">Page {page} of {totalPages}</span>
        {page < totalPages ? (
          <Link href={buildPageHref(page + 1)} className="text-blue-600 hover:underline">Next →</Link>
        ) : (
          <span className="text-gray-300">Next →</span>
        )}
      </div>
    </div>
  );
}
```

Note: if `portalApi.equipmentCategories` does not exist, add an `equipmentCategories: { async all() { return portalGet('/api/equipment-categories'); } }` block to `frontend/lib/portalApi.ts` mirroring the existing patterns, OR fetch categories via a direct server-side call. Verify the categories endpoint returns a tree with `children` (it does — see `equipment_categories.router`).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` (from `frontend/`)
Expected: 0 errors. Fix any type errors in `PortalEquipment` (add `category` field if missing) or `portalApi.equipmentCategories` before proceeding.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/portal/equipment/page.tsx frontend/components/portal/equipment/EquipmentListToolbar.tsx frontend/lib/portalApi.ts
git commit -m "feat(portal): equipment list UI with toolbar, pagination, Edit/Import actions"
```

---

## Task 7: Frontend — Portal Equipment Import Page

**Files:**
- Create: `frontend/app/portal/equipment/import/page.tsx`
- Create: `frontend/app/api/portal/equipment/import/validate/route.ts`
- Create: `frontend/app/api/portal/equipment/import/commit/route.ts`
- Modify: `frontend/lib/portalApiClient.ts` (add `equipment.import.*`)

**Interfaces:**
- Consumes: `portalApiClient.equipment.import.{validate, commit, downloadCsvTemplate, downloadJsonExample}`; `ImportPreview`/`ImportResult`/`ImportFormat`/`triggerBlobDownload` from `clientCableImport`; `ImportPreviewTable` from `components/admin/cable/ImportPreviewTable`.
- Produces: a 3-stage (upload → preview → result) portal equipment import page; two BFF proxy routes; portalApiClient extensions.

**Reference:** `frontend/app/portal/cables/import/page.tsx` (mirror exactly — swap `cables`→`equipment`, `portalApiClient.cables.import`→`portalApiClient.equipment.import`, copy strings). `frontend/app/api/portal/cables/import/validate/route.ts` (BFF pattern).

- [ ] **Step 1: Add `equipment.import.*` to `portalApiClient.ts`**

In `frontend/lib/portalApiClient.ts`, the `equipment` block (lines 103-121) currently has `create`/`update`/`remove`. Add an `import` sub-object mirroring `cables.import` (lines 70-101), pointing at `/api/portal/equipment/import/*`:

```typescript
equipment: {
    async create(data: PortalEquipmentCreate): Promise<PortalEquipment> {
      const res = await bffFetch('/api/portal/equipment', { method: 'POST', body: JSON.stringify(data) });
      return res.json();
    },
    async update(id: string, data: PortalEquipmentUpdate): Promise<PortalEquipment> {
      const res = await bffFetch(`/api/portal/equipment/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      return res.json();
    },
    async remove(id: string): Promise<void> {
      await bffFetch(`/api/portal/equipment/${id}`, { method: 'DELETE' });
    },
    import: {
      async validate(file: File, format: ImportFormat): Promise<ImportPreview> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('format', format);
        const res = await bffFetch('/api/portal/equipment/import/validate', {
          method: 'POST', body: formData, skipDefaultContentType: true,
        });
        return res.json();
      },
      async commit(file: File, format: ImportFormat): Promise<ImportResult> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('format', format);
        const res = await bffFetch('/api/portal/equipment/import/commit', {
          method: 'POST', body: formData, skipDefaultContentType: true,
        });
        return res.json();
      },
      async downloadCsvTemplate(): Promise<Blob> {
        const res = await bffFetch('/api/portal/equipment/import/csv-template');
        return res.blob();
      },
      async downloadJsonExample(): Promise<Blob> {
        const res = await bffFetch('/api/portal/equipment/import/json-example');
        return res.blob();
      },
    },
  },
```

- [ ] **Step 2: Create the two BFF proxy routes**

Create `frontend/app/api/portal/equipment/import/validate/route.ts` (mirror `portal/cables/import/validate/route.ts`, swap path):

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('portal_token')?.value;
  if (!token) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }
  const formData = await request.formData();
  const res = await fetch(`${API_BASE}/api/portal/equipment/import/validate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

Create `frontend/app/api/portal/equipment/import/commit/route.ts` — identical but with `/commit` in both the upstream URL and the export name. (Same body, change `validate` → `commit`.)

- [ ] **Step 3: Create the portal equipment import page**

Create `frontend/app/portal/equipment/import/page.tsx`. Copy `frontend/app/portal/cables/import/page.tsx` verbatim and make these replacements:
- Component name: `PortalEquipmentImportPage`
- `portalApiClient.cables.import.*` → `portalApiClient.equipment.import.*`
- Back arrow `href="/portal/cables"` → `href="/portal/equipment"`
- H1: `Import Cables` → `Import Equipment`
- Result copy: `cables created` → `equipment created`, `cables skipped (already existed)` → `equipment skipped (already existed)`
- Result link `href="/portal/cables"` → `href="/portal/equipment"`
- Template download filenames: `portal-cable-import-template.csv` → `portal-equipment-import-template.csv`; `portal-cable-import-example.json` → `portal-equipment-import-example.json`
- File input `id`: `cable-import-input` → `equipment-import-input`

Keep the `ImportPreviewTable` import (`@/components/admin/cable/ImportPreviewTable`) and `triggerBlobDownload`/types from `@/lib/clientCableImport` unchanged (reused per D5).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` (from `frontend/`)
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/portal/equipment/import/page.tsx frontend/app/api/portal/equipment/import/validate/route.ts frontend/app/api/portal/equipment/import/commit/route.ts frontend/lib/portalApiClient.ts
git commit -m "feat(portal): equipment import page (3-stage) + BFF proxy routes"
```

---

## Task 8: Frontend — Admin Equipment List Page UI

**Files:**
- Modify: `frontend/app/admin/(dashboard)/equipment/page.tsx`
- Create: `frontend/components/admin/list/EquipmentSearchBox.tsx`

**Interfaces:**
- Consumes: `adminApi.equipment.all(page, page_size, { q, manufacturer_id, category_id })` (existing method — verify it forwards `q`).
- Produces: an admin equipment list page with a search box and an Import button in the header.

**Reference:** `frontend/components/admin/list/CableSearchBox.tsx` (mirror exactly, swap route). The existing admin equipment page already has manufacturer/category filter dropdowns and pagination — only additive changes.

- [ ] **Step 1: Verify/extend `adminApi.equipment.all()` accepts `q`**

In `frontend/lib/adminApi.ts` (or wherever `adminApi.equipment.all` is defined), confirm the `all` method forwards a `q` query param to `GET /api/recommended-equipments?q=...`. If it does not, add `q?: string` to its options type and append `q` to the `URLSearchParams` it builds. Mirror the existing `manufacturer_id`/`category_id` forwarding exactly.

- [ ] **Step 2: Create `EquipmentSearchBox.tsx`**

Create `frontend/components/admin/list/EquipmentSearchBox.tsx` — copy `CableSearchBox.tsx` and change the push target from `/admin/cables` to `/admin/equipment`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function EquipmentSearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') ?? '');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    router.push(`/admin/equipment${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by model…"
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button
        type="submit"
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
      >
        Search
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Update the admin equipment list page**

In `frontend/app/admin/(dashboard)/equipment/page.tsx`:
1. Add `q?: string` to the `searchParams` type (line 5): `{ page?: string; manufacturer_id?: string; category_id?: string; q?: string }`.
2. Read `const q = sp.q;` after the other destructures (around line 14).
3. Pass `q` into `adminApi.equipment.all(page, PAGE_SIZE, { manufacturer_id: manufacturerId, category_id: categoryId, q })` (line 17-20).
4. Include `q` in `buildPageHref` (around line 47): `if (q) params.set('q', q);`.
5. Import `EquipmentSearchBox` and render it in the header next to the "New" button. Add an "Import" button linking to `/admin/equipment/import`. Replace the header block (lines 55-63):

```tsx
import { EquipmentSearchBox } from '@/components/admin/list/EquipmentSearchBox';
// ...

<div className="mb-6 flex items-center justify-between">
  <h1 className="text-2xl font-bold text-gray-900">Equipment</h1>
  <div className="flex items-center gap-2">
    <EquipmentSearchBox />
    <Link
      href="/admin/equipment/import"
      className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
    >
      Import
    </Link>
    <Link
      href="/admin/equipment/new"
      className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
    >
      New
    </Link>
  </div>
</div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` (from `frontend/`)
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/admin/(dashboard)/equipment/page.tsx frontend/components/admin/list/EquipmentSearchBox.tsx frontend/lib/adminApi.ts
git commit -m "feat(admin): equipment list search box + Import button"
```

---

## Task 9: Frontend — Admin Equipment Import Page

**Files:**
- Create: `frontend/lib/clientEquipmentImport.ts`
- Create: `frontend/app/admin/(dashboard)/equipment/import/page.tsx`
- Create: `frontend/app/api/admin/equipment/import/validate/route.ts`
- Create: `frontend/app/api/admin/equipment/import/commit/route.ts`

**Interfaces:**
- Consumes: BFF routes at `/api/admin/equipment/import/*`; `ImportPreviewTable` from `components/admin/cable/ImportPreviewTable`.
- Produces: `clientEquipmentImport` lib with `validateImport`, `commitImport`, `downloadCsvTemplate`, `downloadJsonExample`, `triggerBlobDownload`, and types `ImportFormat`/`ImportPreview`/`ImportPreviewRow`/`ImportResult` (re-exported from `clientCableImport` per D5); an admin equipment import page; two BFF proxy routes.

**Reference:** `frontend/lib/clientCableImport.ts` (mirror — swap paths to `/api/admin/equipment/import/*`). `frontend/app/admin/(dashboard)/cables/import/page.tsx` (page mirror).

- [ ] **Step 1: Create `clientEquipmentImport.ts`**

Create `frontend/lib/clientEquipmentImport.ts`. Re-export the shared types from `clientCableImport` (D5: reuse, don't fork) and define equipment-specific functions hitting `/api/admin/equipment/import/*`:

```typescript
// Client-side equipment import module — safe to import from 'use client' components.
// Mirrors clientCableImport but targets /api/admin/equipment/import/*.

export type {
  ImportFormat,
  RowStatus,
  ImportPreviewRow,
  ImportPreview,
  ImportResult,
} from '@/lib/clientCableImport';

import type { ImportFormat, ImportPreview, ImportResult } from '@/lib/clientCableImport';

export async function validateImport(file: File, format: ImportFormat): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', format);
  const res = await fetch('/api/admin/equipment/import/validate', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Validation failed');
  return data as ImportPreview;
}

export async function commitImport(file: File, format: ImportFormat): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', format);
  const res = await fetch('/api/admin/equipment/import/commit', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Commit failed');
  return data as ImportResult;
}

export async function downloadCsvTemplate(): Promise<Blob> {
  const res = await fetch('/api/admin/equipment/import/csv-template');
  if (!res.ok) throw new Error('Failed to download CSV template');
  return res.blob();
}

export async function downloadJsonExample(): Promise<Blob> {
  const res = await fetch('/api/admin/equipment/import/json-example');
  if (!res.ok) throw new Error('Failed to download JSON example');
  return res.blob();
}

export { triggerBlobDownload } from '@/lib/clientCableImport';
```

- [ ] **Step 2: Create the two admin BFF proxy routes**

Create `frontend/app/api/admin/equipment/import/validate/route.ts` (mirror the cable admin validate route — uses `admin_token` cookie). If an existing admin cable BFF route exists, copy it and swap the upstream path. If not, use this (mirroring the portal pattern but with `admin_token`):

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  if (!token) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }
  const formData = await request.formData();
  const res = await fetch(`${API_BASE}/api/admin/equipment/import/validate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

Create `frontend/app/api/admin/equipment/import/commit/route.ts` — identical but with `/commit` in the upstream URL.

Note: verify the admin BFF cookie name is `admin_token` by checking an existing admin BFF route (e.g. `frontend/app/api/admin/cables/import/validate/route.ts` if it exists, or any `app/api/admin/**/route.ts`). Use the same cookie name the existing admin BFF routes use.

- [ ] **Step 3: Create the admin equipment import page**

Create `frontend/app/admin/(dashboard)/equipment/import/page.tsx`. Copy `frontend/app/admin/(dashboard)/cables/import/page.tsx` verbatim and make these replacements:
- Component name: `EquipmentImportPage`
- Imports: replace `from '@/lib/clientCableImport'` with `from '@/lib/clientEquipmentImport'` (keep `ImportPreviewTable` import unchanged)
- `validateImport` / `commitImport` / `downloadCsvTemplate` / `downloadJsonExample` / `triggerBlobDownload` now come from `clientEquipmentImport`
- Back arrow `href="/admin/cables"` → `href="/admin/equipment"`
- H1: `Import Cables` → `Import Equipment`
- Result copy: `cables created` → `equipment created`, `cables skipped (already existed)` → `equipment skipped (already existed)`
- Result link `href="/admin/cables"` → `href="/admin/equipment"`
- Template download filenames: `cable-import-template.csv` → `equipment-import-template.csv`; `cable-import-example.json` → `equipment-import-example.json`
- File input `id`: `cable-import-input` → `equipment-import-input`

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` (from `frontend/`)
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/clientEquipmentImport.ts frontend/app/admin/(dashboard)/equipment/import/page.tsx frontend/app/api/admin/equipment/import/validate/route.ts frontend/app/api/admin/equipment/import/commit/route.ts
git commit -m "feat(admin): equipment import page (3-stage) + BFF proxy + client lib"
```

---

## Task 10: Manual Verification

**Files:** none (verification only).

Run after all Tasks 1-9 are committed and the full stack is up (`docker compose up` or the project's standard dev orchestration).

- [ ] **Step 1: TypeScript compilation (whole frontend)**

Run: `npx tsc --noEmit` (from `frontend/`)
Expected: 0 errors.

- [ ] **Step 2: Backend test suite (regression)**

Run: `pytest backend/tests/api/ -v -k "equipment"`
Expected: all equipment tests PASS (or SKIP where seed data is absent). No regressions.

- [ ] **Step 3: Docker stack health check**

Run: `docker compose ps` (or the project's equivalent)
Expected: all services (backend, frontend, db) healthy/running.

- [ ] **Step 4: Portal equipment list page**

Open `/portal/equipment` in the browser (logged in as an equipment manufacturer user, scope `em-1`).
Verify:
- Name column is plain text (not a link).
- "Actions" column shows an "Edit" link that navigates to `/portal/equipment/{id}`.
- "Import" button in the header links to `/portal/equipment/import`.
- Typing in the search box and clicking "Search" filters the list by model (case-insensitive).
- Selecting a category from the dropdown filters the list; "All Categories" clears the filter.
- Prev/Next pagination works and preserves the current search/category params in the URL.

- [ ] **Step 5: Portal equipment import page (CSV)**

Open `/portal/equipment/import`.
Verify:
- "Download CSV template" downloads `equipment-import-template.csv` with the 10 expected headers.
- Upload the CSV template (with a real `category_id` from `/api/equipment-categories` and a unique `id`/`slug`) → click "Validate" → preview shows the row as valid.
- Click "Commit N valid rows" → result shows "1 equipment created".
- Navigate to `/portal/equipment` → the new equipment row appears.

- [ ] **Step 6: Portal equipment import page (JSON with nested applicable_specs)**

On `/portal/equipment/import`, switch format to JSON.
Verify:
- "View JSON example" downloads `equipment-import-example.json` with `applicable_specs` as a native JSON array.
- Upload a JSON file with one equipment object containing `applicable_specs: [{"spec_key":"power","label":"Power","allowed_values":["100kVA"]}]` and a real `category_id` → Validate → preview valid → Commit → result "1 equipment created".
- Confirm the created equipment's `applicable_specs` persisted (check via the detail page or DB).

- [ ] **Step 7: Portal import — security (force_manufacturer_id)**

Upload a CSV where the `manufacturer_id` column is a bogus value (e.g. `em-evil`). Commit.
Verify: the created equipment's `manufacturer_id` is `em-1` (the logged-in user's scope), NOT `em-evil`. (Covered by `test_portal_equipment_import_force_manufacturer_id`, but verify manually in the UI too.)

- [ ] **Step 8: Admin equipment list page**

Open `/admin/equipment` (logged in as admin).
Verify:
- The "Search by model…" box appears in the header.
- Typing a query and pressing Search filters the list by model (URL gains `?q=...`).
- "Import" button in the header links to `/admin/equipment/import`.

- [ ] **Step 9: Admin equipment import page (CSV)**

Open `/admin/equipment/import`.
Verify:
- "Download CSV template" downloads the admin CSV template.
- Upload a valid CSV (with a real `manufacturer_id` and `category_id`) → Validate → preview valid → Commit → result "N equipment created".
- The admin-supplied `manufacturer_id` is respected (NOT forced — unlike portal). Verify the created equipment's `manufacturer_id` matches the CSV value.

- [ ] **Step 10: Admin equipment import page (JSON with nested applicable_specs)**

On `/admin/equipment/import`, switch to JSON.
Verify: upload a JSON file with nested `applicable_specs` → Validate → preview valid → Commit → result shows created count; `applicable_specs` persisted.

- [ ] **Step 11: Template downloads on both sides**

Verify both `/portal/equipment/import` and `/admin/equipment/import`:
- "Download CSV template" returns a CSV with headers `id, model, slug, manufacturer_id, category_id, description, image_url, external_url, sort_order, applicable_specs` and 1 example row.
- "View JSON example" returns a JSON array with 1 equipment object including a native `applicable_specs` array.

- [ ] **Step 12: Final commit (if any verification surfaced fixes)**

If manual verification surfaced any bugs, fix them and commit with `fix(equipment): ...`. If no fixes are needed, no commit is required for this task.

---

## Self-Review Notes

- **Spec coverage:** Every section of the design doc maps to a task — backend CRUD (Task 1), shared service (Task 2, covers §4.1 fully including 4-layer validation + dual id/slug dup detection), portal routes (Task 3, §4.2), admin routes (Task 4, §4.3), tests (Task 5, covers all 15 tests from §8.1 + the one existing-test update), portal list UI (Task 6, §4.6-4.7), portal import page + BFF + client (Task 7, §4.8-4.9 + §4.14), admin list UI (Task 8, §4.10-4.11), admin import page + client + BFF (Task 9, §4.12-4.14), manual verification (Task 10, §8.2-8.3).
- **Breaking change handled:** D1 (pagination) — Task 1 changes the response shape; Task 5 Step 1 updates the one existing test that asserted the old list shape; Task 6 updates the frontend consumer. All in the same change.
- **Security-critical ordering:** `_force_manufacturer_id` placement (AFTER parse, BEFORE validate) is explicit in Task 3 Step 1 and verified by `test_portal_equipment_import_force_manufacturer_id` (Task 5 Step 5).
- **Reuse decisions:** P1 (reuse `cable_import` schemas) and D5 (reuse `ImportPreviewTable` + `clientCableImport` types) keep the change DRY.
- **Type consistency:** `list_by_manufacturer` returns `tuple[list, int]` in Task 1 (consumed by portal route) and is not used elsewhere. `validate_rows` returns `list[ValidatedRow]` (Task 2), consumed identically by both portal (Task 3) and admin (Task 4) routes. `build_preview` returns `ImportPreview` (Task 2), matching the `response_model=ImportPreview` on every route. `commit_valid_rows` returns `int` (Task 2), used as `created` in every commit endpoint.
