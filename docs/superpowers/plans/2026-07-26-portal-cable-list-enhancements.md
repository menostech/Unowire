---
change: portal-cable-list-enhancements
design-doc: docs/superpowers/specs/2026-07-26-portal-cable-list-enhancements-design.md
base-ref: 50b6ab913e88db9c82e50c88e13b9f8865a843ab
archived-with: 2026-07-26-portal-cable-list-enhancements
---

# Portal Cable List Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reference design doc:** [`docs/superpowers/specs/2026-07-26-portal-cable-list-enhancements-design.md`](../specs/2026-07-26-portal-cable-list-enhancements-design.md) �?canonical technical design. Section references below (e.g., §3.4) point to that document.

**Goal:** Enhance the portal cable list page (`/portal/cables`) with search, 3-level cascading taxonomy filters, plain-text NAME column with an Edit-button row action, a fixed "Unowire" sidebar brand, and a portal-scoped bulk import workflow (CSV/JSON) that force-binds every imported cable to the authenticated user's `scope_id`.

**Architecture:** Backend reuses the existing admin `app/services/cable_import.py` service (parse �?validate �?preview �?commit) behind a new portal route handler that injects `manufacturer_id = user.scope_id` post-parse, before validation �?security-critical. The frontend reuses the admin `ImportPreviewTable` component and mirrors the admin 3-stage import page. The cable list page becomes a Next.js 15 server component that reads URL `searchParams` and a new `CableListToolbar` client component drives cascading industry �?category �?product_type filters via URL state. All new list query params are optional and backward-compatible; no DB schema changes; no admin-side modifications.

**Tech Stack:** FastAPI + SQLAlchemy async (backend), Next.js 15 (async `searchParams`) + React + TypeScript + Tailwind CSS (frontend), pytest (backend tests), `tsc --noEmit` + `next build` (frontend verification).

## Global Constraints

These apply to every task implicitly:

- All new list-API parameters (`search`, `industry_id`, `category_id`, `product_type_id`) are OPTIONAL and default to `None`; callers that send no params get identical behavior to today (limit=50, scoped to `user.scope_id`).
- No database schema changes �?`Cable.industry_id`, `Cable.category_id`, `Cable.product_type_id` already exist.
- No admin-side modifications (admin cable list and admin import are untouched).
- Reuse `app/services/cable_import.py` AS-IS �?do NOT modify the shared service. Scope enforcement belongs in the route handler, not the service.
- Reuse the admin `ImportPreviewTable` component AS-IS �?it is generic and accepts `ImportPreviewRow[]`.
- Import commit MUST force `manufacturer_id = user.scope_id` on every parsed row AFTER `parse_file` and BEFORE `validate_rows`. This mirrors the existing `POST /api/portal/cables` create-endpoint pattern.
- Import limits: `MAX_ROWS = 500` and file size `5 MB` (reuse existing constants from `cable_import` service).
- Portal cable list limit stays at `50` for MVP (no pagination).
- Search is model-only, case-insensitive partial match (`Cable.model.ilike(f"%{search}%")`).
- English-only UI copy (no i18n).
- Backend test framework: pytest (async). Frontend type-check: `tsc --noEmit`. Frontend build: `next build`.

## Note on `tasks.md` vs. design doc (industry_id alignment)

The original `openspec/changes/portal-cable-list-enhancements/tasks.md` predates the spec patch that added `industry_id` as the top level of the 3-level cascading filter (see design §7, "Spec Patches Applied"). Tasks 1.1, 1.2, 3.1�?.4, 5.4, 5.7, 6.1, 7.1 in `tasks.md` mention only `search`/`category_id`/`product_type_id`. This plan **aligns every one of those tasks with the canonical design doc and delta spec** by also including `industry_id`. Task **numbering is preserved exactly** so checkoff tracking stays consistent; only the task **content** is enhanced to match the design.

## File Structure

### Backend

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/crud/cable.py` | Modify | Extend `list_by_manufacturer` with `search`/`industry_id`/`category_id`/`product_type_id` filters |
| `backend/app/api/routes/portal_cables.py` | Modify | Extend `list_cables` GET handler to accept new query params and pass to CRUD |
| `backend/app/api/routes/portal_cable_import.py` | Create | Portal import routes (validate/commit/csv-template/json-example); forces `manufacturer_id = user.scope_id` |
| `backend/app/main.py` (or router aggregation site) | Modify | Register the new `portal_cable_import` router |
| `backend/tests/api/test_portal_cable_list.py` | Create | pytest suite for extended list endpoint |
| `backend/tests/api/test_portal_cable_import.py` | Create | pytest suite for import endpoints |

### Frontend

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/components/portal/layout/PortalSidebar.tsx` | Modify | Replace `user.role_name \|\| 'Factory Portal'` with fixed "Unowire" + scope-specific subtitle |
| `frontend/app/portal/cables/page.tsx` | Rewrite | Server component: read `searchParams`, fetch cables+taxonomy, render toolbar + table with plain-text NAME and Edit button |
| `frontend/components/portal/cable/CableListToolbar.tsx` | Create | Client component: search box + 3 cascading dropdowns driven by URL state |
| `frontend/app/portal/cables/import/page.tsx` | Create | 3-stage import workflow (upload �?preview �?result) |
| `frontend/app/api/portal/cables/route.ts` | Modify | Add GET handler proxying query params + `portal_token` cookie |
| `frontend/app/api/portal/cables/import/validate/route.ts` | Create | BFF POST proxy for validate |
| `frontend/app/api/portal/cables/import/commit/route.ts` | Create | BFF POST proxy for commit |
| `frontend/app/api/portal/cables/import/csv-template/route.ts` | Create | BFF GET proxy for CSV template |
| `frontend/app/api/portal/cables/import/json-example/route.ts` | Create | BFF GET proxy for JSON example |
| `frontend/lib/portalApi.ts` | Modify | Extend `cables.all()` with optional filter params |
| `frontend/lib/portalApiClient.ts` | Modify | Add `cables.import.{validate,commit,downloadCsvTemplate,downloadJsonExample}` namespace |
| `frontend/lib/types/portal.ts` | Verify/extend | Ensure `TaxonomyIndustry` type exists (used by `CableListToolbar`) |

---

## 1. Backend: Extend portal cable list API

### Task 1.1: Extend `list_by_manufacturer` CRUD with search and taxonomy filters

**Files:**
- Modify: `backend/app/crud/cable.py` (the `list_by_manufacturer` method)

**Informs:** Design §3.4 (Backend List API Extension); delta spec requirement "Portal SHALL allow manufacturers to search and filter cables".

**Acceptance criteria:**
- `list_by_manufacturer` accepts optional `search`, `industry_id`, `category_id`, `product_type_id` keyword args (all default `None`).
- `search` applies `Cable.model.ilike(f"%{search}%")` (case-insensitive partial match).
- `industry_id`/`category_id`/`product_type_id` apply exact-match `==` filters.
- All filters combine with AND logic.
- Existing behavior (no new args) is unchanged �?still scoped by `manufacturer_id == scope_id`, `limit=50`, `order_by(Cable.created_at.desc())`, same `selectinload` options.
- The `scope_id` parameter remains keyword-only and required.

**Interfaces:**
- Produces: `list_by_manufacturer(db, *, scope_id, skip=0, limit=50, search=None, industry_id=None, category_id=None, product_type_id=None) -> list[Cable]`.

- [x] **Step 1: Locate the existing `list_by_manufacturer` method**

Run a search to confirm the current signature and surrounding code:
```
Grep pattern "async def list_by_manufacturer" in backend/app/crud/cable.py
```
Read the existing method to confirm current params (expected: `db, *, scope_id, skip=0, limit=50`) and the existing `selectinload` options used (manufacturer, variants.specs, common_specs).

- [x] **Step 2: Replace the method body with the extended version**

Apply this exact implementation (preserves existing options/order; adds 4 optional filters):

```python
async def list_by_manufacturer(
    self,
    db: AsyncSession,
    *,
    scope_id: str,
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    industry_id: str | None = None,
    category_id: str | None = None,
    product_type_id: str | None = None,
) -> list[Cable]:
    """List cables where manufacturer_id == scope_id. For portal routes."""
    stmt = (
        select(Cable)
        .where(Cable.manufacturer_id == scope_id)
    )
    if search:
        stmt = stmt.where(Cable.model.ilike(f"%{search}%"))
    if industry_id:
        stmt = stmt.where(Cable.industry_id == industry_id)
    if category_id:
        stmt = stmt.where(Cable.category_id == category_id)
    if product_type_id:
        stmt = stmt.where(Cable.product_type_id == product_type_id)
    stmt = (
        stmt.options(
            selectinload(Cable.manufacturer),
            selectinload(Cable.variants).selectinload(CableVariant.specs),
            selectinload(Cable.common_specs),
        )
        .order_by(Cable.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
```

- [x] **Step 3: Confirm `Cable`, `CableVariant`, `selectinload` are already imported**

If any import is missing in `cable.py`, add it. Do not add imports that already exist.

- [x] **Step 4: Run the existing backend test suite to verify no regression**

```
pytest backend/tests/api/test_portal_cables.py -v
```
Expected: all existing tests still PASS (no new params are sent yet, so behavior is unchanged).

- [x] **Step 5: Commit**

```bash
git add backend/app/crud/cable.py
git commit -m "feat(portal): extend list_by_manufacturer with search and taxonomy filters"
```

---

### Task 1.2: Extend `GET /api/portal/cables` route to accept new query params

**Files:**
- Modify: `backend/app/api/routes/portal_cables.py` (the `list_cables` handler)

**Informs:** Design §3.4 (Backend List API Extension); delta spec scenarios "Search by model keyword", "Filter by industry_id", "Filter by category_id", "Filter by product_type_id", "Combine search and all three taxonomy filters".

**Acceptance criteria:**
- `GET /api/portal/cables` accepts optional `search`, `industry_id`, `category_id`, `product_type_id` query string params (all default `None`).
- All four are forwarded to `crud_cable.list_by_manufacturer`.
- Existing params (`skip`, `limit`) and the `require_factory_module("cables")` dependency are preserved unchanged.
- Backward-compatible: a request with no new params returns the same response as before.

**Interfaces:**
- Consumes: `list_by_manufacturer` from Task 1.1.
- Produces: HTTP `GET /api/portal/cables?search=&industry_id=&category_id=&product_type_id=&skip=&limit=` returning `list[CableRead]`.

- [x] **Step 1: Locate the existing `list_cables` handler**

```
Grep pattern "async def list_cables" in backend/app/api/routes/portal_cables.py
```
Read the handler to confirm current signature (`skip`, `limit`, `user`, `db`) and the existing `crud_cable.list_by_manufacturer` call.

- [x] **Step 2: Replace the handler with the extended version**

```python
@router.get("", response_model=list[CableRead])
async def list_cables(
    user: User = Depends(require_factory_module("cables")),
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    industry_id: str | None = None,
    category_id: str | None = None,
    product_type_id: str | None = None,
):
    cables = await crud_cable.list_by_manufacturer(
        db,
        scope_id=user.scope_id,
        skip=skip,
        limit=limit,
        search=search,
        industry_id=industry_id,
        category_id=category_id,
        product_type_id=product_type_id,
    )
    return cables
```

Preserve the existing route decorator (path, response_model, tags) and any existing imports.

- [x] **Step 3: Run existing tests to verify no regression**

```
pytest backend/tests/api/test_portal_cables.py -v
```
Expected: existing tests still PASS.

- [x] **Step 4: Commit**

```bash
git add backend/app/api/routes/portal_cables.py
git commit -m "feat(portal): accept search and taxonomy filter params on GET /api/portal/cables"
```

---

### Task 1.3: Verify backward compatibility

**Files:**
- No file changes �?verification only. (Covered by test 3.4.)

**Informs:** Design §3.4 ("Backward compatibility: All new params default to `None`. Existing callers (no params) get the same behavior.") and §5 error-handling row "Invalid query param type (e.g., `?category_id=` empty) �?Treated as `None`".

**Acceptance criteria:**
- A GET request with no query params returns up to 50 scoped cables (unchanged behavior).
- A GET request with empty values (e.g., `?category_id=`) is treated as `None` (no filter applied) �?FastAPI parses empty string as `""`, so confirm the CRUD truthiness check (`if category_id:`) correctly skips empty strings.
- A GET request with only `skip`/`limit` behaves as before.

- [x] **Step 1: Confirm the CRUD truthiness guards**

In `backend/app/crud/cable.py`, the `if search:` / `if industry_id:` / `if category_id:` / `if product_type_id:` checks treat empty string as falsy, so empty values do not apply a filter. Verify this by reading the code.

- [x] **Step 2: Defer formal verification to Task 3.4**

The no-params backward-compat scenario is formally tested in Task 3.4 (`test_no_params_backward_compat`). Do not write a separate test here �?that would duplicate 3.4.

- [x] **Step 3: Mark this task complete when Task 3.4 passes**

Task 1.3 is a verification gate, not a code task. It is "complete" when Task 3.4's test passes.

---

## 2. Backend: Portal cable import API

### Task 2.1: Create `portal_cable_import.py` with validate and commit endpoints

**Files:**
- Create: `backend/app/api/routes/portal_cable_import.py`

**Informs:** Design §3.5 (Portal Import Routes); delta spec requirement "Portal SHALL allow manufacturers to bulk import cables".

**Acceptance criteria:**
- New module defines an `APIRouter` with prefix `/api/portal/cables/import` and tag `portal-cable-import`.
- `POST /api/portal/cables/import/validate` accepts `file: UploadFile` and `format: Literal["csv","json"] = Form(...)`, returns `ImportPreview`, never persists.
- `POST /api/portal/cables/import/commit` accepts the same inputs, returns `ImportResult`, persists valid rows via `commit_valid_rows`.
- Both endpoints depend on `require_factory_module("cables")` and `get_db`.
- Both endpoints enforce `MAX_ROWS` (reject > 500 rows with HTTP 400).
- Both endpoints call `_force_manufacturer_id(parsed, str(user.scope_id))` AFTER `parse_file` and BEFORE `validate_rows`.
- Reuses `parse_file`, `validate_rows`, `build_preview`, `commit_valid_rows`, `MAX_ROWS` from `app.services.cable_import` �?does NOT modify that service.

**Interfaces:**
- Consumes: `parse_file`, `validate_rows`, `build_preview`, `commit_valid_rows`, `MAX_ROWS` from `app.services.cable_import`; `ImportPreview`, `ImportResult` from `app.schemas.cable_import`; `require_factory_module` from `app.api.deps`; `User` from `app.models.user`; `get_db` from `app.core.database`.
- Produces: HTTP endpoints `POST /api/portal/cables/import/validate` and `POST /api/portal/cables/import/commit`.

- [x] **Step 1: Confirm the imports exist**

```
Grep pattern "MAX_ROWS" in backend/app/services/cable_import.py
Grep pattern "class ImportPreview" in backend/app/schemas/cable_import.py
Grep pattern "def require_factory_module" in backend/app/api/deps.py
```
Confirm `MAX_ROWS`, `parse_file`, `validate_rows`, `build_preview`, `commit_valid_rows`, `ImportPreview`, `ImportResult`, `require_factory_module` all exist with the expected names. If any name differs, adjust the import to match the real name (do not rename the source).

- [x] **Step 2: Create the new route module**

Write `backend/app/api/routes/portal_cable_import.py` with this exact content:

```python
"""Portal cable import routes. Scope-forced: manufacturer_id = user.scope_id."""
from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.models.user import User
from app.schemas.cable_import import ImportPreview, ImportResult
from app.services.cable_import import (
    MAX_ROWS,
    build_preview,
    commit_valid_rows,
    parse_file,
    validate_rows,
)

router = APIRouter(prefix="/api/portal/cables/import", tags=["portal-cable-import"])


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
    user: User = Depends(require_factory_module("cables")),
):
    content = await file.read()
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")

    # SECURITY: force manufacturer_id to user's scope, ignoring client input
    scope_id = str(user.scope_id)
    _force_manufacturer_id(parsed, scope_id)

    validated = await validate_rows(db, parsed)
    return build_preview(validated, format)


@router.post("/commit", response_model=ImportResult)
async def portal_commit_import(
    file: UploadFile,
    format: Literal["csv", "json"] = Form(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("cables")),
):
    content = await file.read()
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")

    # SECURITY: force manufacturer_id to user's scope, ignoring client input
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
        raise HTTPException(
            status_code=500,
            detail=f"Transaction failed: {str(e)}",
        )
```

- [x] **Step 3: Verify the module imports cleanly**

```
python -c "from app.api.routes.portal_cable_import import router; print(len(router.routes))"
```
Expected: prints `2` (the validate and commit routes; the template/example GET routes are added in Tasks 2.3-equivalent �?see below).

- [x] **Step 4: Commit**

```bash
git add backend/app/api/routes/portal_cable_import.py
git commit -m "feat(portal): add scope-forced cable import validate/commit endpoints"
```

---

### Task 2.2: Force `manufacturer_id = user.scope_id` on every parsed row (security gate)

**Files:**
- No additional file changes �?implemented inside Task 2.1's `_force_manufacturer_id` helper. This task is a security-review gate, not a separate code change.

**Informs:** Design §3.5 ("Security analysis") and §8 Risk table row "Import file contains arbitrary `manufacturer_id`"; delta spec scenario "Import forces manufacturer_id from user scope".

**Acceptance criteria:**
- `_force_manufacturer_id` is called in BOTH `/validate` and `/commit` AFTER `parse_file` and BEFORE `validate_rows`.
- The helper iterates every parsed row and sets `row.data["manufacturer_id"] = scope_id`, overwriting any client-supplied value.
- `scope_id` is `str(user.scope_id)` �?never read from the file.
- This pattern matches the existing `POST /api/portal/cables` create-endpoint scope-enforcement pattern (see design §3.5 last bullet).

- [x] **Step 1: Re-read the two route handlers in `portal_cable_import.py`**

Confirm both `portal_validate_import` and `portal_commit_import` contain this exact sequence:
1. `content = await file.read()`
2. `parsed = parse_file(content, format)`
3. `MAX_ROWS` check
4. `scope_id = str(user.scope_id)`
5. `_force_manufacturer_id(parsed, scope_id)`
6. `validated = await validate_rows(db, parsed)`

The order is critical: forcing MUST happen after parse (rows exist) and before validate (FK checks run against the forced value).

- [x] **Step 2: Confirm `_force_manufacturer_id` overwrites the key**

The helper sets `row.data["manufacturer_id"] = scope_id` (assignment, not conditional). Any pre-existing `manufacturer_id` in `row.data` is overwritten.

- [x] **Step 3: Mark complete**

This task is "complete" once Task 2.1 lands the code and Task 3.7 (`test_import_forces_manufacturer_id`) passes.

---

### Task 2.3: Reuse `app/services/cable_import.py` for parse/validate/preview/commit

**Files:**
- No file changes �?verification that the new route module imports and uses the shared service unchanged.

**Informs:** Design §3.5 ("Router registration" / "Security analysis") and open-phase design D1 ("Reuse admin cable_import service with portal-scoped wrapper").

**Acceptance criteria:**
- `portal_cable_import.py` imports `parse_file`, `validate_rows`, `build_preview`, `commit_valid_rows`, `MAX_ROWS` from `app.services.cable_import`.
- The shared service file `app/services/cable_import.py` is NOT modified.
- The portal route handler is the ONLY place scope enforcement happens.

- [x] **Step 1: Verify `app/services/cable_import.py` is unchanged**

```
git diff backend/app/services/cable_import.py
```
Expected: empty (no modifications).

- [x] **Step 2: Confirm imports in `portal_cable_import.py` match the service's actual exports**

If the service uses different function names (e.g., `parse_upload` instead of `parse_file`), adjust the import in `portal_cable_import.py` �?never rename the service.

---

### Task 2.4: Enforce `MAX_ROWS=500` and 5MB file size limits

**Files:**
- No file changes for `MAX_ROWS` (already enforced in Task 2.1's route handlers). The 5MB file-size limit is enforced by the shared `parse_file` service �?confirm it is in place; do not add a duplicate check.

**Informs:** Design §5 error-handling table ("> 5MB �?`parse_file` raises `HTTPException(413, "File too large")`"; "> 500 rows �?`parse_file` raises `HTTPException(400, "Too many rows")`") and §8 risk-mitigation row "Large import files could block event loop".

**Acceptance criteria:**
- `MAX_ROWS` check in both route handlers raises `HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")` when `len(parsed) > MAX_ROWS`.
- `MAX_ROWS` value comes from the imported constant (not a hard-coded literal), so changes to the service constant propagate.
- File-size enforcement is delegated to `parse_file` (the shared service already raises `HTTPException(413)` for >5MB).

- [x] **Step 1: Confirm `MAX_ROWS` is imported, not hard-coded**

In `portal_cable_import.py`, both `MAX_ROWS` references should resolve to the imported constant. Grep for `MAX_ROWS` and confirm each usage.

- [x] **Step 2: Confirm `parse_file` raises 413 for oversized files**

```
Grep pattern "413" in backend/app/services/cable_import.py
```
Expected: at least one match in the size-check code path.

- [x] **Step 3: Defer formal verification to Tasks 3.8**

Row-limit and size-limit behaviors are formally tested in Task 3.8. Mark Task 2.4 complete when 3.8 passes.

---

### Task 2.5: Register the new router in `app/main.py` (or router aggregation site)

**Files:**
- Modify: `backend/app/main.py` (or wherever portal routers are aggregated �?search first).

**Informs:** Design §3.5 ("Router registration").

**Acceptance criteria:**
- `portal_cable_import_router` is imported and included on the FastAPI app.
- The new routes appear in the OpenAPI schema at `/docs`.

**Interfaces:**
- Consumes: `router` from `app.api.routes.portal_cable_import`.

- [x] **Step 1: Find where existing portal routers are registered**

```
Grep pattern "portal_cables" in backend/app/main.py
```
If not found there, search the routes aggregation file:
```
Grep pattern "include_router" in backend/app
```
Identify the file that calls `app.include_router(portal_cables_router)` (or equivalent).

- [x] **Step 2: Add the import and registration**

In the same file where other portal routers are included, add:

```python
from app.api.routes.portal_cable_import import router as portal_cable_import_router
```

And alongside the other `include_router` calls:

```python
app.include_router(portal_cable_import_router)
```

Match the existing import/registration style (e.g., if the file uses `from app.api.routes.portal_cables import router as portal_cables_router`, mirror that).

- [x] **Step 3: Verify the routes are registered**

Start the backend (or run a quick ASGI check) and confirm `/api/portal/cables/import/validate` and `/api/portal/cables/import/commit` appear in `GET /openapi.json` paths.

- [x] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(portal): register portal_cable_import router"
```

---

## 3. Backend tests

All tests live in two new files. Reuse the existing portal test fixtures (manufacturer user, `equipment_manufacturer` user, scoped cables, async db session). Mirror the structure of `backend/tests/api/test_portal_cables.py` and any existing admin import tests at `backend/tests/api/test_admin_cable_import.py` (or similar).

### Task 3.1: Test `GET /api/portal/cables?search=keyword` (case-insensitive, scoped, no-match empty)

**Files:**
- Create: `backend/tests/api/test_portal_cable_list.py`

**Informs:** Design §6.1 (`test_search_by_model_keyword`, `test_search_no_matches_returns_empty`, `test_search_scoped_to_manufacturer`); delta spec scenarios "Search by model keyword", "Search with no matches returns empty list".

**Acceptance criteria:**
- `?search=AWG` returns only cables whose `model` contains "AWG" (case-insensitive) and belong to the user's `scope_id`.
- `?search=nonexistent_keyword_xyz` returns `200 OK` with `[]`.
- `?search=awg` (lowercase) matches cables with `model` containing "AWG" (case-insensitive).
- Cables from a different manufacturer are NEVER returned, even if they match the search.

**Interfaces:**
- Consumes: `GET /api/portal/cables` (Tasks 1.1 + 1.2).

- [x] **Step 1: Create the test file with a search test**

Write three test functions in `backend/tests/api/test_portal_cable_list.py`:

```python
async def test_search_by_model_keyword(client, manufacturer_user_token, scoped_cables):
    # scoped_cables fixture creates cables with models "AWG-100", "AWG-200", "HDMI-1"
    res = await client.get(
        "/api/portal/cables?search=AWG",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
    )
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 2
    assert all("AWG" in c["model"] for c in items)


async def test_search_is_case_insensitive(client, manufacturer_user_token, scoped_cables):
    res = await client.get(
        "/api/portal/cables?search=awg",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
    )
    assert res.status_code == 200
    assert len(res.json()) == 2


async def test_search_no_matches_returns_empty(client, manufacturer_user_token, scoped_cables):
    res = await client.get(
        "/api/portal/cables?search=NONEXISTENT_KEYWORD_XYZ",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
    )
    assert res.status_code == 200
    assert res.json() == []


async def test_search_scoped_to_manufacturer(client, manufacturer_user_token, other_manufacturer_cables):
    # other_manufacturer_cables fixture creates cables with model "AWG-999" owned by a different scope
    res = await client.get(
        "/api/portal/cables?search=AWG",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
    )
    assert res.status_code == 200
    models = [c["model"] for c in res.json()]
    assert "AWG-999" not in models
```

(Adjust fixture names to match what already exists in the portal test conftest. If `scoped_cables`/`other_manufacturer_cables` do not exist, create them in the test file or in `backend/tests/api/conftest.py`.)

- [x] **Step 2: Run the new tests �?they should PASS**

```
pytest backend/tests/api/test_portal_cable_list.py::test_search_by_model_keyword -v
pytest backend/tests/api/test_portal_cable_list.py::test_search_is_case_insensitive -v
pytest backend/tests/api/test_portal_cable_list.py::test_search_no_matches_returns_empty -v
pytest backend/tests/api/test_portal_cable_list.py::test_search_scoped_to_manufacturer -v
```
Expected: all 4 PASS.

- [x] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cable_list.py
git commit -m "test(portal): search by model keyword (case-insensitive, scoped)"
```

---

### Task 3.2: Test `?industry_id=`, `?category_id=`, `?product_type_id=` filters

**Files:**
- Modify: `backend/tests/api/test_portal_cable_list.py` (append tests)

**Informs:** Design §6.1 (`test_filter_by_industry_id`, `test_filter_by_category_id`, `test_filter_by_product_type_id`); delta spec scenarios "Filter by industry_id", "Filter by category_id", "Filter by product_type_id".

**Acceptance criteria:**
- `?industry_id=X` returns only cables with `industry_id == X`, scoped to user.
- `?category_id=Y` returns only cables with `category_id == Y`, scoped to user.
- `?product_type_id=Z` returns only cables with `product_type_id == Z`, scoped to user.
- Filters use exact match (not partial).

- [x] **Step 1: Append three filter tests**

```python
async def test_filter_by_industry_id(client, manufacturer_user_token, scoped_cables):
    res = await client.get(
        "/api/portal/cables?industry_id=consumer_electronics",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
    )
    assert res.status_code == 200
    assert all(c["industry_id"] == "consumer_electronics" for c in res.json())


async def test_filter_by_category_id(client, manufacturer_user_token, scoped_cables):
    target_category = scoped_cables[0].category_id
    res = await client.get(
        f"/api/portal/cables?category_id={target_category}",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
    )
    assert res.status_code == 200
    assert all(c["category_id"] == target_category for c in res.json())


async def test_filter_by_product_type_id(client, manufacturer_user_token, scoped_cables):
    target_pt = scoped_cables[0].product_type_id
    res = await client.get(
        f"/api/portal/cables?product_type_id={target_pt}",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
    )
    assert res.status_code == 200
    assert all(c["product_type_id"] == target_pt for c in res.json())
```

- [x] **Step 2: Run the tests �?they should PASS**

```
pytest backend/tests/api/test_portal_cable_list.py::test_filter_by_industry_id -v
pytest backend/tests/api/test_portal_cable_list.py::test_filter_by_category_id -v
pytest backend/tests/api/test_portal_cable_list.py::test_filter_by_product_type_id -v
```

- [x] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cable_list.py
git commit -m "test(portal): industry/category/product_type filter scenarios"
```

---

### Task 3.3: Test combined `?search=&industry_id=&category_id=&product_type_id=` AND logic

**Files:**
- Modify: `backend/tests/api/test_portal_cable_list.py` (append test)

**Informs:** Design §6.1 (`test_combine_search_and_filters`); delta spec scenario "Combine search and all three taxonomy filters".

**Acceptance criteria:**
- A request with all four params returns only cables matching ALL conditions.
- Fewer results than any single filter alone (AND, not OR).

- [x] **Step 1: Append the combined-filter test**

```python
async def test_combine_search_and_all_taxonomy_filters(client, manufacturer_user_token, scoped_cables):
    target = scoped_cables[0]
    res = await client.get(
        f"/api/portal/cables?search={target.model}&industry_id={target.industry_id}"
        f"&category_id={target.category_id}&product_type_id={target.product_type_id}",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
    )
    assert res.status_code == 200
    items = res.json()
    assert all(c["industry_id"] == target.industry_id for c in items)
    assert all(c["category_id"] == target.category_id for c in items)
    assert all(c["product_type_id"] == target.product_type_id for c in items)
    assert all(target.model in c["model"] for c in items)
```

- [x] **Step 2: Run �?should PASS**

```
pytest backend/tests/api/test_portal_cable_list.py::test_combine_search_and_all_taxonomy_filters -v
```

- [x] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cable_list.py
git commit -m "test(portal): combined search + taxonomy filters AND logic"
```

---

### Task 3.4: Test no-params backward compatibility

**Files:**
- Modify: `backend/tests/api/test_portal_cable_list.py` (append test)

**Informs:** Design §6.1 (`test_no_params_backward_compat`); delta spec scenario "No parameters returns all scoped cables".

**Acceptance criteria:**
- A GET with no query params returns up to 50 cables for the user's scope.
- Response is sorted by `created_at` descending.
- Does not leak cables from other manufacturers.

- [x] **Step 1: Append the backward-compat test**

```python
async def test_no_params_backward_compat(client, manufacturer_user_token, scoped_cables, other_manufacturer_cables):
    res = await client.get(
        "/api/portal/cables",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
    )
    assert res.status_code == 200
    items = res.json()
    assert len(items) <= 50
    # All returned cables belong to the user's scope
    user_scope_id = scoped_cables[0].manufacturer_id
    assert all(c["manufacturer_id"] == user_scope_id for c in items)
    # No leak from other manufacturer
    other_models = {c.model for c in other_manufacturer_cables}
    assert not any(c["model"] in other_models for c in items)
    # Sorted by created_at desc
    created = [c["created_at"] for c in items]
    assert created == sorted(created, reverse=True)
```

- [x] **Step 2: Run �?should PASS**

```
pytest backend/tests/api/test_portal_cable_list.py::test_no_params_backward_compat -v
```
This passing also satisfies the verification gate for Task 1.3.

- [x] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cable_list.py
git commit -m "test(portal): no-params backward compatibility"
```

---

### Task 3.5: Test `POST /api/portal/cables/import/validate` (CSV) returns preview, no persistence

**Files:**
- Create: `backend/tests/api/test_portal_cable_import.py`

**Informs:** Design §6.1 (`test_validate_csv_returns_preview`); delta spec scenario "Validate CSV file returns preview".

**Acceptance criteria:**
- POST with a valid CSV (format=csv) returns `200 OK` with `ImportPreview` shape (valid_count, skipped_count, error_count, and rows/errors).
- No cables are persisted (cable count unchanged after the call).
- Invalid rows appear in the preview as skipped/error.

**Interfaces:**
- Consumes: `POST /api/portal/cables/import/validate` (Task 2.1).

- [x] **Step 1: Create the import test file with a CSV validate test**

```python
import io

async def test_validate_csv_returns_preview(client, manufacturer_user_token, db_session):
    csv_content = (
        "id,model,slug,manufacturer_id,industry_id,category_id,product_type_id,size_system\n"
        "c1,Model-A,model-a,00000000-0000-0000-0000-000000000000,consumer_electronics,cat-a,pt-a,none\n"
        "c2,Model-B,model-b,00000000-0000-0000-0000-000000000000,consumer_electronics,cat-a,pt-a,none\n"
    )
    before_count = await db_session.scalar("SELECT COUNT(*) FROM cables")
    res = await client.post(
        "/api/portal/cables/import/validate",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
        files={"file": ("cables.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code == 200
    preview = res.json()
    assert "valid_count" in preview
    assert "skipped_count" in preview
    assert "error_count" in preview
    after_count = await db_session.scalar("SELECT COUNT(*) FROM cables")
    assert after_count == before_count  # no persistence
```

(Adjust the SQL execution to match the project's async db helper �?e.g., `await db.execute(text(...))` if the project uses SQLAlchemy 2.0 text queries.)

- [x] **Step 2: Run �?should PASS**

```
pytest backend/tests/api/test_portal_cable_import.py::test_validate_csv_returns_preview -v
```

- [x] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cable_import.py
git commit -m "test(portal): import validate CSV returns preview without persistence"
```

---

### Task 3.6: Test `POST /api/portal/cables/import/commit` (CSV) creates cables with forced `manufacturer_id`

**Files:**
- Modify: `backend/tests/api/test_portal_cable_import.py` (append test)

**Informs:** Design §6.1 (`test_commit_csv_creates_cables`); delta spec scenario "Commit CSV file creates cables".

**Acceptance criteria:**
- POST with a valid CSV returns `ImportResult` with `created_count > 0`.
- Cables are persisted in the DB.
- All created cables have `manufacturer_id == user.scope_id`.

- [x] **Step 1: Append the CSV commit test**

```python
async def test_commit_csv_creates_cables(client, manufacturer_user_token, db_session, manufacturer_user):
    csv_content = (
        "id,model,slug,manufacturer_id,industry_id,category_id,product_type_id,size_system\n"
        f"c1,Model-A,model-a,00000000-0000-0000-0000-000000000000,consumer_electronics,cat-a,pt-a,none\n"
        f"c2,Model-B,model-b,00000000-0000-0000-0000-000000000000,consumer_electronics,cat-a,pt-a,none\n"
    )
    res = await client.post(
        "/api/portal/cables/import/commit",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
        files={"file": ("cables.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code == 200
    result = res.json()
    assert result["created_count"] == 2
    assert result["skipped_count"] == 0

    # Verify persisted
    rows = await db_session.execute(text("SELECT manufacturer_id FROM cables WHERE id IN ('c1','c2')"))
    for (mid,) in rows:
        assert str(mid) == str(manufacturer_user.scope_id)
```

- [x] **Step 2: Run �?should PASS**

```
pytest backend/tests/api/test_portal_cable_import.py::test_commit_csv_creates_cables -v
```

- [x] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cable_import.py
git commit -m "test(portal): import commit CSV creates scoped cables"
```

---

### Task 3.7: Test import forces `manufacturer_id` from user scope (ignores file value)

**Files:**
- Modify: `backend/tests/api/test_portal_cable_import.py` (append test)

**Informs:** Design §6.1 (`test_import_forces_manufacturer_id`); delta spec scenario "Import forces manufacturer_id from user scope"; design §8 risk row.

**Acceptance criteria:**
- A CSV whose `manufacturer_id` column contains a DIFFERENT manufacturer's ID still produces cables with `manufacturer_id == user.scope_id`.
- This proves the security gate (`_force_manufacturer_id`) works.

- [x] **Step 1: Append the forced-scope test**

```python
async def test_import_forces_manufacturer_id(client, manufacturer_user_token, db_session, manufacturer_user, other_manufacturer):
    # File claims cables belong to a DIFFERENT manufacturer
    csv_content = (
        "id,model,slug,manufacturer_id,industry_id,category_id,product_type_id,size_system\n"
        f"c-evil,Model-Evil,model-evil,{other_manufacturer.id},consumer_electronics,cat-a,pt-a,none\n"
    )
    res = await client.post(
        "/api/portal/cables/import/commit",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
        files={"file": ("evil.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code == 200
    assert res.json()["created_count"] == 1

    rows = await db_session.execute(text("SELECT manufacturer_id FROM cables WHERE id = 'c-evil'"))
    (mid,) = rows.one()
    assert str(mid) == str(manufacturer_user.scope_id)
    assert str(mid) != str(other_manufacturer.id)
```

- [x] **Step 2: Run �?should PASS**

```
pytest backend/tests/api/test_portal_cable_import.py::test_import_forces_manufacturer_id -v
```
This passing also satisfies the verification gate for Task 2.2.

- [x] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cable_import.py
git commit -m "test(portal): import forces manufacturer_id from user scope (security)"
```

---

### Task 3.8: Test import rejects >500 rows and >5MB file

**Files:**
- Modify: `backend/tests/api/test_portal_cable_import.py` (append tests)

**Informs:** Design §6.1 (`test_import_rejects_too_many_rows`, `test_import_rejects_oversized_file`); delta spec scenarios "Import rejects file exceeding row limit", "Import rejects file exceeding size limit".

**Acceptance criteria:**
- A CSV with 501 rows returns 400 (per Task 2.1's `HTTPException(400)`); the spec allows 422 �?accept either 400 or 422 as a pass.
- A file >5MB returns 413 (or 422 per spec's "413 or 422" allowance).

- [x] **Step 1: Append the row-limit and size-limit tests**

```python
async def test_import_rejects_too_many_rows(client, manufacturer_user_token):
    header = "id,model,slug,manufacturer_id,industry_id,category_id,product_type_id,size_system\n"
    rows = "\n".join(
        f"r{i},Model-{i},model-{i},00000000-0000-0000-0000-000000000000,consumer_electronics,cat-a,pt-a,none"
        for i in range(501)
    )
    csv_content = (header + rows).encode()
    res = await client.post(
        "/api/portal/cables/import/validate",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
        files={"file": ("big.csv", io.BytesIO(csv_content), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code in (400, 422)


async def test_import_rejects_oversized_file(client, manufacturer_user_token):
    # 6 MB of filler
    big_content = b"x" * (6 * 1024 * 1024)
    res = await client.post(
        "/api/portal/cables/import/validate",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
        files={"file": ("huge.csv", io.BytesIO(big_content), "text/csv")},
        data={"format": "csv"},
    )
    assert res.status_code in (400, 413, 422)
```

- [x] **Step 2: Run �?should PASS**

```
pytest backend/tests/api/test_portal_cable_import.py::test_import_rejects_too_many_rows -v
pytest backend/tests/api/test_portal_cable_import.py::test_import_rejects_oversized_file -v
```
This passing also satisfies the verification gate for Task 2.4.

- [x] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cable_import.py
git commit -m "test(portal): import rejects oversized files (>500 rows, >5MB)"
```

---

### Task 3.9: Test `equipment_manufacturer` user gets 403 on import endpoints

**Files:**
- Modify: `backend/tests/api/test_portal_cable_import.py` (append test)

**Informs:** Design §6.1 (`test_equipment_manufacturer_forbidden`); delta spec scenario "Non-manufacturer user cannot import"; design §5 error-handling row.

**Acceptance criteria:**
- An `equipment_manufacturer` user (scope_type=equipment_manufacturer) POSTing to `/import/validate` gets 403.
- Same for `/import/commit`.
- The 403 comes from `require_factory_module("cables")` rejecting the equipment scope.

- [x] **Step 1: Append the forbidden test**

```python
async def test_equipment_manufacturer_forbidden(client, equipment_manufacturer_user_token):
    csv_content = (
        "id,model,slug,manufacturer_id,industry_id,category_id,product_type_id,size_system\n"
        "c1,Model-A,model-a,00000000-0000-0000-0000-000000000000,consumer_electronics,cat-a,pt-a,none\n"
    )
    for path in ("/api/portal/cables/import/validate", "/api/portal/cables/import/commit"):
        res = await client.post(
            path,
            headers={"Authorization": f"Bearer {equipment_manufacturer_user_token}"},
            files={"file": ("c.csv", io.BytesIO(csv_content.encode()), "text/csv")},
            data={"format": "csv"},
        )
        assert res.status_code == 403, f"{path} did not return 403"
```

- [x] **Step 2: Run �?should PASS**

```
pytest backend/tests/api/test_portal_cable_import.py::test_equipment_manufacturer_forbidden -v
```

- [x] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cable_import.py
git commit -m "test(portal): equipment_manufacturer gets 403 on import endpoints"
```

---

### Task 3.10: Test JSON format import (validate + commit) with nested structures

**Files:**
- Modify: `backend/tests/api/test_portal_cable_import.py` (append tests)

**Informs:** Design §6.1 (`test_validate_json_returns_preview`, `test_commit_json_creates_cables_with_nested_specs`); delta spec scenario "Validate JSON file returns preview".

**Acceptance criteria:**
- POST with `format=json` and a JSON array of cables (with `variants` and `common_specs` nested arrays) returns a preview.
- Commit persists the cable AND its nested variants/common_specs.
- All created entities have `manufacturer_id == user.scope_id`.

- [x] **Step 1: Append the JSON tests**

```python
async def test_validate_json_returns_preview(client, manufacturer_user_token, db_session):
    payload = [
        {
            "id": "j1",
            "model": "JSON-Model-A",
            "slug": "json-model-a",
            "manufacturer_id": "00000000-0000-0000-0000-000000000000",
            "industry_id": "consumer_electronics",
            "category_id": "cat-a",
            "product_type_id": "pt-a",
            "size_system": "none",
            "common_specs": [],
            "variants": [],
        }
    ]
    before = await db_session.scalar(text("SELECT COUNT(*) FROM cables"))
    res = await client.post(
        "/api/portal/cables/import/validate",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
        files={"file": ("cables.json", io.BytesIO(json.dumps(payload).encode()), "application/json")},
        data={"format": "json"},
    )
    assert res.status_code == 200
    preview = res.json()
    assert preview["valid_count"] >= 1
    after = await db_session.scalar(text("SELECT COUNT(*) FROM cables"))
    assert after == before  # no persistence on validate


async def test_commit_json_creates_cables_with_nested_specs(client, manufacturer_user_token, db_session, manufacturer_user):
    payload = [
        {
            "id": "j2",
            "model": "JSON-Model-B",
            "slug": "json-model-b",
            "manufacturer_id": "00000000-0000-0000-0000-000000000000",
            "industry_id": "consumer_electronics",
            "category_id": "cat-a",
            "product_type_id": "pt-a",
            "size_system": "none",
            "common_specs": [{"name": "length", "value": "1m", "unit": "m"}],
            "variants": [
                {"id": "j2-v1", "specifications": [{"name": "color", "value": "black"}]}
            ],
        }
    ]
    res = await client.post(
        "/api/portal/cables/import/commit",
        headers={"Authorization": f"Bearer {manufacturer_user_token}"},
        files={"file": ("cables.json", io.BytesIO(json.dumps(payload).encode()), "application/json")},
        data={"format": "json"},
    )
    assert res.status_code == 200
    assert res.json()["created_count"] == 1

    rows = await db_session.execute(text("SELECT manufacturer_id FROM cables WHERE id = 'j2'"))
    (mid,) = rows.one()
    assert str(mid) == str(manufacturer_user.scope_id)
```

(Adjust the nested-variant `specifications` key name to match the admin JSON schema �?check `app/schemas/cable_import.py` or an existing admin JSON example for the exact key. The admin import service is reused, so the JSON shape is identical to admin's.)

- [x] **Step 2: Run �?should PASS**

```
pytest backend/tests/api/test_portal_cable_import.py::test_validate_json_returns_preview -v
pytest backend/tests/api/test_portal_cable_import.py::test_commit_json_creates_cables_with_nested_specs -v
```

- [x] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cable_import.py
git commit -m "test(portal): JSON import (validate + commit) with nested structures"
```

---

## 4. Frontend: Sidebar brand

### Task 4.1: Update `PortalSidebar.tsx` to show fixed "Unowire" + scope-specific subtitle

**Files:**
- Modify: `frontend/components/portal/layout/PortalSidebar.tsx` (around lines 85�?7 per design §3.1)

**Informs:** Design §3.1 (Sidebar Brand); delta spec requirement "Portal sidebar SHALL display fixed Unowire brand".

**Acceptance criteria:**
- The brand text is the static string `"Unowire"` followed by a subtitle `<span>`.
- Subtitle is `"Cable Portal"` when `user.scope_type === "manufacturer"`.
- Subtitle is `"Equipment Portal"` when `user.scope_type === "equipment_manufacturer"`.
- Subtitle is `""` (no span content) when `scope_type` is null/undefined.
- The dynamic `{user?.role_name || 'Factory Portal'}` expression is removed.
- Visual style matches the admin sidebar's `Unowire <span>Admin</span>` pattern.

**Interfaces:**
- Consumes: `user.scope_type` from the existing portal user object.

- [x] **Step 1: Read the current sidebar brand block**

```
Read frontend/components/portal/layout/PortalSidebar.tsx (around lines 80-95)
```

- [x] **Step 2: Replace the brand block**

Find:
```tsx
<div className="mb-6 px-2 text-lg font-bold tracking-tight">
  {user?.role_name || 'Factory Portal'}
</div>
```

Replace with:
```tsx
<div className="mb-6 px-2 text-lg font-bold tracking-tight">
  Unowire <span className="text-blue-300">{subtitle}</span>
</div>
```

Add a `subtitle` derivation above the JSX (inside the component body, near where `user` is read):
```tsx
const subtitle =
  user?.scope_type === 'manufacturer'
    ? 'Cable Portal'
    : user?.scope_type === 'equipment_manufacturer'
      ? 'Equipment Portal'
      : '';
```

- [x] **Step 3: Type-check**

```
cd frontend && npx tsc --noEmit
```
Expected: no errors. (If `scope_type` is not on the user type, check `frontend/lib/types/portal.ts` �?it should already exist; if not, add `scope_type?: 'manufacturer' | 'equipment_manufacturer' | null` to the user type. Do NOT add unrelated fields.)

- [x] **Step 4: Commit**

```bash
git add frontend/components/portal/layout/PortalSidebar.tsx
git commit -m "feat(portal): show fixed Unowire brand + scope subtitle in sidebar"
```

---

## 5. Frontend: Cable list page enhancements

This section rewrites `frontend/app/portal/cables/page.tsx` to be a Next.js 15 server component that reads async `searchParams`, fetches cables + taxonomy, and renders a new `CableListToolbar` plus a table with plain-text NAME and an Edit button. Tasks 5.1�?.7 are the granular checklist; the implementation is one cohesive rewrite, so commit once at the end.

### Task 5.1: Remove `<Link>` from NAME column; display as plain text

**Files:**
- Modify: `frontend/app/portal/cables/page.tsx`

**Informs:** Design §3.2 (Cable List Page); delta spec requirement "Portal cable list SHALL display Edit button instead of NAME hyperlink", scenario "NAME column is plain text".

**Acceptance criteria:**
- NAME column renders `{cable.model || cable.slug || cable.id}` as plain text (no `<a>`, no `<Link>`, no underline/hover).
- Display priority is `model` �?`slug` �?`id`.

- [x] **Step 1: Locate the current NAME cell in the page**

```
Grep pattern "model" in frontend/app/portal/cables/page.tsx
```
Find the `<Link href={...}>{cable.model ...}</Link>` (or equivalent) wrapping.

- [x] **Step 2: Replace the NAME cell content**

Replace the existing wrapped link with plain text. For example:
```tsx
<td className="px-3 py-2 text-sm text-gray-900">
  {cable.model || cable.slug || cable.id}
</td>
```

(Tasks 5.1�?.7 land together in one commit at the end of section 5; do not commit after each sub-task.)

---

### Task 5.2: Add "Edit" button at end of each row linking to `/portal/cables/{id}`

**Files:**
- Modify: `frontend/app/portal/cables/page.tsx`

**Informs:** Design §3.2; delta spec scenario "Edit button links to detail page".

**Acceptance criteria:**
- Each row has a final cell containing an "Edit" link styled as a button.
- The link's `href` is `/portal/cables/${cable.id}`.
- Uses `next/link` `<Link>`.

- [x] **Step 1: Add an Actions cell to each row**

```tsx
<td className="px-3 py-2 text-right">
  <Link
    href={`/portal/cables/${cable.id}`}
    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
  >
    Edit
  </Link>
</td>
```

Add an `Actions` column header to the table's `<thead>`.

---

### Task 5.3: Add search box component; submit appends `?search=` to URL

**Files:**
- Create: `frontend/components/portal/cable/CableListToolbar.tsx` (the search box lives inside this toolbar �?see Task 5.4 below for the dropdowns; the toolbar is one component)

**Informs:** Design §3.3 (CableListToolbar); delta spec requirement "Portal cable list SHALL provide search by model", scenarios "Search box filters list", "Empty search clears filter".

**Acceptance criteria:**
- The toolbar contains a form with a text input and a "Search" button.
- Submitting the form sets `?search={trimmed value}` in the URL (preserving other params).
- Submitting with an empty input removes the `search` param.
- The input is initialized from the current URL's `search` param.

- [x] **Step 1: Create the toolbar component skeleton with the search form**

See the full toolbar code in Task 5.4 �?the search form is part of it. Do not duplicate the file; create the file once with the search form, then add dropdowns in 5.4/5.5.

---

### Task 5.4: Add industry/category/product-type cascading filter dropdowns

**Files:**
- Modify (or finalize): `frontend/components/portal/cable/CableListToolbar.tsx`

**Informs:** Design §3.3 (CableListToolbar �?full code shown there); delta spec requirement "Portal cable list SHALL provide cascading industry, category, and product-type filter dropdowns" and its 6 scenarios.

> **Note:** `tasks.md` lists 5.4 as "category filter dropdown" and 5.5 as "product-type filter dropdown". Per the design doc and the patched delta spec, this plan consolidates them into a single 3-level cascading toolbar (industry �?category �?product_type). The dropdowns cannot be implemented separately because they share state (category options depend on selected industry; product-type options depend on selected category). Task numbering 5.4 and 5.5 is preserved but the implementation is the single `CableListToolbar` component below.

**Acceptance criteria:**
- Three `<select>` dropdowns: industry, category, product-type.
- Category dropdown is `disabled` when no industry is selected.
- Product-type dropdown is `disabled` when no category is selected.
- Selecting an industry sets `?industry_id=` and CLEARS `category_id` and `product_type_id` from the URL.
- Selecting a category sets `?category_id=` and CLEARS `product_type_id` from the URL.
- Selecting a product type sets `?product_type_id=`.
- Each dropdown has an "All �? empty option that removes the corresponding param (and descendants).
- All options are derived from the `taxonomy` prop (type `TaxonomyIndustry[]`).
- URL is the single source of truth (server component reads from URL).

**Interfaces:**
- Consumes: `taxonomy: TaxonomyIndustry[]` (passed from the page server component, which fetches `/api/taxonomy`).
- Produces: URL state changes via `router.push`.

- [x] **Step 1: Verify the `TaxonomyIndustry` type exists**

```
Grep pattern "TaxonomyIndustry" in frontend/lib/types/portal.ts
```
If absent, define it (and `TaxonomyCategory`, `TaxonomyProductType`) to match the `/api/taxonomy` response shape:
```typescript
export interface TaxonomyProductType { id: string; label: string; }
export interface TaxonomyCategory { id: string; label: string; product_types: TaxonomyProductType[]; }
export interface TaxonomyIndustry { id: string; label: string; categories: TaxonomyCategory[]; }
```
Confirm the actual field names against the `/api/taxonomy` response (it may use `name` instead of `label`, etc.). Adjust to match reality.

- [x] **Step 2: Write the full `CableListToolbar` component**

Create `frontend/components/portal/cable/CableListToolbar.tsx`:

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { TaxonomyIndustry } from '@/lib/types/portal';

interface Props {
  taxonomy: TaxonomyIndustry[];
}

export function CableListToolbar({ taxonomy }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const [search, setSearch] = useState(sp.get('search') ?? '');
  const selectedIndustry = sp.get('industry_id') ?? '';
  const selectedCategory = sp.get('category_id') ?? '';
  const selectedProductType = sp.get('product_type_id') ?? '';

  const industryOptions = taxonomy;
  const categoryOptions = selectedIndustry
    ? taxonomy.find((i) => i.id === selectedIndustry)?.categories ?? []
    : [];
  const productTypeOptions = selectedCategory
    ? categoryOptions.find((c) => c.id === selectedCategory)?.product_types ?? []
    : [];

  function pushParams(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(sp.toString());
    mutator(params);
    for (const key of [...params.keys()]) {
      if (!params.get(key)) params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? `/portal/cables?${qs}` : '/portal/cables');
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    pushParams((p) => p.set('search', search.trim()));
  }

  function handleIndustryChange(value: string) {
    pushParams((p) => {
      if (value) p.set('industry_id', value);
      else p.delete('industry_id');
      p.delete('category_id');
      p.delete('product_type_id');
    });
  }

  function handleCategoryChange(value: string) {
    pushParams((p) => {
      if (value) p.set('category_id', value);
      else p.delete('category_id');
      p.delete('product_type_id');
    });
  }

  function handleProductTypeChange(value: string) {
    pushParams((p) => {
      if (value) p.set('product_type_id', value);
      else p.delete('product_type_id');
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by model�?
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
      </form>

      <select
        value={selectedIndustry}
        onChange={(e) => handleIndustryChange(e.target.value)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">All Industries</option>
        {industryOptions.map((i) => (
          <option key={i.id} value={i.id}>{i.label}</option>
        ))}
      </select>

      <select
        value={selectedCategory}
        onChange={(e) => handleCategoryChange(e.target.value)}
        disabled={!selectedIndustry}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:bg-gray-100"
      >
        <option value="">All Categories</option>
        {categoryOptions.map((c) => (
          <option key={c.id} value={c.id}>{c.label}</option>
        ))}
      </select>

      <select
        value={selectedProductType}
        onChange={(e) => handleProductTypeChange(e.target.value)}
        disabled={!selectedCategory}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:bg-gray-100"
      >
        <option value="">All Product Types</option>
        {productTypeOptions.map((pt) => (
          <option key={pt.id} value={pt.id}>{pt.label}</option>
        ))}
      </select>
    </div>
  );
}
```

This single component satisfies Tasks 5.3, 5.4, and 5.5.

---

### Task 5.5: (Covered by Task 5.4)

Task 5.5 ("Add product-type filter dropdown") is implemented inside the same `CableListToolbar` component as Task 5.4. No separate file or commit. Mark 5.5 complete when 5.4's component is committed.

---

### Task 5.6: Add "Import" button alongside "New Cable" button

**Files:**
- Modify: `frontend/app/portal/cables/page.tsx`

**Informs:** Design §3.2 (Toolbar header with Import + New Cable buttons); delta spec scenario "Import entry point is on cable list page".

**Acceptance criteria:**
- The page header shows two buttons: "Import" (links to `/portal/cables/import`) and "New Cable" (existing link).
- The "Import" button uses `next/link` `<Link>`.

- [x] **Step 1: Add the Import button to the page header**

In the page's header area (next to the existing "New Cable" button), add:
```tsx
<Link
  href="/portal/cables/import"
  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
>
  Import
</Link>
```

---

### Task 5.7: Read URL search params and pass to `portalApi.cables.all()`

**Files:**
- Modify: `frontend/app/portal/cables/page.tsx`

**Informs:** Design §3.2 (Server Component steps 1�?) and §3.7 (API client extensions); delta spec requirement "Portal SHALL allow manufacturers to search and filter cables".

**Acceptance criteria:**
- The page reads `searchParams: Promise<{ search?, industry_id?, category_id?, product_type_id? }>` (Next.js 15 async searchParams �?`await` it).
- Passes the resolved params to `portalApi.cables.all({ search, industry_id, category_id, product_type_id })`.
- Fetches the taxonomy tree from `${API_BASE}/api/taxonomy` for label resolution + filter options.
- Builds `categoryMap` and `productTypeMap` (existing pattern from admin list page) for cell label rendering.
- Renders `<CableListToolbar taxonomy={taxonomy} />` above the table.
- Empty state: when `cables.length === 0`, shows `"No cables found."`.

**Interfaces:**
- Consumes: `portalApi.cables.all(params)` (Task 6.1); `TaxonomyIndustry[]` from `/api/taxonomy`; `<CableListToolbar />` (Task 5.4).

- [x] **Step 1: Rewrite the page server component**

```tsx
import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';
import { CableListToolbar } from '@/components/portal/cable/CableListToolbar';
import type { TaxonomyIndustry } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

interface PageProps {
  searchParams: Promise<{
    search?: string;
    industry_id?: string;
    category_id?: string;
    product_type_id?: string;
  }>;
}

export default async function PortalCablesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [cables, taxonomyRes] = await Promise.all([
    portalApi.cables.all({
      search: params.search,
      industry_id: params.industry_id,
      category_id: params.category_id,
      product_type_id: params.product_type_id,
    }),
    fetch(`${API_BASE}/api/taxonomy`).then((r) => r.json() as Promise<TaxonomyIndustry[]>),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cables</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/portal/cables/import"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Import
          </Link>
          <Link
            href="/portal/cables/new"
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Cable
          </Link>
        </div>
      </div>

      <CableListToolbar taxonomy={taxonomyRes} />

      {cables.length === 0 ? (
        <p className="text-sm text-gray-500">No cables found.</p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Manufacturer</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Category</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Product Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Size System</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Created</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {cables.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 text-sm text-gray-900">{c.model || c.slug || c.id}</td>
                <td className="px-3 py-2 text-sm text-gray-900">{c.manufacturer?.name ?? '�?}</td>
                <td className="px-3 py-2 text-sm text-gray-900">{c.category_id ?? '�?}</td>
                <td className="px-3 py-2 text-sm text-gray-900">{c.product_type_id ?? '�?}</td>
                <td className="px-3 py-2 text-sm text-gray-900">{c.size_system ?? '�?}</td>
                <td className="px-3 py-2 text-sm text-gray-500">{c.created_at ?? '�?}</td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/portal/cables/${c.id}`}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

(Adjust `c.manufacturer?.name` and the field names to match the actual `PortalCable` type. If the project uses a `categoryMap`/`productTypeMap` for label resolution, wire those in for the Category/Product Type cells instead of showing raw IDs �?match the admin list page pattern.)

- [x] **Step 2: Type-check**

```
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [x] **Step 3: Commit (covers Tasks 5.1�?.7)**

```bash
git add frontend/app/portal/cables/page.tsx frontend/components/portal/cable/CableListToolbar.tsx frontend/lib/types/portal.ts
git commit -m "feat(portal): cable list page with plain-text NAME, Edit button, search, cascading filters, import link"
```

---

## 6. Frontend: API client extensions

### Task 6.1: Extend `cables.all()` with optional filter params

**Files:**
- Modify: `frontend/lib/portalApi.ts`

**Informs:** Design §3.7 (API Client Extensions).

**Acceptance criteria:**
- `portalApi.cables.all()` accepts an optional `{ search?, industry_id?, category_id?, product_type_id? }` arg.
- Each truthy param is appended as a query string key.
- Empty/undefined params are not appended.
- The call uses the existing `portalGet` helper.

**Interfaces:**
- Produces: `cables.all(params?) -> Promise<PortalCable[]>` (consumed by Task 5.7).

- [x] **Step 1: Locate the existing `cables.all` method**

```
Grep pattern "cables:" in frontend/lib/portalApi.ts
```

- [x] **Step 2: Replace `cables.all` with the extended version**

```typescript
cables: {
  async all(params?: {
    search?: string;
    industry_id?: string;
    category_id?: string;
    product_type_id?: string;
  }): Promise<PortalCable[]> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.industry_id) qs.set('industry_id', params.industry_id);
    if (params?.category_id) qs.set('category_id', params.category_id);
    if (params?.product_type_id) qs.set('product_type_id', params.product_type_id);
    const suffix = qs.toString() ? `?${qs}` : '';
    return portalGet<PortalCable[]>(`/api/portal/cables${suffix}`);
  },
  // ... existing getById, create, update, remove
},
```

Preserve the other methods in the `cables` namespace.

- [x] **Step 3: Type-check**

```
cd frontend && npx tsc --noEmit
```

---

### Task 6.2: Add `cables.import` namespace (`validate`, `commit`, `downloadCsvTemplate`, `downloadJsonExample`)

**Files:**
- Modify: `frontend/lib/portalApiClient.ts`

**Informs:** Design §3.7 (API Client Extensions �?`portalApiClient.ts`).

**Acceptance criteria:**
- `portalApiClient.cables.import.validate(file, format)` POSTs multipart to `/api/portal/cables/import/validate`, returns `ImportPreview`.
- `portalApiClient.cables.import.commit(file, format)` POSTs multipart to `/api/portal/cables/import/commit`, returns `ImportResult`.
- `portalApiClient.cables.import.downloadCsvTemplate()` GETs `/api/portal/cables/import/csv-template`, returns `Blob`.
- `portalApiClient.cables.import.downloadJsonExample()` GETs `/api/portal/cables/import/json-example`, returns `Blob`.
- All multipart POSTs use `skipDefaultContentType: true` (or equivalent) so the browser sets the multipart boundary.
- Mirrors the admin `clientCableImport.ts` API shape.

**Interfaces:**
- Consumes: `bffFetch` helper (existing in `portalApiClient.ts`).
- Produces: `cables.import.{validate,commit,downloadCsvTemplate,downloadJsonExample}` (consumed by Task 8.x).

- [x] **Step 1: Locate the existing `cables` namespace in `portalApiClient.ts`**

```
Grep pattern "cables:" in frontend/lib/portalApiClient.ts
```
Also confirm the `bffFetch` helper signature �?specifically whether it supports a `skipDefaultContentType` option. If it uses a different option name (e.g., `multipart: true`), use that instead. Mirror the admin `clientCableImport.ts` pattern.

- [x] **Step 2: Add the `import` sub-namespace inside `cables`**

```typescript
cables: {
  // ... existing create/update/remove

  import: {
    async validate(file: File, format: 'csv' | 'json'): Promise<ImportPreview> {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', format);
      const res = await bffFetch('/api/portal/cables/import/validate', {
        method: 'POST',
        body: formData,
        skipDefaultContentType: true,
      });
      return res.json();
    },
    async commit(file: File, format: 'csv' | 'json'): Promise<ImportResult> {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', format);
      const res = await bffFetch('/api/portal/cables/import/commit', {
        method: 'POST',
        body: formData,
        skipDefaultContentType: true,
      });
      return res.json();
    },
    async downloadCsvTemplate(): Promise<Blob> {
      const res = await bffFetch('/api/portal/cables/import/csv-template');
      return res.blob();
    },
    async downloadJsonExample(): Promise<Blob> {
      const res = await bffFetch('/api/portal/cables/import/json-example');
      return res.blob();
    },
  },
},
```

- [x] **Step 3: Ensure `ImportPreview` and `ImportResult` types are imported**

If they are not already imported from `@/lib/types/portal` (or wherever they live), import them. If they do not exist, define them to match the backend `ImportPreview`/`ImportResult` schemas (mirror the admin types in `clientCableImport.ts`).

- [x] **Step 4: Type-check**

```
cd frontend && npx tsc --noEmit
```

- [x] **Step 5: Commit (covers Tasks 6.1 and 6.2)**

```bash
git add frontend/lib/portalApi.ts frontend/lib/portalApiClient.ts
git commit -m "feat(portal): extend cables.all with filters; add cables.import namespace"
```

---

## 7. Frontend: BFF routes

### Task 7.1: Add GET handler to `app/api/portal/cables/route.ts` (proxy query params + `portal_token`)

**Files:**
- Modify: `frontend/app/api/portal/cables/route.ts`

**Informs:** Design §3.6 (BFF Routes �?`route.ts` GET).

**Acceptance criteria:**
- `GET /api/portal/cables` reads the `portal_token` cookie; if missing, returns 401.
- Forwards all query params (`search`, `industry_id`, `category_id`, `product_type_id`, `skip`, `limit`) to `${API_BASE}/api/portal/cables?{qs}`.
- Sets `Authorization: Bearer {token}` on the upstream request.
- Uses `cache: 'no-store'`.
- Returns the upstream JSON and status code.
- The existing `POST` handler is preserved unchanged.

**Interfaces:**
- Produces: BFF `GET /api/portal/cables?...` (consumed by `portalApi.cables.all` via `portalGet`).

- [x] **Step 1: Locate the existing route file**

```
Read frontend/app/api/portal/cables/route.ts
```

- [x] **Step 2: Add the GET handler (preserve the existing POST)**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('portal_token')?.value;
  if (!token) {
    return NextResponse.json({ code: 401, message: 'Unauthorized' }, { status: 401 });
  }
  const searchParams = req.nextUrl.searchParams.toString();
  const url = `${API_BASE}/api/portal/cables${searchParams ? `?${searchParams}` : ''}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

// existing POST handler stays below �?do not modify it
```

- [x] **Step 3: Type-check**

```
cd frontend && npx tsc --noEmit
```

---

### Task 7.2: Create `app/api/portal/cables/import/validate/route.ts` (POST proxy)

**Files:**
- Create: `frontend/app/api/portal/cables/import/validate/route.ts`

**Informs:** Design §3.6 (BFF Routes �?`validate/route.ts`).

**Acceptance criteria:**
- `POST /api/portal/cables/import/validate` reads the `portal_token` cookie; 401 if missing.
- Forwards the multipart `formData` body to `${API_BASE}/api/portal/cables/import/validate` WITHOUT setting `Content-Type` (browser sets the multipart boundary).
- Sets `Authorization: Bearer {token}`.
- Uses `cache: 'no-store'`.
- Returns upstream JSON + status.

- [x] **Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('portal_token')?.value;
  if (!token) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }
  const formData = await request.formData();
  const res = await fetch(`${API_BASE}/api/portal/cables/import/validate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

---

### Task 7.3: Create `app/api/portal/cables/import/commit/route.ts` (POST proxy)

**Files:**
- Create: `frontend/app/api/portal/cables/import/commit/route.ts`

**Informs:** Design §3.6 (BFF Routes �?same pattern as validate).

**Acceptance criteria:**
- Identical to Task 7.2 but targets `${API_BASE}/api/portal/cables/import/commit`.

- [x] **Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('portal_token')?.value;
  if (!token) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }
  const formData = await request.formData();
  const res = await fetch(`${API_BASE}/api/portal/cables/import/commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

---

### Task 7.4: Create `app/api/portal/cables/import/csv-template/route.ts` (GET proxy)

**Files:**
- Create: `frontend/app/api/portal/cables/import/csv-template/route.ts`

**Informs:** Design §3.6 (BFF Routes �?"Same pattern for csv-template, json-example").

**Acceptance criteria:**
- `GET /api/portal/cables/import/csv-template` reads `portal_token`; 401 if missing.
- Forwards to `${API_BASE}/api/portal/cables/import/csv-template` with Bearer token.
- Returns the upstream response body and `Content-Disposition` header (so the browser downloads the file).

- [x] **Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('portal_token')?.value;
  if (!token) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }
  const res = await fetch(`${API_BASE}/api/portal/cables/import/csv-template`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const blob = await res.blob();
  const headers = new Headers();
  headers.set('Content-Type', res.headers.get('Content-Type') ?? 'text/csv');
  const cd = res.headers.get('Content-Disposition');
  if (cd) headers.set('Content-Disposition', cd);
  return new NextResponse(blob, { status: res.status, headers });
}
```

---

### Task 7.5: Create `app/api/portal/cables/import/json-example/route.ts` (GET proxy)

**Files:**
- Create: `frontend/app/api/portal/cables/import/json-example/route.ts`

**Informs:** Design §3.6 (BFF Routes �?same as csv-template, JSON content type).

**Acceptance criteria:**
- Identical to Task 7.4 but targets `${API_BASE}/api/portal/cables/import/json-example` and defaults `Content-Type` to `application/json`.

- [x] **Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('portal_token')?.value;
  if (!token) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }
  const res = await fetch(`${API_BASE}/api/portal/cables/import/json-example`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const blob = await res.blob();
  const headers = new Headers();
  headers.set('Content-Type', res.headers.get('Content-Type') ?? 'application/json');
  const cd = res.headers.get('Content-Disposition');
  if (cd) headers.set('Content-Disposition', cd);
  return new NextResponse(blob, { status: res.status, headers });
}
```

- [x] **Step 2: Type-check (covers Tasks 7.1�?.5)**

```
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit (covers Tasks 7.1�?.5)**

```bash
git add frontend/app/api/portal/cables/route.ts frontend/app/api/portal/cables/import
git commit -m "feat(portal): BFF routes for cable list GET and import (validate/commit/templates)"
```

---

## 8. Frontend: Import page

### Task 8.1: Create `app/portal/cables/import/page.tsx` with 3-stage state machine

**Files:**
- Create: `frontend/app/portal/cables/import/page.tsx`

**Informs:** Design §3.8 (Import Page); delta spec requirement "Portal frontend SHALL provide a bulk-import page with 3-stage workflow".

**Acceptance criteria:**
- Page is a Client Component (`'use client'`).
- Three stages: `upload` �?`preview` �?`result`.
- State machine: `useState<'upload' | 'preview' | 'result'>`.
- Back link �?`/portal/cables`.
- Uses `portalApiClient.cables.import.{validate,commit,downloadCsvTemplate,downloadJsonExample}` (NOT the admin `clientCableImport`).
- Mirrors admin `app/admin/(dashboard)/cables/import/page.tsx` structure.

**Interfaces:**
- Consumes: `portalApiClient.cables.import` (Task 6.2); `<ImportPreviewTable />` from `@/components/admin/cable/ImportPreviewTable` (Task 8.5).

- [x] **Step 1: Read the admin import page for reference**

```
Read frontend/app/admin/(dashboard)/cables/import/page.tsx
```
Mirror its layout, state machine, and UX. Replace admin API calls with `portalApiClient.cables.import.*` calls. Replace `/admin/cables` back-links with `/portal/cables`.

- [x] **Step 2: Create the portal import page**

Skeleton (adapt from admin page):

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portalApiClient } from '@/lib/portalApiClient';
import { ImportPreviewTable } from '@/components/admin/cable/ImportPreviewTable';
import type { ImportPreview, ImportResult } from '@/lib/types/portal';

type Stage = 'upload' | 'preview' | 'result';

export default function PortalCableImportPage() {
  const [stage, setStage] = useState<Stage>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ... handlers: onValidate, onCommit, onDownloadCsvTemplate, onDownloadJsonExample
  //   onValidate: call portalApiClient.cables.import.validate(file, format)
  //                �?setPreview(res); setStage('preview')
  //   onCommit:    call portalApiClient.cables.import.commit(file, format)
  //                �?setResult(res); setStage('result')

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/cables" className="text-sm text-blue-600 hover:underline">
          �?Back to Cable List
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Import Cables</h1>
      </div>

      {stage === 'upload' && <UploadStage ... />}
      {stage === 'preview' && <PreviewStage ... />}
      {stage === 'result' && <ResultStage ... />}
    </div>
  );
}
```

The full implementation (upload/preview/result sub-components) is detailed in Tasks 8.2�?.4.

---

### Task 8.2: Upload stage �?format radio buttons, drag-and-drop, template/example links

**Files:**
- Modify: `frontend/app/portal/cables/import/page.tsx` (upload stage JSX)

**Informs:** Design §3.8 (Upload stage: CSV/JSON radio, drag-and-drop, max 5MB/500 rows, CSV template + JSON example download links); delta spec scenario "Upload stage shows format selection and file drop".

**Acceptance criteria:**
- Radio buttons for `csv` and `json` formats.
- Drag-and-drop file area (or `<input type="file">` �?match admin pattern).
- Client-side file-size pre-check: reject >5MB with an inline error.
- "Download CSV Template" link calls `portalApiClient.cables.import.downloadCsvTemplate()` and triggers a browser download.
- "Download JSON Example" link calls `portalApiClient.cables.import.downloadJsonExample()`.
- "Validate" button is disabled until a file is selected.

- [x] **Step 1: Implement the upload stage**

Build the upload-stage JSX inside the page (or as a sub-component in the same file). Wire the Validate button to call `portalApiClient.cables.import.validate(file, format)` and transition to `preview` on success.

---

### Task 8.3: Preview stage �?show counts and `ImportPreviewTable`

**Files:**
- Modify: `frontend/app/portal/cables/import/page.tsx` (preview stage JSX)

**Informs:** Design §3.8 (Preview stage: show valid/skipped/error counts + `ImportPreviewTable`); delta spec scenario "Validate action shows preview".

**Acceptance criteria:**
- Shows `valid_count`, `skipped_count`, `error_count` from the `ImportPreview` response.
- Renders `<ImportPreviewTable rows={preview.rows} />` (or whatever prop name the admin component expects �?verify before wiring).
- "Commit N valid rows" button is enabled only when `valid_count > 0`.
- "Back" button returns to upload stage.

- [x] **Step 1: Implement the preview stage**

Wire the Commit button to call `portalApiClient.cables.import.commit(file, format)` and transition to `result` on success. The same `file` and `format` from the upload stage are reused (the server re-parses and re-forces `manufacturer_id` �?this is the security design).

---

### Task 8.4: Result stage �?created/skipped counts, error list, "Back to Cable List" link

**Files:**
- Modify: `frontend/app/portal/cables/import/page.tsx` (result stage JSX)

**Informs:** Design §3.8 (Result stage); delta spec scenario "Commit action shows result".

**Acceptance criteria:**
- Shows `created_count` and `skipped_count` from the `ImportResult`.
- Shows any errors from `result.errors`.
- "Back to Cable List" link navigates to `/portal/cables`.

- [x] **Step 1: Implement the result stage**

- [x] **Step 2: Type-check (covers Tasks 8.1�?.5)**

```
cd frontend && npx tsc --noEmit
```

---

### Task 8.5: Reuse admin `ImportPreviewTable` (or create portal wrapper)

**Files:**
- Verify: `frontend/components/admin/cable/ImportPreviewTable.tsx` exists and accepts `ImportPreviewRow[]`.
- (Create a portal wrapper only if the admin component cannot be reused as-is.)

**Informs:** Design §3.8 ("Reuse `ImportPreviewTable` from `@/components/admin/cable/ImportPreviewTable` (generic, takes `ImportPreviewRow[]`)"); design §8 risk-mitigation row "`ImportPreviewTable` incompatible with portal data shape".

**Acceptance criteria:**
- The portal import page imports and renders the admin `ImportPreviewTable` directly.
- The component's prop type matches the `ImportPreview.rows` shape (both admin and portal use the same `ImportPreview` schema from the shared `cable_import` service).
- No new component is created UNLESS the admin component's prop type is incompatible. If incompatible, create a minimal `frontend/components/portal/cable/ImportPreviewTable.tsx` that wraps the same row-rendering logic �?but this should be unnecessary.

- [x] **Step 1: Verify the admin component is reusable**

```
Read frontend/components/admin/cable/ImportPreviewTable.tsx
```
Confirm its props accept `ImportPreviewRow[]` (or the shape returned by `build_preview`). The admin and portal share the same backend service, so the row shape is identical.

- [x] **Step 2: If reusable, import it directly in the portal import page**

```tsx
import { ImportPreviewTable } from '@/components/admin/cable/ImportPreviewTable';
```

- [x] **Step 3: Commit (covers Tasks 8.1�?.5)**

```bash
git add frontend/app/portal/cables/import/page.tsx
git commit -m "feat(portal): 3-stage cable import page reusing admin ImportPreviewTable"
```

---

## 9. Verification

This section validates the WHOLE implementation end-to-end. Run all tasks in order; each task is a gate.

### Task 9.1: Run the backend pytest suite �?all existing + new tests pass

**Informs:** Design §6.1 (backend test strategy) and §6.2 (frontend verification).

- [x] **Step 1: Run the full backend test suite**

```
pytest backend/tests -v
```
Expected: all existing tests PASS and all new tests from Tasks 3.1�?.10 PASS.

- [x] **Step 2: If any test fails, fix the implementation (not the test) and re-run**

Do NOT mark this task complete until the full suite is green.

### Task 9.2: Run frontend `tsc --noEmit` �?no type errors

- [x] **Step 1: Run the TypeScript compiler**

```
cd frontend && npx tsc --noEmit
```
Expected: exits 0 with no output (or only pre-existing warnings unrelated to this change).

### Task 9.3: Run frontend `next build` �?build succeeds with new routes

- [x] **Step 1: Run the Next.js production build**

```
cd frontend && npx next build
```
Expected: build succeeds. Confirm the route manifest includes:
- `/portal/cables` (server component)
- `/portal/cables/import` (client component)
- `/api/portal/cables` (GET + POST)
- `/api/portal/cables/import/validate` (POST)
- `/api/portal/cables/import/commit` (POST)
- `/api/portal/cables/import/csv-template` (GET)
- `/api/portal/cables/import/json-example` (GET)

### Task 9.4: Manual smoke test �?sidebar brand for both scope types

- [x] **Step 1: Log in as a `manufacturer` user**

Expected: sidebar top shows `Unowire Cable Portal` (main brand "Unowire", subtitle "Cable Portal").

- [x] **Step 2: Log in as an `equipment_manufacturer` user**

Expected: sidebar top shows `Unowire Equipment Portal`.

### Task 9.5: Manual smoke test �?cable list search/filter/Edit button

- [x] **Step 1: Navigate to `/portal/cables`**

Expected:
- NAME column is plain text (no underline/hover).
- Each row has an "Edit" button linking to `/portal/cables/{id}`.

- [x] **Step 2: Type "AWG" in the search box and press Enter**

Expected: URL updates to `?search=AWG`, list shows only cables whose `model` contains "AWG" (case-insensitive).

- [x] **Step 3: Clear the search box and submit**

Expected: `?search` removed from URL, list shows all scoped cables.

- [x] **Step 4: Select an industry from the dropdown**

Expected: URL updates to `?industry_id=...`, list filters, category dropdown narrows to categories within that industry.

- [x] **Step 5: Select a category**

Expected: URL updates with `&category_id=...`, list filters further, product-type dropdown narrows.

- [x] **Step 6: Select a product type**

Expected: URL updates with `&product_type_id=...`, list filters further.

- [x] **Step 7: Change the industry to a different industry**

Expected: URL drops `category_id` and `product_type_id`, keeps only the new `industry_id`. Category and product-type dropdowns reset to "All".

- [x] **Step 8: Change the category**

Expected: URL drops `product_type_id`, keeps `industry_id` and the new `category_id`. Product-type dropdown resets to "All".

- [x] **Step 9: Select "All �? in the industry dropdown**

Expected: all three filter params removed from URL, list shows all scoped cables.

### Task 9.6: Manual smoke test �?import workflow (CSV and JSON)

- [x] **Step 1: Click "Import" on `/portal/cables`**

Expected: navigates to `/portal/cables/import`.

- [x] **Step 2: Download the CSV template**

Expected: browser downloads `portal-cable-import-template.csv`. Open it �?the `manufacturer_id` column should be pre-filled with the current user's `scope_id`.

- [x] **Step 3: Fill in 1�? valid rows, save the CSV, upload it, click "Validate"**

Expected: preview stage shows `valid_count >= 1`, `skipped_count`, `error_count`.

- [x] **Step 4: Click "Commit N valid rows"**

Expected: result stage shows `created_count >= 1`, `skipped_count`, and no errors.

- [x] **Step 5: Click "Back to Cable List"**

Expected: navigates to `/portal/cables`, and the newly imported cables appear in the list.

- [x] **Step 6: Repeat Steps 2�? with a JSON file**

Expected: same flow works for JSON, including nested `variants` and `common_specs`.

### Task 9.7: Manual smoke test �?import forces `manufacturer_id` (security)

- [x] **Step 1: Craft a CSV with a `manufacturer_id` column set to a DIFFERENT manufacturer's ID**

(If you do not know another manufacturer's ID, use any non-empty UUID that is not your scope.)

- [x] **Step 2: Upload and commit the file**

Expected: commit succeeds (assuming rows are otherwise valid).

- [x] **Step 3: Inspect the created cables**

Either via the portal cable list (they should appear in YOUR list because they were forced to your scope) or via a DB query:

```sql
SELECT id, model, manufacturer_id FROM cables WHERE id IN ('...');
```

Expected: `manufacturer_id` equals YOUR `scope_id`, NOT the value supplied in the file. This confirms the security gate (`_force_manufacturer_id`) is effective in production, matching the unit test in Task 3.7.
