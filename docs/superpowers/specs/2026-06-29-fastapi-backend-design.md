# FastAPI Backend Design Spec

**Date**: 2026-06-29
**Phase**: Step 2 of Path C (FastAPI + PostgreSQL → Step 3: Admin Panel)
**Status**: Draft

## 1. Overview

Build a FastAPI + PostgreSQL backend to replace the static JSON data source. The frontend `lib/api.ts` internally switches from importing JSON files to fetching the API, but its public interface remains unchanged — all components and pages require zero modification.

This is Step 2 of the Path C approach:
- **Step 2** (this spec): FastAPI + PostgreSQL + full CRUD API (no auth) + seed scripts. Data maintained via SQL/scripts.
- **Step 3** (future): Admin panel UI + JWT authentication. Reuses the API and users/audit_log tables.

### Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Development path | C: FastAPI first, admin panel later | Zero thrown-away work; API is shared foundation |
| API scope | Full CRUD, no auth | MVP constraint; auth deferred to Step 3 |
| Frontend migration | lib/api.ts interface unchanged | Components/pages zero modification |
| DB scope | 6 data tables + users + audit_log | Users/audit_log prepared for Step 3 auth |
| Deployment | Nginx /api/ reverse proxy to FastAPI:8000 | Same origin, no CORS |
| PostgreSQL location | Same server as Next.js/FastAPI | MVP; simpler ops |
| ORM | SQLAlchemy 2.0 + Alembic | Mature, async support, matches project memory |
| API style | RESTful | Consistent with existing /api/cables/ endpoint |
| Specs storage | EAV (spec_items table) | Flexible, matches existing SpecItem structure |
| Taxonomy storage | 3 tables + filters JSONB | Preserves hierarchy, filters stay flexible |
| Data migration | Python seed scripts reading JSON | Idempotent, repeatable |
| Old categories.json | Stays as JSON file | Legacy redirect only, not worth DB migration |
| Frontend render mode | ISR (revalidate: 60s) | Balance of performance and data freshness |
| Local dev PostgreSQL | Local install | No Docker dependency for MVP |
| Backend location | monorepo backend/ directory | Consistent with existing structure |
| Auth preparation | Tables only, no middleware | Step 3 adds JWT middleware |
| Pagination format | { items, total, page, page_size } | Matches existing frontend |
| Backend layering | Classic: api → crud → models → schemas | Matches project memory constraint |

## 2. Architecture & Deployment

### System Architecture

```
Internet → Nginx (443/HTTPS)
              ├── /            → Next.js (127.0.0.1:3000, PM2, ISR)
              ├── /api/        → FastAPI (127.0.0.1:8000, Gunicorn+Uvicorn, PM2)
              ├── /sitemap.xml → Next.js
              └── /robots.txt  → Next.js
                                 ↓
                          PostgreSQL (127.0.0.1:5432)
```

### Monorepo Structure

```
unowire/
  frontend/          # Existing Next.js (lib/api.ts → fetch /api/)
  backend/           # New FastAPI
    app/
      api/routes/    # Route handlers
      crud/          # DB operations
      models/        # SQLAlchemy ORM models
      schemas/       # Pydantic request/response schemas
      core/          # config + database engine
      main.py        # FastAPI entry point
    alembic/         # Migrations
    scripts/
      seed.py        # Import from JSON to PostgreSQL
    tests/
    pyproject.toml   # Dependency management
    requirements.txt # Pinned dependencies
    .env.example
  deploy/
    deploy.sh              # Updated: deploy both frontend + backend
    nginx-unowire.conf     # Updated: add /api/ reverse proxy
    ecosystem.config.cjs   # Updated: add unowire-backend process
  docs/superpowers/
```

### Data Flow

- **Frontend reads**: Next.js ISR page → `lib/api.ts` (internal fetch) → Nginx `/api/` → FastAPI → PostgreSQL
- **Frontend writes** (no UI in Step 2, but API ready): direct calls to `/api/` CRUD endpoints
- **Seed data**: `python scripts/seed.py` reads `frontend/data/*.json` → ORM → PostgreSQL
- **Legacy categories.json**: stays in `frontend/data/`, Next.js reads directly (legacy redirect, not in DB)

### Deployment Changes

| Component | Change |
|---|---|
| Nginx | Add `location /api/` reverse proxy to 127.0.0.1:8000 |
| PM2 | Add `unowire-backend` process (Gunicorn + Uvicorn workers) |
| PostgreSQL | New install, systemd managed |
| deploy.sh | Add `cd backend && pip install -r requirements.txt && alembic upgrade head` |
| Environment variables | Add `DATABASE_URL` (shared by frontend/backend) |

### Key Constraints

- Same origin `/api/`, no CORS
- FastAPI with Gunicorn + Uvicorn workers (project memory)
- PM2 fork mode for FastAPI
- All config files committed to repository (project memory)

## 3. Database Schema

### Entity Relationships

```
manufacturers 1───* brands 1───* cables *───1 product_types
                                            *───1 categories *───1 industries
                                            │
                                            1
                                            │
                                            * variants 1───* spec_items
                                            │
                                            1
                                            │
                                            * common_specs (spec_items with variant_id=NULL)

cables.category_ids → legacy categories.json (JSONB, not a FK)

users (Step 3 auth, table only in Step 2)
audit_log (logs all write operations)
recommended_equipments (independent, range-matching conditions)
```

### Table Definitions

#### 3.1 manufacturers

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | VARCHAR(50) | PRIMARY KEY | 'mfr-1' |
| name | VARCHAR(200) | NOT NULL UNIQUE | |
| slug | VARCHAR(200) | NOT NULL UNIQUE | |
| country | VARCHAR(100) | | |
| website | VARCHAR(500) | | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

#### 3.2 brands

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | VARCHAR(50) | PRIMARY KEY | 'brand-1' |
| name | VARCHAR(200) | NOT NULL | |
| slug | VARCHAR(200) | NOT NULL UNIQUE | |
| manufacturer_id | VARCHAR(50) | NOT NULL FK → manufacturers(id) ON DELETE RESTRICT | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

#### 3.3 industries

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | VARCHAR(50) | PRIMARY KEY | 'consumer_electronics' (business key) |
| label | VARCHAR(200) | NOT NULL | |
| slug | VARCHAR(200) | NOT NULL UNIQUE | |
| description | TEXT | | |
| sort_order | INT | DEFAULT 0 | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

#### 3.4 categories (new taxonomy, not old categories.json)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | VARCHAR(50) | PRIMARY KEY | 'consumer_electronics/internal_wiring' |
| industry_id | VARCHAR(50) | NOT NULL FK → industries(id) ON DELETE CASCADE | |
| label | VARCHAR(200) | NOT NULL | |
| slug | VARCHAR(200) | NOT NULL | |
| description | TEXT | | |
| sort_order | INT | DEFAULT 0 | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(industry_id, slug) | |

#### 3.5 product_types

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | VARCHAR(50) | PRIMARY KEY | 'consumer_electronics/internal_wiring/electronic_wire' |
| category_id | VARCHAR(50) | NOT NULL FK → categories(id) ON DELETE CASCADE | |
| label | VARCHAR(200) | NOT NULL | |
| slug | VARCHAR(200) | NOT NULL | |
| size_system | VARCHAR(20) | NOT NULL CHECK IN ('awg','mm2','kcmil','none') | |
| filters | JSONB | NOT NULL DEFAULT '[]' | TaxonomyFilter[] array |
| sort_order | INT | DEFAULT 0 | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(category_id, slug) | |

`filters` JSONB structure:
```json
[
  {"spec_key": "size", "label": "AWG", "control": "enum"},
  {"spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm"}
]
```

#### 3.6 cables

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | VARCHAR(50) | PRIMARY KEY | 'cable-model-1' |
| brand_id | VARCHAR(50) | NOT NULL FK → brands(id) ON DELETE RESTRICT | |
| product_type_id | VARCHAR(50) | NOT NULL FK → product_types(id) ON DELETE RESTRICT | |
| model | VARCHAR(200) | NOT NULL | |
| slug | VARCHAR(200) | NOT NULL | |
| industry_id | VARCHAR(50) | NOT NULL FK → industries(id) ON DELETE RESTRICT | |
| category_id | VARCHAR(50) | NOT NULL FK → categories(id) ON DELETE RESTRICT | |
| size_system | VARCHAR(20) | NOT NULL CHECK IN ('awg','mm2','kcmil','none') | |
| base_description | TEXT | | |
| meta_title | VARCHAR(200) | | |
| meta_description | TEXT | | |
| category_ids | JSONB | NOT NULL DEFAULT '[]' | Legacy categories.json IDs (migration period) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(brand_id, slug) | |

#### 3.7 cable_variants

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGSERIAL | PRIMARY KEY | Auto-generated |
| cable_id | VARCHAR(50) | NOT NULL FK → cables(id) ON DELETE CASCADE | |
| slug | VARCHAR(200) | NOT NULL | 'awg24' |
| sort_order | INT | DEFAULT 0 | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |
| | | UNIQUE(cable_id, slug) | |

#### 3.8 spec_items (EAV core — serves both common_specs and variant specs)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGSERIAL | PRIMARY KEY | Auto-generated |
| cable_id | VARCHAR(50) | NOT NULL FK → cables(id) ON DELETE CASCADE | |
| variant_id | BIGINT | FK → cable_variants(id) ON DELETE CASCADE | NULL = common_spec (cable-level) |
| spec_key | VARCHAR(100) | NOT NULL | 'size', 'outer_diameter', 'shielding'... |
| label | VARCHAR(200) | NOT NULL | Display label |
| value_string | TEXT | | enum/string type values |
| value_number | NUMERIC(20,4) | | number type values |
| unit | VARCHAR(50) | | |
| spec_type | VARCHAR(20) | NOT NULL CHECK IN ('string','number','enum') | |
| filterable | BOOLEAN | NOT NULL DEFAULT FALSE | |
| sort_order | INT | DEFAULT 0 | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

CHECK constraint:
```sql
CHECK (
  (spec_type = 'number' AND value_number IS NOT NULL AND value_string IS NULL)
  OR (spec_type IN ('enum','string') AND value_string IS NOT NULL AND value_number IS NULL)
)
```

Indexes:
- `idx_spec_items_variant_id` ON (variant_id)
- `idx_spec_items_cable_common` ON (cable_id, variant_id) WHERE variant_id IS NULL
- `idx_spec_items_key_string` ON (spec_key, value_string) WHERE filterable = TRUE
- `idx_spec_items_key_number` ON (spec_key, value_number) WHERE filterable = TRUE

#### 3.9 recommended_equipments

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | VARCHAR(50) | PRIMARY KEY | 'rec-eq-1' |
| name | VARCHAR(200) | NOT NULL | |
| slug | VARCHAR(200) | NOT NULL UNIQUE | |
| brand | VARCHAR(200) | | |
| applicable_specs | JSONB | NOT NULL DEFAULT '[]' | Range matching conditions |
| description | TEXT | | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

`applicable_specs` JSONB structure (preserves existing rule array):
```json
[
  {"spec_key": "conductor_area", "min": 0.5, "max": 2.5},
  {"spec_key": "outer_diameter", "min": 1.0, "max": 3.0}
]
```

#### 3.10 users (Step 3 auth, table only in Step 2)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGSERIAL | PRIMARY KEY | |
| email | VARCHAR(200) | NOT NULL UNIQUE | |
| password_hash | VARCHAR(200) | | Empty in Step 2, filled in Step 3 |
| role | VARCHAR(20) | NOT NULL DEFAULT 'admin' CHECK IN ('admin','editor') | |
| is_active | BOOLEAN | NOT NULL DEFAULT TRUE | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

#### 3.11 audit_log

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | BIGSERIAL | PRIMARY KEY | |
| user_id | BIGINT | FK → users(id) ON DELETE SET NULL | NULL in Step 2 (no auth) |
| action | VARCHAR(20) | NOT NULL CHECK IN ('CREATE','UPDATE','DELETE') | |
| entity_type | VARCHAR(50) | NOT NULL | 'cable', 'brand', 'taxonomy'... |
| entity_id | VARCHAR(100) | | Target entity ID |
| changes | JSONB | | Before/after diff (optional in Step 2) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

### Key Schema Decisions

1. **EAV single table for common + variant specs**: `variant_id` NULL = common_spec, non-NULL = variant spec. Avoids dual tables, simplifies queries and seed import.
2. **value_string + value_number dual columns**: CHECK constraint enforces type consistency. Stronger typing than single `value TEXT` column, supports numeric indexes for range filtering.
3. **Taxonomy uses business keys as IDs** (e.g. `consumer_electronics`): Consistent with existing JSON structure. slug stored separately for URLs. IDs are stable, slugs can change.
4. **cables.category_ids JSONB**: Legacy categories.json IDs preserved during migration period, not a foreign key.
5. **filters JSONB**: Taxonomy filter config is structured but flexible. JSONB preserves structure and supports future extension.
6. **BIGSERIAL primary keys** for variant/spec_item/audit_log: High-volume tables, IDs don't need business meaning.
7. **All tables have created_at/updated_at**: Audit foundation, traceable after Step 3 auth.

### JSON-to-Table Mapping

| JSON File | Database Table | Notes |
|---|---|---|
| manufacturers.json | manufacturers | 1:1 mapping |
| brands.json | brands | 1:1, manufacturer_id FK |
| taxonomy.json | industries + categories + product_types | Nested structure → 3 tables |
| cables.json | cables + cable_variants + spec_items | Aggregate → 3 tables |
| recommended-equipments.json | recommended_equipments | 1:1, applicable_specs JSONB |
| categories.json | **Not in DB** | Stays as JSON file for legacy redirect |

## 4. REST API Endpoints

### API Overview

Base path: `/api/` (Nginx reverse proxy to FastAPI)

### 4.1 Manufacturers

| Method | Path | Description |
|---|---|---|
| GET | `/api/manufacturers` | List (paginated) |
| GET | `/api/manufacturers/{id}` | Detail |
| POST | `/api/manufacturers` | Create |
| PUT | `/api/manufacturers/{id}` | Full update |
| DELETE | `/api/manufacturers/{id}` | Delete (RESTRICT if brands reference) |

### 4.2 Brands

| Method | Path | Description |
|---|---|---|
| GET | `/api/brands` | List (paginated, filter by manufacturer_id) |
| GET | `/api/brands/{id}` | Detail |
| POST | `/api/brands` | Create |
| PUT | `/api/brands/{id}` | Full update |
| DELETE | `/api/brands/{id}` | Delete (RESTRICT if cables reference) |

### 4.3 Industries

| Method | Path | Description |
|---|---|---|
| GET | `/api/industries` | List (no pagination, small set) |
| GET | `/api/industries/{id}` | Detail (with nested categories) |
| POST | `/api/industries` | Create |
| PUT | `/api/industries/{id}` | Full update |
| DELETE | `/api/industries/{id}` | Delete (CASCADE to categories + product_types) |

### 4.4 Categories (nested under industries)

| Method | Path | Description |
|---|---|---|
| GET | `/api/industries/{industry_id}/categories` | List categories in industry |
| GET | `/api/industries/{industry_id}/categories/{id}` | Detail (with nested product_types) |
| POST | `/api/industries/{industry_id}/categories` | Create |
| PUT | `/api/industries/{industry_id}/categories/{id}` | Full update |
| DELETE | `/api/industries/{industry_id}/categories/{id}` | Delete |

### 4.5 Product Types (nested under industries/categories)

| Method | Path | Description |
|---|---|---|
| GET | `/api/industries/{industry_id}/categories/{category_id}/product-types` | List |
| GET | `/api/industries/{industry_id}/categories/{category_id}/product-types/{id}` | Detail (with filters) |
| POST | `/api/industries/{industry_id}/categories/{category_id}/product-types` | Create |
| PUT | `/api/industries/{industry_id}/categories/{category_id}/product-types/{id}` | Full update |
| DELETE | `/api/industries/{industry_id}/categories/{category_id}/product-types/{id}` | Delete |

### 4.6 Cables (core — most complex)

| Method | Path | Description |
|---|---|---|
| GET | `/api/cables` | List (paginated + multi-dimensional filtering) |
| GET | `/api/cables/{id}` | Detail (with variants + common_specs + brand + manufacturer) |
| GET | `/api/cables/by-url/{brand_slug}/{cable_slug}` | By URL slug (for frontend detail page) |
| POST | `/api/cables` | Create (with variants + specs) |
| PUT | `/api/cables/{id}` | Full update (replace variants + specs) |
| DELETE | `/api/cables/{id}` | Delete |

**GET /api/cables filter parameters** (aligned with frontend CableQueryParams):

| Parameter | Type | Description |
|---|---|---|
| industry | string | Industry key (optional, no filter if omitted) |
| category | string | Category key (optional) |
| product_type | string | Product type key (optional) |
| q | string | Full-text search (model/base_description) |
| manufacturer | string[] | Manufacturer ID filter |
| brand | string[] | Brand ID filter |
| size | string[] | Enum value filter (AWG) |
| min_size | number | Range lower bound (mm2/kcmil) |
| max_size | number | Range upper bound (mm2/kcmil) |
| spec_filters | JSON string | `{"shielding":["none","aluminum_foil"]}` |
| min_od | number | Outer diameter lower bound |
| max_od | number | Outer diameter upper bound |
| page | int | Page number (default 1) |
| page_size | int | Page size (default 20) |

Note: industry/category/product_type are **optional in the API** — when omitted, returns all cables (supports cross-industry search on /cables overview). This differs from the frontend CableQueryParams where they are required (route-scoped), because the API also serves the cross-industry /cables overview page which has no fixed taxonomy context.

**GET /api/cables response**:

```json
{
  "items": [
    {
      "id": "cable-model-1",
      "model": "UL1007",
      "slug": "ul1007",
      "brand": { "id": "brand-1", "name": "Hitachi", "slug": "hitachi" },
      "manufacturer": { "id": "mfr-1", "name": "Hitachi Metals" },
      "industry": "consumer_electronics",
      "category": "internal_wiring",
      "product_type": "electronic_wire",
      "size_system": "awg",
      "base_description": "...",
      "meta_title": "...",
      "meta_description": "...",
      "common_specs": [
        { "spec_key": "jacket", "label": "Jacket", "value_string": "PVC", "spec_type": "enum" }
      ],
      "variants": [
        {
          "id": 1,
          "slug": "awg24",
          "sort_order": 0,
          "specs": [
            { "spec_key": "size", "value_string": "24", "spec_type": "enum" }
          ]
        }
      ]
    }
  ],
  "total": 123,
  "page": 1,
  "page_size": 20,
  "facets": {
    "manufacturers": [ { "id": "mfr-1", "name": "Hitachi Metals", "count": 5 } ],
    "brands": [ { "id": "brand-1", "name": "Hitachi", "count": 3 } ],
    "size": [ { "value": "24", "count": 2 }, { "value": "26", "count": 1 } ],
    "size_range": { "min": 0.08, "max": 2.5 },
    "spec_facets": { "shielding": [ { "value": "none", "count": 3 } ] },
    "outer_diameter": { "min": 1.2, "max": 5.0 }
  }
}
```

List response embeds `facets` — single request returns data + filter statistics.

**GET /api/cables/by-url/{brand_slug}/{cable_slug}**: Frontend detail page专用. Same structure as `/api/cables/{id}`, additionally includes `recommended_equipments`. Preserves URL-driven query pattern.

### 4.7 Recommended Equipments

| Method | Path | Description |
|---|---|---|
| GET | `/api/recommended-equipments` | List (paginated, filter by cable_id) |
| GET | `/api/recommended-equipments/{id}` | Detail |
| POST | `/api/recommended-equipments` | Create |
| PUT | `/api/recommended-equipments/{id}` | Full update |
| DELETE | `/api/recommended-equipments/{id}` | Delete |

`?cable_id=xxx` parameter: returns equipment matching that cable's specs (server-side rules engine).

### 4.8 Taxonomy Aggregation

| Method | Path | Description |
|---|---|---|
| GET | `/api/taxonomy` | Full taxonomy tree (industries + categories + product_types) |

Frontend `lib/api.ts` `api.taxonomy.all()` calls this endpoint. Single request returns complete structure, replacing `taxonomy.json` file read.

### Response Formats

**Success (list)**:
```json
{ "items": [...], "total": 123, "page": 1, "page_size": 20 }
```

**Success (detail)**:
```json
{ "id": "...", "field1": "...", ... }
```

**Error** (project memory constraint):
```json
{ "code": 404, "message": "Cable not found" }
```

**Validation error**:
```json
{ "code": 422, "message": "Validation error", "details": [ { "field": "size_system", "error": "Invalid value" } ] }
```

### Key API Decisions

1. **Categories/ProductTypes nested routes**: Express ownership, self-documenting URLs. CRUD automatically validates hierarchy.
2. **Cables list embeds facets**: Single request returns data + filter stats, reduces round trips. Aligned with frontend `filterCables` + `buildFacets`.
3. **by-url endpoint**: Frontend detail page queries by brand_slug + cable_slug, not database ID. Preserves URL-driven pattern.
4. **spec_filters as JSON string**: HTTP query string cannot pass JSON objects directly. Frontend `JSON.stringify()`, backend parses.
5. **Taxonomy aggregation endpoint**: Single request returns full tree, frontend needs one fetch to replace JSON file read.
6. **Industries not paginated**: 6 records, full return is more convenient.

## 5. Frontend Migration

### Principle

**lib/api.ts public interface unchanged** — all components and pages require zero modification. Internally switches from `import JSON` to `fetch('/api/...')`.

### Migration Scope

| Current | After Migration | Impact |
|---|---|---|
| `import cablesData from '@/data/cables.json'` | `fetch('/api/cables?...')` | api.ts internal |
| `import taxonomyData from '@/data/taxonomy.json'` | `fetch('/api/taxonomy')` | api.ts internal |
| `import brandsData from '@/data/brands.json'` | `fetch('/api/brands')` | api.ts internal |
| `import manufacturersData from '@/data/manufacturers.json'` | `fetch('/api/manufacturers')` | api.ts internal |
| `import categoriesData from '@/data/categories.json'` | **Keep import** (legacy redirect, not in DB) | Unchanged |
| `import recommendedEquipmentsData from '@/data/recommended-equipments.json'` | `fetch('/api/recommended-equipments')` | api.ts internal |

### Core Change: Synchronous JSON → Async Fetch

**Before** (synchronous):
```typescript
import cablesData from '@/data/cables.json';
const cables = cablesData as Cable[];
export const api = {
  cables: {
    all(): Cable[] { return cables; },
  }
};
```

**After** (asynchronous):
```typescript
export const api = {
  cables: {
    async all(): Promise<Cable[]> { ... },
  }
};
```

All callers must use `await`. Next.js App Router Server Components natively support `async/await`.

### Caching Strategy

```typescript
const cache = new Map<string, { data: unknown; expires: number }>();

async function fetchWithCache<T>(url: string, ttlMs: number = 60_000): Promise<T> {
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return cached.data as T;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  cache.set(url, { data, expires: Date.now() + ttlMs });
  return data as T;
}
```

- `fetch(url, { next: { revalidate: 60 } })`: Next.js ISR-level cache, 60-second revalidation
- In-memory cache: prevents duplicate fetches within same SSR request
- `revalidate` value adjustable per endpoint (taxonomy changes less → longer TTL)

### API URL Resolution

```typescript
// In lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
// Production: empty string → fetch('/api/...') → Nginx reverse proxy
// Local dev: 'http://localhost:8000' → direct FastAPI call
```

`.env.local` (local dev):
```
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

Production: this variable is unset — Nginx handles routing.

### Page-Level Migration

Server Components only need `async` + `await`:

**Before**:
```typescript
export default function CableDetailPage({ params }) {
  const detail = api.getCableDetail(params.brand_slug, params.slug);
}
```

**After**:
```typescript
export default async function CableDetailPage({ params }) {
  const detail = await api.getCableDetail(params.brand_slug, params.slug);
}
```

Client components receive data via props — unchanged pattern.

### Search on /cables Overview

Current: `filterCablesByText` runs client-side. After migration:

**Recommended**: URL-driven SSR search. Search box changes URL query params (`?q=xxx`), Server Component fetches with params. No client-side fetch needed. SEO-friendly, consistent with Next.js patterns.

### Unchanged Files

| File | Reason |
|---|---|
| categories.json + api.categories.* | Legacy redirect only, not in DB |
| lib/filter.ts | Pure frontend filtering logic, can migrate to backend later |
| lib/validate.ts | Build-time validation, still reads JSON |
| lib/seo.ts | Receives api-returned objects, doesn't care about data source |
| All component files | Receive props, don't care about data source |
| frontend/data/*.json | Seed data source, retained. Can archive after backend is live |

### Migration Checklist

- [ ] lib/api.ts all methods → async
- [ ] All pages add async/await
- [ ] fetchWithCache + ISR revalidate
- [ ] API response → existing TypeScript type adapter functions
- [ ] `npm run build` passes
- [ ] All pages verified locally
- [ ] lib/validate.ts still reads JSON (build-time, unaffected)

## 6. Seed Script & Data Migration

### Seed Script

**File**: `backend/scripts/seed.py`

**Execution order** (by FK dependency):

```
1. manufacturers.json  → manufacturers table
2. brands.json         → brands table (depends on manufacturers)
3. taxonomy.json       → industries + categories + product_types (3-level order)
4. cables.json         → cables table (depends on brands + product_types)
5. cables.json         → cable_variants table (depends on cables)
6. cables.json         → spec_items table (depends on cables + cable_variants, common + variant specs)
7. recommended-equipments.json → recommended_equipments table
```

**Idempotent design**: Truncate all tables in reverse FK order, then insert in dependency order. Seed data always matches JSON files.

```python
async def seed_all():
    await truncate_tables([
        "spec_items", "cable_variants", "cables",
        "recommended_equipments", "product_types", "categories", "industries",
        "brands", "manufacturers"
    ])
    await seed_manufacturers()
    await seed_brands()
    await seed_industries()
    await seed_categories()
    await seed_product_types()
    await seed_cables()      # includes cables + variants + spec_items
    await seed_equipment()
```

**cables.json parsing** (most complex):

- Insert cable record with product_type_id derived from `industry/category/product_type` keys
- Insert common_specs with `variant_id = NULL`
- For each variant: insert cable_variant, then insert variant specs with `variant_id = variant.id`
- spec_item value mapping: `type=number` → `value_number`, `type=enum|string` → `value_string`

**taxonomy.json parsing**:

- Industry: id = industry key, slug/label from JSON
- Category: id = `{industry_key}/{category_key}`, FK to industry
- Product type: id = `{industry_key}/{category_key}/{pt_key}`, FK to category, filters as JSONB

**CLI usage**:

```bash
cd backend
python -m scripts.seed                     # Full seed
python -m scripts.seed --only manufacturers # Single table (dev debug)
python -m scripts.seed --dry-run            # Print only, no writes
```

### Alembic Migrations

**Initialization**:

```bash
cd backend
alembic init alembic
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

**Workflow**:

1. Modify `models/*.py` ORM models
2. `alembic revision --autogenerate -m "description"`
3. Review generated migration file
4. `alembic upgrade head`
5. Commit migration file to git

**Deploy**: `deploy.sh` automatically runs `alembic upgrade head` (before seed script).

### Local Dev Setup

**PostgreSQL** (Windows):

```powershell
# 1. Install PostgreSQL 16
# 2. Create database
psql -U postgres -c "CREATE DATABASE unowire;"
psql -U postgres -c "CREATE USER unowire WITH PASSWORD 'unowire_dev';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE unowire TO unowire;"
```

**Backend environment**:

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # Edit DATABASE_URL
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload --port 8000
```

## 7. Deployment Integration

### 7.1 PM2 Configuration

**File**: `deploy/ecosystem.config.cjs`

Add `unowire-backend` process:

```javascript
module.exports = {
  apps: [
    {
      name: 'unowire-frontend',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/var/www/unowire/frontend',
      env: { NODE_ENV: 'production', PORT: 3000 },
    },
    {
      name: 'unowire-backend',
      script: 'venv/bin/gunicorn',
      args: 'app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000',
      cwd: '/var/www/unowire/backend',
      env: { DATABASE_URL: 'postgresql://unowire:xxx@127.0.0.1:5432/unowire' },
    },
  ],
};
```

### 7.2 Nginx Configuration

**File**: `deploy/nginx-unowire.conf`

Add `/api/` location block:

```nginx
server {
    listen 443 ssl http2;
    server_name www.unowire.com;

    # ... existing SSL/security headers ...

    # Next.js frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # FastAPI backend (new)
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
}
```

### 7.3 deploy.sh

**File**: `deploy/deploy.sh`

Add backend deployment steps:

```bash
#!/bin/bash
set -e
BRANCH=${1:-master}
cd /var/www/unowire
git fetch origin
git checkout $BRANCH
git pull origin $BRANCH

# Frontend
cd /var/www/unowire/frontend
npm install
npm run build
pm2 reload unowire-frontend

# Backend
cd /var/www/unowire/backend
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
pm2 reload unowire-backend

pm2 save
```

### 7.4 Backend Dependencies

**File**: `backend/requirements.txt`

```
fastapi==0.115.*
uvicorn[standard]==0.34.*
gunicorn==23.*
sqlalchemy[asyncio]==2.0.*
alembic==1.14.*
asyncpg==0.30.*
pydantic==2.*
pydantic-settings==2.*
```

### 7.5 Environment Variables

| Variable | Frontend | Backend | Description |
|---|---|---|---|
| `DATABASE_URL` | - | Yes | `postgresql+asyncpg://unowire:pw@127.0.0.1:5432/unowire` |
| `NEXT_PUBLIC_API_BASE` | Yes | - | Local: `http://localhost:8000`; Production: empty (Nginx) |

## 8. Scope Boundaries

### In Scope (Step 2)

- FastAPI application with full CRUD API (no auth)
- PostgreSQL schema (11 tables including users/audit_log)
- SQLAlchemy 2.0 ORM models + Alembic migrations
- Pydantic schemas for request/response validation
- Seed scripts (JSON → PostgreSQL)
- lib/api.ts migration (sync JSON → async fetch)
- Page-level async/await additions
- Nginx /api/ reverse proxy config
- PM2 backend process config
- deploy.sh update
- `npm run build` + smoke test verification

### Out of Scope

- Admin panel UI (Step 3)
- JWT authentication middleware (Step 3)
- Rate limiting
- API versioning
- Docker/CI/CD (project memory: not in MVP)
- Automated API tests (project memory: no automated tests for MVP)
- lib/filter.ts migration to backend (future optimization)
- lib/validate.ts changes (build-time, still reads JSON)
- categories.json removal (legacy redirect, stays as file)
- Frontend data/*.json removal (archive after backend is live, not a code change)
