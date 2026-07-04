# Manufacturer Pages — Design Spec

**Date:** 2026-07-04
**Status:** Approved (brainstorming complete)
**Target routes:** `/manufacturers` (index) + `/manufacturers/:slug` (detail)

## Goal

Add a public manufacturer showcase: an A-Z index page at `/manufacturers` and a per-manufacturer detail page at `/manufacturers/:slug`. Admins edit showcase content (description, contact info, featured cables, recommendation slots) by extending the existing `/admin/manufacturers/[id]` page with additional editing blocks.

## Context

- `manufacturers` table exists with 7 columns: `id, slug, name, country, website, image_url, created_at`
- `cables` belong to `brands`, and `brands` belong to `manufacturers` (cable → brand → manufacturer)
- Existing `/cables` page already does in-memory product_type grouping on `api.cables.all()` — same pattern reused here
- Cable detail page at `/cable/[brand_slug]/[slug]` uses SSR + ISR(1h) + Breadcrumbs + JsonLd — reference pattern
- `CableCard` component exists and is reused on home page and cable detail page
- Admin `/admin/manufacturers/[id]` page already edits base fields (name/slug/country/website/image_url)
- No pytest infrastructure; MVP constraint = no automated tests
- `featured_image_sort` / `featured_text_sort` are independent sort columns for two separate recommendation slots

## Architecture

**Approach: Single-table extension + reuse existing patterns**

- **Data:** Extend `manufacturers` table with 10 new nullable columns (no new tables, no FK changes)
- **API:** Extend existing `/api/manufacturers` endpoints' schemas; add 1 new read endpoint `GET /api/manufacturers/slug/{slug}`
- **Frontend index:** SSR (no ISR — list changes should be immediate), two-column layout (A-Z list left, recommendation slots right)
- **Frontend detail:** SSR + ISR(1h), 6-section layout, empty sections auto-hidden
- **Admin edit:** Extend existing `/admin/manufacturers/[id]` page with 4 independent editing blocks (each block saves independently via partial PUT)

### Why this approach

- Minimal schema change (single-table column additions, no migration risk)
- Backend surface stays small (1 new endpoint, schema extension only)
- Reuses existing cable detail page patterns (SSR + ISR + Breadcrumbs + JsonLd)
- Reuses existing `/cables` page pattern (api.cables.all() + in-memory product_type grouping)
- Reuses existing `CableCard` component (no new card components)
- Per-block save (partial PUT) avoids blocking one block's error from saving others

## Data Model

### `manufacturers` table extension

```sql
ALTER TABLE manufacturers ADD COLUMN description TEXT;
ALTER TABLE manufacturers ADD COLUMN founded_year INT;
ALTER TABLE manufacturers ADD COLUMN address VARCHAR(500);
ALTER TABLE manufacturers ADD COLUMN phone VARCHAR(100);
ALTER TABLE manufacturers ADD COLUMN email VARCHAR(200);
ALTER TABLE manufacturers ADD COLUMN featured_cable_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE manufacturers ADD COLUMN featured_image BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE manufacturers ADD COLUMN featured_image_sort INT NOT NULL DEFAULT 0;
ALTER TABLE manufacturers ADD COLUMN featured_text BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE manufacturers ADD COLUMN featured_text_sort INT NOT NULL DEFAULT 0;
```

### Field semantics

| Field | Type | Nullable | Purpose |
|---|---|---|---|
| `description` | TEXT | yes | Rich text (HTML fragment) for "About {name}" section |
| `founded_year` | INT | yes | Year established (shown in header metadata row) |
| `address` | VARCHAR(500) | yes | Contact info — empty = hide on page |
| `phone` | VARCHAR(100) | yes | Contact info — empty = hide on page |
| `email` | VARCHAR(200) | yes | Contact info — empty = hide on page |
| `featured_cable_ids` | JSONB array | no (default `[]`) | Cable IDs to feature in "Featured Cables" section |
| `featured_image` | BOOLEAN | no (default FALSE) | Whether manufacturer appears in image recommendation slot |
| `featured_image_sort` | INT | no (default 0) | Sort order within image recommendation slot (ascending) |
| `featured_text` | BOOLEAN | no (default FALSE) | Whether manufacturer appears in text recommendation slot |
| `featured_text_sort` | INT | no (default 0) | Sort order within text recommendation slot (ascending) |

### Pydantic schema extension (`backend/app/schemas/manufacturer.py`)

- `ManufacturerBase`: append all 10 fields with defaults (`description: str | None = None`, `founded_year: int | None = None`, `address/phone/email: str | None = None`, `featured_cable_ids: list[str] = []`, `featured_image: bool = False`, `featured_image_sort: int = 0`, `featured_text: bool = False`, `featured_text_sort: int = 0`)
- `ManufacturerCreate` / `ManufacturerUpdate`: append corresponding Optional fields (all optional for partial update)
- `ManufacturerRead`: auto-includes all new fields

### Alembic migration

Generate a new migration file containing the 10 ALTER TABLE statements above. Both `up` and `down` paths must be defined (`down` drops the columns).

## Backend API

### Existing endpoints (schema extension only, no logic change)

| Endpoint | Method | Auth | Change |
|---|---|---|---|
| `/api/manufacturers` | GET | public | Response includes new fields (automatic via Pydantic schema) |
| `/api/manufacturers/{id}` | GET | public | Response includes new fields |
| `/api/manufacturers` | POST | admin | Accepts new fields in body |
| `/api/manufacturers/{id}` | PUT | admin | Accepts new fields in body (partial update) |

### New endpoint

| Endpoint | Method | Auth | Response |
|---|---|---|---|
| `/api/manufacturers/slug/{slug}` | GET | public | `ManufacturerRead` or 404 `{"code": 404, "message": "Manufacturer not found"}` |

**Rationale:** Frontend detail page needs slug-based lookup (mirrors cable's slug-based routes).

### Frontend API client extension (`frontend/lib/api.ts`)

Add `manufacturers.getBySlug(slug: string): Promise<Manufacturer | null>` — try/catch returns null on 404.

## Frontend — Index Page `/manufacturers`

**Route:** `frontend/app/(site)/manufacturers/page.tsx`
**Render:** SSR (no ISR — list changes should be immediate)
**Layout:** Two columns (left main 2/3, right recommendation sidebar 1/3)

### Left column — A-Z grouped name list

1. Fetch `api.manufacturers.all()`
2. Group by `name[0].toUpperCase()` (numbers/symbols → `#` group)
3. Sort letter groups A-Z ascending; sort manufacturers within each group by name ascending (case-insensitive)
4. For each non-empty letter group render:
   - Heading: `# {Letter}` (`text-2xl font-bold text-gray-900 border-b pb-2 mb-3`)
   - List of `<Link href="/manufacturers/{slug}">{name}</Link>` (one per line, `py-1 text-gray-700 hover:text-blue-600 hover:underline`)
5. Skip letters with no manufacturers (no empty blocks)
6. Empty state: if no manufacturers exist, show `"No manufacturers yet."`

### Right column — Recommendation slots (sticky, `sticky top-20`)

**Slot 1 — Image recommendations (top):**
- Filter manufacturers where `featured_image === true`, sort by `featured_image_sort` ascending, take first 5
- Skip any with empty `image_url` (image slot requires logo)
- Render each as a card: logo image (80x80 rounded) + name + country, link to `/manufacturers/{slug}`
- Cards stacked vertically
- Hide entire slot (including heading) if no matches

**Divider:** `<hr className="my-6 border-gray-200" />` between slots

**Slot 2 — Text recommendations (bottom):**
- Filter manufacturers where `featured_text === true`, sort by `featured_text_sort` ascending, take first 10
- Render each as a text-only link: name, link to `/manufacturers/{slug}`
- Style: `py-2 border-b border-gray-100 last:border-0`
- Hide entire slot (including heading) if no matches

### SEO

- `generateMetadata()`: `{ title: "Manufacturers - Unowire", description: "Browse cable manufacturers A-Z." }`
- Breadcrumbs: Home > Manufacturers
- No JsonLd (index page has no structured data need)

## Frontend — Detail Page `/manufacturers/[slug]`

**Route:** `frontend/app/(site)/manufacturers/[slug]/page.tsx`
**Render:** SSR + ISR 1h (`export const revalidate = 3600;`)
**Layout:** 6 sections in fixed order, empty sections auto-hidden

### Section 1 — Header

- Left: logo (`image_url`, 80x80 rounded; if empty, show first letter as placeholder)
- Right: `<h1>{name}</h1>` + metadata row
- Metadata row joins non-empty fields with ` · ` separator: `country` · `Founded: {founded_year}` · `Website: <a target="_blank" rel="noopener">{website_domain}</a>`
- Website renders as button "Visit Website →"
- Omit empty fields from metadata row (no "—" placeholder)

### Section 2 — Description (auto-hidden if empty)

- Only render if `description` is non-empty
- Heading: `<h2>About {name}</h2>`
- Body: `<div dangerouslySetInnerHTML={{ __html: description }} />` (admin is trusted user; HTML fragment storage is consistent with future CMS direction)

### Section 3 — Contact Info (auto-hidden if all empty)

- Only render if at least one of `address` / `phone` / `email` is non-empty
- Heading: `<h2>Contact</h2>`
- Three-column grid; each field rendered independently if non-empty:
  - `address`: plain text
  - `phone`: `<a href="tel:{phone}">{phone}</a>`
  - `email`: `<a href="mailto:{email}">{email}</a>`
- Empty fields are omitted from the grid (no "—" placeholder)

### Section 4 — Featured Cables (auto-hidden if empty)

- Only render if `featured_cable_ids` array is non-empty
- Heading: `<h2>Featured Cables</h2>`
- For each id in `featured_cable_ids`: fetch `api.cables.getById(id)`; if it returns null (id not found), skip silently (no error)
- Render valid cables as 4-column `CableCard` grid (reuses existing component)
- Cables must belong to a brand whose `manufacturer_id` matches this manufacturer (defensive filter; if a featured id points to a cable from a different manufacturer, skip it)

### Section 5 — All Brands (auto-hidden if empty)

- Fetch `api.brands.all()`, filter `brand.manufacturer_id === manufacturer.id`
- Heading: `<h2>Brands</h2>`
- Render as 4-column grid of brand cards: brand image + name + cable count
- Card click navigates to `/cables?brand={brand.id}` (reuses existing cable list filtering)
- Hide entire section if no brands

### Section 6 — All Cables by Product Type (auto-hidden if empty)

- Fetch `api.cables.all()`, filter cables whose brand belongs to this manufacturer
- Group by `product_type_id` (same pattern as `/cables` index page)
- For each product_type subgroup:
  - Sub-heading: `{ProductType Label} ({count})`
  - 4-column `CableCard` grid
- Hide entire section if no cables

### 404 handling

- `api.manufacturers.getBySlug(slug)` returns null → call `notFound()` (Next.js renders 404 page)

### SEO

- `generateMetadata()`:
  - `title`: `"{name} - Manufacturer - Unowire"`
  - `description`: first 160 chars of `description`, or fallback `"{name} is a cable manufacturer based in {country}."`
- Breadcrumbs: Home > Manufacturers > {name}
- JsonLd: Organization schema with `name`, `url` (website), `logo` (image_url), `foundingDate` (founded_year), `address` (address), `contactPoint` (phone/email)

## Admin — Extend `/admin/manufacturers/[id]`

**File:** `frontend/app/admin/(dashboard)/manufacturers/[id]/page.tsx`

Existing form (base fields: name/slug/country/website/image_url) stays unchanged. Append 4 independent editing blocks below, each with its own save button (partial PUT).

### Block A — Company Description

- Fields: `description` (textarea with simple markdown preview or raw HTML input), `founded_year` (number input)
- Save button → `PUT /api/admin/manufacturers/:id` with body `{ description, founded_year }` only

### Block B — Featured Cables

- Display all cables from this manufacturer's brands (fetch `api.cables.all()` + in-memory filter by brand.manufacturer_id)
- Multi-select checkboxes; selected IDs stored as `featured_cable_ids` array
- Save button → `PUT` with body `{ featured_cable_ids }` only

### Block C — Contact Info

- Fields: `address`, `phone`, `email` (text inputs with placeholder "Leave empty to hide on page")
- Save button → `PUT` with body `{ address, phone, email }` only

### Block D — Recommendation Slot Config

- Two toggle+number pairs:
  - `featured_image` (checkbox) + `featured_image_sort` (number input)
  - `featured_text` (checkbox) + `featured_text_sort` (number input)
- Save button → `PUT` with body `{ featured_image, featured_image_sort, featured_text, featured_text_sort }` only

### Error handling

- Each block saves independently; failure shows red toast (matches existing BrandForm pattern)
- Partial update failure does not affect other blocks

## Navigation Integration

### Top Nav (`frontend/components/layout/Nav.tsx`)

- Add link `{ href: '/manufacturers', label: 'Manufacturers' }` after `Cables`, before `Automotive`

### Footer (`frontend/components/layout/Footer.tsx`)

- Add `<Link href="/manufacturers">Manufacturers</Link>` after `Cables`

### Cable detail page cross-link

- In `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx`: manufacturer name in the `{brand.name} · {manufacturer.country}` line becomes a `<Link href={/manufacturers/${manufacturer.slug}}>` (only the name is linked, country stays plain text)

## Sitemap

**`frontend/app/sitemap.ts`** append:

- Index page entry: `{ url: ${SITE_URL}/manufacturers, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 }`
- Per-manufacturer entries: for each `m` in `api.manufacturers.all()`, add `{ url: ${SITE_URL}/manufacturers/${m.slug}, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 }`

## Error Handling Summary

### Backend

- `GET /api/manufacturers/slug/{slug}` → 404 `{"code": 404, "message": "Manufacturer not found"}` if slug missing
- `PUT /api/manufacturers/{id}` → 404 if id missing (existing behavior)
- `featured_cable_ids` field validation: must be `list[str]` — Pydantic returns 422 on type mismatch

### Frontend

- Detail page `notFound()` on null manufacturer
- `api.manufacturers.getBySlug()` try/catch returns null on 404 (matches existing `getById` pattern)
- Invalid `featured_cable_ids`: `api.cables.getById()` returns null, frontend filters out nulls
- Featured cable from a different manufacturer: defensive filter skips it
- Admin block save failure: red toast, no navigation change

## Testing Strategy

MVP constraint: no pytest, no frontend automated tests. Verification via:

1. **Backend syntax check:** `docker compose exec backend python -c "from app.main import app; print(len(app.routes))"`
2. **Frontend tsc check:** `docker compose exec frontend npx tsc --noEmit` — must introduce 0 new errors (14 pre-existing errors from brands/manufacturers image_url schema drift are tolerated)
3. **Manual smoke test scenarios (12):**
   - Index page loads with A-Z grouping + both recommendation slots populated
   - Index page empty state when no manufacturers
   - Recommendation slots auto-hide when empty
   - Detail page 404 for nonexistent slug
   - Detail page renders all 6 sections for a fully-populated manufacturer
   - Detail page auto-hides empty sections (description, featured cables, contact)
   - Contact section renders only non-empty fields (no "—" placeholders)
   - Admin Block A/B/C/D each saves independently
   - Setting `featured_image=true` makes manufacturer appear in index image slot
   - Nav + Footer links navigate to `/manufacturers`
   - Cable detail page manufacturer name links to `/manufacturers/{slug}`
   - Sitemap contains manufacturer index + detail URLs

## Performance Considerations

- **N+1 avoidance:** Detail page calls `api.manufacturers.getBySlug()` + `api.brands.all()` + `api.cables.all()` — each API internally avoids N+1 via selectin relationships
- **Featured cables fetch:** N `getById` calls for N featured IDs. MVP N<10, acceptable. Future optimization: batch endpoint `POST /api/cables/batch`
- **ISR 1h:** Detail page cache 1 hour; admin edits visible to visitors within 1 hour (matches cable detail page)
- **Index page no ISR:** List changes (new manufacturers, recommendation config) visible immediately

## Out of Scope (YAGNI)

- Multi-language support (deferred to i18n phase)
- Image gallery / multiple logos (single `image_url` only)
- Full CMS block editor (manufacturer page has fixed structure)
- Brand detail page (only manufacturer detail page in this scope)
- Featured brands section (only featured cables + all brands list)
- Automated tests (MVP constraint)
- Batch cable fetch endpoint (deferred; N<10 acceptable for MVP)
