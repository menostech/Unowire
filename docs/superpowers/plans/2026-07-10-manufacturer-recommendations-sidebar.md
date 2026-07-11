# Manufacturer Recommendations Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the right sidebar across cable detail, manufacturers list, and manufacturer detail pages to show a shared manufacturer recommendations block (2×3 image grid + 10 text links + All Manufacturers link), and widen the cable detail sidebar by switching from flex to a 4-column grid.

**Architecture:** Extract a shared `ManufacturerRecommendations` component that accepts a `Manufacturer[]` array. Three pages import and render it in their sidebars. No backend changes — `GET /api/manufacturers` already returns all featured fields.

**Tech Stack:** Next.js 16 (App Router, server components), TypeScript, Tailwind CSS

---

### Task 1: Create ManufacturerRecommendations component

**Files:**
- Create: `frontend/components/shared/ManufacturerRecommendations.tsx`

- [ ] **Step 1: Create the component file**

Create `frontend/components/shared/ManufacturerRecommendations.tsx` with this exact content:

```tsx
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

- [ ] **Step 2: Verify TypeScript compiles**

Run from `d:\projects\unowire\frontend`:
```
npx tsc --noEmit
```
Expected: 8 pre-existing errors in `.next/dev/types/validator.ts` — no new errors from this file.

- [ ] **Step 3: Commit**

```
git add frontend/components/shared/ManufacturerRecommendations.tsx
git commit -m "feat: add ManufacturerRecommendations shared component"
```

---

### Task 2: Integrate into cable detail page

**Files:**
- Modify: `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx`

- [ ] **Step 1: Add import for the new component**

In `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx`, add this import after line 14 (after the `InquiryFormModal` import):

```tsx
import { ManufacturerRecommendations } from '@/components/shared/ManufacturerRecommendations';
```

- [ ] **Step 2: Add data fetching for all manufacturers**

In the same file, after line 42 (`const similar = await api.cables.similar(cable, 4);`), add:

```tsx
  const allManufacturers = await api.manufacturers.all();
```

- [ ] **Step 3: Change layout from flex to 4-column grid**

Replace lines 66-68 (the flex layout wrapper):

```tsx
      <div className="flex flex-col lg:flex-row gap-8">
        {/* 主内容 */}
        <div className="flex-1 min-w-0 space-y-8">
```

with:

```tsx
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 主内容 */}
        <div className="lg:col-span-3 space-y-8">
```

- [ ] **Step 4: Change sidebar from fixed width to grid column**

Replace line 108:

```tsx
        <aside className="lg:w-64 shrink-0 space-y-6">
```

with:

```tsx
        <aside className="lg:col-span-1 space-y-6">
```

- [ ] **Step 5: Add ManufacturerRecommendations after manufacturer info block**

After line 143 (the closing `)}` of the `{manufacturer && (...)}` block) and before line 145 (the `{/* Categories */}` comment), insert:

```tsx

          {/* Recommended Manufacturers */}
          <ManufacturerRecommendations manufacturers={allManufacturers} />
```

- [ ] **Step 6: Demote View JSON to gray small text**

Replace lines 162-171 (the View JSON block):

```tsx
          {/* View JSON */}
          <div>
            <a
              href={jsonUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              View JSON →
            </a>
          </div>
```

with:

```tsx
          {/* View JSON */}
          <div>
            <a
              href={jsonUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              View JSON
            </a>
          </div>
```

- [ ] **Step 7: Verify TypeScript compiles**

Run from `d:\projects\unowire\frontend`:
```
npx tsc --noEmit
```
Expected: 8 pre-existing errors — no new errors.

- [ ] **Step 8: Commit**

```
git add "frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx"
git commit -m "feat: add manufacturer recommendations to cable detail sidebar"
```

---

### Task 3: Integrate into manufacturers list page

**Files:**
- Modify: `frontend/app/(site)/manufacturers/page.tsx`

- [ ] **Step 1: Add import for the new component**

In `frontend/app/(site)/manufacturers/page.tsx`, add this import after line 6 (after `import type { Manufacturer } from '@/lib/types';`):

```tsx
import { ManufacturerRecommendations } from '@/components/shared/ManufacturerRecommendations';
```

- [ ] **Step 2: Delete inline featuredImage/featuredText computation**

Delete lines 35-41 (the `featuredImage` and `featuredText` const declarations):

```tsx
  const featuredImage = manufacturers
    .filter(m => m.featured_image)
    .sort((a, b) => a.featured_image_sort - b.featured_image_sort);

  const featuredText = manufacturers
    .filter(m => m.featured_text)
    .sort((a, b) => a.featured_text_sort - b.featured_text_sort);
```

- [ ] **Step 3: Replace sidebar inline blocks with shared component**

Replace lines 81-129 (the entire sidebar div with inline FeaturedImage + FeaturedText blocks):

```tsx
        <div className="lg:col-span-1 order-2 lg:order-2 space-y-6">
          {featuredImage.length > 0 && (
            <div className="border rounded-lg p-4 bg-white">
              <h3 className="text-base font-bold mb-4 text-gray-800">Featured Manufacturers</h3>
              <div className="space-y-4">
                {featuredImage.map(m => (
                  <Link
                    key={m.id}
                    href={`/manufacturers/${m.slug}`}
                    className="flex items-center gap-3 hover:bg-gray-50 p-2 rounded transition -mx-2"
                  >
                    {m.image_url ? (
                      <div className="w-12 h-12 shrink-0 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                        <img
                          src={m.image_url}
                          alt={m.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 shrink-0 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs font-bold">
                        {m.name.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-800 truncate">{m.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

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
        </div>
```

with:

```tsx
        <div className="lg:col-span-1 order-2 lg:order-2 space-y-6">
          <ManufacturerRecommendations manufacturers={manufacturers} />
        </div>
```

- [ ] **Step 4: Verify the `Link` import is still used**

The `Link` import on line 2 is still used by the main content area (line 66-72, the manufacturers list links), so it must remain. No change needed — just verify it's still there.

- [ ] **Step 5: Verify TypeScript compiles**

Run from `d:\projects\unowire\frontend`:
```
npx tsc --noEmit
```
Expected: 8 pre-existing errors — no new errors.

- [ ] **Step 6: Commit**

```
git add "frontend/app/(site)/manufacturers/page.tsx"
git commit -m "refactor: use shared ManufacturerRecommendations in manufacturers list sidebar"
```

---

### Task 4: Integrate into manufacturer detail page

**Files:**
- Modify: `frontend/app/(site)/manufacturers/[slug]/page.tsx`

- [ ] **Step 1: Add import for the new component**

In `frontend/app/(site)/manufacturers/[slug]/page.tsx`, add this import after line 11 (after the `InquiryFormModal` import):

```tsx
import { ManufacturerRecommendations } from '@/components/shared/ManufacturerRecommendations';
```

- [ ] **Step 2: Delete inline recommendation computation (remove exclusion logic)**

Delete lines 89-96 (the `others` variable and `featuredImage`/`featuredText` computation that excludes the current manufacturer):

```tsx
  // Recommendation lists (exclude current manufacturer)
  const others = allManufacturers.filter(m => m.id !== manufacturer.id);
  const featuredImage = others
    .filter(m => m.featured_image)
    .sort((a, b) => a.featured_image_sort - b.featured_image_sort);
  const featuredText = others
    .filter(m => m.featured_text)
    .sort((a, b) => a.featured_text_sort - b.featured_text_sort);
```

- [ ] **Step 3: Replace sidebar inline blocks with shared component**

Replace lines 336-384 (the entire `<aside>` element with inline FeaturedImage + FeaturedText blocks):

```tsx
        {/* Right sidebar: Recommendations */}
        <aside className="lg:col-span-1 space-y-6">
          {featuredImage.length > 0 && (
            <div className="border rounded-lg p-4 bg-white">
              <h3 className="text-base font-bold mb-4 text-gray-800">Featured Manufacturers</h3>
              <div className="space-y-4">
                {featuredImage.map(m => (
                  <Link
                    key={m.id}
                    href={`/manufacturers/${m.slug}`}
                    className="flex items-center gap-3 hover:bg-gray-50 p-2 rounded transition -mx-2"
                  >
                    {m.image_url ? (
                      <div className="w-12 h-12 shrink-0 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                        <img
                          src={m.image_url}
                          alt={m.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 shrink-0 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs font-bold">
                        {m.name.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-800 truncate">{m.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

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
        </aside>
```

with:

```tsx
        {/* Right sidebar: Recommendations */}
        <aside className="lg:col-span-1 space-y-6">
          <ManufacturerRecommendations manufacturers={allManufacturers} />
        </aside>
```

- [ ] **Step 4: Verify the `Link` import is still used**

The `Link` import on line 2 is still used by the main content area (e.g., the "Login to Contact" link on line 189, and other links), so it must remain. No change needed — just verify it's still there.

- [ ] **Step 5: Verify TypeScript compiles**

Run from `d:\projects\unowire\frontend`:
```
npx tsc --noEmit
```
Expected: 8 pre-existing errors — no new errors.

- [ ] **Step 6: Commit**

```
git add "frontend/app/(site)/manufacturers/[slug]/page.tsx"
git commit -m "refactor: use shared ManufacturerRecommendations in manufacturer detail sidebar"
```

---

### Task 5: Build and verify

**Files:**
- None (verification only)

- [ ] **Step 1: Run full TypeScript check**

Run from `d:\projects\unowire\frontend`:
```
npx tsc --noEmit
```
Expected: 8 pre-existing errors in `.next/dev/types/validator.ts` — 0 new errors.

- [ ] **Step 2: Build frontend Docker container**

Run from `d:\projects\unowire`:
```
docker compose build frontend
```
Expected: Build succeeds with no errors.

- [ ] **Step 3: Restart frontend container**

Run from `d:\projects\unowire`:
```
docker compose up -d frontend
```
Expected: Container starts and is healthy.

- [ ] **Step 4: Manual smoke test (deferred to user)**

Document the following smoke test checklist for the user:

| Scenario | URL | Expected |
|---|---|---|
| Cable detail sidebar layout | `http://localhost:3000/cable/sumitomo/avss` | Sidebar occupies 1 of 4 grid columns (wider than before) |
| Cable detail recommendations | Same URL | Manufacturer info → image grid (2×3) → text list → All Manufacturers link |
| Cable detail View JSON | Same URL | Gray small text "View JSON" at sidebar bottom, no arrow |
| Manufacturers list sidebar | `http://localhost:3000/manufacturers` | Same recommendations block in right sidebar |
| Manufacturer detail sidebar | `http://localhost:3000/manufacturers/sumitomo-electric` | Same recommendations block; current manufacturer also appears |
| Three-page consistency | Compare all three | Image and text recommendations identical across pages |
| Click image recommendation | Click a logo in 2×3 grid | Navigate to that manufacturer's detail page |
| Click text recommendation | Click a text link | Navigate to that manufacturer's detail page |
| Click All Manufacturers | Click the link | Navigate to `/manufacturers` |

- [ ] **Step 5: Commit (if any fixup needed)**

If no fixups are needed, this step is skipped. Otherwise:
```
git add -A
git commit -m "fix: build verification adjustments"
```
