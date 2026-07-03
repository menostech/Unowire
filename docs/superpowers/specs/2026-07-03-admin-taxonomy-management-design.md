# Admin Taxonomy Management Design

**Date**: 2026-07-03
**Status**: Approved
**Author**: brainstorming session
**Spec ID**: add-admin-taxonomy-management

## Why

The unowire project's cable taxonomy (Industry → Category → Product Type) currently has working backend CRUD routes (`/api/industries`, `/api/industries/{id}/categories`, `/api/industries/{id}/categories/{cid}/product-types`), but two critical gaps prevent safe day-to-day maintenance:

1. **Security gap**: All POST/PUT/DELETE endpoints on taxonomy routes are publicly writable — they lack the `get_current_admin` dependency that protects Manufacturer/Brand/Cable write endpoints. Anyone with network access can mutate the taxonomy.
2. **Operational gap**: There is no admin UI for taxonomy. The only way to edit taxonomy today is to modify `frontend/data/taxonomy.json` and re-run `seed.py` (which truncates and re-imports — destroying any admin-side edits made between deploys).

This spec adds admin UI and auth guards for managing the three-level taxonomy, with seed behavior changed to upsert so admin edits survive future re-seeds.

## Scope

**In scope**:
- Add `Depends(get_current_admin)` to all POST/PUT/DELETE in `industries.py`, `categories.py`, `product_types.py`
- Build three independent admin pages (Industry / Category / Product Type) following the existing Manufacturer admin pattern
- Build Next.js API route proxies (`/api/admin/industries`, `/api/admin/categories`, `/api/admin/product-types`) that forward the `admin_token` cookie as a Bearer token to the backend
- Add `adminApi.taxonomy` namespace in `frontend/lib/adminApi.ts`
- Add cross-level quick navigation between pages (Industry row → "View Categories", Category edit page → Industry breadcrumb, etc.)
- Build a JSON editor for Product Type `filters` with live validation (mirrors CableForm's common_specs editor pattern)
- Change `seed_taxonomy` in `seed.py` to upsert mode (never deletes admin-added records)
- Remove `industries`, `categories`, `product_types` from `truncate_all`
- RESTRICT-based delete protection with 409 error surfacing on the UI

**Out of scope (deferred)**:
- Legacy `categories.json` system (4-level hierarchy, `cat-N` IDs) — unchanged, still maintained via scripts
- `Cable.category_ids` JSONB field (legacy) — unchanged
- `/categories/[...slugs]` route — unchanged
- Taxonomy export/import to JSON
- Drag-and-drop reordering UI (use `sort_order` numeric input instead)
- Taxonomy merge/split operations
- Multi-role support (admin only)
- Audit log writing (table exists but unused)

## Architecture

### Layered View

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                           │
├──────────────────────────────────┬──────────────────────────────────┤
│  Admin Pages (RSC)               │  API Route Proxies               │
│  /admin/taxonomy/                │  /api/admin/industries/          │
│  ├─ industries/                  │  ├─ route.ts (POST)              │
│  │  ├─ page.tsx (list)           │  └─ [id]/route.ts (PUT/DELETE)   │
│  │  ├─ new/page.tsx              │                                  │
│  │  └─ [id]/page.tsx             │  /api/admin/categories/          │
│  ├─ categories/                  │  ├─ route.ts (POST)              │
│  │  ├─ page.tsx (list)           │  └─ [id]/route.ts (PUT/DELETE)   │
│  │  ├─ new/page.tsx              │                                  │
│  │  └─ [id]/page.tsx             │  /api/admin/product-types/       │
│  └─ product-types/               │  ├─ route.ts (POST)              │
│  │  ├─ page.tsx (list)           │  └─ [id]/route.ts (PUT/DELETE)   │
│  │  ├─ new/page.tsx              │                                  │
│  │  └─ [id]/page.tsx             │                                  │
│                                  │                                  │
│  Form Components (client)        │  adminApi.ts                     │
│  ├─ IndustryForm.tsx             │  └─ taxonomy.{industries,        │
│  ├─ CategoryForm.tsx             │       categories, productTypes}  │
│  └─ ProductTypeForm.tsx          │                                  │
│       (includes filters JSON     │                                  │
│        editor with validation)   │                                  │
└──────────────────────────────────┴──────────────────────────────────┘
                                  │
                                  ▼ (HTTP with Bearer token)
┌─────────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI)                            │
├──────────────────────────────────┬──────────────────────────────────┤
│  Auth Guard                      │  Existing CRUD Routes            │
│  get_current_admin (deps.py)     │  ├─ industries.py (+auth)        │
│                                  │  ├─ categories.py (+auth)        │
│                                  │  └─ product_types.py (+auth)     │
│                                  │                                  │
│                                  │  GET endpoints remain public     │
│                                  │  (consumed by /cables, sitemap,  │
│                                  │   CableForm cascade dropdown)    │
├──────────────────────────────────┼──────────────────────────────────┤
│  CRUD Layer: crud/taxonomy.py (existing, unchanged)                │
│  Models: models/taxonomy.py (existing, unchanged)                  │
│  Schemas: schemas/taxonomy.py (existing, unchanged)                │
├─────────────────────────────────────────────────────────────────────┤
│                        Database (PostgreSQL)                        │
├─────────────────────────────────────────────────────────────────────┤
│  industries (id PK string, label, slug, description, sort_order)   │
│  categories (id PK string, industry_id FK, label, slug, ...)       │
│  product_types (id PK string, category_id FK, label, slug,         │
│                 size_system, filters JSONB, sort_order)             │
│                                                                     │
│  All FKs to cables use ondelete=RESTRICT (cable-side)               │
│  Internal taxonomy FKs use ondelete=CASCADE                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Three independent admin pages, not a tree view** — Mirrors the existing Manufacturer/Brand/Cable admin pattern. Each page is independently testable, follows the same RSC list + client form structure, and keeps file sizes small. Cross-level navigation is provided via quick links (see below).

2. **Flat admin proxy paths, nested backend paths** — Admin proxy routes are flat (`/api/admin/categories/[id]`) even though backend routes are nested (`/api/industries/{ind_id}/categories/{cat_id}`). The proxy reads `industry_id` and `category_id` from the request body or splits the composite ID. This keeps frontend routes simple.

3. **Composite string IDs preserved** — The existing ID format (`"consumer_electronics/internal_wiring/electronic_wire"`) is kept unchanged. URLs encode the ID with `encodeURIComponent`. No Alembic migration needed.

4. **Seed upsert, not truncate** — `seed_taxonomy` is changed to upsert mode so admin edits survive future `seed.py` runs. The three taxonomy tables are removed from `truncate_all`.

5. **RESTRICT delete protection** — Deletion of a taxonomy node with cables referencing it returns HTTP 409. The UI surfaces the error message. No SET NULL, no cascade migration UI.

6. **filters JSON editor** — Reuses the CableForm pattern: a `<textarea>` with live `JSON.parse` validation, red border on invalid, Save button disabled when invalid.

## Backend Changes

### Change 1: Add admin auth guard to taxonomy write endpoints

For each of the three route files, add `_: dict = Depends(get_current_admin)` to the signature of every POST/PUT/DELETE handler. No logic change beyond the dependency. GET handlers remain public.

**Files**:
- [backend/app/api/routes/industries.py](file:///d:/projects/unowire/backend/app/api/routes/industries.py) — POST, PUT `{id}`, DELETE `{id}`
- [backend/app/api/routes/categories.py](file:///d:/projects/unowire/backend/app/api/routes/categories.py) — POST (under `{industry_id}`), PUT `{id}`, DELETE `{id}`
- [backend/app/api/routes/product_types.py](file:///d:/projects/unowire/backend/app/api/routes/product_types.py) — POST (under `{industry_id}/categories/{category_id}`), PUT `{id}`, DELETE `{id}`

### Change 2: Seed upsert

Modify `seed_taxonomy(db, dry_run)` in [backend/scripts/seed.py](file:///d:/projects/unowire/backend/scripts/seed.py):

- For each Industry in `taxonomy.json`:
  - Query by `slug` (or composite `id`)
  - If exists: update `label`, `description`, `sort_order` from JSON
  - If not exists: insert
- For each Category under that Industry:
  - Query by `(industry_id, slug)`
  - If exists: update `label`, `description`, `sort_order`
  - If not exists: insert
- For each ProductType under that Category:
  - Query by `(category_id, slug)`
  - If exists: update `label`, `size_system`, `filters`, `sort_order`
  - If not exists: insert
- **Never delete** records that exist in DB but not in JSON (admin-added records are preserved)
- **Never change** `id` of existing records (composite path IDs are stable)

Modify `truncate_all(db)`:
- Remove `industries`, `categories`, `product_types` from the truncate list
- They were previously truncated in reverse FK order; now skipped entirely

### Change 3: Error handling for delete with dependents

The existing `ForeignKeyViolation` exception handler in [backend/app/core/exception_handlers.py](file:///d:/projects/unowire/backend/app/core/exception_handlers.py) already catches PostgreSQL FK violations and returns HTTP 409 with `{"code": 409, "message": "Cannot delete resource with dependent records"}`. No backend change needed — the UI just needs to surface this error.

## Frontend Admin UI

### Route Structure

```
frontend/app/admin/(dashboard)/taxonomy/
├── industries/
│   ├── page.tsx              (RSC: list, 20 per page, search by label)
│   ├── new/page.tsx          (RSC: empty IndustryForm)
│   └── [id]/page.tsx         (RSC: pre-filled IndustryForm + Delete button)
├── categories/
│   ├── page.tsx              (RSC: list, filter by industry_id query param)
│   ├── new/page.tsx          (RSC: empty CategoryForm, requires industry_id? query)
│   └── [id]/page.tsx         (RSC: pre-filled CategoryForm + Delete + breadcrumb)
└── product-types/
    ├── page.tsx              (RSC: list, filter by category_id query param)
    ├── new/page.tsx          (RSC: empty ProductTypeForm, requires category_id? query)
    └── [id]/page.tsx         (RSC: pre-filled ProductTypeForm + Delete + breadcrumb)
```

### Form Fields

#### IndustryForm
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| label | text | yes | Display name |
| slug | text | yes | URL-friendly, lowercase, hyphens |
| description | textarea | no | Free-form description |
| sort_order | number | no | Default 0, ascending |

#### CategoryForm
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| industry_id | dropdown | yes | Populated from `/api/industries` |
| label | text | yes | |
| slug | text | yes | Unique within industry |
| description | textarea | no | |
| sort_order | number | no | Default 0 |

#### ProductTypeForm
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| industry_id | dropdown | yes | Cascade parent |
| category_id | dropdown | yes | Cascade: filtered by industry_id |
| label | text | yes | |
| slug | text | yes | Unique within category |
| size_system | select | yes | Options: `awg`, `mm2`, `kcmil`, `none` |
| filters | textarea (JSON) | no | Live JSON validation, red border on error |
| sort_order | number | no | Default 0 |

### Cross-Level Quick Navigation

To bridge the three independent pages:

1. **Industry list page**: each row has a "View Categories →" link to `/admin/taxonomy/categories?industry_id={ind_id}`
2. **Category list page**:
   - Filter dropdown at top to scope by Industry
   - Each row has a "View Product Types →" link to `/admin/taxonomy/product-types?category_id={cat_id}`
3. **Category edit page**: top breadcrumb shows `Industries / {Industry label}` (clickable back to industries list)
4. **Product Type edit page**: top breadcrumb shows `Industries / {Industry label} / {Category label}` (clickable)
5. **Category new page**: if accessed via `?industry_id=` query, pre-selects that Industry in the dropdown
6. **Product Type new page**: if accessed via `?category_id=` query, pre-selects Industry + Category in the cascade

### Filters JSON Editor

Mirrors the existing CableForm `common_specs` editor pattern:

- A `<textarea>` with monospace font
- Initial value: `JSON.stringify(filters, null, 2)` if filters exist, else `[]`
- On every input: attempt `JSON.parse`
  - On success: clear error, enable Save
  - On failure: show red border, display parse error message below, disable Save
- On submit: parse JSON and include as `filters` in the request body
- Empty textarea is treated as `[]` (no filters)

Expected `filters` shape (array of objects):
```json
[
  {
    "spec_key": "awg_size",
    "label": "AWG Size",
    "control": "select",
    "unit": null
  },
  {
    "spec_key": "voltage_rating",
    "label": "Voltage Rating",
    "control": "range",
    "unit": "V"
  }
]
```

### Admin Sidebar

Add a new entry to `navLinks` in [frontend/components/admin/layout/AdminSidebar.tsx](file:///d:/projects/unowire/frontend/components/admin/layout/AdminSidebar.tsx):

```tsx
{ label: 'Taxonomy', href: '/admin/taxonomy/industries', icon: FolderOpen }
```

Placed between "Brands" and "View Site" (or after "Manufacturers" — grouped with data entities).

### adminApi.ts Namespace

Add to [frontend/lib/adminApi.ts](file:///d:/projects/unowire/frontend/lib/adminApi.ts):

```typescript
taxonomy: {
  industries: {
    all(): Promise<Industry[]>           // GET /api/industries
    getById(id): Promise<Industry>       // GET /api/industries/{id}
    create(data): Promise<Industry>      // POST /api/admin/industries
    update(id, data): Promise<Industry>  // PUT /api/admin/industries/{id}
    remove(id): Promise<void>            // DELETE /api/admin/industries/{id}
  },
  categories: {
    all(industryId?): Promise<Category[]>
    getById(id): Promise<Category>
    create(data): Promise<Category>
    update(id, data): Promise<Category>
    remove(id): Promise<void>
  },
  productTypes: {
    all(categoryId?): Promise<ProductType[]>
    getById(id): Promise<ProductType>
    create(data): Promise<ProductType>
    update(id, data): Promise<ProductType>
    remove(id): Promise<void>
  }
}
```

### API Route Proxies

All proxies follow the Manufacturer pattern: read `admin_token` cookie from request, forward as `Authorization: Bearer {token}` to backend, return response status and body transparently.

**Composite ID handling**: The `[id]` URL parameter contains the full composite path (e.g., `consumer_electronics/internal_wiring/electronic_wire`). The proxy must `decodeURIComponent` it and forward as-is to the backend URL path.

**Category/Product Type nested paths**: The backend expects `/api/industries/{ind_id}/categories/{cat_id}`. For PUT/DELETE, the proxy:
1. Decodes the composite `[id]` (e.g., `consumer_electronics/internal_wiring`)
2. Splits by `/` to extract `industry_id` and `category_id`
3. Constructs the nested backend URL
4. Forwards the request

For POST, the proxy reads `industry_id` from the request body and constructs the nested URL accordingly.

## Delete Protection

### Scenario: Delete Industry with dependent Categories or Cables

1. User clicks Delete on `/admin/taxonomy/industries/{id}`
2. Confirmation dialog: "Are you sure you want to delete this industry?"
3. User confirms → `DELETE /api/admin/industries/{id}`
4. If Industry has Categories: backend FK CASCADE deletes them (internal FKs are CASCADE)
5. If Industry has Cables referencing it via `cable.industry_id`: backend returns 409 (RESTRICT)
6. UI displays: "Cannot delete: this industry has N cables referencing it. Please reassign or delete those cables first."

### Scenario: Delete Category with dependent Product Types or Cables

Same flow, but:
- If Category has Product Types: CASCADE deletes them
- If Category has Cables: 409

### Scenario: Delete Product Type with dependent Cables

- No internal dependents (Product Type is the leaf)
- If Product Type has Cables: 409

## Data Flow

### Create Category (example)

```
User fills form → CategoryForm.tsx
  ↓ POST /api/admin/categories (Next.js API route proxy)
    ↓ reads admin_token cookie, forwards as Bearer
    ↓ POST http://backend:8000/api/industries/{industry_id}/categories
      ↓ get_current_admin validates JWT
      ↓ crud_category.create inserts into PostgreSQL
      ↓ returns CategoryRead
    ← 200 with created category
  ← sets no cookie, returns JSON
← client receives response
  ↓ router.push('/admin/taxonomy/categories')
  ↓ list page reloads, shows new category
```

### Delete Industry with 409

```
User clicks Delete → confirm dialog → DELETE /api/admin/industries/{id}
  ↓ proxy forwards to DELETE /api/industries/{id}
    ↓ get_current_admin validates
    ↓ crud_industry.remove attempts DELETE
    ↓ PostgreSQL raises FK violation (cables.industry_id RESTRICT)
    ↓ exception_handlers.py catches, returns 409
  ← 409 {code: 409, message: "Cannot delete resource with dependent records"}
← CategoryForm displays error toast
```

## Testing

### Smoke Tests (manual or scripted)

1. Login as admin
2. Visit `/admin/taxonomy/industries` — list renders
3. Click "New Industry" — form renders
4. Create a test industry — redirects to list, new industry appears
5. Click "View Categories" on the new industry — empty list
6. Click "New Category" — industry pre-selected
7. Create a category — appears in list
8. Click "View Product Types" — empty list
9. Click "New Product Type" — industry + category pre-selected
10. Fill form, enter invalid JSON in filters — Save disabled, red border
11. Fix JSON — Save enabled, click Save — appears in list
12. Try deleting the industry — 409 error (because cable exists referencing it)
13. Try deleting the test product type — succeeds (no cables reference it)
14. Logout, visit `/admin/taxonomy/industries` — redirect to login
15. Unauthenticated POST `/api/industries` — 401

### Auth Verification

- All POST/PUT/DELETE on taxonomy routes return 401 without Bearer token
- All GET on taxonomy routes remain public (200 without token)

### Seed Upsert Verification

**Semantics clarification**: `taxonomy.json` remains the canonical source for records it defines. Upsert means:
- Records **in JSON**: seed updates their fields (label, description, sort_order, size_system, filters) to match JSON. Admin edits to these fields will be reverted by the next seed.
- Records **NOT in JSON** (admin-added via UI): seed leaves them untouched — never deleted, never modified.

This is intentional: JSON continues to version-control the canonical taxonomy, while admin UI is for adding operational records not yet in JSON. To make an admin edit permanent for a JSON-defined record, update `taxonomy.json` too.

**Test steps**:

1. Run `python -m scripts.seed --dry-run` — shows "would upsert N taxonomy records, 0 would be created, M would be updated"
2. Add a new Industry via admin UI (not in `taxonomy.json`)
3. Run `python -m scripts.seed` — new Industry is NOT deleted (preserved, not in JSON)
4. Modify a JSON-defined Industry's `label` via admin UI
5. Run `python -m scripts.seed` — label reverts to JSON value (expected: JSON is canonical for records it defines)
6. To make the label change permanent, edit `taxonomy.json` and re-run seed

## File Inventory

### Modified Files

| File | Change |
|------|--------|
| [backend/app/api/routes/industries.py](file:///d:/projects/unowire/backend/app/api/routes/industries.py) | Add `Depends(get_current_admin)` to POST/PUT/DELETE |
| [backend/app/api/routes/categories.py](file:///d:/projects/unowire/backend/app/api/routes/categories.py) | Same |
| [backend/app/api/routes/product_types.py](file:///d:/projects/unowire/backend/app/api/routes/product_types.py) | Same |
| [backend/scripts/seed.py](file:///d:/projects/unowire/backend/scripts/seed.py) | `seed_taxonomy` → upsert; `truncate_all` removes 3 tables |
| [frontend/components/admin/layout/AdminSidebar.tsx](file:///d:/projects/unowire/frontend/components/admin/layout/AdminSidebar.tsx) | Add Taxonomy nav link |
| [frontend/lib/adminApi.ts](file:///d:/projects/unowire/frontend/lib/adminApi.ts) | Add `taxonomy` namespace |

### New Files

**Industry admin**:
- `frontend/app/admin/(dashboard)/taxonomy/industries/page.tsx` (list)
- `frontend/app/admin/(dashboard)/taxonomy/industries/new/page.tsx`
- `frontend/app/admin/(dashboard)/taxonomy/industries/[id]/page.tsx`
- `frontend/components/admin/form/IndustryForm.tsx`
- `frontend/app/api/admin/industries/route.ts` (POST proxy)
- `frontend/app/api/admin/industries/[id]/route.ts` (PUT/DELETE proxy)

**Category admin**:
- `frontend/app/admin/(dashboard)/taxonomy/categories/page.tsx` (list)
- `frontend/app/admin/(dashboard)/taxonomy/categories/new/page.tsx`
- `frontend/app/admin/(dashboard)/taxonomy/categories/[id]/page.tsx`
- `frontend/components/admin/form/CategoryForm.tsx`
- `frontend/app/api/admin/categories/route.ts` (POST proxy)
- `frontend/app/api/admin/categories/[id]/route.ts` (PUT/DELETE proxy)

**Product Type admin**:
- `frontend/app/admin/(dashboard)/taxonomy/product-types/page.tsx` (list)
- `frontend/app/admin/(dashboard)/taxonomy/product-types/new/page.tsx`
- `frontend/app/admin/(dashboard)/taxonomy/product-types/[id]/page.tsx`
- `frontend/components/admin/form/ProductTypeForm.tsx` (includes filters JSON editor)
- `frontend/app/api/admin/product-types/route.ts` (POST proxy)
- `frontend/app/api/admin/product-types/[id]/route.ts` (PUT/DELETE proxy)

**Total**: 6 modified + 18 new = 24 files

## Non-Goals

- **Legacy categories.json cleanup**: The legacy 4-level hierarchy (`cat-N` IDs, `/categories/[...slugs]` route, `Cable.category_ids` JSONB) is left untouched. It continues to be maintained via scripts. Cleaning it up is a separate spec.
- **Taxonomy tree view**: A single-page tree UI was considered and rejected in favor of three independent pages for consistency with the existing admin pattern.
- **Data layer merge**: Merging three tables into one self-referencing `categories` table was considered and rejected — it would require rewriting all backend routes, all frontend consumers, and an Alembic migration. Risk far exceeds benefit.
- **Drag-and-drop sorting**: Use numeric `sort_order` input. Drag UI is polish, not MVP.
