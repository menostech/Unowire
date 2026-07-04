# Cable Bulk Import — Design Spec

**Date:** 2026-07-04
**Status:** Approved (brainstorming complete)
**Target page:** `/admin/cables` → new `/admin/cables/import` route

## Goal

Add a bulk import feature for cables at `/admin/cables/import`. Support two file formats: CSV (basic cable fields only) and JSON (full nested structure with variants and specs). Use a two-step preview + confirm flow with a stateless backend (file is re-uploaded on commit).

## Context

- `/admin/cables` list page exists with a "New" button but no bulk operations
- `Cable` is nested: `Cable` + `CableVariant` + `SpecItem` (common specs have `variant_id IS NULL`)
- All 4 FKs on Cable (`brand_id`, `industry_id`, `category_id`, `product_type_id`) are `RESTRICT` — referenced rows must pre-exist
- Taxonomy uses composite slash-delimited IDs (e.g. `consumer_electronics/internal_wiring/electronic_wire`)
- `Cable.id` is client-supplied (existing UI uses slug as id)
- Existing single-create route (`POST /api/cables`) does nested transaction: Cable flush → common SpecItems → each Variant flush → its SpecItems → commit
- No CSV/Excel libraries installed; Python stdlib `csv` + `json` suffice for this design
- Project has no pytest infrastructure; verification is manual smoke testing (MVP constraint)

## Architecture

**Approach: Two-endpoint backend (validate + commit), stateless**

- **Validate endpoint:** parses + validates all rows, returns preview report, does NOT write to DB
- **Commit endpoint:** re-parses + re-validates the same file, commits all valid rows in a single transaction
- **Stateless:** no temp files or sessions between validate and commit; frontend re-uploads the original file on commit
- **Parsing:** backend Python stdlib `csv` + `json` (no new dependencies)

### Why this approach

- Backend is single source of truth for validation (FK existence, schema constraints)
- Preview data never leaves server; commit re-parses original file (idempotent — client can't tamper with preview data)
- Honors "preview + confirm" UX choice
- Zero new backend dependencies

## Backend Endpoints

### Import endpoints (`/api/admin/cables/import`)

| Endpoint | Method | Auth | Request | Response |
|---|---|---|---|---|
| `/api/admin/cables/import/validate` | POST | admin | multipart (`file` + `format=csv\|json`) | `ImportPreview` JSON |
| `/api/admin/cables/import/commit` | POST | admin | multipart (`file` + `format`) | `ImportResult` JSON |

### Template endpoints (`/api/admin/cables/import`)

| Endpoint | Method | Auth | Response |
|---|---|---|---|
| `/api/admin/cables/import/csv-template` | GET | admin | CSV file download |
| `/api/admin/cables/import/json-example` | GET | admin | JSON file download |

### Registration

Both routers registered in `backend/app/main.py` under `/api/admin/cables/import`.

## File Formats

### CSV format (basic fields only)

UTF-8 with optional BOM (decoded as `utf-8-sig`). First row is header. Fields:

| Column | Required | Description | Example |
|---|---|---|---|
| `id` | yes | Cable ID (slug) | `premium-hdmi-cable-4k` |
| `model` | yes | Model name | `Premium HDMI Cable 4K` |
| `slug` | yes | URL slug | `premium-hdmi-cable-4k` |
| `brand_id` | yes | Brand ID (must pre-exist) | `sony` |
| `industry_id` | yes | Industry ID | `consumer_electronics` |
| `category_id` | yes | Category ID (composite path) | `consumer_electronics/internal_wiring` |
| `product_type_id` | yes | Product Type ID (composite path) | `consumer_electronics/internal_wiring/electronic_wire` |
| `size_system` | yes | Enum: `awg\|mm2\|kcmil\|none` | `none` |
| `base_description` | no | Description | `High-speed HDMI cable` |
| `meta_title` | no | SEO title | `Premium HDMI Cable 4K - Sony` |
| `meta_description` | no | SEO description | `...` |
| `category_ids` | no | Multi-category, JSON array string | `["consumer_electronics/internal_wiring"]` |

**CSV excludes `variants` and `common_specs`** — managed in UI afterward or via JSON import.

**Empty cell handling:** empty = null for nullable DB fields. Empty `category_ids` = `[]`.

### JSON format (full nested)

JSON file is an array of `CableCreate` objects, identical to existing `POST /api/cables` request body:

```json
[
  {
    "id": "premium-hdmi",
    "model": "Premium HDMI Cable 4K",
    "slug": "premium-hdmi-cable-4k",
    "brand_id": "sony",
    "industry_id": "consumer_electronics",
    "category_id": "consumer_electronics/internal_wiring",
    "product_type_id": "consumer_electronics/internal_wiring/electronic_wire",
    "size_system": "none",
    "base_description": "High-speed HDMI cable",
    "meta_title": null,
    "meta_description": null,
    "category_ids": [],
    "common_specs": [
      {
        "spec_key": "length",
        "label": "Length",
        "value_string": "2m",
        "value_number": null,
        "unit": "m",
        "spec_type": "string",
        "filterable": false,
        "sort_order": 0
      }
    ],
    "variants": [
      {
        "slug": "2m",
        "sort_order": 0,
        "specs": []
      }
    ]
  }
]
```

JSON import supports full nested data (`common_specs` + `variants.specs`), suitable for migration from other systems or complex bulk entry.

### Shared conventions

- Composite slash-delimited IDs for `industry_id` / `category_id` / `product_type_id` (matches existing `CableForm.tsx` submission logic)
- `id` field is the cable primary key (matches existing UI: slug used as id)
- File size limit: 5MB
- Row limit: 500 rows per file

## Validation Flow

4 layers executed in order. Any layer failure records the row error and continues to next row (does not abort).

### Layer 1: File-level validation

- File not empty
- File size ≤ 5MB
- Row count ≤ 500
- CSV: header row contains all required columns
- JSON: valid JSON array, each element is an object

### Layer 2: Row-level field validation (Pydantic schema)

- Required fields non-empty
- `size_system` enum valid (`awg|mm2|kcmil|none`)
- JSON format: each cable object validated against `CableCreate` schema; nested `common_specs` and `variants.specs` validated against `SpecItemCreate` / `CableVariantCreate`
- `spec_type` enum valid (`string|number|enum`)
- `value_number` / `value_string` match `spec_type` (number → `value_number` set; string/enum → `value_string` set)

### Layer 3: FK existence validation (batch queries, avoid N+1)

- `brand_id` exists in `brands` table
- `industry_id` exists in `industries` table
- `category_id` exists in `categories` table
- `product_type_id` exists in `product_types` table

**Optimization:** one `SELECT id FROM <table> WHERE id IN (...)` per table, cache result sets, all rows reuse for O(1) lookup.

### Layer 4: Duplicate validation

- **Intra-file duplicate:** multiple rows with same `id` — first row is valid, subsequent rows marked error
- **DB already exists:** `id` exists in `cables` table — marked as "skipped" (not error)

### Row status classification

| Status | Meaning | Committed? |
|---|---|---|
| `valid` | Passes all validation, not in DB | ✅ yes |
| `skipped` | DB already has same id | ❌ no |
| `error` | Field/FK/format error | ❌ no |

## Preview Report (`ImportPreview`)

```python
class ImportPreviewRow(BaseModel):
    row_number: int          # 1-based index into data rows (1 = first data row after header for CSV; 1 = first array element for JSON)
    status: Literal["valid", "skipped", "error"]
    id: str | None           # Parsed cable id (CSV: value of `id` column; JSON: `id` field; None if parse failed)
    model: str | None        # Parsed model (for display)
    errors: list[str] = []   # Error messages (only for error status)

class ImportPreview(BaseModel):
    total_rows: int
    valid_count: int
    skipped_count: int
    error_count: int
    rows: list[ImportPreviewRow]
    file_format: Literal["csv", "json"]
```

### Error message examples

- `Row 3: missing required field 'brand_id'`
- `Row 5: invalid size_system 'foo' (must be awg|mm2|kcmil|none)`
- `Row 7: brand_id 'sony' does not exist`
- `Row 9: product_type_id 'consumer_electronics/internal_wiring/unknown' does not exist`
- `Row 11: duplicate id 'premium-hdmi' (first seen at row 4)`

## Commit Endpoint Behavior

- Re-parses + re-validates the file (identical logic to validate, shared function)
- Single transaction: all `valid` rows inserted via nested create pattern (Cable → common_specs → variants → variant.specs → flush → next), single `commit()` at end
- Any row raises DB exception (e.g. concurrent insert unique conflict) → entire transaction rolls back → return 500 + error row number
- Returns `ImportResult`:

```python
class ImportResult(BaseModel):
    created_count: int
    skipped_count: int
    errors: list[str] = []   # Commit-phase exceptions (normally empty)
```

## Frontend UI Flow

### Page route: `/admin/cables/import`

Single page with 3-stage state machine:

```
[upload] → [preview] → [result]
```

### Stage 1: Upload

- Format selector: radio (CSV / JSON), default CSV
- Drag-and-drop area (reuses `MediaUploader` drop style)
- "Download CSV template" link (calls `/csv-template` endpoint)
- "View JSON example" link (calls `/json-example` endpoint)
- "Validate" button (disabled until file selected)
- Format hints: "Supports .csv / .json, Max 5MB, 500 rows"

### Stage 2: Preview

- Top stats bar: `N rows total` + 3-color counts (green valid / yellow skipped / red error)
- Table columns: Row | Status | ID | Model | Errors
- Pagination: 20 rows per page
- Status filter: default shows all (no filter)
- Error rows: red highlight, error message in Errors column
- Skipped rows: yellow highlight, `(already exists)` in Errors column
- "Back" button returns to upload stage
- "Commit N valid rows" button (disabled if 0 valid rows)

### Stage 3: Result

- Success: green prompt with created/skipped/error counts
- "View Cables List" button → `/admin/cables`
- "Import Another File" button → reset to upload stage

### State management

```tsx
type Stage = 'upload' | 'preview' | 'result';
const [stage, setStage] = useState<Stage>('upload');
const [format, setFormat] = useState<'csv' | 'json'>('csv');
const [file, setFile] = useState<File | null>(null);
const [preview, setPreview] = useState<ImportPreview | null>(null);
const [result, setResult] = useState<ImportResult | null>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

`file` state retained through result stage (commit needs original file). `loading` overlays both Validate and Commit buttons to prevent double-submit.

### Toast errors

- Network error / file > 5MB / parse failure: top red toast
- Per-row errors: shown in preview table only, no toast

### `/admin/cables` list page change

Add "Import" button next to existing "New" button, linking to `/admin/cables/import`.

## Backend File Structure

### New files

| File | Purpose |
|---|---|
| `backend/app/api/routes/cable_import.py` | validate + commit endpoints |
| `backend/app/schemas/cable_import.py` | `ImportPreview` / `ImportPreviewRow` / `ImportResult` |
| `backend/app/services/cable_import.py` | parse + validate + commit core logic (decoupled from routes) |
| `backend/app/api/routes/cable_import_templates.py` | CSV template + JSON example downloads |

### Modified files

| File | Change |
|---|---|
| `backend/app/main.py` | Register `cable_import.router` and `cable_import_templates.router` |

### Service layer (`services/cable_import.py`)

```python
def parse_file(content: bytes, format: Literal["csv", "json"]) -> list[ParsedRow]:
    """Returns parsed rows, each with raw data + parse errors"""

async def validate_rows(db: AsyncSession, parsed_rows: list[ParsedRow]) -> list[ValidatedRow]:
    """4-layer validation: schema + FK existence + intra-file dup + DB dup
    Returns per-row status (valid/skipped/error) + error messages"""

async def commit_valid_rows(db: AsyncSession, validated_rows: list[ValidatedRow]) -> int:
    """Single transaction: nested create for valid rows, returns created_count
    Any exception → transaction rolls back, exception propagates"""
```

### Route layer (`cable_import.py`)

```python
@router.post("/validate", response_model=ImportPreview)
async def validate_import(
    file: UploadFile,
    format: Literal["csv", "json"] = Form(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    content = await file.read()
    if len(content) > MAX_IMPORT_SIZE:
        raise HTTPException(413, "File too large (max 5MB)")
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(400, f"Too many rows (max {MAX_ROWS})")
    validated = await validate_rows(db, parsed)
    return build_preview(validated, format)

@router.post("/commit", response_model=ImportResult)
async def commit_import(
    file: UploadFile,
    format: Literal["csv", "json"] = Form(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    content = await file.read()
    parsed = parse_file(content, format)
    validated = await validate_rows(db, parsed)
    valid_rows = [r for r in validated if r.status == "valid"]
    skipped_count = sum(1 for r in validated if r.status == "skipped")
    if not valid_rows:
        return ImportResult(created_count=0, skipped_count=skipped_count, errors=["No valid rows to import"])
    created = await commit_valid_rows(db, valid_rows)
    return ImportResult(created_count=created, skipped_count=skipped_count, errors=[])
```

### Template layer (`cable_import_templates.py`)

```python
@router.get("/csv-template")
async def download_csv_template(_: User = Depends(get_current_admin)):
    """Returns CSV template file (header + 1 example row)"""

@router.get("/json-example")
async def download_json_example(_: User = Depends(get_current_admin)):
    """Returns JSON example file (1 complete cable object)"""
```

Template content hardcoded in code (not read from filesystem).

### FK validation optimization (avoid N+1)

```python
async def _load_fk_sets(db: AsyncSession, rows: list[ParsedRow]) -> dict:
    brand_ids = {r.data.get("brand_id") for r in rows if r.data.get("brand_id")}
    industry_ids = {...}
    category_ids = {...}
    product_type_ids = {...}

    brands = (await db.execute(select(Brand.id).where(Brand.id.in_(brand_ids)))).scalars().all()
    # ... same for industries / categories / product_types

    return {
        "brands": set(brands),
        "industries": set(industries),
        "categories": set(categories),
        "product_types": set(product_types),
    }
```

### Nested create (reuses existing pattern)

`commit_valid_rows` inner loop per valid row matches existing `POST /api/cables` steps:

```python
for row in valid_rows:
    cable = Cable(**row.cable_fields)
    db.add(cable)
    await db.flush()

    for spec in row.common_specs:
        db.add(SpecItem(cable_id=cable.id, variant_id=None, **spec))
    await db.flush()

    for variant in row.variants:
        v = CableVariant(cable_id=cable.id, slug=variant.slug, sort_order=variant.sort_order)
        db.add(v)
        await db.flush()
        for spec in variant.specs:
            db.add(SpecItem(cable_id=cable.id, variant_id=v.id, **spec))

await db.commit()  # single commit
```

Any exception → no commit, session auto-rollbacks.

## Frontend File Structure

### New files

| File | Purpose |
|---|---|
| `frontend/app/admin/(dashboard)/cables/import/page.tsx` | Import page (3-stage state machine) |
| `frontend/lib/clientCableImport.ts` | `validateImport` + `commitImport` + template download functions |
| `frontend/app/api/admin/cables/import/validate/route.ts` | Next.js cookie-to-Bearer proxy |
| `frontend/app/api/admin/cables/import/commit/route.ts` | Next.js cookie-to-Bearer proxy |
| `frontend/app/api/admin/cables/import/csv-template/route.ts` | Next.js proxy for template download |
| `frontend/app/api/admin/cables/import/json-example/route.ts` | Next.js proxy for template download |

### Modified files

| File | Change |
|---|---|
| `frontend/app/admin/(dashboard)/cables/page.tsx` | Add "Import" button next to "New" |

### Client module (`clientCableImport.ts`)

```typescript
export async function validateImport(file: File, format: 'csv' | 'json'): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', format);
  const res = await fetch('/api/admin/cables/import/validate', { method: 'POST', body: formData });
  if (!res.ok) throw new Error((await res.json()).detail || 'Validation failed');
  return res.json();
}

export async function commitImport(file: File, format: 'csv' | 'json'): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', format);
  const res = await fetch('/api/admin/cables/import/commit', { method: 'POST', body: formData });
  if (!res.ok) throw new Error((await res.json()).detail || 'Commit failed');
  return res.json();
}

export async function downloadCsvTemplate(): Promise<Blob> { /* GET /csv-template */ }
export async function downloadJsonExample(): Promise<Blob> { /* GET /json-example */ }
```

### Next.js proxy routes

Each proxy route follows the existing cookie-to-Bearer pattern:

```typescript
export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const backendRes = await fetch(`${API_BASE}/api/admin/cables/import/validate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,  // pass through multipart, do NOT set Content-Type
    cache: 'no-store',
  });

  return new NextResponse(backendRes.body, {
    status: backendRes.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## Error Response Specification

| Scenario | HTTP Status | Response Body |
|---|---|---|
| Not authenticated | 401 | `{detail: "Not authenticated"}` |
| File > 5MB | 413 | `{detail: "File too large (max 5MB)"}` |
| Rows > 500 | 400 | `{detail: "Too many rows (max 500)"}` |
| Empty file | 400 | `{detail: "File is empty"}` |
| CSV missing required columns | 400 | `{detail: "Missing required columns: brand_id, ..."}` |
| JSON not an array | 400 | `{detail: "JSON must be an array"}` |
| JSON element not an object | 400 | `{detail: "Row 3: expected object"}` |
| Commit with no valid rows | 200 | `ImportResult{created_count:0, errors:["No valid rows to import"]}` |
| Commit transaction failure | 500 | `{detail: "Transaction failed at row N: <error>"}` |
| Other exceptions | 500 | `{detail: "Import failed: <error>"}` |

## Edge Cases

### CSV parsing

- BOM: decode as `utf-8-sig` (auto-strips BOM)
- Quote escaping: Python `csv.DictReader` handles RFC 4180 quotes by default
- Empty lines: skip fully blank rows (not counted in row_number)
- Empty cells: `None` → nullable DB fields accept null; non-nullable fields → Layer 2 error
- `category_ids` column: empty = `[]`; non-empty = `json.loads()`, parse failure = row error

### JSON parsing

- Top-level non-array: file-level error
- Array element not object: row-level error
- Missing `common_specs` / `variants`: default `[]` (matches `CableCreate` schema)
- Missing nested `specs`: default `[]`

### Duplicate handling

- Intra-file same id multiple rows: first row valid, subsequent rows error (`duplicate id 'xxx' (first seen at row N)`)
- Intra-file same id + DB exists: first row skipped, subsequent rows error (intra-file dup)
- Case-sensitive: `HDMI` and `hdmi` are different ids

### Concurrency

- Between validate and commit, another user may insert same id cable → commit hits unique constraint conflict → transaction rolls back → returns 500 + error row number
- MVP does not handle concurrency; error message advises retry

### File format

- `format` parameter governs parsing; file extension is ignored
- Mismatch (format=csv but file is .json) → parse fails → file-level error

## Out of Scope (YAGNI)

- ❌ Excel (.xlsx) format support
- ❌ Export functionality (cables to CSV/JSON)
- ❌ Async background tasks (celery / workers) — synchronous is fine for ≤500 rows
- ❌ Import history / audit log
- ❌ Per-row commit (partial success) — single transaction confirmed
- ❌ Upsert (update existing cables) — skip confirmed
- ❌ Progress bar / real-time feedback — file ≤5MB / 500 rows, sync wait acceptable
- ❌ Multi-file drop — one file at a time

## Testing Strategy

Manual smoke testing (project has no pytest infrastructure, MVP constraint).

### Smoke test checklist

1. CSV template download — file has 12-column header + 1 example row
2. JSON example download — file has 1 complete cable object
3. CSV upload all valid — 3 new cables, preview shows 3 valid, commit creates 3
4. CSV upload with skipped — 1 existing id, preview shows 1 valid + 1 skipped, commit creates 1
5. CSV upload with error — 1 row missing brand_id, preview shows error + message
6. CSV upload intra-file duplicate — 2 rows same id, preview shows 1 valid + 1 error
7. JSON upload all valid — 1 cable with variants + specs, commit creates successfully
8. JSON upload nested validation error — variant.specs spec_type/value mismatch, preview errors
9. FK does not exist — brand_id points to non-existent brand, preview errors
10. Empty file — returns 400
11. File > 5MB — returns 413
12. Rows > 500 — returns 400
13. Unauthenticated API access — returns 401
14. Commit with no valid rows — button disabled; API returns 200 + 0 created
15. Regression — `/admin/cables` list page loads, "Import" button links correctly

### Verification commands

- Backend import: `docker compose exec backend python -c "from app.services.cable_import import parse_file, validate_rows; print('ok')"`
- Frontend tsc: `docker compose exec frontend npx tsc --noEmit` (no new tsc errors)
- API: curl/Invoke-WebRequest simulating uploads covering above scenarios

## Global Constraints (binding)

- Frontend MVP does not require automated tests — verification is manual smoke testing
- All code, comments, and commit messages in English
- Backend tests deferred (no pytest infrastructure in project)
- Cookie-to-Bearer proxy pattern: Next.js API routes read `admin_token` cookie, forward to FastAPI with `Authorization: Bearer` header
- All middleware/routes must use async/await
- Template endpoints require admin auth (consistent with other admin endpoints)
- Service layer decoupled from route layer (per user decision)
- FK validation uses set caching to avoid N+1 queries (per user decision)
- Commit uses single transaction (per user decision)
- Skip existing cables on conflict (per user decision)
- Validate-all-then-commit error handling (per user decision)
- Preview + confirm UX flow (per user decision)
- CSV basic fields only; JSON full nested (per user decision)
