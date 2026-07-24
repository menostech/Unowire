# Hero Height, Search Width, Stats Cards Design Spec

> **Branch:** `feat/media-picker-modal`
> **Date:** 2026-07-20
> **Status:** Approved by user (2026-07-20)

## Goal

Three visual tweaks to the homepage hero and stats sections:

1. **Hero height +50%** — increase hero vertical padding from `py-20` (80px each side, 160px total) to `py-[120px]` (120px each side, 240px total). Total hero section height grows by approximately 35-50% depending on viewport content height.
2. **Search box width ×2** — widen the hero search form from `max-w-xl` (576px) to `max-w-6xl` (1152px). Exactly double the max width.
3. **Stats as cards** — replace the current plain-text stats row with 5 white cards in a responsive grid. Each card has border + shadow + white background.

## Scope

### In Scope
- Modify `frontend/components/home/HeroSearch.tsx` — two className swaps (hero padding, search form max-width)
- Modify `frontend/components/home/StatsRow.tsx` — replace render block with card grid

### Out of Scope
- Backend changes (none)
- New components, new pages, new tests (per project constraint)
- Changes to data flow, props, or types
- Changes to other sections of the homepage (CableCategoryGrid, EquipmentCategoryGrid)
- Tab behavior, popular chips, search input styling (all unchanged)
- i18n, SEO, accessibility beyond what naturally changes with the layout swap

## Component Design

### 1. `HeroSearch.tsx` — hero padding

**File:** `frontend/components/home/HeroSearch.tsx:54`

**Before:**
```tsx
<div className="w-full px-8 md:px-12 py-20 text-center">
```

**After:**
```tsx
<div className="w-full px-8 md:px-12 py-[120px] text-center">
```

Rationale:
- `py-20` = Tailwind's 80px padding top + 80px padding bottom = 160px total vertical padding.
- `py-[120px]` = arbitrary 120px each side = 240px total vertical padding. Exactly +50% on padding.
- The hero section's total height is padding (240px) + content (h1 + p + tabs + form + popular row ≈ 400-500px depending on viewport). So total height grows from ~560-660px to ~640-740px, an increase of ~12-18% in absolute terms but +50% in the user-controllable padding dimension.
- Arbitrary value `py-[120px]` is used because Tailwind v4's spacing scale has no `py-30` class (the scale jumps from `py-24` = 96px to `py-32` = 128px).
- All other classNames on this div unchanged (`w-full px-8 md:px-12 text-center`).

### 2. `HeroSearch.tsx` — search form width

**File:** `frontend/components/home/HeroSearch.tsx:96`

**Before:**
```tsx
<form
  onSubmit={handleSubmit}
  className="mx-auto flex max-w-xl overflow-hidden rounded-b-lg rounded-tr-lg border-2 border-white"
>
```

**After:**
```tsx
<form
  onSubmit={handleSubmit}
  className="mx-auto flex max-w-6xl overflow-hidden rounded-b-lg rounded-tr-lg border-2 border-white"
>
```

Rationale:
- `max-w-xl` = 36rem = 576px max width.
- `max-w-6xl` = 72rem = 1152px max width. Exactly ×2.
- On viewports narrower than 1152px (plus horizontal padding), the form continues to fill available width via `flex` — behavior unchanged below the breakpoint.
- All other form classNames unchanged (`mx-auto flex overflow-hidden rounded-b-lg rounded-tr-lg border-2 border-white`).
- Search input (`flex-1`) and search button (`px-6`) automatically grow/stay fixed respectively — no other changes needed.

### 3. `StatsRow.tsx` — card grid layout

**File:** `frontend/components/home/StatsRow.tsx`

**Before** (lines 23-34):
```tsx
  return (
    <section className="border-b bg-gray-50 py-8">
      <div className="flex flex-wrap justify-center gap-8 md:gap-12">
        {stats.map(stat => (
          <div key={stat.label} className="text-center">
            <p className="text-3xl font-bold text-blue-600">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
```

**After:**
```tsx
  return (
    <section className="border-b bg-gray-50 py-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {stats.map(stat => (
          <div
            key={stat.label}
            className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm"
          >
            <p className="text-3xl font-bold text-blue-600">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
```

Rationale:
- **Grid layout replaces flex:** `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5` creates a responsive grid. 5 cards distribute cleanly on desktop (single row), tablet (2 rows: 3+2), and mobile (3 rows: 2+2+1).
- **Card styling:** `rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm` — white card on gray section background, subtle border and shadow for depth. Standard Tailwind card pattern.
- **Stat number and label:** unchanged styling (`text-3xl font-bold text-blue-600` + `text-sm text-gray-500`). User-perceived numbers and labels are identical — only the container changes.
- **Section wrapper:** unchanged (`border-b bg-gray-50 py-8`). The section background remains gray-50 so the white cards visually pop.
- **Gap:** `gap-4` (16px) between cards — standard card grid spacing.

## File Structure Summary

### Modified Files
- `frontend/components/home/HeroSearch.tsx` — 2 className swaps (lines 54 and 96)
- `frontend/components/home/StatsRow.tsx` — render block swap (lines 23-34)

### New Files
- None

### Deleted Files
- None

## Impact Assessment

### User-visible changes
- Homepage hero section is visibly taller (~50% more vertical padding).
- Hero search form is visibly wider on desktop viewports (1152px max instead of 576px max).
- Homepage stats row shows 5 distinct white cards instead of 5 plain text stats.

### Pages affected
- `/` (homepage) — both HeroSearch and StatsRow render here

### Pages NOT affected
- `/cables`, `/equipment`, `/login`, admin pages, member pages — none use HeroSearch or StatsRow

### Risk
- **Hero aspect ratio:** With +50% padding and wider search form, the hero may feel "thinner" vertically relative to the wider search bar. This is acceptable per user request.
- **Mobile stats grid:** On mobile, 5 cards in 2 columns = 3 rows (2+2+1). The lone 5th card sits in column 1 of row 3 — visually slightly unbalanced but standard for odd-count card grids. Acceptable.
- **Tablet stats grid:** 3 columns × 2 rows = 6 cells, 5 cards. Row 2 has 2 cards in columns 1-2, column 3 of row 2 is empty. Acceptable.
- **Container width interaction:** The wider search form (`max-w-6xl` = 1152px) fits inside the full-width Container (`px-8 md:px-12`, no max-width) on viewports ≥1200px. No overflow.

## Verification

1. `docker compose --env-file .env.docker build frontend` succeeds
2. tsc: 0 new errors
3. HTTP smoke test: `/` returns 200
4. Manual browser checks:
   - Hero section is visibly taller than before
   - Search form on desktop (≥1200px) is visibly wider than before, fills most of the hero width
   - Search form on mobile (<768px) still fits viewport (max-w-6xl doesn't apply, flex fills available width)
   - Stats section shows 5 white cards in a single row on desktop, 3+2 on tablet, 2+2+1 on mobile
   - Card numbers and labels are unchanged (Cables, Brands, Industries, Equipment, Manufacturers)

## Acceptance Criteria

1. ✅ Hero section uses `py-[120px]` (was `py-20`)
2. ✅ Search form uses `max-w-6xl` (was `max-w-xl`)
3. ✅ Stats section renders 5 cards in `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5`
4. ✅ Each stat card has `rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm`
5. ✅ Stat number and label styling unchanged
6. ✅ Section wrapper unchanged (`border-b bg-gray-50 py-8`)
7. ✅ Docker frontend build succeeds
8. ✅ 0 new tsc errors
9. ✅ HTTP smoke test: `/` returns 200

## Rollback

Single commit revert. No migrations, no data changes.
