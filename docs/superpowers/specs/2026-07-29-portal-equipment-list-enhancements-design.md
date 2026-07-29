---
comet_change: portal-equipment-list-enhancements
role: technical-design
canonical_spec: openspec
---

# Design Doc: Portal & Admin Equipment List Enhancements

## 1. Overview

This change brings the portal and admin equipment list pages to feature parity with their cable counterparts by:
1. Updating the portal equipment list UI (plain-text Name, Edit button, Actions column, toolbar, pagination)
2. Adding search and category filtering to the portal equipment list endpoint
3. Adding a free-text search box to the admin equipment list page
4. Adding batch upload (CSV/JSON) with a 3-stage flow (upload, preview, result) on both portal and admin sides
5. Creating a shared `equipment_import` service module used by both portal and admin import routes

The implementation mirrors the proven cable list/import architecture, adapting it to the equipment data model (which has a flat category tree and no variants concept).

## 2. Context

- **OpenSpec change**: `portal-equipment-list-enhancements`
- **Reference patterns**: cable list page, cable import service, cable import routes, cable BFF client
- **No database schema changes** — all features use existing tables and columns
- **No breaking API changes for external consumers** — the portal equipment list endpoint response shape changes from `list[X]` to `PaginatedResponse[X]`, but only the frontend consumes it (updated in the same change)

## 3. Architecture

### 3.1 Backend Component Map

- `crud/equipment.py` [MODIFIED]: `list_by_manufacturer(search, category_id, skip, limit) -> (items, total)`; `get_all_with_relations(q, ...) -> (items, total)` for admin search
- `services/equipment_import.py` [NEW - shared service]: `parse_file`, `validate_rows`, `build_preview`, `commit_valid_rows`
- `schemas/equipment_import.py` [NEW]: `EquipmentImportPreviewRow`, `EquipmentImportPreview`, `EquipmentImportResult`
- `api/routes/portal_equipment.py` [MODIFIED]: add search/category/pagination params
- `api/routes/portal_equipment_import.py` [NEW - self-prefixed `/api/portal/equipment/import`]: POST /validate, POST /commit, GET /csv-template, GET /json-example (all guarded by `require_factory_module("equipment")`)
- `api/routes/equipment.py` [MODIFIED]: add `q` search param to admin list
- `api/routes/equipment_import.py` [NEW - admin validate/commit]: guarded by `require_operator("equipment_list")`
- `api/routes/equipment_import_templates.py` [NEW - admin csv-template/json-example]
- `api/routes/main.py` [MODIFIED]: register new routers

### 3.2 Frontend Component Map

- `app/portal/equipment/page.tsx` [MODIFIED]: searchParams, toolbar, pagination, Import button
- `app/portal/equipment/import/page.tsx` [NEW - 3-stage flow]
- `app/admin/(dashboard)/equipment/page.tsx` [MODIFIED]: EquipmentSearchBox, Import button, q param
- `app/admin/(dashboard)/equipment/import/page.tsx` [NEW - 3-stage flow]
- `app/api/portal/equipment/import/{validate,commit}/route.ts` [NEW - BFF proxy, portal_token]
- `app/api/admin/equipment/import/{validate,commit}/route.ts` [NEW - BFF proxy, admin_token]
- `components/portal/equipment/EquipmentListToolbar.tsx` [NEW - search + single category dropdown]
- `components/admin/list/EquipmentSearchBox.tsx` [NEW - q param search box]
- `lib/portalApiClient.ts` [MODIFIED - add equipment.import.* methods]
- `lib/clientEquipmentImport.ts` [NEW - admin BFF client library]
- `lib/portalApi.ts` [MODIFIED - equipment.all() accepts search/category/page params]

## 4. Detailed Design

### 4.1 Backend: Equipment Import Service (`services/equipment_import.py`)

Mirrors `cable_import.py` structure. Constants and intermediate classes:

```python
MAX_IMPORT_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_ROWS = 500
REQUIRED_CSV_COLUMNS = {"id", "model", "slug", "manufacturer_id", "category_id"}

@dataclass
class ParsedRow:
    row_number: int
    data: dict[str, Any]
    parse_errors: list[str] | None = None

@dataclass
class ValidatedRow:
    row_number: int
    status: Literal["valid", "skipped", "error"]
    id: str | None
    model: str | None
    errors: list[str] | None = None
    equipment_create: RecommendedEquipmentCreate | None = None
```

**`parse_file(content, format)`:**
- Empty file -> 400. Size > 5 MB -> 413.
- CSV: `utf-8-sig` decode, `csv.DictReader`, check required columns present (missing -> 400), skip blank rows.
- JSON: must be a `list` (else 400); each item must be a dict (non-dict -> ParsedRow with parse_errors).
- `len(rows) > MAX_ROWS` -> 400.

**`validate_rows(db, parsed_rows)`:**

Preload stage (batched queries before per-row loop):
- `_load_fk_sets(db, rows)`: batch-load category IDs and manufacturer IDs via `SELECT id FROM ... WHERE id IN (...)`.
- `_load_existing_equipment_ids(db, ids)`: batch-load existing `RecommendedEquipment.id` values.
- `_load_existing_equipment_slugs(db, manufacturer_id, slugs)`: batch-load existing `slug` values for the manufacturer.

Per-row validation (4 layers):
1. **Parse errors**: if `parsed.parse_errors` exists -> mark `error`.
2. **Field validation**: check `id`, `model`, `slug`, `manufacturer_id`, `category_id` present; validate `applicable_specs` (JSON string in CSV -> `json.loads()`, failure -> error); coerce to `RecommendedEquipmentCreate` Pydantic model.
3. **FK existence**: check `category_id` and `manufacturer_id` against preloaded sets; missing -> `error`.
4. **Duplicate detection**:
   - `seen_ids` tracks id -> first row_number. If id in `seen_ids` -> `error` (intra-file). If id in `existing_ids` (DB) -> `skipped`.
   - `seen_slugs` tracks slug -> first row_number. If slug in `seen_slugs` -> `error` (intra-file). If slug in `existing_slugs` (DB) -> `skipped`.

**`build_preview(validated, format)`:** aggregates counts (valid/skipped/error) into `EquipmentImportPreview`; rows carry row_number, status, id, model, errors.

**`commit_valid_rows(db, validated_rows)`:**
- Filters valid rows. For each: creates `RecommendedEquipment`, `db.add()` + `await db.flush()`.
- Single `await db.commit()` at the end; ANY exception -> `await db.rollback()` + re-raise. Returns `created_count`. All-or-nothing transaction.

### 4.2 Backend: Portal Equipment Import Routes (`portal_equipment_import.py`)

Self-prefixed router at `/api/portal/equipment/import`. All endpoints guarded by `require_factory_module("equipment")`.

Key pattern: `_force_manufacturer_id(parsed_rows, scope_id)` mutates `row.data["manufacturer_id"] = scope_id` on every parsed row. Called AFTER `parse_file` but BEFORE `validate_rows` — security-critical ordering.

Endpoints:
- POST `/validate`: read -> parse -> force_manufacturer_id -> validate -> build_preview -> return EquipmentImportPreview
- POST `/commit`: same flow -> if no valid rows return 200 with errors=["No valid rows to import"] -> else commit_valid_rows in try/except (500 on exception)
- GET `/csv-template`: StreamingResponse with CSV headers + 1 example row
- GET `/json-example`: StreamingResponse with JSON array example

### 4.3 Backend: Admin Equipment Import Routes

Two modules mounted under prefix `/api/admin/equipment/import`:

**`equipment_import.py`** (validate + commit):
- Same as portal but uses `require_operator("equipment_list")` guard.
- NO `_force_manufacturer_id` — admin can set any `manufacturer_id` (FK-validated but not scope-overridden).

**`equipment_import_templates.py`** (csv-template + json-example):
- `CSV_TEMPLATE_HEADERS = ["id", "model", "slug", "manufacturer_id", "category_id", "description", "image_url", "external_url", "sort_order", "applicable_specs"]`
- Both endpoints guarded by `require_operator("equipment_list")`.

**Registration in `main.py`:**
```python
app.include_router(equipment_import.router, prefix=f"{settings.api_prefix}/admin/equipment/import", tags=["equipment-import"])
app.include_router(equipment_import_templates.router, prefix=f"{settings.api_prefix}/admin/equipment/import", tags=["equipment-import"])
app.include_router(portal_equipment_import.router)  # self-prefixed
```

### 4.4 Backend: CRUD Extensions (`crud/equipment.py`)

`list_by_manufacturer` extended to accept `search` (ilike on model) and `category_id` (equality), returns `(items, total)` tuple. Count query applies same filters.

`get_all_with_relations` extended to accept `q` (ilike on model) for admin search.

### 4.5 Backend: Route Extensions

**Portal (`portal_equipment.py`):** GET endpoint accepts `page`, `page_size`, `search`, `category_id`; returns `PaginatedResponse[RecommendedEquipmentRead]`.

**Admin (`equipment.py`):** GET endpoint accepts `q` (in addition to existing `cable_id`, `category_id`, `manufacturer_id`); forwards to CRUD.

### 4.6 Frontend: Portal Equipment List Page

Server component changes:
- Accept `searchParams: Promise<{ search?: string; category_id?: string; page?: string }>` and await it.
- Call `portalApi.equipment.all({ search, category_id, page, page_size: 20 })`.
- Render `<EquipmentListToolbar categories={categories} />` above the table.
- Render Name as plain text (remove `<Link>`).
- Add "Actions" column with "Edit" button linking to `/portal/equipment/${e.id}`.
- Add "Import" button in header next to "New Equipment".
- Add pagination controls (Prev/Next) preserving existing search/category params.

### 4.7 Frontend: EquipmentListToolbar

Client component mirroring `CableListToolbar` but with a single category dropdown:
- Props: `{ categories: EquipmentCategoryRead[] }`.
- `useRouter()` + `useSearchParams()`.
- `pushParams(mutator)`: clone searchParams, run mutator, delete empty keys, `router.push('/portal/equipment?' + qs)`.
- Form with search input ("Search by model...") + Search button.
- Single `<select>` for category (populated from props, "All Categories" default).

### 4.8 Frontend: Portal Equipment Import Page

Client component mirroring `portal/cables/import/page.tsx`:
- 3-stage state: `type Stage = 'upload' | 'preview' | 'result'`.
- Format toggle (CSV/JSON), drag-and-drop file zone, 5 MB size limit.
- Validate: `portalApiClient.equipment.import.validate(file, format)` -> preview with `<ImportPreviewTable>` (reused from cable).
- Commit: `portalApiClient.equipment.import.commit(file, format)` -> result with counts.
- Back arrow -> `/portal/equipment`; result link -> `/portal/equipment`.

### 4.9 Frontend: portalApiClient Extensions

Add to the `equipment` block an `import` sub-object with `validate(file, format)`, `commit(file, format)`, `downloadCsvTemplate()`, `downloadJsonExample()` methods. Each calls the corresponding BFF route at `/api/portal/equipment/import/*`.

### 4.10 Frontend: Admin Equipment List Page

- Add `q` to `searchParams` type.
- Forward `q` to `adminApi.equipment.all(...)`.
- Add `<EquipmentSearchBox />` to header.
- Add "Import" button linking to `/admin/equipment/import`.

### 4.11 Frontend: EquipmentSearchBox

Client component mirroring `CableSearchBox`:
- `useRouter()` + `useSearchParams()`.
- Local `q` state init from `sp.get('q')`.
- `handleSubmit`: build URLSearchParams, set `q.trim()` if non-empty, `router.push('/admin/equipment?' + qs)`.
- Form with text input (placeholder "Search by model...") + "Search" button.

### 4.12 Frontend: Admin Equipment Import Page

Client component mirroring `admin/(dashboard)/cables/import/page.tsx`:
- 3-stage flow, same structure as portal import page.
- Calls standalone functions from `clientEquipmentImport.ts`.
- Back arrow -> `/admin/equipment`; result link -> `/admin/equipment`.

### 4.13 Frontend: clientEquipmentImport

Mirrors `clientCableImport.ts`:
- Types: `ImportFormat`, `ImportPreview`, `ImportPreviewRow`, `ImportResult` (re-export from `clientCableImport` or define identically).
- Functions: `validateImport(file, format)`, `commitImport(file, format)`, `downloadCsvTemplate()`, `downloadJsonExample()`, `triggerBlobDownload(blob, filename)`.
- All hit `/api/admin/equipment/import/*` paths.

### 4.14 Frontend: BFF Proxy Routes

Four new route files, each structurally identical to the cable equivalents:

**Portal validate/commit** (`app/api/portal/equipment/import/{validate,commit}/route.ts`):
- Read `portal_token` cookie; if absent -> 401.
- Forward FormData to `http://backend:8000/api/portal/equipment/import/{validate,commit}` with `Authorization: Bearer <token>`.
- `cache: 'no-store'`; propagate status verbatim.

**Admin validate/commit** (`app/api/admin/equipment/import/{validate,commit}/route.ts`):
- Same pattern with `admin_token` cookie and `/api/admin/equipment/import/{validate,commit}` upstream.

## 5. Data Flow

### 5.1 Portal Equipment Import (validate -> commit)

```
User uploads CSV/JSON on /portal/equipment/import
    |
    v
portalApiClient.equipment.import.validate(file, format)
    |  FormData { file, format }
    v
BFF /api/portal/equipment/import/validate (reads portal_token cookie)
    |  Authorization: Bearer <portal_token>
    v
Backend portal_equipment_import.py /validate
    |  1. require_factory_module("equipment") -> user.scope_id
    |  2. parse_file(content, format) -> list[ParsedRow]
    |  3. _force_manufacturer_id(parsed, scope_id)  <- overwrites all rows
    |  4. validate_rows(db, parsed) -> list[ValidatedRow]
    |     +- FK check: category_id must exist
    |     +- Dup check: id (file+DB) + slug (file+DB)
    |     +- Field validation: applicable_specs JSON validity
    |  5. build_preview(validated, format) -> EquipmentImportPreview
    v
Frontend shows preview (valid/skipped/error counts + ImportPreviewTable)
    |  User clicks "Commit N valid rows"
    v
BFF /api/portal/equipment/import/commit -> Backend /commit
    |  Same flow steps 1-4
    |  5. commit_valid_rows(db, validated) -> single transaction
    |     +- db.add() each valid row
    |     +- db.commit() (all-or-nothing)
    |     +- db.rollback() on any exception
    v
Frontend shows result (created/skipped/error counts)
```

### 5.2 Admin Equipment Import

Same as portal but:
- Guard: `require_operator("equipment_list")` instead of `require_factory_module("equipment")`.
- NO `_force_manufacturer_id` — admin-supplied `manufacturer_id` is trusted (FK-validated but not scope-overridden).
- BFF uses `admin_token` cookie.
- Frontend calls `clientEquipmentImport.validateImport()` / `commitImport()`.

## 6. Key Decisions

### D1: Pagination added to portal equipment list (breaking change)

The portal equipment list endpoint changes from returning `list[RecommendedEquipmentRead]` to `PaginatedResponse[RecommendedEquipmentRead]`. This is a breaking response-shape change but:
- Only the frontend consumes this endpoint (no external API consumers documented).
- The frontend is updated in the same change.
- Achieves full parity with the cable portal list which already uses `PaginatedResponse`.

### D2: Import file requires `id` column (cable pattern)

The CSV/JSON import file MUST include the `id` field. This mirrors the cable import pattern where users supply the id. Rationale:
- Consistency with cable import (users familiar with one pattern can use the other).
- `id` is used for duplicate detection (file + DB).
- Portal single-form create still server-generates id via `_generate_equipment_id()`; batch import requires user-supplied id (different UX, different scale).

### D3: Duplicate detection checks both `id` and `slug`

Both `id` and `slug` are checked for intra-file and DB duplicates:
- `id` collision in DB -> `skipped` (same as cable).
- `id` collision in file -> `error` (same as cable).
- `slug` collision in DB -> `skipped` (slug is unique per manufacturer).
- `slug` collision in file -> `error`.

Two batched SELECTs for DB lookup (existing ids + existing slugs). Acceptable overhead since both use `WHERE ... IN (...)` pattern.

### D4: Shared service module used by both admin and portal

`backend/app/services/equipment_import.py` contains the core pipeline. Admin and portal routes both call it. Portal routes add `_force_manufacturer_id` wrapper; admin routes do not. Mirrors the cable import architecture exactly.

### D5: Reuse cable's ImportPreviewTable component

The equipment import preview reuses `frontend/components/admin/cable/ImportPreviewTable.tsx`. The component displays `id` and `model` columns which equipment also has. No need to fork unless future column requirements diverge.

### D6: Admin import URL uses `/api/admin/equipment/import` (not `/api/recommended-equipments/import`)

The existing admin equipment CRUD lives at `/api/recommended-equipments`. The new import endpoints use `/api/admin/equipment/import` for clarity and consistency with the cable import path (`/api/admin/cables/import`). The existing CRUD path stays unchanged.

## 7. Risks and Mitigations

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R1 | Portal list endpoint response shape change | Breaking change for any consumer | Only frontend consumes it; updated in same change. Documented in proposal Impact section. |
| R2 | Duplicate detection runs 2 batched SELECTs (id + slug) | Slightly higher DB load per import | Both use `WHERE ... IN (...)` single-query pattern. Acceptable for max 500 rows. |
| R3 | `applicable_specs` in CSV is a JSON string (user error risk) | Invalid JSON breaks validation | Layer 2 validation catches `json.loads()` failures -> row marked `error` with clear message. |
| R4 | Reusing cable's `ImportPreviewTable` may diverge in future | If equipment needs different preview columns | Direct reuse now; fork only if requirements diverge. Component is generic enough. |
| R5 | Admin import path differs from admin CRUD path | URL inconsistency | Documented decision (D6). New path is clearer; CRUD path unchanged. |
| R6 | Portal uses `portalApiClient.equipment.import.*`, admin uses `clientEquipmentImport.*` | Inconsistent BFF client patterns | Mirrors cable import architecture exactly. Each side mirrors its own cable counterpart. |
| R7 | `_force_manufacturer_id` must run AFTER parse but BEFORE validate | Security: if order is wrong, client manufacturer_id could leak | Helper is called explicitly between `parse_file` and `validate_rows` in both validate and commit endpoints. Unit test `test_portal_equipment_import_force_manufacturer_id` verifies. |

## 8. Testing Strategy

### 8.1 Backend Tests (pytest, 15 tests)

**List Filtering (5 tests):**
- `test_portal_equipment_list_with_search` — `?search=transformer` returns only matching equipment.
- `test_portal_equipment_list_with_category_filter` — `?category_id=cat-1` returns only that category.
- `test_portal_equipment_list_without_filters` — no params returns first page (backward-compatible).
- `test_portal_equipment_list_pagination` — `?page=2&page_size=10` returns correct page with total.
- `test_admin_equipment_list_with_q` — `?q=transformer` returns only matching equipment.

**Portal Import (7 tests):**
- `test_portal_equipment_import_validate_csv` — valid CSV -> 200, preview shows valid rows.
- `test_portal_equipment_import_validate_json` — valid JSON -> 200, with nested `applicable_specs`.
- `test_portal_equipment_import_commit` — commit -> 200, records created in DB.
- `test_portal_equipment_import_force_manufacturer_id` — wrong `manufacturer_id` overwritten with scope_id.
- `test_portal_equipment_import_too_many_rows` — >500 rows -> 400.
- `test_portal_equipment_import_cross_scope_403` — cable manufacturer user -> 403.
- `test_portal_equipment_import_dup_detection` — id+slug file/DB duplicates correctly marked.

**Admin Import (4 tests):**
- `test_admin_equipment_import_validate_csv` — admin valid CSV -> 200.
- `test_admin_equipment_import_commit` — admin commit -> 200, records created.
- `test_admin_equipment_import_validate_manufacturer_id` — non-existent `manufacturer_id` -> row marked error.
- `test_admin_equipment_import_unauthorized` — non-operator -> 403.

### 8.2 Frontend Verification (manual)

- TypeScript compilation: 0 errors (`npx tsc --noEmit`).
- Portal list page: Name is plain text, Edit button works, search filters by model, category dropdown filters, pagination works, Import button links to import page.
- Portal import page: CSV upload -> validate -> preview -> commit -> result flow works; JSON upload with nested `applicable_specs` works; template downloads work.
- Admin list page: search box filters by model, Import button links to import page.
- Admin import page: CSV/JSON upload -> validate -> preview -> commit -> result flow works.

### 8.3 Integration Verification

- Docker stack health check (all services healthy).
- End-to-end API tests covering all scenarios from delta specs.

## 9. Spec Patches Applied

The following Spec Patches were written back to OpenSpec delta specs during the design phase:

1. **`specs/portal-equipment-crud/spec.md`**: Added new requirement "Portal equipment list SHALL return a paginated response" with 4 scenarios (paginated response shape, page parameter, pagination controls, pagination preserves filters). Updated "without filters returns all" scenario to reflect first-page default behavior.

2. **`specs/portal-equipment-import/spec.md`**: Updated 4-layer validation requirement to clarify `id` is required in the file and duplicate detection checks BOTH `id` and `slug`. Added 2 new scenarios: "Row with id collision in DB is marked skipped" and "Row with intra-file duplicate id is marked error".

3. **`specs/admin-equipment-import/spec.md`**: Same updates as portal-equipment-import — clarified `id` is required and added id-based duplicate detection scenarios.

## 10. Out of Scope

- Equipment data model / database schema changes
- Cascading filter dropdowns (equipment has a flat category tree)
- Excel/XLSX format support (CSV + JSON only)
- Equipment variant support (equipment has no variants concept)
- Refactoring existing cable import code
- Generic/shared import service parameterized by model type
