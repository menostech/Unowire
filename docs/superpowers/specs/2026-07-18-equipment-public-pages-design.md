# Equipment Public Pages Design Spec

> **Date:** 2026-07-18
> **Branch:** `feat/media-picker-modal` (continued on existing branch)
> **Base:** HEAD `e5ad2f6`
> **Status:** Approved (brainstorming complete)

## Goal

Build public-facing Equipment pages for the Unowire site: a list page with category navigation + three-column filter/list/ad layout, a device detail page with applicable specs table, and an equipment manufacturer detail page. All three reuse the existing backend API (zero backend changes) and follow the established cable/manufacturer page patterns.

## Architecture

**Approach:** Pure frontend in-memory filtering (Approach A).

- The list page server component loads all equipment + categories + manufacturers upfront via the public `api` client.
- A client-side wrapper component owns filter state (synced to URL searchParams) and calls a pure `filterEquipment()` function to re-filter and rebuild facets in memory.
- No backend changes. The existing public endpoints (`/api/recommended-equipments`, `/api/equipment-categories`, `/api/equipment-manufacturers`) already return all the data needed, including nested `manufacturer` and `category` objects.
- Device counts are low (currently 4) and will remain modest; in-memory filtering is correct and performant.

**Tech Stack:** Next.js App Router (server + client components), TypeScript, Tailwind CSS, existing `lib/api.ts` patterns, existing `Pagination` / `Breadcrumbs` / `Container` / `JsonLd` / `InquiryFormModal` components.

## Routes

| Route | Type | Purpose |
|-------|------|---------|
| `/equipment` | Server + Client | List page: category nav + 3-column filter/list/ad layout |
| `/equipment/[slug]` | Server | Device detail page (image, info, applicable specs table, inquiry CTA) |
| `/equipment/manufacturers/[slug]` | Server | Equipment manufacturer detail page (info, contact, equipment list) |

## File Structure

```
frontend/app/(site)/equipment/
├── page.tsx                                    # List page (server component, SEO, initial data load)
├── [slug]/page.tsx                             # Device detail page (server, generateMetadata, JsonLd)
└── manufacturers/[slug]/page.tsx               # Manufacturer detail page (server, generateMetadata, JsonLd)

frontend/components/equipment/
├── EquipmentCategoryNav.tsx                    # Top sub-category image tag nav (server)
├── EquipmentFilters.tsx                        # Left-column filter panel (client)
├── EquipmentListClient.tsx                     # Client wrapper managing filter state + re-rendering
├── EquipmentCard.tsx                           # Device card (image-top + info-bottom, server)
├── ApplicableSpecsTable.tsx                    # Applicable specs table for detail page (server)
├── HotEquipmentRecommendation.tsx              # Right-column top: hot equipment image grid (server)
└── EquipmentManufacturerRecommendation.tsx     # Right-column bottom: manufacturer text list (server)

frontend/lib/
├── equipmentFilter.ts                          # Pure filter + facet logic (modeled on lib/filter.ts)
├── api.ts                                      # Extend: add equipmentCategories + equipmentManufacturers namespaces
└── types.ts                                    # Extend: add EquipmentManufacturer, EquipmentCategory, ApplicableSpec, RecommendedEquipment, filter types
```

## Data Model (Frontend Types)

All types added to `frontend/lib/types.ts`. Field names match the backend Pydantic schemas (snake_case).

```typescript
// === Equipment (public) ===
export interface EquipmentManufacturer {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  website: string | null;
  image_url: string | null;
  description: string | null;
  founded_year: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EquipmentCategory {
  id: string;
  parent_id: string | null;
  label: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  children: EquipmentCategory[];
}

export interface ApplicableSpec {
  spec_key: string;
  min?: number;
  max?: number;
  allowed_values?: string[];
}

export interface RecommendedEquipment {
  id: string;
  manufacturer_id: string;
  category_id: string;
  model: string;
  slug: string;
  applicable_specs: ApplicableSpec[];
  description: string | null;
  image_url: string | null;
  external_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  manufacturer?: EquipmentManufacturer;
  category?: EquipmentCategory;
}

// Filter types
export interface EquipmentFilterParams {
  q?: string;
  category_ids?: string[];
  manufacturer_ids?: string[];
  spec_filters?: Record<string, { min?: number; max?: number; values?: string[] }>;
}

export interface EquipmentFilterFacets {
  manufacturers: { id: string; name: string; count: number }[];
  categories: { id: string; label: string; parent_id: string | null; count: number }[];
  spec_facets: Record<string, {
    type: "range" | "enum";
    min?: number; max?: number;          // for range
    values?: { value: string; count: number }[];  // for enum
  }>;
}

export interface EquipmentListResponse {
  items: RecommendedEquipment[];
  total: number;
  page: number;
  page_size: number;
  facets: EquipmentFilterFacets;
}
```

## API Client Extension (`frontend/lib/api.ts`)

Add two namespaces to the existing `api` object. Both follow the existing `recommendedEquipments` pattern (use `apiGet`, return `null` on error for single-item fetches).

```typescript
equipmentCategories: {
  async tree(): Promise<EquipmentCategory[]> {
    return apiGet<EquipmentCategory[]>("/api/equipment-categories");
  },
  async getById(id: string): Promise<EquipmentCategory | null> {
    try {
      return await apiGet<EquipmentCategory>(`/api/equipment-categories/${id}`);
    } catch {
      return null;
    }
  },
},

equipmentManufacturers: {
  async all(): Promise<EquipmentManufacturer[]> {
    const res = await apiGet<{ items: EquipmentManufacturer[]; total: number; page: number; page_size: number }>(
      "/api/equipment-manufacturers?page_size=999"
    );
    return res.items ?? [];
  },
  async getById(id: string): Promise<EquipmentManufacturer | null> {
    try {
      return await apiGet<EquipmentManufacturer>(`/api/equipment-manufacturers/${id}`);
    } catch {
      return null;
    }
  },
  async getBySlug(slug: string): Promise<EquipmentManufacturer | null> {
    const all = await this.all();
    return all.find((m) => m.slug === slug) ?? null;
  },
},
```

**Note:** `equipmentManufacturers.all()` uses `page_size=999` to fetch all entries (matches the existing `recommendedEquipments.all()` convention). The backend paginated response shape is `{ items, total, page, page_size }`.

## Filter Logic (`frontend/lib/equipmentFilter.ts`)

Modeled on `lib/filter.ts`. Exports `filterEquipment(params)` that:

1. Loads all data in parallel: `api.recommendedEquipments.all()` + `api.equipmentManufacturers.all()` + `api.equipmentCategories.tree()`
2. Applies filters in order: keyword → category → manufacturer → spec range → spec enum
3. Builds facets from the filtered result set
4. Paginates (default `page_size = 12`)
5. Returns `EquipmentListResponse`

### Filter Rules

- **Keyword:** `model.toLowerCase().includes(q) || description.toLowerCase().includes(q)`
- **Category:** `equipment.category_id` ∈ selected `category_ids`
- **Manufacturer:** `equipment.manufacturer_id` ∈ selected `manufacturer_ids`
- **Spec range (e.g. `conductor_area`, `outer_diameter`):** Equipment's `applicable_specs` contains an entry with `spec_key` match AND the rule's `[min, max]` intersects the user's `[userMin, userMax]`. Intersection test: `specMin <= userMax && specMax >= userMin` (with `Infinity` defaults for missing bounds).
- **Spec enum (e.g. `shielding`, `jacket`, `core_structure`):** Equipment's `applicable_specs` contains an entry with `spec_key` match AND `allowed_values` intersects the user's selected values.

### Facet Building

After filtering, iterate the filtered result set to compute:

- **Manufacturers:** count per manufacturer_id (only those with count > 0)
- **Categories:** count per category_id (only those with count > 0), preserving `parent_id` for tree rendering
- **Spec facets:** For each `spec_key` that appears in any equipment's `applicable_specs`:
  - If any equipment has `min`/`max` for this key → `type: "range"`, aggregate min of mins and max of maxes
  - Else if any equipment has `allowed_values` → `type: "enum"`, collect distinct values with counts

### Spec Key Labels

```typescript
export const SPEC_KEY_LABELS: Record<string, string> = {
  conductor_area: "Conductor Area",
  outer_diameter: "Outer Diameter",
  shielding: "Shielding",
  jacket: "Jacket",
  core_structure: "Core Structure",
};

export function specKeyLabel(key: string): string {
  return SPEC_KEY_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
```

## List Page Layout (`/equipment`)

```
┌─────────────────────────────────────────────────────────────┐
│ Breadcrumbs: Home > Equipment                                │
│ H1: Equipment                                                │
├─────────────────────────────────────────────────────────────┤
│ [Sub-cat 1] [Sub-cat 2] [Sub-cat 3] ...   ← image tag nav   │
├──────────────┬──────────────────────────┬───────────────────┤
│ Left (1/4)   │ Center (2/4) Equipment   │ Right (1/4) Ads   │
│              │ list                    │                   │
│ Keyword      │ ┌────┐ ┌────┐ ┌────┐    │ ┌──┐┌──┐┌──┐    │
│ [_________]  │ │img │ │img │ │img │    │ │  ││  ││  │ Hot │
│              │ │model│ │model│ │model│   │ └──┘└──┘└──┘ Eq  │
│ Categories   │ │mfr │ │mfr │ │mfr │    │                   │
│ □ Processing │ └────┘ └────┘ └────┘    │ Mfr Recommend     │
│   □ Semi-Auto│ ┌────┐ ┌────┐ ...       │ • Komax           │
│   □ Fully-Au │ │    │ │    │            │ • KMV             │
│              │ └────┘ └────┘            │                   │
│ Manufacturers│                        │                   │
│ □ Komax      │ ← Pagination →          │                   │
│ □ KMV        │                        │                   │
│              │                        │                   │
│ Spec Facets  │                        │                   │
│ conductor_   │                        │                   │
│ area:        │                        │                   │
│ [min][max]   │                        │                   │
│ shielding:   │                        │                   │
│ □ none       │                        │                   │
│ □ braided    │                        │                   │
└──────────────┴──────────────────────────┴───────────────────┘
```

### Top Category Nav (`EquipmentCategoryNav`)

- Renders only **sub-categories** (those with `parent_id !== null`), not top-level categories
- Each tag: rounded card `w-32` with category image + label, horizontally arranged, scrollable on overflow
- Click → sets `?category={id}` (URL-encoded) and smooth-scrolls to the equipment list section
- Active state: highlight the tag matching `searchParams.category`

### Left Filter Panel (`EquipmentFilters`)

Client component. Props: `facets`, `params`, `onChange`. URL state synced via `searchParams`:

1. **Keyword search:** text input, debounce 300ms, updates `?q=`
2. **Category tree:** recursive render with checkboxes. Top-level label + indented sub-category checkboxes. Multi-select. Updates `?category=id1,id2`
3. **Manufacturers:** checkboxes with counts. Multi-select. Updates `?manufacturer=id1,id2`
4. **Spec facets (dynamic from `applicable_specs`):**
   - Range type (e.g. `conductor_area`): two number inputs `[min][max]` bounded by facet min/max. Updates `?spec.{key}.min=X&spec.{key}.max=Y`
   - Enum type (e.g. `shielding`): checkbox list with counts. Updates `?spec.{key}.values=v1,v2`

### Center Equipment List

- Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
- Each card (`EquipmentCard`): image-top (`h-48 w-full object-cover`) + info block (model bold, manufacturer name, category badge)
- Whole card is a `<Link href="/equipment/{slug}">`
- Empty state: "No equipment found. Try adjusting your filters."
- Pagination: reuse `Pagination` component, `page_size = 12`

### Right Ad Column

- **Top (`HotEquipmentRecommendation`):** First 3 equipment items by `sort_order`, 3-column small image grid (`h-24 w-full object-cover`), each links to detail page
- **Bottom (`EquipmentManufacturerRecommendation`):** All equipment manufacturers as text list with counts, each links to `/equipment/manufacturers/{slug}`. "All Equipment Manufacturers →" link if more than 10

### Server/Client Collaboration

List page is a server component for SEO, but filtering requires client interactivity. Pattern:

- `EquipmentListPage` (server): loads initial data, renders static HTML (SEO-friendly), renders `<EquipmentListClient>` with initial data as props
- `EquipmentListClient` (client): owns filter state (synced to URL), calls `filterEquipment()` on state change (pure in-memory, no network), re-renders cards/pagination/sidebar

```
EquipmentListPage (server)
├── Breadcrumbs
├── H1
├── EquipmentCategoryNav (server)
└── EquipmentListClient (client)
    ├── EquipmentFilters (client)
    ├── EquipmentCard grid (re-filtered in memory)
    ├── Pagination (client)
    └── aside
        ├── HotEquipmentRecommendation (passed as props, static)
        └── EquipmentManufacturerRecommendation (passed as props, static)
```

## Device Detail Page (`/equipment/[slug]`)

Layout: 3+1 column grid (`lg:grid-cols-4 gap-16`, main `lg:col-span-3` + aside `lg:col-span-1`).

### Main Content (top to bottom)

1. **Breadcrumbs:** Home > Equipment > {model}
2. **Header block:**
   - Left: equipment image (`h-80 w-full object-cover rounded-lg`)
   - Right: model (H1), manufacturer name (link to `/equipment/manufacturers/{slug}`), category badge, `external_url` button ("View Product →" if present)
3. **Description:** `description` field rendered as paragraph text (only if non-empty)
4. **Applicable Specs Table (`ApplicableSpecsTable`):**
   - 3 columns: Spec / Range / Allowed Values
   - Each row = one entry in `applicable_specs`
   - Range type (`conductor_area`, `outer_diameter`): Range column shows `{min} - {max}`, Allowed Values shows "—"
   - Enum type (`shielding`, `jacket`, `core_structure`): Range shows "—", Allowed Values shows comma-separated values
   - `spec_key` rendered via `specKeyLabel()` for friendly display
5. **Inquiry CTA:**
   - Logged-in member: "Inquire About This Equipment" button → opens `InquiryFormModal` with `defaultSubject={model}`
   - Non-member: "Login to Inquire" link → `/login?redirect=/equipment/{slug}`

### Right Aside

1. `HotEquipmentRecommendation` — top 3 hot equipment (excluding current)
2. `EquipmentManufacturerRecommendation` — manufacturer list (excluding current manufacturer optional)

### SEO

- `generateMetadata`: title = `{model} - {manufacturer_name} | Unowire`, description = first 160 chars of `description`
- `JsonLd`: Product schema (name, image, description, manufacturer, category) + BreadcrumbList schema
- `export const dynamic = 'force-dynamic'`

## Equipment Manufacturer Detail Page (`/equipment/manufacturers/[slug]`)

Layout: 3+1 column grid (same as above).

### Main Content (top to bottom)

1. **Breadcrumbs:** Home > Equipment > Manufacturers > {name}
2. **Header block:**
   - Left: manufacturer logo (`image_url`, `h-32 w-32 object-contain`)
   - Right: name (H1), country, website link, founded year
3. **About:** `description` rendered as paragraphs (only if non-empty)
4. **Contact Information:** address, phone, email (each row shown only if field is non-empty)
5. **Equipment Products:**
   - Filter `api.recommendedEquipments.all()` by `manufacturer_id === current.id`
   - Grid of `EquipmentCard` components (reuse)
   - No pagination (manufacturer equipment count is small)

### Right Aside

1. `HotEquipmentRecommendation` — top 3 hot equipment (excluding current manufacturer's equipment)
2. `EquipmentManufacturerRecommendation` — other manufacturers (excluding current)

### SEO

- `generateMetadata`: title = `{name} | Equipment Manufacturers | Unowire`, description = first 160 chars of `description`
- `JsonLd`: Organization schema (name, logo, url, address, foundingDate) + BreadcrumbList schema
- `export const dynamic = 'force-dynamic'`

### Member Inquiry

Manufacturer page header also shows inquiry CTA (same logic as device detail: member → modal, non-member → login link).

## Error Handling

- API failure: `api.*.all()` methods return `[]` on error (existing try/catch pattern); single-item `getById`/`getBySlug` return `null`
- Equipment/manufacturer not found: `notFound()` → 404 page
- Empty filter results: "No equipment found. Try adjusting your filters."
- All pages `force-dynamic` (no ISR caching issues)

## Testing Strategy

- **No automated frontend tests** (per project convention: MVP frontend does not require tests)
- **Backend tests:** existing suite must still pass (zero backend changes expected)
- **tsc baseline:** 8 pre-existing errors in `.next/dev/types/validator.ts` line 440 must remain unchanged; 0 new errors
- **Manual smoke tests:** documented in the implementation plan (browser-based scenarios for list/filter/detail/manufacturer flows)

## Task Breakdown

| # | Task | Key Files |
|---|------|-----------|
| 1 | Frontend types extension | `frontend/lib/types.ts` |
| 2 | API client extension | `frontend/lib/api.ts` |
| 3 | Filter logic | `frontend/lib/equipmentFilter.ts` |
| 4 | EquipmentCard + ApplicableSpecsTable components | `frontend/components/equipment/` |
| 5 | EquipmentCategoryNav + sidebar recommendation components | `frontend/components/equipment/` |
| 6 | EquipmentFilters client component | `frontend/components/equipment/` |
| 7 | EquipmentListClient wrapper component | `frontend/components/equipment/` |
| 8 | List page route | `frontend/app/(site)/equipment/page.tsx` |
| 9 | Device detail page route | `frontend/app/(site)/equipment/[slug]/page.tsx` |
| 10 | Equipment manufacturer detail page route | `frontend/app/(site)/equipment/manufacturers/[slug]/page.tsx` |
| 11 | Final verification + tsc + smoke tests | All |

## Acceptance Criteria

- `/equipment` page loads with all equipment + top sub-category nav + three-column layout
- Filters work in real-time (keyword, category tree, manufacturer, spec facets)
- Clicking an equipment card navigates to the detail page showing all info
- Clicking a manufacturer name navigates to the manufacturer page
- Inquiry CTA works on detail and manufacturer pages (member → modal, non-member → login)
- Right column hot equipment and manufacturer recommendations render correctly
- SEO metadata and JSON-LD generate correctly
- tsc reports 0 new errors (baseline 8 pre-existing unchanged)
- Backend test suite has no regressions

## Out of Scope

- Backend changes (API, models, migrations)
- Category detail page (`/equipment/categories/[...id]`) — not in this iteration
- Equipment showcase/featured flags (like cable manufacturers' `featured_image`/`featured_text`) — not added
- Pagination on manufacturer detail page (equipment count is small)
- Automated frontend tests
- Internationalization (i18n)
