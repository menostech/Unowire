# Equipment Manufacturers, Categories, and Equipment CRUD — Design

**Date:** 2026-07-06
**Status:** Approved
**Scope:** Backend + Admin UI + Frontend refactor

## Context

The project currently has a flat `recommended_equipments` table with `brand` stored as a plain string (no proper manufacturer entity) and no equipment category concept at all. There is also a schema mismatch: the backend model has `name`+`slug`, but frontend types expect `brand`+`model`+`type`+`external_url`. Four equipment items currently live in `frontend/data/recommended-equipments.json`, with the DB table empty.

This design introduces proper `equipment_manufacturers` and `equipment_categories` (two-level nested) entities, refactors `recommended_equipments` to reference them via foreign keys, builds full admin CRUD pages, and migrates the frontend cable detail page recommendation module to consume the new API.

## Decision Summary

- **Equipment Manufacturer entity:** Complete version, field-aligned with cable `manufacturers` table (no showcase fields)
- **Equipment Category entity:** Two-level nested via self-referencing `parent_id`
- **Equipment entity:** Complete with `manufacturer_id` FK + `category_id` FK + `model` + `applicable_specs` + `image_url` + `external_url` + `sort_order`
- **Scope:** Backend + Admin UI + Frontend refactor (cable detail page recommendation module only, no standalone equipment pages)
- **Data migration:** Migrate existing 4 items from JSON, auto-create KMV/Komax manufacturers and Processing Equipment category tree
- **Admin paths:** `/admin/equipment/manufacturers`, `/admin/equipment/categories`, `/admin/equipment`
- **Frontend matching:** Move local rule engine to backend (already exists as `get_matching_cable`), remove `matched_variants` and `explanation` display

## 1. Data Model

### 1.1 New Table: `equipment_manufacturers`

Mirrors cable `manufacturers` table structure, excluding showcase fields (`featured_cable_ids`, `featured_image`, `featured_text`, etc.) — equipment manufacturers do not need homepage showcase slots.

```python
class EquipmentManufacturer(Base):
    __tablename__ = "equipment_manufacturers"
    id: str (PK, 100)
    name: str (200, unique)
    slug: str (200, unique)
    country: str | None (100)
    website: str | None (500)
    image_url: str | None (500)
    description: Text | None
    founded_year: int | None
    address: str | None (500)
    phone: str | None (100)
    email: str | None (200)
    sort_order: int (default 0)
    created_at: datetime
    updated_at: datetime
```

### 1.2 New Table: `equipment_categories` (Two-Level Nested)

Self-referencing `parent_id` implements two-level nesting.

```python
class EquipmentCategory(Base):
    __tablename__ = "equipment_categories"
    __table_args__ = (UniqueConstraint("parent_id", "slug"),)
    id: str (PK, 100)  # e.g. "processing/stripping"
    parent_id: str | None (FK → equipment_categories.id, ON DELETE CASCADE)
    label: str (200)
    slug: str (200)
    description: str | None
    image_url: str | None (500)
    sort_order: int (default 0)
    created_at: datetime
    updated_at: datetime
```

**Constraints:**
- `parent_id IS NULL` → top-level category (e.g. "Processing Equipment")
- `parent_id IS NOT NULL` → second-level category (e.g. "Semi-Automatic Stripping Machine")
- Application layer enforces max depth of 2 (POST/PUT rejects if parent itself has a parent, returns 422 "Maximum depth is 2 levels")
- ID format: `<parent_slug>/<child_slug>` (aligned with cable's `industry_id/category_id/product_type_id` style)

### 1.3 Refactored Table: `recommended_equipments`

```python
class RecommendedEquipment(Base):
    __tablename__ = "recommended_equipments"
    id: str (PK, 100)
    manufacturer_id: str (FK → equipment_manufacturers.id, ON DELETE RESTRICT)
    category_id: str (FK → equipment_categories.id, ON DELETE RESTRICT)
    model: str (200)              # replaces old `name`
    slug: str (200, unique)
    applicable_specs: JSONB (default "[]")  # rule engine format unchanged
    description: str | None
    image_url: str | None (500)   # new
    external_url: str | None (500)  # new (was in JSON, not DB)
    sort_order: int (default 0)
    created_at: datetime
    updated_at: datetime
```

**Changes:**
- Removed: `name`, `brand` (string)
- Added: `manufacturer_id`, `category_id`, `model`, `image_url`, `external_url`, `sort_order`
- Delete strategy: `RESTRICT` on both FKs (referenced manufacturer/category cannot be deleted, returns 409)

## 2. API Endpoints

### 2.1 Equipment Manufacturers `/api/equipment-manufacturers`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Public | List (paginated, supports `q` search, `page`/`page_size`) |
| GET | `/{id}` | Public | Detail |
| POST | `/` | Admin | Create |
| PUT | `/{id}` | Admin | Update |
| DELETE | `/{id}` | Admin | Delete (409 if referenced by equipment) |

Response model `EquipmentManufacturerRead` includes all fields. List response is `PaginatedResponse[EquipmentManufacturerRead]` (aligned with existing `manufacturers`).

### 2.2 Equipment Categories `/api/equipment-categories`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Public | Returns two-level tree (top-level nested with children) |
| GET | `/{id}` | Public | Detail (includes children) |
| POST | `/` | Admin | Create (`parent_id` optional) |
| PUT | `/{id}` | Admin | Update |
| DELETE | `/{id}` | Admin | Delete (409 if has children or referenced by equipment) |

**Tree structure:** Follows existing `taxonomy.py` `get_all_with_children` pattern using `selectinload(EquipmentCategory.children)`.

**Two-level limit:** POST/PUT validates — if `parent_id` points to a category that itself has a `parent_id`, return 422 "Maximum depth is 2 levels".

### 2.3 Equipment `/api/recommended-equipments` (Refactored)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Public | List (paginated, supports `cable_id`, `category_id`, `manufacturer_id` filters) |
| GET | `/{id}` | Public | Detail (includes nested manufacturer and category objects) |
| POST | `/` | Admin | Create |
| PUT | `/{id}` | Admin | Update |
| DELETE | `/{id}` | Admin | Delete |

**Changes:**
- GET list adds optional `category_id`, `manufacturer_id` filters
- GET detail response nests `manufacturer: EquipmentManufacturerRead` and `category: EquipmentCategoryRead` (via `selectinload`)
- Retains `cable_id` parameter: calls CRUD `get_matching_cable()` rule engine (logic unchanged, only field source changes from `brand` string to `manufacturer.name`)

**Response model `RecommendedEquipmentRead`:**
```python
class RecommendedEquipmentRead(BaseModel):
    id: str
    manufacturer_id: str
    category_id: str
    model: str
    slug: str
    applicable_specs: list[dict] = []
    description: str | None = None
    image_url: str | None = None
    external_url: str | None = None
    sort_order: int = 0
    manufacturer: EquipmentManufacturerRead | None = None  # nested
    category: EquipmentCategoryRead | None = None  # nested
    created_at: datetime
    updated_at: datetime
```

### 2.4 Route Registration (main.py)

```python
app.include_router(equipment_manufacturers.router, prefix=f"{settings.api_prefix}/equipment-manufacturers", tags=["equipment-manufacturers"])
app.include_router(equipment_categories.router, prefix=f"{settings.api_prefix}/equipment-categories", tags=["equipment-categories"])
# recommended-equipments route already exists, refactored in place
```

### 2.5 File Organization

**Backend new/modified:**
- `backend/app/models/equipment.py` — add `EquipmentManufacturer`, `EquipmentCategory`, refactor `RecommendedEquipment`
- `backend/app/schemas/equipment.py` — add 3 sets of Read/Create/Update schemas
- `backend/app/crud/equipment.py` — split into `crud_equipment_manufacturer`, `crud_equipment_category`, `crud_equipment` (3 CRUD classes)
- `backend/app/api/routes/equipment_manufacturers.py` — new router file
- `backend/app/api/routes/equipment_categories.py` — new router file
- `backend/app/api/routes/equipment.py` — refactored in place (keeps existing prefix)

Three independent route files aligned with existing `manufacturers.py`/`brands.py`/`industries.py` single-responsibility style.

## 3. Database Migration & Seed

### 3.1 Alembic Migration `add_equipment_manufacturers_and_categories`

Single migration:

1. **Create `equipment_manufacturers` table** (fields per Section 1.1)
2. **Create `equipment_categories` table** (fields per Section 1.2, with self-referencing FK `parent_id`)
3. **Refactor `recommended_equipments` table:**
   - Add columns (nullable phase): `manufacturer_id`, `category_id`, `model`, `image_url`, `external_url`, `sort_order`
   - Add FKs: `manufacturer_id → equipment_manufacturers.id` (RESTRICT), `category_id → equipment_categories.id` (RESTRICT)
   - **No data migration in migration script** — DB table is currently empty, so data import is handled by the seed script (Section 3.2)
   - Set `manufacturer_id`, `category_id`, `model` to NOT NULL
   - Drop old columns: `name`, `brand`
4. **downgrade:** reverse — restore `name`/`brand`, drop new columns and two new tables

### 3.2 Seed Script `backend/scripts/seed_equipment.py`

Idempotent script, safe to re-run. Flow:

1. Create 2 equipment manufacturers: KMV, Komax (fields per Section 1.1, derived from JSON `brand` field)
2. Create category tree (two levels, all English):
   - `Processing Equipment` (top-level)
     - `Semi-Automatic Stripping Machine` (second-level)
     - `Fully Automatic Cutting & Stripping Machine` (second-level)
3. Import 4 equipment items (read from `frontend/data/recommended-equipments.json`):
   - Match `brand` → `manufacturer_id`
   - Match `type` → `category_id`:
     - `semi_automatic_stripping_machine` → `processing/semi-automatic-stripping-machine`
     - `fully_automatic_cutting_stripping_machine` → `processing/fully-automatic-cutting-stripping-machine`
   - `model` ← JSON `model`
   - `applicable_specs` ← JSON `applicable_specs` (preserved as-is)
   - `description` ← JSON `description`
   - `external_url` ← JSON `external_url`
   - `slug` ← generated from `model` (e.g. `kmv-cs-800`)
   - `id` ← preserved from JSON (e.g. `rec-eq-1`)

**Dedup logic:** Use `id` as upsert key; skip or update if exists.

### 3.3 JSON File Handling

After migration:
- `frontend/data/recommended-equipments.json` **retained but no longer the data source** — frontend switches to API
- Add comment at top: `// Deprecated, data now lives in DB via /api/recommended-equipments`
- Not physically deleted to avoid git history disruption

### 3.4 Execution Order

```
1. alembic upgrade head  (create new tables + refactor old table, old table is empty)
2. python -m scripts.seed_equipment  (import data from JSON)
3. Backend restart and verify
```

## 4. Admin UI

### 4.1 Route Structure

Grouped under `/admin/equipment` as specified:

```
/admin/equipment/manufacturers        # manufacturer list
/admin/equipment/manufacturers/new    # new
/admin/equipment/manufacturers/[id]   # edit

/admin/equipment/categories           # category list
/admin/equipment/categories/new       # new
/admin/equipment/categories/[...id]   # edit (catch-all for slash-containing IDs)

/admin/equipment                      # equipment list
/admin/equipment/new                  # new
/admin/equipment/[id]                 # edit
```

> Category IDs contain slashes (e.g. `processing/stripping`), so `[...id]` catch-all route is used, aligned with existing `/admin/industries/categories/[...id]` pattern.

### 4.2 Sidebar Navigation

New "Equipment" group added to `AdminSidebar.tsx` with 3 sub-items:

```
Equipment
  ├─ Manufacturers    /admin/equipment/manufacturers
  ├─ Categories       /admin/equipment/categories
  └─ Equipments       /admin/equipment
```

### 4.3 List Pages (3 total)

Each list page aligned with existing `/admin/manufacturers` pattern:

**Equipment Manufacturer List:**
- Table columns: Image / Name / Country / Website / Sort / Actions
- "New Manufacturer" button at top
- Edit / Delete actions per row

**Equipment Category List:**
- Tree display showing two levels (indented second-level)
- Columns: Label / Slug / Parent / Sort / Actions
- "New Category" button at top

**Equipment List:**
- Table columns: Image / Model / Manufacturer / Category / Sort / Actions
- "New Equipment" button + filters (Manufacturer dropdown, Category dropdown) at top

### 4.4 Form Pages (3 total)

Each form reuses existing components:

**EquipmentManufacturerForm:**
- Fields: id (new only), name, slug, country, website, image_url (via `ImageFieldWithPicker`), description, founded_year, address, phone, email, sort_order
- Structure fully aligned with `ManufacturerForm.tsx`

**EquipmentCategoryForm:**
- Fields: id (new only), parent_id (dropdown, optional, lists top-level categories only), label, slug, description, image_url (via `ImageFieldWithPicker`), sort_order
- Application-layer validation: if parent_id selected and parent itself has a parent, block submit (two-level limit)

**EquipmentForm:**
- Fields: id (new only), manufacturer_id (dropdown), category_id (dropdown showing two-level indented), model, slug, applicable_specs (JSON editor, aligned with cable specs editing), description, image_url (via `ImageFieldWithPicker`), external_url, sort_order

### 4.5 Next.js API Proxy Routes

New 3 groups of proxy routes (aligned with existing `/api/admin/manufacturers` pattern):

```
/api/admin/equipment-manufacturers/route.ts          (POST)
/api/admin/equipment-manufacturers/[id]/route.ts     (PUT, DELETE)

/api/admin/equipment-categories/route.ts             (POST)
/api/admin/equipment-categories/[...id]/route.ts     (PUT, DELETE)

/api/admin/equipment/route.ts                        (POST)
/api/admin/equipment/[id]/route.ts                   (PUT, DELETE)
```

> GET requests are made by server components directly to the backend (via `adminApi.ts` `adminGet`), not through proxy — aligned with existing architecture.

### 4.6 adminApi.ts Extension

Add `equipmentManufacturers`, `equipmentCategories`, `equipment` namespaces to the `adminApi` object. Each namespace includes `all()`, `getById()`, `create()`, `update()`, `remove()` methods, aligned with existing `manufacturers` namespace pattern.

## 5. Frontend Refactor (Cable Detail Page)

### 5.1 Current Architecture

The cable detail page reads equipment data from `frontend/data/recommended-equipments.json` and calls local `recommendEquipments()` function for rule matching.

### 5.2 Refactored Architecture

**Switch to backend API** `GET /api/recommended-equipments?cable_id={id}`. Backend `crud_equipment.get_matching_cable()` rule engine remains unchanged; only the data source changes from JSON to DB.

### 5.3 Data Flow

```
Cable detail page (server component)
  ├─ Calls /api/cables/{id} to fetch cable (unchanged)
  └─ Calls /api/recommended-equipments?cable_id={id} to fetch matched equipment
       └─ Backend executes rule matching, returns RecommendedEquipmentRead[] (with nested manufacturer, category)
```

### 5.4 Frontend Type Alignment

`types.ts` `RecommendedEquipment` interface refactored:

```typescript
// Old
export interface RecommendedEquipment {
  id: string;
  brand: string;          // string
  model: string;
  type: string;           // string
  description: string;
  applicable_specs: ApplicableSpecRule[];
  external_url: string;
}

// New
export interface EquipmentManufacturer {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  website: string | null;
  image_url: string | null;
  description: string | null;
}

export interface EquipmentCategory {
  id: string;
  label: string;
  slug: string;
  parent_id: string | null;
  image_url: string | null;
}

export interface RecommendedEquipment {
  id: string;
  manufacturer_id: string;
  category_id: string;
  model: string;
  slug: string;
  applicable_specs: ApplicableSpecRule[];
  description: string | null;
  image_url: string | null;
  external_url: string | null;
  sort_order: number;
  manufacturer: EquipmentManufacturer | null;  // nested
  category: EquipmentCategory | null;           // nested
}
```

### 5.5 Component Changes

`RecommendedEquipmentCard.tsx`:
- `equipment.brand` → `equipment.manufacturer?.name`
- `equipment.type` → `equipment.category?.label`
- `equipment.external_url` → `equipment.external_url` (unchanged, but now optional)
- New: `equipment.image_url` displays equipment image (if present)
- New: `equipment.manufacturer?.image_url` displays manufacturer logo (optional, small size)

### 5.6 Deprecate Local Rule Engine

`equipment-recommend.ts` `recommendEquipments()` function **deprecated but file retained**. Add comment at top: `// Deprecated, matching now done by backend API`.

Reasons:
- Backend already has equivalent `get_matching_cable()` logic
- Retaining file avoids git history disruption and does not affect runtime
- No longer referenced by any component

### 5.7 RecommendedEquipmentResult Simplification

Per approved approach (Plan a): remove `matched_variants` and `explanation` display.

```typescript
// Simplified — backend only returns equipment list, no matched_variants/explanation
// Frontend card displays equipment info only
```

Backend `GET /api/recommended-equipments?cable_id={id}` returns only the equipment list, **not** `matched_variants` or `explanation`. Frontend card is simplified to show equipment info only (manufacturer name, category label, model, description, image, external link).

## 6. Testing & Verification

### 6.1 Backend Verification

**Manual smoke testing** (project convention: no frontend automated tests for MVP):

1. `alembic upgrade head` succeeds, all 3 tables have correct structure
2. `python -m scripts.seed_equipment` results in DB containing:
   - 2 equipment manufacturers (KMV, Komax)
   - 3 categories (1 top-level + 2 second-level)
   - 4 equipment records
3. API endpoint verification (via curl or Swagger at `/api/docs`):
   - `GET /api/equipment-manufacturers` returns 2 items
   - `GET /api/equipment-categories` returns tree structure
   - `GET /api/recommended-equipments?cable_id={existing_id}` returns matched equipment
   - `POST/PUT/DELETE` require admin token, return 401 without

**Key verification points:**
- Category two-level limit: creating a third-level category returns 422
- Delete restriction: deleting a manufacturer/category referenced by equipment returns 409
- Rule engine: use existing cable data to verify match results are consistent with previous JSON-based approach

### 6.2 Frontend Admin Verification

1. Sidebar "Equipment" group shows 3 sub-items
2. 3 list pages load correctly, data matches backend
3. 3 new forms submit and persist data
4. 3 edit forms display correct initial values, save updates
5. Delete operations work (show error tooltip when referenced)
6. `ImageFieldWithPicker` works in all 3 forms
7. `applicable_specs` JSON editor works in equipment form

### 6.3 Frontend Verification

1. Cable detail page recommendation module displays correctly
2. Equipment card shows manufacturer name (from `manufacturer.name`) and category label (from `category.label`)
3. "View product →" external link works
4. Empty state displays gracefully when no equipment matches (no error)
5. Compare recommendation results before/after refactor using same cable

### 6.4 Docker Deployment Verification

1. `docker compose up -d --build` full rebuild succeeds
2. Migration executes in container (or manual `alembic upgrade head`)
3. Seed script executes in container
4. Frontend and backend health checks pass

## Out of Scope

- Standalone public equipment pages (`/equipment`, `/equipment/[slug]`) — only cable detail page recommendation module is refactored
- Equipment manufacturer showcase fields (`featured_*`) — not needed for equipment manufacturers
- Third-level or deeper category nesting — explicitly blocked by application-layer validation
- Automated tests — MVP convention is manual smoke testing only
- Physical deletion of `frontend/data/recommended-equipments.json` — retained as deprecated reference
- Physical deletion of `frontend/lib/equipment-recommend.ts` — retained as deprecated reference
