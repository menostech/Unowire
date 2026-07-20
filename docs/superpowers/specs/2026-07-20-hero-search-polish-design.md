# Hero Search Polish & Comprehensive Text Search Design Spec

> **Branch:** `feat/media-picker-modal`
> **Date:** 2026-07-20
> **Status:** Approved by user (2026-07-20)

## Goal

Three related improvements to the homepage hero search and the in-memory text filters that back it:

1. **White search input text** — switch typed text from `text-slate-900` to `text-white` (with `placeholder:text-white/70`) so typed text is readable against the dark hero background image. Input background stays transparent (Tailwind v4 preflight default — image shows through).
2. **Equipment Popular searches** — add a popular-searches chip row for the Equipment tab (mirroring the existing Cable chip row), using 4 seed-data-derived suggestions: `Komax`, `Alpha 488`, `Gamma 333`, `KMV`.
3. **Comprehensive text search** — extend the in-memory filter predicates so `q=` matches manufacturer name, brand name, category label, and spec keywords/values (in addition to the currently matched model and description fields).

## Scope

### In Scope
- Modify `frontend/components/home/HeroSearch.tsx` — input className + equipment popular chips
- Modify `frontend/lib/filter.ts` — extend `filterCablesByText` predicate (global cable search) AND `filterCables` predicate (scoped cable search) to also match manufacturer name, brand name, and `common_specs` values
- Modify `frontend/lib/equipmentFilter.ts` — extend `filterEquipment` predicate to also match `manufacturer.name`, `category.label`, and `applicable_specs` fields

### Out of Scope
- Backend changes (none — all required data is already preloaded on the frontend)
- New components, new pages, new tests (per project constraint)
- Changes to backend `/api/cables?q=` SQL behavior (currently unused by frontend; left as-is)
- Adding `q` parameter to backend `/api/recommended-equipments` route (not needed for in-memory approach)
- i18n, SEO, accessibility changes beyond the input color swap
- Search input width or layout changes
- Autocomplete / typeahead / suggestions API (out of scope — only chip suggestions added)

## Architecture

### Data Flow (unchanged)

Both search pages already preload all required data via parallel `Promise.all` calls. No new fetches needed.

**Cable page** (`frontend/app/(site)/cables/page.tsx`):
- Already loads `api.cables.all()`, `api.manufacturers.all()`, `api.brands.all()`
- `filterCablesByText` (global search via `?q=`) currently uses manufacturers/brands arrays for facet enrichment but does NOT include them in the search predicate
- `filterCables` (scoped route `/cables/[industry]/[category]/[product-type]?q=`) loads the same data

**Equipment page** (`frontend/app/(site)/equipment/page.tsx`):
- Already loads `api.recommendedEquipments.all()`, `api.equipmentManufacturers.all()`, `api.equipmentCategories.tree()`
- Each equipment item's `manufacturer` and `category` are populated by `adaptEquipment` (`frontend/lib/api.ts:386-409`)
- `applicable_specs` is on each equipment item directly

### Why No Backend Changes

All fields the user wants to search are already in the preloaded frontend data:

| Field | Source | Already loaded? |
|---|---|---|
| Cable manufacturer name | `manufacturers.find(m => m.id === cable.manufacturer_id)?.name` | Yes (`api.manufacturers.all()`) |
| Cable brand name | `brands.find(b => b.id === cable.brand_id)?.name` | Yes (`api.brands.all()`) |
| Cable common_specs values | `cable.common_specs[].value` | Yes (on each cable) |
| Equipment manufacturer name | `e.manufacturer?.name` | Yes (populated by adapter) |
| Equipment category label | `e.category?.label` | Yes (populated by adapter) |
| Equipment applicable_specs | `e.applicable_specs[]` | Yes (on each equipment) |

Adding backend `q` support would duplicate work without user-visible benefit. In-memory filtering is consistent with the existing pattern.

## Component Design

### 1. `HeroSearch.tsx` modifications

**File:** `frontend/components/home/HeroSearch.tsx`

#### 1a. New POPULAR_EQUIPMENT_SEARCHES constant

Add after line 24 (after `POPULAR_CABLE_SEARCHES`):

```tsx
const POPULAR_EQUIPMENT_SEARCHES = ['Komax', 'Alpha 488', 'Gamma 333', 'KMV'];
```

These four values are derived from the seed data in `frontend/data/recommended-equipments.json` and `backend/alembic/versions/e3f4a5b6c7d8_add_equipment_manufacturers_and_categories.py:71-83`. They cover the two seed manufacturers (Komax, KMV) and the two flagship models per manufacturer.

#### 1b. Input className swap

Replace input className (currently line 106):
- Before: `flex-1 border-0 px-4 py-3 text-sm text-slate-900 outline-none`
- After:  `flex-1 border-0 px-4 py-3 text-sm text-white outline-none placeholder:text-white/70`

Rationale:
- `text-slate-900` → `text-white` — typed text becomes #ffffff, readable against the dark hero overlay
- Add `placeholder:text-white/70` — placeholder is white at 70% opacity, distinguishes from typed text
- No `bg-*` class — Tailwind v4 preflight makes input backgrounds transparent by default, so the hero image shows through (verified in `frontend/app/globals.css` — no input background override)

#### 1c. Popular searches row — render for both tabs

Replace lines 116-130 (currently conditional on `activeTab === 'cable'`):

**Before:**
```tsx
{/* Popular searches — only on Cable tab */}
{activeTab === 'cable' && (
  <div className="mt-4 text-xs opacity-90">
    <span className="mr-2">Popular:</span>
    {POPULAR_CABLE_SEARCHES.map(q => (
      <Link
        key={q}
        href={`/cables?q=${encodeURIComponent(q)}`}
        className="mr-2 inline-block rounded-full bg-white/20 px-3 py-1 text-white hover:bg-white/30"
      >
        {q}
      </Link>
    ))}
  </div>
)}
```

**After:**
```tsx
{/* Popular searches — per active tab */}
{(() => {
  const popular = activeTab === 'cable' ? POPULAR_CABLE_SEARCHES : POPULAR_EQUIPMENT_SEARCHES;
  const basePath = activeTab === 'cable' ? '/cables' : '/equipment';
  return (
    <div className="mt-4 text-xs opacity-90">
      <span className="mr-2">Popular:</span>
      {popular.map(q => (
        <Link
          key={q}
          href={`${basePath}?q=${encodeURIComponent(q)}`}
          className="mr-2 inline-block rounded-full bg-white/20 px-3 py-1 text-white hover:bg-white/30"
        >
          {q}
        </Link>
      ))}
    </div>
  );
})()}
```

### 2. `filter.ts` — extend cable search predicates

**File:** `frontend/lib/filter.ts`

#### 2a. `filterCablesByText` (global cable search, lines 179-219)

**Current predicate** (lines 190-194):
```ts
let filtered = allCables.filter(c =>
  c.model.toLowerCase().includes(q) ||
  c.base_description.toLowerCase().includes(q) ||
  c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))
);
```

**New predicate:**
```ts
let filtered = allCables.filter(c => {
  if (c.model.toLowerCase().includes(q)) return true;
  if (c.base_description.toLowerCase().includes(q)) return true;
  if (c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))) return true;
  if (c.common_specs.some(s => String(s.value).toLowerCase().includes(q))) return true;
  const brand = brandMap.get(c.brand_id);
  if (brand && brand.name.toLowerCase().includes(q)) return true;
  if (brand) {
    const mfr = manufacturerMap.get(brand.manufacturer_id);
    if (mfr && mfr.name.toLowerCase().includes(q)) return true;
  }
  return false;
});
```

Notes:
- `brandMap` and `manufacturerMap` are already built at lines 187-188 as `Map<id, Brand>` and `Map<id, Manufacturer>` — reuse them directly (no new maps needed).
- Cables link to manufacturers via `brand.manufacturer_id` (two hops: cable → brand → manufacturer), per the `Cable` and `Brand` type definitions in `frontend/lib/types.ts:103,25`.
- This mirrors the existing facet-enrichment pattern at filter.ts:204.

#### 2b. `filterCables` (scoped cable search, lines 83-177)

The scoped filter currently has its own predicate at lines 102-109. It must be extended with the same matches so global and scoped search behave consistently.

**Current predicate** (lines 102-109):
```ts
if (q) {
  filtered = filtered.filter(c =>
    c.model.toLowerCase().includes(q) ||
    c.base_description.toLowerCase().includes(q) ||
    c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))
  );
}
```

**New predicate:**
```ts
if (filterParams.q) {
  const q = filterParams.q.toLowerCase();
  filtered = filtered.filter(c => {
    if (c.model.toLowerCase().includes(q)) return true;
    if (c.base_description.toLowerCase().includes(q)) return true;
    if (c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))) return true;
    if (c.common_specs.some(s => String(s.value).toLowerCase().includes(q))) return true;
    const brand = brandMap.get(c.brand_id);
    if (brand && brand.name.toLowerCase().includes(q)) return true;
    if (brand) {
      const mfr = manufacturerMap.get(brand.manufacturer_id);
      if (mfr && mfr.name.toLowerCase().includes(q)) return true;
    }
    return false;
  });
}
```

Notes:
- `brandMap` and `manufacturerMap` are already built at lines 91-92 — reuse them directly.
- Same two-hop lookup as `filterCablesByText` (cable → brand → manufacturer).
- The `q` variable is already declared inside the `if (filterParams.q)` block at line 103 — kept that pattern.

### 3. `equipmentFilter.ts` — extend equipment search predicate

**File:** `frontend/lib/equipmentFilter.ts`

**Current predicate** (lines 71-79):
```ts
if (params.q) {
  const q = params.q.toLowerCase();
  filtered = filtered.filter(
    (e) =>
      e.model.toLowerCase().includes(q) ||
      (e.description ?? '').toLowerCase().includes(q)
  );
}
```

**New predicate:**
```ts
if (params.q) {
  const q = params.q.toLowerCase();
  filtered = filtered.filter((e) => {
    if (e.model.toLowerCase().includes(q)) return true;
    if ((e.description ?? '').toLowerCase().includes(q)) return true;
    if (e.manufacturer && e.manufacturer.name.toLowerCase().includes(q)) return true;
    if (e.category && e.category.label.toLowerCase().includes(q)) return true;
    if (
      e.applicable_specs.some(spec => {
        if (spec.spec_key.toLowerCase().includes(q)) return true;
        if (spec.min !== undefined && String(spec.min).includes(q)) return true;
        if (spec.max !== undefined && String(spec.max).includes(q)) return true;
        if (spec.allowed_values && spec.allowed_values.some(v => String(v).toLowerCase().includes(q))) return true;
        return false;
      })
    ) return true;
    return false;
  });
}
```

Notes:
- `e.manufacturer` and `e.category` are optional (`?` in the type) — guarded with `&&`
- `applicable_specs` is always an array (possibly empty) — `.some(...)` is safe
- `spec.min`/`spec.max` are optional numbers — converted to strings for comparison
- `spec.allowed_values` is optional array — guarded

## File Structure Summary

### Modified Files
- `frontend/components/home/HeroSearch.tsx` — input className, equipment popular chips
- `frontend/lib/filter.ts` — extend `filterCablesByText` AND `filterCables` predicates
- `frontend/lib/equipmentFilter.ts` — extend `filterEquipment` predicate

### New Files
- None

### Deleted Files
- None

## Impact Assessment

### User-visible behavior changes
- Hero search input: typed text becomes white (was dark slate) — visible against dark hero overlay
- Hero search Equipment tab: now shows 4 popular search chips (was empty)
- Cable global search (`/cables?q=Komax`): now matches cables made by manufacturers named "Komax" (previously 0 results)
- Cable scoped search (`/cables/[ind]/[cat]/[pt]?q=...`): same expanded matching
- Equipment search (`/equipment?q=Komax`): now matches all equipment made by Komax (previously 0 results unless model/description contained "Komax")
- Equipment search (`/equipment?q=cutting`): now matches equipment in categories labeled "Cutting" (e.g., the "Cutting & Stripping" top-level category)

### Pages affected
- `/` (homepage hero search)
- `/cables` (global cable search via `?q=`)
- `/cables/[industry]/[category]/[product-type]` (scoped cable search via `?q=`)
- `/equipment` (equipment search via `?q=`)

### Pages NOT affected
- Cable detail page (`/cable/[brand_slug]/[slug]`) — no search box
- Equipment detail pages — no search box
- Admin pages — use their own search/filter UIs
- `/login`, `/member/*` — no search

### Risk
- **Performance:** Adding 4-5 extra predicate checks per item. With Map-based lookups for cable manufacturer/brand, the cable filter stays O(n) where n = cables. Equipment filter adds O(n*m) where m = avg applicable_specs per equipment (typically 2-5). At current data volume (4 equipment, ~100s of cables), negligible. At 10,000+ items, may need optimization (e.g., pre-built search index).
- **False positives:** Searching `awg` will now match spec values containing "awg" in common_specs and applicable_specs. This is the user's explicit request ("spec keywords"). Acceptable.
- **Search input readability:** White text on dark hero overlay is readable. If user uploads a very light hero image in the future, the overlay (`rgba(15, 23, 42, 0.65-0.75)`) keeps the input area dark enough.

## Verification

1. `docker compose --env-file .env.docker build frontend` succeeds
2. tsc: 0 new errors (8 pre-existing baseline in `.next/dev/types/validator.ts` — actually 0 as of last build, but either is acceptable)
3. HTTP smoke test:
   - `/` → 200
   - `/cables?q=UL1007` → 200 (existing cable search still works)
   - `/cables?q=Komax` → 200 (NEW: matches by manufacturer name)
   - `/equipment?q=Komax` → 200 (NEW: matches by manufacturer name)
   - `/equipment?q=cutting` → 200 (NEW: matches by category label)
4. Manual browser checks:
   - Hero input typed text is white, placeholder is white-at-70%
   - Hero input background shows the hero image through it (transparent)
   - Clicking Cable tab shows 4 popular chips
   - Clicking Equipment tab shows 4 different popular chips
   - Searching `Komax` on Equipment tab returns all Komax equipment (Alpha 488, Gamma 333)
   - Searching `Komax` on Cable tab returns cables made by Komax (if any in DB)
   - Searching `awg` on Cable tab returns cables with "awg" in spec values

## Acceptance Criteria

1. ✅ Hero search input uses `text-white` with `placeholder:text-white/70`
2. ✅ Hero search input background is transparent (hero image visible through it)
3. ✅ Hero Equipment tab shows 4 popular search chips (`Komax`, `Alpha 488`, `Gamma 333`, `KMV`)
4. ✅ Hero Cable tab still shows its 4 popular search chips (`UL1007`, `AVSS`, `UL1015`, `UL2468`)
5. ✅ `filterCablesByText` matches: model, base_description, variant spec values, common_specs values, manufacturer.name, brand.name
6. ✅ `filterCables` (scoped) matches the same fields as `filterCablesByText`
7. ✅ `filterEquipment` matches: model, description, manufacturer.name, category.label, applicable_specs (spec_key, min, max, allowed_values)
8. ✅ No backend changes
9. ✅ Docker frontend build succeeds
10. ✅ 0 new tsc errors
11. ✅ HTTP smoke test passes on `/`, `/cables?q=...`, `/equipment?q=...`

## Rollback

Single commit revert. No migrations, no data changes.
