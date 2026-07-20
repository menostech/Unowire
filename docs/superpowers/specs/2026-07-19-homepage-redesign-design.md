# Homepage Redesign Design Spec

> **Branch:** `feat/homepage-redesign`
> **Date:** 2026-07-19
> **Reference:** https://www.thomasnet.com/suppliers
> **Status:** Approved by user (visual companion session 2026-07-19)

## Goal

Redesign the Unowire homepage (`/`) to follow the Thomasnet supplier-directory pattern: a hero with background image and Cable | Equipment tab-toggled search, a kept stats row, and two independent Thomasnet-style category grids (Cable industries with category/product_type sub-links, Equipment top-level categories with children sub-links). Remove the Featured Cables section. Constrain all content to `max-w-7xl` centered.

## Scope

### In Scope
- Rewrite `frontend/app/(site)/page.tsx` with new 4-section layout
- Add `max-w-7xl mx-auto` to `frontend/components/layout/Container.tsx`
- Create 4 new components: `HeroSearch`, `StatsRow`, `CableCategoryGrid`, `EquipmentCategoryGrid`
- Download one hero background image to `frontend/public/hero-bg.jpg`
- All rendering is server-side except `HeroSearch` (tab toggle + search input needs client interactivity)

### Out of Scope
- Backend changes (no new endpoints, no schema changes)
- Cable/Equipment list page changes
- Nav/Header/Footer changes
- i18n (English-only per project constraint)
- Automated tests (frontend MVP doesn't require tests per project constraint)
- Future tab expansion (Connectors, etc.) — design must be extensible but only Cable | Equipment implemented now

## Architecture

### Page Structure (top to bottom)

```
<Container>                              ← max-w-7xl mx-auto px-6
  <HeroSearch />                         ← client component, full-width background image
  <StatsRow cables={} brands={} ... />   ← server component
  <CableCategoryGrid taxonomy={...} />   ← server component, Thomasnet grid
  <EquipmentCategoryGrid tree={...} />   ← server component, same grid style
</Container>
```

### Data Flow

The homepage server component loads 3 data sources in parallel via existing `api.*` methods:

```typescript
const [cables, brands, taxonomy, equipmentTree, manufacturers] = await Promise.all([
  api.cables.all(),                    // for cable count
  api.brands.all(),                    // for brand count
  api.taxonomy.all(),                  // for CableCategoryGrid (industries → categories → product_types)
  api.equipmentCategories.tree(),      // for EquipmentCategoryGrid (top-level → children)
  api.equipmentManufacturers.all(),    // for manufacturer count
]);
```

All counts computed in-memory (consistent with current homepage pattern). Equipment count is derived from `api.recommendedEquipments.all()` — **OR** omitted if the equipment list endpoint returns total count without fetching all items. Decision: fetch equipment list (current data volume is 4 items, negligible cost).

Revised data loading:

```typescript
const [cables, brands, taxonomy, equipmentTree, equipmentManufacturers, equipmentList] = await Promise.all([
  api.cables.all(),
  api.brands.all(),
  api.taxonomy.all(),
  api.equipmentCategories.tree(),
  api.equipmentManufacturers.all(),
  api.recommendedEquipments.all(),
]);
```

### Rendering Strategy

- `export const dynamic = 'force-dynamic'` (kept from current homepage)
- `export const metadata` — title and description for SEO
- All sections server-rendered except `HeroSearch` (client interactivity for tab toggle + form submit)
- No `fetchWithCache` changes — existing caching behavior preserved

## Component Design

### 1. `HeroSearch` (client component)

**File:** `frontend/components/home/HeroSearch.tsx`

**Responsibilities:**
- Render hero with background image (`/hero-bg.jpg`) + dark overlay
- Tab toggle between `Cable` and `Equipment`
- Search input with placeholder that changes per active tab
- Popular search chips (only shown when Cable tab is active — Equipment has no popular searches yet)
- On submit: `router.push()` to `/cables?q={query}` or `/equipment?q={query}`

**Props:** none (self-contained, uses `useRouter` + `useState`)

**Tab behavior:**
- Default active tab: `Cable`
- Clicking a tab sets active state and updates placeholder
- Tab does NOT affect the category grids below (per user decision: "分类区域独立，不联动")
- Tab state is client-only (not synced to URL) — when user navigates back to homepage, default tab (Cable) is shown

**Placeholder text:**
- Cable tab: `"Search cable model, e.g. UL1007, AVSS..."`
- Equipment tab: `"Search equipment model or manufacturer..."`

**Popular search chips:**
- Cable tab active: show `UL1007`, `AVSS`, `UL1015`, `UL2468` (existing behavior)
- Equipment tab active: hide chips (no popular equipment searches yet)

**Visual spec:**
- Background: `linear-gradient(rgba(15, 23, 42, 0.65), rgba(15, 23, 42, 0.75)), url('/hero-bg.jpg') center/cover`
- Text color: white
- Padding: `py-20` (taller than current `py-16`)
- H1: `text-4xl font-bold` — "Cable & Equipment Specs Database"
- Subtitle: `text-lg opacity-90` — "Query cable and equipment specifications. Browse by brand, category, and technical parameters."
- Tabs: inline-flex, semi-transparent white background, active tab = solid white with dark text
- Search bar: `max-w-xl mx-auto`, white border, blue search button
- Chips: small pills with semi-transparent white background

**Hero background image:**
- File: `frontend/public/hero-bg.jpg`
- Source: Unsplash free image (industrial/factory/cable theme)
- Spec: ~1200x800px, JPG format, < 200KB
- Implementation: download image bytes to file during Task 1 (no external runtime dependency)

### 2. `StatsRow` (server component)

**File:** `frontend/components/home/StatsRow.tsx`

**Responsibilities:**
- Render 5 statistics in a horizontal row

**Props:**
```typescript
interface StatsRowProps {
  cables: number;
  brands: number;
  industries: number;
  equipment: number;
  manufacturers: number;
}
```

**Visual spec:**
- Background: `bg-gray-50 border-b`
- Padding: `py-8`
- Layout: `flex justify-center gap-12`
- Each stat: large blue number (`text-3xl font-bold text-blue-600`) + small gray label (`text-sm text-gray-500`)
- Stats: Cables, Brands, Industries, Equipment, Manufacturers

### 3. `CableCategoryGrid` (server component)

**File:** `frontend/components/home/CableCategoryGrid.tsx`

**Responsibilities:**
- Render Thomasnet-style 3-column grid of industry cards
- Each card shows industry name (link) + list of category and product_type sub-links

**Props:**
```typescript
interface CableCategoryGridProps {
  taxonomy: Taxonomy;  // Record<string, TaxonomyIndustry>
}
```

**Visual spec:**
- Section heading: "Browse Cables by Industry" with blue underline
- Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
- Each card: `border rounded-lg p-4 bg-gray-50`
- Card header: industry label (link to `/cables?industry={slug}`), `font-bold text-blue-600 border-b pb-2 mb-2`
- Card body: `<ul>` of categories and product_types
  - Category: `▸ {category.label}` (link to `/cables?industry={ind.slug}&category={cat.slug}`)
  - ProductType: `   {pt.label}` (link to `/cables?industry={ind.slug}&category={cat.slug}&type={pt.slug}`), indented, smaller, gray

**Link structure:**
- Industry link: `/cables?industry={industry.slug}`
- Category link: `/cables?industry={industry.slug}&category={category.slug}`
- ProductType link: `/cables?industry={industry.slug}&category={category.slug}&type={pt.slug}`

**Edge cases:**
- Industry with 0 categories: render card with "(No categories yet)" message
- Industry with categories but 0 product_types: render category name without product_type sub-items

### 4. `EquipmentCategoryGrid` (server component)

**File:** `frontend/components/home/EquipmentCategoryGrid.tsx`

**Responsibilities:**
- Render Thomasnet-style 3-column grid of top-level equipment categories
- Each card shows top-level category name (link) + list of children sub-links

**Props:**
```typescript
interface EquipmentCategoryGridProps {
  tree: EquipmentCategory[];  // top-level categories with children populated
}
```

**Visual spec:**
- Same grid style as CableCategoryGrid for visual consistency
- Section heading: "Browse Equipment by Category" with blue underline
- Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
- Each card: same styling as Cable cards
- Card header: top-level category label (link to `/equipment?category={id}`), `font-bold text-blue-600 border-b pb-2 mb-2`
- Card body: `<ul>` of children
  - Child: `▸ {child.label}` (link to `/equipment?category={child.id}`)

**Edge cases:**
- Top-level category with 0 children: render card with "(No sub-categories yet)" message
- Empty tree (0 top-level categories): render section with placeholder message "Equipment categories coming soon"

### 5. `Container` modification

**File:** `frontend/components/layout/Container.tsx`

**Change:** Add `max-w-7xl mx-auto` to the className.

**Before:**
```typescript
<div className={cn('w-full px-6', className)}>
```

**After:**
```typescript
<div className={cn('mx-auto w-full max-w-7xl px-6', className)}>
```

**Impact:** This affects ALL pages using `<Container>`, not just the homepage. Verified safe because:
- All existing pages already center content visually
- max-w-7xl (1280px) is wider than most existing content needs
- Cable/Equipment list pages use their own grid layouts inside Container — they'll just be centered with more whitespace on sides

### 6. `app/(site)/page.tsx` rewrite

**File:** `frontend/app/(site)/page.tsx`

**Changes:**
- Remove imports: `SearchBox`, `CableCard`, `api.manufacturers` (was for N+1 fetch)
- Add imports: `HeroSearch`, `StatsRow`, `CableCategoryGrid`, `EquipmentCategoryGrid`
- Remove Featured Cables section entirely
- Remove old SearchBox from hero (replaced by HeroSearch)
- Add new 4-section layout

**Data loading:**
```typescript
const [cables, brands, taxonomy, equipmentTree, equipmentManufacturers, equipmentList] = await Promise.all([
  api.cables.all(),
  api.brands.all(),
  api.taxonomy.all(),
  api.equipmentCategories.tree(),
  api.equipmentManufacturers.all(),
  api.recommendedEquipments.all(),
]);

const industryCount = Object.keys(taxonomy).length;
```

**Render:**
```tsx
<Container>
  <HeroSearch />
  <StatsRow
    cables={cables.length}
    brands={brands.length}
    industries={industryCount}
    equipment={equipmentList.length}
    manufacturers={equipmentManufacturers.length}
  />
  <CableCategoryGrid taxonomy={taxonomy} />
  <EquipmentCategoryGrid tree={equipmentTree} />
</Container>
```

## File Structure Summary

### New Files
- `frontend/components/home/HeroSearch.tsx` — client component
- `frontend/components/home/StatsRow.tsx` — server component
- `frontend/components/home/CableCategoryGrid.tsx` — server component
- `frontend/components/home/EquipmentCategoryGrid.tsx` — server component
- `frontend/public/hero-bg.jpg` — background image

### Modified Files
- `frontend/components/layout/Container.tsx` — add `max-w-7xl mx-auto`
- `frontend/app/(site)/page.tsx` — full rewrite of homepage layout

### Deleted Files
- None (SearchBox component is kept — still used in Nav.tsx)

## SEO

- `metadata` export with title "Unowire | Cable & Equipment Specs Database" and description
- All category links are server-rendered `<a href>` tags (crawable)
- No `JsonLd` needed for homepage (existing site-level schema is sufficient)
- Hero background image has no semantic impact (decorative)

## Error Handling

- If `api.taxonomy.all()` fails: CableCategoryGrid renders with empty state "Categories unavailable"
- If `api.equipmentCategories.tree()` fails: EquipmentCategoryGrid renders with empty state
- If any count fetch fails: StatsRow shows 0 for that stat (graceful degradation)
- All API methods already use `fetchWithCache` with in-memory cache (60s revalidate)

## Performance

- 6 parallel API calls on homepage load (was 3 + N+1 for featured cables)
- No N+1 fetches (Featured Cables section removed)
- Hero background image: ~150KB JPG, cached by browser
- All category grids are server-rendered (no client JS for grids)
- Only `HeroSearch` is a client component (~2KB JS)

## Accessibility

- Tab buttons use `<button>` with `aria-selected` attribute
- Search input has `<label>` (visually hidden)
- All category links are proper `<a href>` tags
- Color contrast: white text on dark overlay meets WCAG AA
- Stats numbers use semantic `<strong>` tag

## Testing

Per project constraint: "Frontend MVP does not require automated tests". Verification is manual:
1. Homepage loads without errors
2. Hero background image displays
3. Tab toggle switches placeholder text
4. Cable search submits to `/cables?q=`
5. Equipment search submits to `/equipment?q=`
6. Popular chips only show on Cable tab
7. All 6 industry cards render with correct sub-links
8. Equipment top-level cards render with children
9. Stats show correct counts
10. Container is centered on wide screens
11. Docker `next build` succeeds with 0 new tsc errors

## Acceptance Criteria

1. ✅ Homepage has 4 sections: Hero, Stats, Cable Categories, Equipment Categories
2. ✅ Hero has background image with dark overlay, Cable|Equipment tabs, search box
3. ✅ Tab toggle changes search placeholder and popular chips visibility
4. ✅ Stats row shows 5 numbers (Cables, Brands, Industries, Equipment, Manufacturers)
5. ✅ Cable category grid shows 6 industry cards, each with category/product_type sub-links
6. ✅ Equipment category grid shows top-level categories with children sub-links
7. ✅ All content centered to max-w-7xl on wide screens
8. ✅ Featured Cables section removed
9. ✅ No new tsc errors (8 pre-existing baseline maintained)
10. ✅ Docker frontend build succeeds

## Task Breakdown (Preview for Plan)

1. **Task 1:** Download hero background image to `frontend/public/hero-bg.jpg`
2. **Task 2:** Modify `Container.tsx` — add `max-w-7xl mx-auto`
3. **Task 3:** Create `HeroSearch.tsx` — client component with tabs + search
4. **Task 4:** Create `StatsRow.tsx` — server component with 5 stats
5. **Task 5:** Create `CableCategoryGrid.tsx` — server component with Thomasnet grid
6. **Task 6:** Create `EquipmentCategoryGrid.tsx` — server component with same grid style
7. **Task 7:** Rewrite `app/(site)/page.tsx` — compose all components
8. **Task 8:** Rebuild frontend container + verify tsc baseline + smoke test
