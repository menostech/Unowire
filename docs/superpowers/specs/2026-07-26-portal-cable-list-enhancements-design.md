---
comet_change: portal-cable-list-enhancements
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-26-portal-cable-list-enhancements
status: final
---

# Portal Cable List Enhancements — Technical Design Doc

> OpenSpec artifacts (`proposal.md`, `design.md`, `specs/portal-cable-crud/spec.md`, `tasks.md`) remain canonical. This doc is the deep technical refinement of the open-phase framework decisions (D1–D5), with implementation-level detail for the build phase.

## 1. Context and Goals

The portal cable list page (`/portal/cables`) currently provides only a flat list with a "New Cable" button. It lacks search, taxonomy filters, bulk import, and uses a NAME hyperlink instead of a conventional Edit button. The portal sidebar shows a dynamic `user.role_name` instead of a fixed brand identity.

The admin side already has a mature cable-import workflow (`/admin/cables/import`) with a 3-stage upload → preview → result flow supporting CSV and JSON. The backend service (`app/services/cable_import.py`) is global (not scoped). The portal needs an equivalent capability but force-bound to the manufacturer's `scope_id` to prevent cross-scope data leakage.

The Cable model already has `industry_id`, `category_id`, and `product_type_id` FK fields. The `/api/taxonomy` endpoint already returns the industry → category → product_type tree. No schema changes are needed.

**Goals:**
- Improve portal cable list usability with search, 3-level cascading taxonomy filters, and Edit-button row actions
- Add portal-scoped bulk import (CSV/JSON) reusing the admin 3-stage workflow pattern
- Fix portal sidebar brand to show "Unowire" + scope-specific subtitle
- All new list parameters are optional and backward-compatible

**Non-Goals:**
- Modify admin-side cable list or import (only portal)
- Database schema changes (fields already exist)
- Modify cable detail/edit page behavior
- Add pagination to portal cable list (deferred; current limit=50 with search/filter is sufficient for MVP)
- Equipment list page enhancements (only cable list; sidebar change affects both scopes but is a text-only change)

## 2. Architecture Overview

```
┌─ Frontend (Next.js) ─────────────────────────────────────────────────────┐
│                                                                          │
│  /portal/cables (Server Component)                                       │
│  ├─ reads searchParams: { search?, industry_id?, category_id?,          │
│  │                       product_type_id? }                              │
│  ├─ portalApi.cables.all(params)  ──► /api/portal/cables (BFF GET)      │
│  ├─ fetch /api/taxonomy (for labels + filter options)                   │
│  └─ renders:                                                            │
│     ├─ <CableListToolbar /> (Client) — search + 3 cascading dropdowns   │
│     │   + Import button + New Cable button                              │
│     └─ <table> — Name (plain) | Manufacturer | Category | Product Type │
│         | Size System | Created | [Edit button]                         │
│                                                                          │
│  /portal/cables/import (Client Component)                               │
│  └─ 3-stage state machine: upload → preview → result                    │
│     ├─ uses lib/portalApiClient.ts (cables.import.{validate,commit})    │
│     └─ reuses <ImportPreviewTable /> from admin (generic)               │
│                                                                          │
│  BFF routes (app/api/portal/cables/...)                                  │
│  ├─ route.ts (GET, POST) — proxy + portal_token cookie → Bearer         │
│  └─ import/{validate,commit,csv-template,json-example}/route.ts         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ (HTTP with Bearer token)
┌─ Backend (FastAPI) ──────────────────────────────────────────────────────┐
│                                                                          │
│  app/api/routes/portal_cables.py                                         │
│  ├─ GET  /api/portal/cables  (extended: search, industry_id,            │
│  │                            category_id, product_type_id)              │
│  ├─ POST /api/portal/cables  (existing, force manufacturer_id)          │
│  └─ ... (existing detail/update/delete)                                 │
│                                                                          │
│  app/api/routes/portal_cable_import.py (NEW)                             │
│  ├─ POST /api/portal/cables/import/validate                              │
│  ├─ POST /api/portal/cables/import/commit                                │
│  ├─ GET  /api/portal/cables/import/csv-template                          │
│  └─ GET  /api/portal/cables/import/json-example                          │
│                                                                          │
│  app/crud/cable.py                                                       │
│  └─ list_by_manufacturer(search, industry_id, category_id,              │
│                            product_type_id) — extended                   │
│                                                                          │
│  app/services/cable_import.py (REUSED, no changes)                       │
│  └─ parse_file, validate_rows, build_preview, commit_valid_rows         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## 3. Component-Level Design

### 3.1 Sidebar Brand (Frontend)

**File**: `frontend/components/portal/layout/PortalSidebar.tsx`

Replace lines 85-87:
```tsx
// BEFORE
<div className="mb-6 px-2 text-lg font-bold tracking-tight">
  {user?.role_name || 'Factory Portal'}
</div>

// AFTER
<div className="mb-6 px-2 text-lg font-bold tracking-tight">
  Unowire <span className="text-blue-300">{subtitle}</span>
</div>
```

Where `subtitle` is derived from `user?.scope_type`:
- `manufacturer` → `"Cable Portal"`
- `equipment_manufacturer` → `"Equipment Portal"`
- `null`/`undefined` → `""` (empty)

This mirrors the admin sidebar pattern (`Unowire <span>Admin</span>`).

### 3.2 Cable List Page (Frontend)

**File**: `frontend/app/portal/cables/page.tsx` (rewrite)

Server component that:
1. Reads `searchParams: Promise<{ search?, industry_id?, category_id?, product_type_id? }>` (Next.js 15 async searchParams)
2. Calls `portalApi.cables.all({ search, industry_id, category_id, product_type_id })`
3. Fetches taxonomy tree from `${API_BASE}/api/taxonomy` (for label resolution + filter options)
4. Builds `categoryMap` and `productTypeMap` (existing pattern)
5. Renders:
   - Toolbar header with `<CableListToolbar taxonomy={taxonomy} />` + Import button + New Cable button
   - Table with columns: Name | Manufacturer | Category | Product Type | Size System | Created | Actions
   - NAME column: plain text (`{c.model || c.slug || c.id}`)
   - Actions column: `<Link href={`/portal/cables/${c.id}`}>Edit</Link>` (text link styled as button)

**Empty state**: When `cables.length === 0`, show "No cables found." message (matching admin pattern).

### 3.3 CableListToolbar Component (NEW, Client)

**File**: `frontend/components/portal/cable/CableListToolbar.tsx`

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

  // Derive cascading options from taxonomy tree
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
    // Clean up empty params
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
      // Clear descendants
      p.delete('category_id');
      p.delete('product_type_id');
    });
  }

  function handleCategoryChange(value: string) {
    pushParams((p) => {
      if (value) p.set('category_id', value);
      else p.delete('category_id');
      // Clear descendant
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
          placeholder="Search by model…"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button type="submit" className="...">Search</button>
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

**Key behaviors**:
- URL is the single source of truth (server component reads from URL)
- Changing industry clears `category_id` and `product_type_id` from URL
- Changing category clears `product_type_id` from URL
- Category dropdown is disabled when no industry selected; product-type dropdown disabled when no category selected
- Search box preserves other params when submitted

### 3.4 Backend List API Extension

**File**: `backend/app/api/routes/portal_cables.py` (modify `list_cables`)

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

**File**: `backend/app/crud/cable.py` (modify `list_by_manufacturer`)

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

**Backward compatibility**: All new params default to `None`. Existing callers (no params) get the same behavior.

### 3.5 Portal Import Routes (Backend, NEW)

**File**: `backend/app/api/routes/portal_cable_import.py` (NEW)

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


@router.get("/csv-template")
async def portal_download_csv_template(
    user: User = Depends(require_factory_module("cables")),
):
    """Return CSV template pre-filled with the user's manufacturer_id."""
    import csv
    from io import StringIO

    scope_id = str(user.scope_id)
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "id", "model", "slug", "manufacturer_id", "industry_id",
        "category_id", "product_type_id", "size_system",
        "base_description", "meta_title", "meta_description", "category_ids",
    ])
    writer.writeheader()
    writer.writerow({
        "id": "your-unique-cable-id",
        "model": "Cable Model Name",
        "slug": "cable-model-slug",
        "manufacturer_id": scope_id,  # pre-filled, but server will force this anyway
        "industry_id": "consumer_electronics",
        "category_id": "consumer_electronics/internal_wiring",
        "product_type_id": "consumer_electronics/internal_wiring/electronic_wire",
        "size_system": "none",
        "base_description": "",
        "meta_title": "",
        "meta_description": "",
        "category_ids": '["consumer_electronics/internal_wiring"]',
    })

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=portal-cable-import-template.csv"},
    )


@router.get("/json-example")
async def portal_download_json_example(
    user: User = Depends(require_factory_module("cables")),
):
    """Return JSON example pre-filled with the user's manufacturer_id."""
    import json

    scope_id = str(user.scope_id)
    example = [
        {
            "id": "your-unique-cable-id",
            "model": "Cable Model Name",
            "slug": "cable-model-slug",
            "manufacturer_id": scope_id,  # pre-filled, but server will force this anyway
            "industry_id": "consumer_electronics",
            "category_id": "consumer_electronics/internal_wiring",
            "product_type_id": "consumer_electronics/internal_wiring/electronic_wire",
            "size_system": "none",
            "base_description": "",
            "meta_title": "",
            "meta_description": "",
            "category_ids": ["consumer_electronics/internal_wiring"],
            "common_specs": [],
            "variants": [],
        }
    ]

    content = json.dumps(example, indent=2)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=portal-cable-import-example.json"},
    )
```

**Router registration**: Add to `app/main.py` (or wherever portal routers are aggregated):
```python
from app.api.routes.portal_cable_import import router as portal_cable_import_router
app.include_router(portal_cable_import_router)
```

**Security analysis**:
- `_force_manufacturer_id` runs after `parse_file` (file decoded) but before `validate_rows` (FK checks)
- Any `manufacturer_id` value in the file (including other manufacturers' IDs) is overwritten with `user.scope_id`
- FK validation passes because `user.scope_id` is a valid manufacturer
- `commit_valid_rows` uses the forced value (already in `cable_create.manufacturer_id`)
- This mirrors the existing `POST /api/portal/cables` create-endpoint pattern (line 92 of `portal_cables.py`)

### 3.6 BFF Routes (Frontend)

**File**: `frontend/app/api/portal/cables/route.ts` (extend with GET)

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// GET /api/portal/cables — proxy with query params + portal_token cookie
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

// POST /api/portal/cables — existing create proxy (unchanged)
export async function POST(req: NextRequest) {
  // ... existing implementation
}
```

**File**: `frontend/app/api/portal/cables/import/validate/route.ts` (NEW)
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
    body: formData, // pass through multipart; do NOT set Content-Type
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

(Same pattern for `commit`, `csv-template`, `json-example` — see admin BFF at `app/api/admin/cables/import/*/route.ts`.)

### 3.7 API Client Extensions (Frontend)

**File**: `frontend/lib/portalApi.ts` (extend `cables.all`)

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
  // ... existing getById
},
```

**File**: `frontend/lib/portalApiClient.ts` (add `cables.import` namespace)

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

### 3.8 Import Page (Frontend, NEW)

**File**: `frontend/app/portal/cables/import/page.tsx` (NEW)

Mirror the admin import page at `frontend/app/admin/(dashboard)/cables/import/page.tsx`, with these adaptations:
- Use `portalApiClient.cables.import.{validate,commit,downloadCsvTemplate,downloadJsonExample}` instead of `clientCableImport` functions
- Back link → `/portal/cables` (not `/admin/cables`)
- Reuse `ImportPreviewTable` from `@/components/admin/cable/ImportPreviewTable` (generic, takes `ImportPreviewRow[]`)
- Same 3-stage state machine: `upload` → `preview` → `result`
- Same drag-and-drop, format radio buttons, file size validation (5MB client-side, server enforces too)

## 4. Data Flow

### 4.1 List Page with Filters

```
User selects "consumer_electronics" in industry dropdown
  ↓
CableListToolbar.handleIndustryChange("consumer_electronics")
  ↓
pushParams: URL → /portal/cables?industry_id=consumer_electronics
  ↓
Server component re-renders, reads searchParams
  ↓
portalApi.cables.all({ industry_id: "consumer_electronics" })
  ↓
BFF GET /api/portal/cables?industry_id=consumer_electronics
  ↓ (forwards with portal_token cookie as Bearer)
Backend GET /api/portal/cables?industry_id=consumer_electronics
  ↓
crud_cable.list_by_manufacturer(scope_id, industry_id="consumer_electronics")
  ↓
SQL: SELECT * FROM cables
     WHERE manufacturer_id = :scope_id
       AND industry_id = 'consumer_electronics'
     ORDER BY created_at DESC LIMIT 50
  ↓
Returns filtered cables → rendered in table
```

### 4.2 Import Workflow

```
User uploads cables.csv on /portal/cables/import
  ↓
Clicks "Validate"
  ↓
portalApiClient.cables.import.validate(file, 'csv')
  ↓
BFF POST /api/portal/cables/import/validate (with portal_token cookie)
  ↓
Backend portal_validate_import:
  1. parse_file(content, 'csv')  →  list[ParsedRow]
  2. _force_manufacturer_id(parsed, user.scope_id)  ← SECURITY: overwrites any client value
  3. validate_rows(db, parsed)  →  list[ValidatedRow]
  4. build_preview(validated, 'csv')  →  ImportPreview
  ↓
Returns preview (valid/skipped/error counts, no persistence)
  ↓
User reviews preview, clicks "Commit N valid rows"
  ↓
portalApiClient.cables.import.commit(file, 'csv')
  ↓
Backend portal_commit_import:
  1-4. Same as validate (re-parses + forces + validates)
  5. commit_valid_rows(db, validated)  →  created_count
  ↓
Returns ImportResult(created_count, skipped_count, errors)
  ↓
UI shows result stage with counts + "Back to Cable List" link
```

## 5. Error Handling

| Scenario | Backend behavior | Frontend behavior |
|----------|------------------|-------------------|
| Invalid query param type (e.g., `?category_id=` empty) | Treated as `None` (no filter applied) | N/A |
| Search with no matches | Returns `200 OK` with `[]` | Shows "No cables found." empty state |
| Import file empty | `parse_file` raises `HTTPException(400, "File is empty")` | Shows error message |
| Import file > 5MB | `parse_file` raises `HTTPException(413, "File too large")` | Client pre-checks 5MB; server enforces |
| Import file > 500 rows | `parse_file` raises `HTTPException(400, "Too many rows")` | Server enforces only |
| Import with all invalid rows | Returns `ImportResult(created_count=0, errors=["No valid rows to import"])` | Shows error in result stage |
| `equipment_manufacturer` user hits import | `require_factory_module("cables")` returns 403 | BFF forwards 403, UI shows error |
| Import commit transaction fails | `commit_valid_rows` raises, `HTTPException(500)` | Shows error, no partial commits (transaction rollback) |
| BFF missing `portal_token` cookie | Returns 401 | UI shows "Unauthorized" error |

## 6. Testing Strategy

### 6.1 Backend pytest (in `backend/tests/`)

New test file: `backend/tests/api/test_portal_cable_list.py`
- `test_search_by_model_keyword` — `?search=AWG` returns matching cables (case-insensitive, scoped)
- `test_filter_by_industry_id` — `?industry_id=X` returns only cables in that industry
- `test_filter_by_category_id` — `?category_id=X` returns only cables in that category
- `test_filter_by_product_type_id` — `?product_type_id=X` returns only cables of that product type
- `test_combine_search_and_filters` — `?search=&industry_id=&category_id=&product_type_id=` AND logic
- `test_no_params_backward_compat` — returns up to 50 scoped cables
- `test_search_no_matches_returns_empty` — `?search=NONEXISTENT` returns `200 OK` with `[]`
- `test_search_scoped_to_manufacturer` — does not leak cables from other manufacturers

New test file: `backend/tests/api/test_portal_cable_import.py`
- `test_validate_csv_returns_preview` — preview with valid/skipped/error counts, no persistence
- `test_commit_csv_creates_cables` — cables created with forced `manufacturer_id`
- `test_import_forces_manufacturer_id` — file with different `manufacturer_id` → created cables have `user.scope_id`
- `test_import_rejects_too_many_rows` — >500 rows → 400
- `test_import_rejects_oversized_file` — >5MB → 413
- `test_equipment_manufacturer_forbidden` — `equipment_manufacturer` user → 403
- `test_validate_json_returns_preview` — JSON format with nested structures
- `test_commit_json_creates_cables_with_nested_specs` — JSON with variants/common_specs
- `test_csv_template_prefilled_with_scope` — template download contains `user.scope_id` in `manufacturer_id` column

### 6.2 Frontend Verification

- `tsc --noEmit` — no TypeScript errors
- `next build` — build succeeds, new routes compiled
- Manual smoke tests:
  - Sidebar shows "Unowire Cable Portal" for manufacturer user, "Unowire Equipment Portal" for equipment_manufacturer user
  - Cable list NAME column is plain text (no underline/hover)
  - Edit button on each row links to `/portal/cables/{id}`
  - Search box filters by model (case-insensitive)
  - Industry dropdown filters list; selecting industry narrows category dropdown
  - Category dropdown filters list; selecting category narrows product-type dropdown
  - Product-type dropdown filters list
  - Changing industry clears category and product-type selections
  - Changing category clears product-type selection
  - Clear option in any dropdown removes the filter
  - Import button navigates to `/portal/cables/import`
  - Import workflow: upload CSV → validate → preview → commit → result
  - Import workflow: upload JSON → validate → preview → commit → result
  - Created cables from import have `manufacturer_id` matching the logged-in user's scope

## 7. Spec Patches Applied

Two patches were applied to `openspec/changes/portal-cable-list-enhancements/specs/portal-cable-crud/spec.md`:

1. **Added `industry_id` to search-and-filter requirement**: After user selected 3-level cascading filters, the backend filter requirement was extended to accept an optional `industry_id` query parameter (exact match). A new scenario `Filter by industry_id` was added, and the combined-filter scenario was updated to cover all four parameters (`search`, `industry_id`, `category_id`, `product_type_id`).

2. **Rewrote filter-dropdown requirement as cascading**: The original "category and product-type filter dropdowns" requirement was replaced with "cascading industry, category, and product-type filter dropdowns". Six scenarios were added covering: industry filter, category cascade from industry, product-type cascade from category, changing industry clears descendants, changing category clears product-type, and clear filter behavior.

## 8. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Import file contains arbitrary `manufacturer_id` | High (user could edit CSV) | Critical (cross-scope data leak) | Post-parse injection overwrites `manufacturer_id` with `user.scope_id` before validation; FK check passes against user's own scope |
| Large import file blocks event loop | Low | Medium | Reuses admin limits (MAX_ROWS=500, 5MB); enforced by shared `parse_file` |
| Cascading dropdown UX confusion | Low | Low | Disabled state on child dropdowns when parent not selected; URL is source of truth, refresh preserves filters |
| `ImportPreviewTable` incompatible with portal data shape | Very Low | Low | Component is generic (`ImportPreviewRow[]`); admin and portal use the same `ImportPreview` schema |
| BFF multipart proxy drops file metadata | Very Low | Medium | Pattern proven by admin BFF; same `formData` pass-through with `skipDefaultContentType` |

## 9. Out of Scope (Explicitly Deferred)

- Pagination on portal cable list (current limit=50 + search/filter is sufficient for MVP)
- Search across multiple fields (model-only for MVP, matches admin)
- Equipment list page enhancements (only cable list)
- Cable detail/edit page modifications
- Database schema changes (fields already exist)
- Admin-side cable list or import modifications
- Internationalization (i18n) — English-only per project constraint
