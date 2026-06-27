# Unowire MVP Design Spec

**Date:** 2026-06-27
**Project:** Unowire — Wire Harness Industry Cable-to-Equipment Matching Platform
**Phase:** MVP (targeting future industry-grade database)
**Language:** All code, docs, and UI in English (i18n deferred)

---

## 1. Overview

### 1.1 Goal

Build a website for the wire harness industry where users can:
1. Search cable parameters by manufacturer and brand
2. Get automatic equipment recommendations (semi-auto stripping machines, fully-auto cutting & stripping machines) that can process a given cable
3. Each equipment type returns top-N best matches with transparent scoring

### 1.2 Target User

Wire harness factory procurement / process engineers who know which cable they need to process and want to quickly find suitable equipment, avoiding selection errors.

### 1.3 MVP Scope

- **Equipment types:** semi-auto stripping machine, fully-auto cutting & stripping machine (2 types)
- **Data source:** user's own equipment data + common cable specs (CSV/JSON batch import)
- **Match logic:** rule-based with scoring (rules stored in DB, configurable)
- **Future path:** evolve into industry-level cable + equipment aggregation database

### 1.4 Out of Scope (MVP)

- Reverse matching (given equipment, find processable cables)
- Admin UI for data entry (use seed scripts + CSV files)
- i18n (ship English-only first)
- Docker, CI/CD (manual deployment)
- Frontend unit tests
- AI-based recommendations

---

## 2. Architecture

### 2.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | FastAPI + Python 3.11 + SQLAlchemy ORM |
| Database | PostgreSQL 15 |
| Process Manager | PM2 (frontend), systemd (backend) |
| Reverse Proxy | Nginx |

### 2.2 Deployment Topology

```
                    Internet
                       │
                       ▼
              ┌────────────────┐
              │  Nginx (80/443) │  ← SSL termination + reverse proxy
              └────────┬───────┘
                       │
          ┌────────────┼────────────┐
          ▼                         ▼
   ┌──────────────┐         ┌──────────────┐
   │ Next.js      │         │ FastAPI      │
   │ localhost:3000│        │ localhost:8000│
   │ (PM2)        │         │ (Gunicorn +  │
   │              │         │  Uvicorn)    │
   └──────────────┘         └──────┬───────┘
                                   │
                                   ▼
                           ┌──────────────┐
                           │ PostgreSQL   │
                           │ localhost:5432│
                           └──────────────┘
```

- **Domain:** `www.unowire.com`
- **Same-origin deployment:** frontend serves `/`, backend serves `/api/` — no CORS issues in production
- Backend retains CORS support for future split deployment

### 2.3 Monorepo Structure

```
unowire/
├── frontend/                    # Next.js 14 App Router
├── backend/                     # FastAPI
├── docs/                        # Project documentation
│   └── superpowers/
│       └── specs/               # Design specs
├── scripts/                     # Cross-project scripts (deployment, etc.)
├── .gitignore
└── README.md
```

---

## 3. Data Model

PostgreSQL schema. All field names in English.

### 3.1 `manufacturers`

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| name | varchar | Manufacturer name |
| slug | varchar UNIQUE | URL slug, e.g. "hitachi-cable" |
| type | enum | `cable_manufacturer` / `equipment_manufacturer` |
| country | varchar | Country |
| website | varchar | Official website |
| description | text | Brief intro |
| created_at | timestamp | |
| updated_at | timestamp | |

**Indexes:** `slug` (UNIQUE)

### 3.2 `cables`

| Field | Type | Notes | Example |
|-------|------|-------|---------|
| id | UUID PK | | |
| manufacturer_id | FK → manufacturers | | |
| brand | varchar | Brand | "Hitachi Cable" |
| brand_slug | varchar | Brand slug (denormalized for URL) | "hitachi-cable" |
| model | varchar | Model | "UL1007" |
| slug | varchar UNIQUE | Full slug, e.g. "ul1007-awg24" | "ul1007-awg24" |
| spec | varchar | Full spec | "UL1007 AWG24" |
| awg | varchar | AWG number | "24" |
| conductor_area | numeric (mm²) | Conductor cross-section | 0.205 |
| outer_diameter | numeric (mm) | Max outer diameter | 1.40 |
| insulation_material | varchar | Insulation material | "PVC" |
| shielding | enum | Shielding | `none` / `braided` / `spiral` / `foil` |
| jacket | enum | Jacket | `none` / `pvc` / `pu` / `lszh` |
| core_structure | enum | Core structure | `single` / `2_core` / `3_core` / `4_core` / `multi_core` |
| rated_voltage | varchar | Rated voltage | "300V" |
| temperature_rating | varchar | Temperature rating | "105°C" |
| description | text | SEO-friendly long description (for Google indexing) | |
| meta_title | varchar | Custom SEO title (optional, falls back to spec) | |
| meta_description | varchar | Custom meta description (optional) | |
| created_at | timestamp | | |
| updated_at | timestamp | | |

**Indexes:** `brand`, `model`, `awg`, `manufacturer_id`, `slug` (UNIQUE), `(brand_slug, slug)` composite

**URL pattern:** `/cables/{brand_slug}/{slug}` — pseudo-static, e.g. `/cables/hitachi-cable/ul1007-awg24`

**Note:** `rated_voltage` and `temperature_rating` are display-only fields in MVP (not match dimensions). They can be promoted to match rules later without schema changes — just insert new rows into `match_rules` and add corresponding capacity fields to `equipments` if needed.

### 3.3 `equipments`

| Field | Type | Notes | Example |
|-------|------|-------|---------|
| id | UUID PK | | |
| manufacturer_id | FK → manufacturers | | |
| brand | varchar | Brand | "KMV" |
| brand_slug | varchar | Brand slug (denormalized for URL) | "kmv" |
| model | varchar | Model | "CS-800" |
| slug | varchar UNIQUE | Full slug, e.g. "cs-800" | "cs-800" |
| equipment_type | enum | Type | `semi_auto_stripping` / `fully_auto_cutting_stripping` |
| automation_level | enum | Automation | `semi_auto` / `fully_auto` |
| conductor_area_min | numeric (mm²) | Conductor area lower bound | 0.05 |
| conductor_area_max | numeric (mm²) | Conductor area upper bound | 2.5 |
| outer_diameter_min | numeric (mm) | OD lower bound | 0.5 |
| outer_diameter_max | numeric (mm) | OD upper bound | 5.0 |
| cut_length_min | numeric (mm) | Cut length lower bound | 10 |
| cut_length_max | numeric (mm) | Cut length upper bound | 99999 |
| supported_shieldings | jsonb | Supported shielding values | `["none","braided","spiral","foil"]` |
| supported_jackets | jsonb | Supported jacket values | `["none","pvc","pu","lszh"]` |
| supported_cores | jsonb | Supported core structures | `["single","2_core","3_core"]` |
| image_url | varchar | Equipment image URL | |
| spec_pdf_url | varchar | Spec sheet PDF URL | |
| description | text | SEO-friendly long description | |
| meta_title | varchar | Custom SEO title (optional) | |
| meta_description | varchar | Custom meta description (optional) | |
| created_at | timestamp | | |
| updated_at | timestamp | | |

**Indexes:** `brand`, `equipment_type`, `slug` (UNIQUE), `(brand_slug, slug)` composite, `(equipment_type, conductor_area_min, conductor_area_max)`; GIN index on `supported_shieldings`, `supported_jackets`, `supported_cores`

**URL pattern:** `/equipments/{brand_slug}/{slug}` — pseudo-static, e.g. `/equipments/kmv/cs-800`

**Design decision:** Both equipment types (`semi_auto_stripping` and `fully_auto_cutting_stripping`) share the same matching dimensions and the same schema fields. The difference is only the `equipment_type` and `automation_level` enum values. This keeps the match rules table uniform across types.

### 3.4 `match_rules`

Rules stored in DB — the core of the configurable rule engine.

| Field | Type | Notes | Example |
|-------|------|-------|---------|
| id | UUID PK | | |
| equipment_type | enum | Equipment type | `semi_auto_stripping` |
| cable_field | varchar | Cable field name | "conductor_area" |
| operator | enum | Comparison operator | `range` / `in` / `eq` |
| equipment_field | varchar | Equipment field name(s) | "conductor_area_min,max" |
| weight | numeric | Score weight | 1.0 |
| is_required | bool | Hard filter if true | true |
| description | varchar | Rule description | "Conductor area must be within equipment capacity range" |

**Sample rules** (applied identically to both equipment types):

| equipment_type | cable_field | operator | equipment_field | weight | is_required |
|---|---|---|---|---|---|
| semi_auto_stripping | conductor_area | range | conductor_area_min,max | 1.0 | true |
| semi_auto_stripping | outer_diameter | range | outer_diameter_min,max | 0.8 | true |
| semi_auto_stripping | cut_length | range | cut_length_min,max | 0.5 | false |
| semi_auto_stripping | shielding | in | supported_shieldings | 0.7 | true |
| semi_auto_stripping | jacket | in | supported_jackets | 0.6 | true |
| semi_auto_stripping | core_structure | in | supported_cores | 0.9 | true |

(Same 6 rules apply to `fully_auto_cutting_stripping`.)

**Semantics:**
- `is_required=true` → hard filter; failing any required rule eliminates the equipment
- `is_required=false` → soft rule; failing deducts weight from score but keeps the equipment
- `weight` → relative importance in scoring
- `operator=range` → numeric interval check: `equip_min <= cable_value <= equip_max`
- `operator=in` → enum containment: `cable_value in equip_list` (jsonb)
- `operator=eq` → exact equality

**Adding a new equipment type** (e.g., terminal crimping machine in future): insert rules into `match_rules` + add capacity fields to `equipments` if needed. The Python scoring path requires zero code change. If the new type introduces *new* required rule fields, the SQL pre-filter (Phase 1) may need extension — see section 4.3 for the extensibility trade-off.

### 3.5 Config via Environment Variables (not a DB table)

```env
MATCH_TOP_N=3              # Max results per equipment type
MATCH_SCORE_THRESHOLD=0.0  # Min score to include (0 = no filter)
```

Read by backend `core/config.py` at startup.

---

## 4. Matching Engine

Location: `backend/app/engine/`

### 4.1 Module Layout

```
backend/app/engine/
├── rules_engine.py   # Main 3-phase algorithm
├── operators.py      # range / in / eq implementations
└── scorer.py         # Score calculation
```

Pure functions, no side effects, easy to unit test.

### 4.2 Input/Output Contract

**Input:**
```json
{
  "cable_id": "uuid",
  "cable_params": { "conductor_area": 0.205, "outer_diameter": 1.40, ... },
  "cut_length": 100,
  "equipment_types": ["semi_auto_stripping", "fully_auto_cutting_stripping"],
  "top_n": 3
}
```

**Input modes:**
- `cable_id` or `cable_params` — exactly one required (provides cable-intrinsic fields: conductor_area, outer_diameter, shielding, jacket, core_structure). If both absent → 400.
- `cut_length` — optional top-level field (processing parameter, not a cable property). Can be supplied with either mode. If absent, the `cut_length` rule (non-required) is skipped during scoring.

**Why `cut_length` is separate:** Cut length is a user's processing parameter (how long to cut), not an intrinsic cable property. The same cable can be cut to different lengths by different users, so it does not belong in the `cables` table. It is supplied at match time.

**Output:**
```json
{
  "cable": { ...cable object... },
  "results": [
    {
      "equipment_type": "semi_auto_stripping",
      "matches": [
        {
          "equipment": { ...equipment object... },
          "score": 0.92,
          "failed_required": false,
          "matched_rules": [
            {
              "cable_field": "conductor_area",
              "operator": "range",
              "passed": true,
              "required": true,
              "weight": 1.0
            },
            ...
          ],
          "explanation": "All required rules passed. Conductor area (0.205 mm²) within range [0.05, 2.5]. Shielding (none) supported."
        }
      ]
    }
  ]
}
```

### 4.3 Three-Phase Algorithm

**Phase 1 — Hard filter (SQL pre-filter)**
- Evaluate all `is_required=true` range-type rules in SQL using indexed columns
- Enum containment (`in` operator) checked via `jsonb @>` with GIN index
- Any required rule failure → equipment eliminated
- Fast, scalable to thousands of equipments

```sql
SELECT e.* FROM equipments e
WHERE e.equipment_type = :type
  AND e.conductor_area_min <= :cable_area
  AND e.conductor_area_max >= :cable_area
  AND e.outer_diameter_min <= :cable_od
  AND e.outer_diameter_max >= :cable_od
  AND e.supported_shieldings @> :cable_shielding::jsonb
  AND e.supported_jackets @> :cable_jacket::jsonb
  AND e.supported_cores @> :cable_core::jsonb
```

**Note on SQL pre-filter scope:** For MVP, the SQL pre-filter is hardcoded for the 6 current required rules (conductor_area, outer_diameter, shielding, jacket, core_structure). This is an optimization — the Python scoring phase (Phase 2) reads rules dynamically from the `match_rules` table. 

**Extensibility trade-off:** Adding a new equipment type that reuses the same rule fields requires zero engine code change (only DB inserts). Adding a new equipment type with *new* required rule fields requires extending the SQL pre-filter (or falling back to Python-only evaluation for that type). The Python scoring path remains fully rule-driven and generic.

**Phase 2 — Scoring (in Python)**
- For surviving equipments, evaluate ALL rules (required + non-required)
- Score = (sum of weights for passed rules) / (sum of all weights)
- Range: 0.0 to 1.0

Example: 6 rules with weights [1.0, 0.8, 0.5, 0.7, 0.6, 0.9]
- All pass → score = 1.0
- Only `cut_length` (weight 0.5, non-required) fails → score = (1.0+0.8+0.7+0.6+0.9)/(1.0+0.8+0.5+0.7+0.6+0.9) = 4.0/4.5 ≈ 0.89

**Phase 3 — Rank and return top N**
- Sort by score descending
- Take top N (from env var `MATCH_TOP_N`, default 3)
- Filter by score threshold if `MATCH_SCORE_THRESHOLD > 0`
- Attach human-readable `explanation` per equipment

### 4.4 Operator Implementations

```python
def eval_range(cable_value: float, equip_min: float, equip_max: float) -> bool:
    return equip_min <= cable_value <= equip_max

def eval_in(cable_value: str, equip_list: list[str]) -> bool:
    return cable_value in equip_list

def eval_eq(cable_value: str, equip_value: str) -> bool:
    return cable_value == equip_value
```

Engine dispatches to the right function based on `operator` field. Adding a new operator = one new function + one dispatch entry. No schema change.

### 4.5 Key Properties

1. **Rule-driven, not hardcoded** — engine logic is generic; new equipment types added via DB rows
2. **Transparent** — every match returns per-rule pass/fail + human-readable explanation
3. **Normalized score** — 0-1 ratio, cross-type comparable, threshold-filterable
4. **Pure functions** — no side effects, easy unit testing
5. **Hybrid SQL + Python** — SQL pre-filter for scale, Python scoring for flexibility

---

## 5. API Design

RESTful JSON API. FastAPI auto-generates OpenAPI docs at `/docs`.

### 5.1 Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cables` | Cable list (pagination, filtering, search) |
| GET | `/api/cables/{id}` | Cable detail by UUID |
| GET | `/api/cables/by-slug/{brand_slug}/{slug}` | Cable detail by slug (for ISR pages) |
| GET | `/api/cables/search` | Search by AWG/model/brand |
| GET | `/api/cables/sitemap` | All cable slugs + lastmod (for sitemap generation) |
| GET | `/api/equipments` | Equipment list |
| GET | `/api/equipments/{id}` | Equipment detail by UUID |
| GET | `/api/equipments/by-slug/{brand_slug}/{slug}` | Equipment detail by slug |
| GET | `/api/equipments/sitemap` | All equipment slugs + lastmod |
| GET | `/api/manufacturers` | Manufacturer list |
| GET | `/api/manufacturers/{slug}` | Manufacturer detail by slug |
| GET | `/api/manufacturers/{slug}/cables` | Cables by manufacturer |
| GET | `/api/manufacturers/{slug}/equipments` | Equipments by manufacturer |
| **POST** | **`/api/match`** | **Core match endpoint** |
| GET | `/api/health` | Health check |

### 5.2 `POST /api/match`

**Request:**
```json
{
  "cable_id": "uuid",
  "cable_params": {
    "conductor_area": 0.205,
    "outer_diameter": 1.40,
    "shielding": "none",
    "jacket": "pvc",
    "core_structure": "single"
  },
  "cut_length": 100,
  "equipment_types": ["semi_auto_stripping", "fully_auto_cutting_stripping"],
  "top_n": 3
}
```

- `cable_id` or `cable_params` — exactly one required (provides cable-intrinsic fields)
- `cut_length` — optional top-level field (processing parameter; if absent, `cut_length` rule is skipped)
- `equipment_types` — array of types to match against
- `top_n` — optional; defaults to env var `MATCH_TOP_N`

**Errors:**
- `400 BAD_REQUEST` — both `cable_id` and `cable_params` provided, or neither
- `404 NOT_FOUND` — `cable_id` does not exist
- `422 UNPROCESSABLE_ENTITY` — request body validation failed (FastAPI auto)

### 5.3 `GET /api/cables`

**Query params:**
- `q` — search keyword (matches brand/model/spec)
- `awg` — filter by AWG
- `brand` — filter by brand
- `manufacturer_id` — filter by manufacturer
- `shielding`, `jacket`, `core_structure` — enum filters
- `conductor_area_min`, `conductor_area_max` — range filter
- `outer_diameter_min`, `outer_diameter_max` — range filter
- `page` (default 1), `page_size` (default 20)

**Response:**
```json
{
  "items": [...],
  "total": 156,
  "page": 1,
  "page_size": 20
}
```

### 5.4 Error Response Format

```json
{
  "error": {
    "code": "CABLE_NOT_FOUND",
    "message": "Cable with id xxx not found"
  }
}
```

Common codes: `BAD_REQUEST`, `NOT_FOUND`, `UNPROCESSABLE_ENTITY`, `INTERNAL_ERROR`.

### 5.5 Design Decisions

1. **Match uses POST, queries use GET** — match input is complex (array + params); queries are cacheable/shareable
2. **Match response inlines cable info** — avoids extra round trip
3. **`matched_rules` transparency** — frontend can render match-detail table
4. **Unified pagination** — `page` + `page_size` + `total` across all list endpoints
5. **FastAPI OpenAPI auto-docs** — frontend dev references `/docs` directly

---

## 6. Frontend Pages

Next.js 14 App Router. Tailwind + shadcn/ui. English-only UI (i18n deferred).

**SEO-first design:** The site is a "yellow pages" directory — content generation for Google indexing is a primary goal. All detail pages use pseudo-static URLs (slug-based), Server-Side Rendering (SSR) or Incremental Static Regeneration (ISR), structured data (Schema.org), and full meta tag support.

### 6.1 Page Inventory

| Route | Page | Rendering |
|-------|------|-----------|
| `/` | Home (directory portal + search) | SSG |
| `/cables` | Cable directory list (filters sidebar) | SSR (dynamic filters) |
| `/cables/[brand_slug]/[slug]` | Cable detail (pseudo-static) | ISR (revalidate every 3600s) |
| `/equipments` | Equipment directory list | SSR |
| `/equipments/[brand_slug]/[slug]` | Equipment detail (pseudo-static) | ISR |
| `/manufacturers` | Manufacturer directory list | SSG |
| `/manufacturers/[slug]` | Manufacturer detail (pseudo-static) | ISR |
| `/match` | Match result (interactive tool) | CSR (client-side) |
| `/sitemap.xml` | Dynamic sitemap | Route handler |
| `/robots.txt` | Robots | Static |

### 6.2 Home `/`

Yellow pages directory portal:
- Hero with tagline "Wire Harness Industry Directory — Find Cables & Processing Equipment"
- Prominent search box (brand/model/AWG/spec) → `/cables?q=xxx`
- "Browse by category" cards: Cables, Equipment, Manufacturers
- "Match by parameters" CTA → `/match`
- Popular cable brands (browseable links for SEO internal linking)
- How-it-works: 1. Search cable → 2. View specs → 3. Get matched equipment

### 6.3 Cable Directory `/cables`

Yellow pages style directory listing with filters:
- Left sidebar filters:
  - Manufacturer (multi-select, searchable)
  - AWG (multi-select)
  - Cross-section (mm²) range slider
  - OD (mm) range slider
  - Shielding (multi-select)
  - Jacket (multi-select)
  - Core structure (multi-select)
- Right: directory cards (model, brand, key params, link to detail). Pagination at bottom.
- Each card links to pseudo-static detail page `/cables/{brand_slug}/{slug}` (SEO internal linking)
- Breadcrumbs: Home > Cables > [Brand] (structured data)

### 6.4 Cable Detail `/cables/[brand_slug]/[slug]`

**Pseudo-static, ISR-rendered, SEO-optimized.**

- `generateStaticParams()` pre-generates all cable pages at build time
- `generateMetadata()` produces per-page title/description/OG tags
- Full spec table (all fields including rated_voltage, temperature_rating)
- SEO long description section (rendered from `description` field)
- Breadcrumbs: Home > Cables > [Brand] > [Model] (with BreadcrumbList structured data)
- Schema.org Product structured data (JSON-LD) with all specs
- `[Match Equipment →]` button → `/match?cable_id=xxx`
- Internal links: same-brand cables, same-AWG cables (SEO cross-linking)

### 6.5 Equipment Detail `/equipments/[brand_slug]/[slug]`

- `generateStaticParams()` + `generateMetadata()` (same as cable)
- Full equipment params, capacity ranges, supported cable types
- Schema.org Product structured data
- Spec PDF download
- Manufacturer link
- Internal links: same-type equipment, same-brand equipment

### 6.6 Manufacturer Detail `/manufacturers/[slug]`

- Manufacturer info + logo
- List of their cables (link to cable detail pages)
- List of their equipment (link to equipment detail pages)
- Schema.org Organization structured data

### 6.7 Match Page `/match` (Interactive Tool)

Dual entry:
- From cable detail: URL `?cable_id=xxx` auto-fills cable params
- Direct access: user fills cable param form

Form fields: conductor_area, outer_diameter, cut_length, shielding, jacket, core_structure.
Equipment type checkboxes (semi_auto_stripping, fully_auto_cutting_stripping).
`[Match]` button triggers `POST /api/match`.

Results:
- Grouped by equipment type (collapsible sections)
- Each card: rank #, brand, model, score (progress bar), image, per-rule ✓/✗, link to equipment detail page, `[Download PDF]`
- Top N fixed (read from backend config, not user-configurable in UI)

Note: Match page is the only non-indexable interactive page. `noindex` meta tag applied (it's a tool, not content).

### 6.8 SEO Infrastructure

**Sitemap (`/sitemap.xml`):**
- Dynamic route handler querying all cables, equipments, manufacturers
- Outputs `<urlset>` with lastmod from `updated_at`
- Cable/equipment detail URLs use pseudo-static slugs

**Robots.txt (`/robots.txt`):**
- Allow all crawling
- Point to sitemap: `Sitemap: https://www.unowire.com/sitemap.xml`
- Disallow `/match` (interactive tool, not content)
- Disallow `/api/`

**Per-page SEO (`generateMetadata`):**
- Title: `{spec} | {brand} | Unowire` (or `meta_title` if set)
- Description: `meta_description` or first 160 chars of `description` or auto-generated from specs
- canonical URL: `https://www.unowire.com{pathname}`
- OG tags: title, description, image (equipment image_url or default)
- robots: `index, follow` for content pages; `noindex` for `/match`

**Structured Data (JSON-LD):**
- Cable detail: `Product` schema with `additionalProperty` for each spec
- Equipment detail: `Product` schema with capacity ranges as properties
- Manufacturer: `Organization` schema
- Breadcrumbs: `BreadcrumbList` schema on all detail pages

### 6.9 Design Decisions

1. **Yellow pages directory form** — browseable, indexable, content-rich pages for Google
2. **Pseudo-static URLs** — slug-based (`/cables/hitachi-cable/ul1007-awg24`), not query params
3. **ISR for detail pages** — pre-rendered at build + revalidated hourly; fast + fresh + indexable
4. **SEO infrastructure first-class** — sitemap, robots, structured data, meta tags built into MVP
5. **Internal linking** — cross-links between cables/equipment/manufacturers boost SEO
6. **Dual-entry match page** — covers "pick cable then match" and "input params directly" flows
7. **Transparent results** — score + per-rule pass/fail builds engineer trust
8. **Top N backend-controlled** — consistency across users; not user-tunable
9. **Responsive** — Tailwind md/lg breakpoints; mobile collapses sidebar to drawer

---

## 7. Project Structure

### 7.1 Frontend `frontend/`

```
frontend/
├── app/
│   ├── layout.tsx               # Root layout (Nav + Footer)
│   ├── page.tsx                 # Home /
│   ├── cables/
│   │   ├── page.tsx             # /cables (directory list)
│   │   └── [brand_slug]/
│   │       └── [slug]/
│   │           └── page.tsx     # /cables/[brand_slug]/[slug] (ISR)
│   ├── equipments/
│   │   ├── page.tsx             # /equipments
│   │   └── [brand_slug]/
│   │       └── [slug]/
│   │           └── page.tsx     # /equipments/[brand_slug]/[slug] (ISR)
│   ├── manufacturers/
│   │   ├── page.tsx             # /manufacturers
│   │   └── [slug]/
│   │       └── page.tsx         # /manufacturers/[slug] (ISR)
│   ├── match/
│   │   └── page.tsx             # /match (noindex, CSR)
│   ├── sitemap.ts               # /sitemap.xml route handler
│   └── robots.ts                # /robots.txt route handler
├── components/
│   ├── ui/                      # shadcn/ui base components
│   ├── layout/                  # Nav, Footer, Container, Breadcrumbs
│   ├── cable/                   # CableCard, CableFilters, CableSpecs
│   ├── equipment/               # EquipmentCard, EquipmentSpecs
│   ├── match/                   # MatchForm, MatchResult, RuleBadge
│   ├── seo/                     # JsonLd, BreadcrumbJsonLd, ProductJsonLd
│   └── shared/                  # SearchBox, Pagination, ScoreBar
├── lib/
│   ├── api.ts                   # API client (fetch wrapper)
│   ├── types.ts                 # TypeScript types
│   ├── seo.ts                   # SEO helpers (metadata generation, JSON-LD)
│   └── utils.ts                 # slug helpers, formatters
├── public/                      # Static assets (equipment images, default OG)
├── package.json
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

### 7.2 Backend `backend/`

```
backend/
├── app/
│   ├── main.py                  # FastAPI entry
│   ├── api/
│   │   ├── deps.py              # Dependency injection (DB session)
│   │   ├── cables.py
│   │   ├── equipments.py
│   │   ├── match.py
│   │   └── manufacturers.py
│   ├── models/                  # SQLAlchemy ORM models
│   │   ├── cable.py
│   │   ├── equipment.py
│   │   ├── match_rule.py
│   │   └── manufacturer.py
│   ├── engine/                  # Matching engine (core module)
│   │   ├── rules_engine.py
│   │   ├── operators.py
│   │   └── scorer.py
│   ├── schemas/                 # Pydantic request/response models
│   │   ├── cable.py
│   │   ├── equipment.py
│   │   └── match.py
│   ├── core/
│   │   ├── config.py            # Settings (env vars, DB URL)
│   │   └── database.py          # DB connection / session
│   └── crud/                    # DB CRUD operations
│       ├── cable.py
│       └── equipment.py
├── scripts/
│   └── seed/
│       ├── init_db.py           # Create tables (DROP + CREATE, repeatable)
│       ├── seed_manufacturers.py
│       ├── seed_cables.py
│       ├── seed_equipments.py
│       ├── seed_rules.py
│       └── data/                # CSV data files (user-maintained)
│           ├── manufacturers.csv
│           ├── cables.csv
│           └── equipments.csv
├── tests/
│   ├── conftest.py              # pytest fixtures (real PostgreSQL test DB)
│   ├── test_engine.py           # Engine unit tests
│   ├── test_operators.py        # Operator unit tests
│   └── test_api.py              # API integration tests
├── alembic/                     # Reserved for future migrations
├── requirements.txt
├── pyproject.toml
└── .env                         # Not in git
```

### 7.3 Design Decisions

1. **Backend layered:** `api/` (routes) → `crud/` (data access) → `models/` (ORM) → `schemas/` (DTO) → `engine/` (business logic)
2. **Engine submodule split:** `rules_engine.py` (main flow) + `operators.py` (operators) + `scorer.py` (scoring). Single responsibility per file.
3. **Schemas separate from models** — ORM models never returned directly; Pydantic schemas act as DTOs
4. **Frontend components grouped by domain** — `cable/`, `equipment/`, `match/` isolated; shared in `shared/`
5. **`alembic/` reserved** — MVP uses `init_db.py` (DROP + CREATE); alembic added later for smooth migrations
6. **Seed scripts read from CSV** — user maintains data files in `scripts/seed/data/`, no code changes needed for data updates
7. **Scripts repeatable** — `INSERT ... ON CONFLICT DO NOTHING` or DELETE-then-INSERT

---

## 8. Data Initialization

### 8.1 Initialization Order

```
1. init_db.py             → Create all tables
2. seed_manufacturers.py  → Insert manufacturers (from data/manufacturers.csv)
3. seed_cables.py         → Insert cables (from data/cables.csv)
4. seed_equipments.py     → Insert equipments (from data/equipments.csv)
5. seed_rules.py          → Insert match rules (hardcoded in script — only 12 rows)
```

Each script independently executable. Repeatable (uses `ON CONFLICT DO NOTHING`).

### 8.2 Seed Data Scope

User has more data than the suggested MVP baseline; scripts support batch CSV import. Suggested minimum for demo:
- Manufacturers: 4-6 (cable + equipment manufacturers)
- Cables: 10-15+ common models (UL1007, AVSS, AWM, etc.)
- Equipments: 8-12+ (semi-auto stripping + fully-auto cutting & stripping)
- Match rules: 12 (6 per equipment type × 2 types)

### 8.3 Configuration

Environment variables in `backend/.env`:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/unowire
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/unowire_test
CORS_ORIGINS=https://www.unowire.com
MATCH_TOP_N=3
MATCH_SCORE_THRESHOLD=0.0
ENVIRONMENT=production
```

Frontend `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=https://www.unowire.com/api
```

---

## 9. Testing Strategy

### 9.1 Backend Tests (pytest)

| Level | File | Scope |
|-------|------|-------|
| Unit | `test_engine.py` | 3-phase algorithm, scoring, top-N, dual-input mode |
| Unit | `test_operators.py` | range/in/eq boundary conditions |
| Integration | `test_api.py` | All API endpoints, error handling |
| Data | `test_seed.py` (optional) | Seed data integrity |

**Engine test cases (critical):**
- `test_required_rule_fail_eliminates_equipment` — failing a required rule removes equipment
- `test_score_all_pass` — all rules pass → score = 1.0
- `test_score_one_soft_fail` — one non-required rule fails → score < 1.0 but equipment kept
- `test_top_n_limit` — more matches than top_n → only top_n returned
- `test_cable_params_mode` — match works with `cable_params` instead of `cable_id`
- `test_cable_id_mode` — match works with `cable_id`
- `test_sql_prefilter_correctness` — SQL pre-filter results match in-memory evaluation
- `test_score_threshold` — low-score equipments filtered out when threshold > 0

**Integration tests connect to real PostgreSQL test DB** (`unowire_test`), not SQLite. Fixtures in `conftest.py` handle setup/teardown.

### 9.2 Frontend Tests

None for MVP. TypeScript compilation provides type safety. Frontend tests deferred until product stabilizes.

### 9.3 Manual Acceptance Checklist

1. Home search box → type "UL1007" → redirect to `/cables?q=UL1007` → results shown
2. Cable page filters: Hitachi + AWG24 → correct results
3. Cable detail → all params shown → click "Match Equipment" → redirect to `/match?cable_id=xxx`
4. Match page direct input → fill params → click Match → two equipment-type sections with top-N results
5. Match results: scores sorted descending, per-rule ✓/✗ displayed, explanation readable
6. Equipment detail page: params, PDF download work
7. Manufacturer list page: complete
8. Mobile responsive: sidebar collapses, cards stack

---

## 10. Deployment

### 10.1 Domain

`www.unowire.com` — same-origin (frontend `/`, backend `/api/`).

### 10.2 Nginx Config

```nginx
server {
    listen 80;
    server_name www.unowire.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name www.unowire.com;

    # SSL certs ...

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /docs {
        # Optional: IP whitelist for production
        proxy_pass http://localhost:8000;
    }
}
```

### 10.3 Process Management

| Service | Tool | Command |
|---------|------|---------|
| Next.js | PM2 | `pm2 start "npm run start" --name unowire-frontend` |
| FastAPI | systemd | `gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000` |
| PostgreSQL | system service | Already installed, auto-start on boot |

### 10.4 Manual Deploy Steps

```bash
# On server
git pull origin main

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/seed/init_db.py
sudo systemctl restart unowire-backend

# Frontend
cd ../frontend
npm ci
npm run build
pm2 restart unowire-frontend

# Nginx
sudo nginx -t && sudo systemctl reload nginx
```

### 10.5 Design Decisions

1. **Same-origin via Nginx** — avoids CORS complexity; backend still supports CORS for future split
2. **Gunicorn + Uvicorn workers** — multi-process production stability
3. **`next start` + PM2** — simple, reliable, auto-restart on crash
4. **No Docker (MVP)** — local PostgreSQL already present; Docker deferred to team/migration phase
5. **No CI/CD (MVP)** — manual `git pull` + restart; add GitHub Actions when process stabilizes
6. **`/docs` optional in production** — FastAPI Swagger useful in dev, close or IP-whitelist in prod

---

## 11. Future Evolution (Beyond MVP)

Documented for architectural awareness; not part of MVP implementation:

- **More equipment types** — terminal crimping machine, etc. (insert rules + add equipment fields; zero engine change)
- **Reverse match API** — given equipment, find processable cables
- **Admin UI** — replace seed scripts with web-based data management
- **i18n** — add `next-intl` for English/Chinese toggle
- **Industry-level database** — aggregate multiple cable + equipment manufacturers
- **AI-assisted recommendations** — similar cable suggestions, common pairing hints (rules stay primary)
- **Alembic migrations** — replace `init_db.py` for schema evolution
- **Docker + CI/CD** — when team grows or deployment frequency increases
- **Data source tracking** — `data_source` field for spec-sheet provenance (trust scoring)

---

## 12. Open Questions / Assumptions

| # | Assumption | Status |
|---|-----------|--------|
| 1 | Both equipment types share identical match dimensions (conductor area, OD, cut length, shielding, jacket, core) | Confirmed |
| 2 | `rated_voltage` and `temperature_rating` are display-only in MVP (not match dimensions) | Confirmed |
| 3 | Shielding/jacket/core_structure use enum classification (not boolean or numeric) | Confirmed |
| 4 | Top N is backend-controlled via env var, not user-tunable in UI | Confirmed |
| 5 | Match endpoint supports both `cable_id` and `cable_params` input modes | Confirmed |
| 6 | Same-origin deployment at `www.unowire.com` | Confirmed |
| 7 | No Docker, no CI/CD for MVP | Confirmed |
| 8 | Frontend has no automated tests in MVP | Confirmed |
| 9 | Integration tests connect to real PostgreSQL test database | Confirmed |
| 10 | No reverse match API in MVP | Confirmed |
