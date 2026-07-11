# Manufacturer Recommendations Sidebar — Design Spec

> **Date:** 2026-07-10
> **Branch:** `feat/media-picker-modal`
> **Status:** Approved (all 4 sections)

## Goal

Unify the right sidebar across the cable detail page, manufacturers list page, and manufacturer detail page to display a shared manufacturer recommendations block: a 2×3 image grid (6 logo slots), a text list (10 manufacturer names), and an "All Manufacturers" link pointing to `/manufacturers`. Widen the cable detail page sidebar by switching from flex to a 4-column grid layout.

## Architecture & Scope

**Approach:** Extract a shared `ManufacturerRecommendations` component, then use it in three pages. No backend changes — the `GET /api/manufacturers` endpoint already returns all featured fields, and the admin manages them via `ManufacturerShowcaseBlocks.tsx`.

**Files to modify (4):**

| File | Change |
|---|---|
| `frontend/components/shared/ManufacturerRecommendations.tsx` (NEW) | Shared component: accepts `manufacturers: Manufacturer[]`, renders image grid (2×3) + text list (10) + "All Manufacturers" link. |
| `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx` | Switch flex → 4-col grid; add `api.manufacturers.all()` call; sidebar becomes `lg:col-span-1`; render `<ManufacturerRecommendations>` after manufacturer info block; demote "View JSON" to gray small text. |
| `frontend/app/(site)/manufacturers/page.tsx` | Replace inline FeaturedImage + FeaturedText blocks with `<ManufacturerRecommendations>`. |
| `frontend/app/(site)/manufacturers/[slug]/page.tsx` | Replace inline FeaturedImage + FeaturedText blocks with `<ManufacturerRecommendations>`; remove the "exclude current manufacturer" logic. |

**No changes to:**
- Backend: `GET /api/manufacturers` already returns all featured fields.
- `Manufacturer` type: already has `featured_image`, `featured_image_sort`, `featured_text`, `featured_text_sort`.

**Key decision:** All three pages show the **same** recommendations — no exclusion of the current manufacturer. The `ManufacturerRecommendations` component takes only `manufacturers: Manufacturer[]` (no `excludeId` parameter).

## Data Flow

```
Cable detail page (server component)
  → existing data fetching (cable, brand, manufacturer, categories, equipment, similar)
  → NEW: api.manufacturers.all() → allManufacturers
  → <ManufacturerRecommendations manufacturers={allManufacturers} />

Manufacturers list page (server component)
  → existing api.manufacturers.all() → manufacturers
  → <ManufacturerRecommendations manufacturers={manufacturers} />

Manufacturer detail page (server component)
  → existing api.manufacturers.all() → allManufacturers
  → <ManufacturerRecommendations manufacturers={allManufacturers} />
  (previously excluded current manufacturer — now includes it)
```

## Component Design

### ManufacturerRecommendations component

```tsx
// frontend/components/shared/ManufacturerRecommendations.tsx
import Link from 'next/link';
import type { Manufacturer } from '@/lib/types';

interface Props {
  manufacturers: Manufacturer[];
}

export function ManufacturerRecommendations({ manufacturers }: Props) {
  const featuredImage = manufacturers
    .filter(m => m.featured_image)
    .sort((a, b) => a.featured_image_sort - b.featured_image_sort)
    .slice(0, 6);

  const featuredText = manufacturers
    .filter(m => m.featured_text)
    .sort((a, b) => a.featured_text_sort - b.featured_text_sort)
    .slice(0, 10);

  if (featuredImage.length === 0 && featuredText.length === 0) return null;

  return (
    <>
      {/* Image recommendations: 2×3 grid, logo only */}
      {featuredImage.length > 0 && (
        <div className="border rounded-lg p-4 bg-white">
          <h3 className="text-base font-bold mb-4 text-gray-800">Featured Manufacturers</h3>
          <div className="grid grid-cols-3 gap-3">
            {featuredImage.map(m => (
              <Link
                key={m.id}
                href={`/manufacturers/${m.slug}`}
                className="flex items-center justify-center aspect-square bg-gray-100 rounded overflow-hidden hover:shadow-md transition"
              >
                {m.image_url ? (
                  <img
                    src={m.image_url}
                    alt={m.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-gray-400 text-lg font-bold">
                    {m.name.charAt(0)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Text recommendations: 10 manufacturer names */}
      {featuredText.length > 0 && (
        <div className="border rounded-lg p-4 bg-white">
          <h3 className="text-base font-bold mb-4 text-gray-800">Recommended Manufacturers</h3>
          <ul className="space-y-2">
            {featuredText.map(m => (
              <li key={m.id}>
                <Link
                  href={`/manufacturers/${m.slug}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {m.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* All Manufacturers link */}
      <div>
        <Link
          href="/manufacturers"
          className="text-sm text-blue-600 hover:underline font-medium"
        >
          All Manufacturers →
        </Link>
      </div>
    </>
  );
}
```

**Key design points:**
- **Image grid:** `grid grid-cols-3 gap-3`, each card `aspect-square` (square), logo only (no manufacturer name), fallback to first initial.
- **Text list:** same style as existing manufacturers list page (`space-y-2` + `text-blue-600`).
- **Empty protection:** if both image and text recommendations are empty, component returns `null` (renders nothing).
- **slice limits:** image takes first 6, text takes first 10.
- **All Manufacturers link:** rendered inside the component, only when at least one recommendation block is non-empty (because the whole component returns `null` otherwise). If no recommendations exist at all, the link is also hidden — users can still reach `/manufacturers` via the top nav bar.

## Page-Specific Changes

### Cable detail page (`cable/[brand_slug]/[slug]/page.tsx`)

**Layout change:**
```tsx
// Current (flex)
<div className="flex flex-col lg:flex-row gap-8">
  <div className="flex-1 min-w-0 space-y-8">...</div>
  <aside className="lg:w-64 shrink-0 space-y-6">...</aside>
</div>

// New (4-col grid)
<div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
  <div className="lg:col-span-3 space-y-8">...</div>
  <aside className="lg:col-span-1 space-y-6">
    {/* Manufacturer info block (kept) */}
    {/* ManufacturerRecommendations (new) */}
    {/* Categories (kept) */}
    {/* View JSON (demoted to gray small text) */}
  </aside>
</div>
```

**New data fetching:**
```tsx
const allManufacturers = await api.manufacturers.all();
```

**New import:**
```tsx
import { ManufacturerRecommendations } from '@/components/shared/ManufacturerRecommendations';
```

**Sidebar rendering:** insert after manufacturer info block `</div>`, before Categories:
```tsx
<ManufacturerRecommendations manufacturers={allManufacturers} />
```

**View JSON style change:**
```tsx
// Current
<a href={jsonUrl} ... className="text-sm text-blue-600 hover:underline">View JSON →</a>
// New
<a href={jsonUrl} ... className="text-xs text-gray-400 hover:text-gray-600">View JSON</a>
```

**Sidebar order:** Manufacturer info → ManufacturerRecommendations → Categories → View JSON

### Manufacturers list page (`manufacturers/page.tsx`)

**Delete inline code:** lines 35-41 (featuredImage/featuredText computation), lines 82-128 (entire sidebar inline FeaturedImage + FeaturedText blocks).

**New import:**
```tsx
import { ManufacturerRecommendations } from '@/components/shared/ManufacturerRecommendations';
```

**Sidebar rendering** (replace lines 82-128):
```tsx
<div className="lg:col-span-1 order-2 lg:order-2 space-y-6">
  <ManufacturerRecommendations manufacturers={manufacturers} />
</div>
```

Note: `manufacturers` variable already exists (line 20 `api.manufacturers.all()`), can be passed directly.

### Manufacturer detail page (`manufacturers/[slug]/page.tsx`)

**Delete inline code:** lines 84-96 (allManufacturers/others/featuredImage/featuredText computation), lines 337-383 (entire aside inline FeaturedImage + FeaturedText blocks).

**New import:**
```tsx
import { ManufacturerRecommendations } from '@/components/shared/ManufacturerRecommendations';
```

**Sidebar rendering** (replace lines 336-384 aside content):
```tsx
<aside className="lg:col-span-1 space-y-6">
  <ManufacturerRecommendations manufacturers={allManufacturers} />
</aside>
```

Note: `allManufacturers` already exists (line 84). The old code used `others = allManufacturers.filter(m => m.id !== manufacturer.id)` to exclude the current manufacturer — this is removed. Pass `allManufacturers` directly. Delete the `others` variable.

## Edge Cases

| Case | Handling |
|---|---|
| No manufacturers with `featured_image=true` | Image block not rendered; text block and All Manufacturers link render normally. |
| No manufacturers with `featured_text=true` | Text block not rendered; image block and All Manufacturers link render normally. |
| Both image and text recommendations empty | Component returns `null` — sidebar shows other blocks only. All Manufacturers link also hidden. |
| Fewer than 6 image recommendations | `slice(0, 6)` takes what's available; `grid-cols-3` auto-wraps. |
| Fewer than 10 text recommendations | `slice(0, 10)` takes what's available; list shows normally. |
| Manufacturer has no `image_url` | Image slot shows first initial of manufacturer name (gray text). |
| Cable has no manufacturer | Manufacturer info block not rendered (existing logic); recommendations block still renders. |
| `api.manufacturers.all()` returns empty array | Component returns `null`; page other sections unaffected. |

### All Manufacturers Link Display Logic

If both image and text recommendations are empty, the component returns `null`, so the All Manufacturers link is also not shown. This is acceptable behavior — users can still reach `/manufacturers` via the top navigation bar. Showing an isolated "All Manufacturers" link with no recommendations has little value.

## Testing Strategy

**No frontend automated tests** (per MVP constraint). Coverage via manual smoke test:

| Scenario | Action | Expected Result |
|---|---|---|
| Cable detail sidebar layout | Open `/cable/sumitomo/avss` | Sidebar occupies 1 of 4 grid columns (wider than previous `lg:w-64`) |
| Cable detail recommendations | Check right sidebar | Manufacturer info block, then image grid (2×3), then text list, then All Manufacturers link |
| Cable detail View JSON | Check sidebar bottom | Gray small text "View JSON", no arrow |
| Manufacturers list sidebar | Open `/manufacturers` | Right sidebar shows recommendations block, same as cable detail page |
| Manufacturer detail sidebar | Open `/manufacturers/sumitomo-electric` | Right sidebar shows recommendations block; Sumitomo Electric appears in recommendations (not excluded) |
| Three-page consistency | Compare all three pages | Image and text recommendations are identical across pages |
| Click image recommendation | Click a logo in the 2×3 grid | Navigate to that manufacturer's detail page |
| Click text recommendation | Click a text link | Navigate to that manufacturer's detail page |
| Click All Manufacturers | Click the link | Navigate to `/manufacturers` |
| Fewer than 6 image recommendations | Admin sets <6 featured_image | Grid shows only available items, auto-wraps |
| No-image manufacturer | Recommendation list includes a manufacturer without image_url | Shows first initial as placeholder |

### TypeScript Verification

- New `ManufacturerRecommendations` component accepts `Manufacturer[]` type, matching `api.manufacturers.all()` return type.
- All three pages' `manufacturers` / `allManufacturers` variables have the same type.
- Run `npx tsc --noEmit` to confirm 0 new errors (current baseline: 8 pre-existing errors in `.next/dev/types/`).
