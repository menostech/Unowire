# Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Unowire homepage (`/`) with a Thomasnet-style hero (background image + Cable|Equipment tabbed search), kept-and-expanded stats row, and two independent Thomasnet-style category grids (Cable industries with category/product_type sub-links, Equipment top-level categories with children sub-links). Remove the Featured Cables section. Constrain all content to `max-w-7xl` centered.

**Architecture:** Next.js 15 App Router. One new client component (`HeroSearch`) for tab toggle + search routing; three new server components (`StatsRow`, `CableCategoryGrid`, `EquipmentCategoryGrid`) for SSR-friendly content. The homepage server component loads 6 data sources in parallel via existing `api.*` methods and composes the 4 sections. The shared `Container` gets `max-w-7xl mx-auto` added.

**Tech Stack:** Next.js 15 (App Router, RSC), TypeScript, Tailwind CSS, existing `api` client (`frontend/lib/api.ts`), existing types (`frontend/lib/types.ts`).

**Branch:** `feat/media-picker-modal` (continuing on existing branch — homepage redesign is the next feature)

**Spec:** `docs/superpowers/specs/2026-07-19-homepage-redesign-design.md`

**Global Constraints:**
- All code, comments, and documentation in English (project is global-facing)
- Frontend MVP does not require automated tests
- Docker frontend container runs production mode (no bind-mount) — must run `docker compose --env-file .env.docker build frontend` to apply changes
- tsc baseline: 8 pre-existing errors in `.next/dev/types/validator.ts` line 440 — verify 0 NEW errors per task
- Host `tsc --noEmit` with `incremental: true` does NOT reliably catch new errors — Docker `next build` is authoritative
- All existing API methods (`api.cables.all()`, `api.brands.all()`, `api.taxonomy.all()`, `api.equipmentCategories.tree()`, `api.equipmentManufacturers.all()`, `api.recommendedEquipments.all()`) return arrays via `fetchWithCache` (60s revalidate)
- Type names already defined in `frontend/lib/types.ts`: `Taxonomy`, `TaxonomyIndustry`, `TaxonomyCategory`, `ProductTypeConfig`, `EquipmentCategory`
- `EquipmentCategory.children` is optional (`children?: EquipmentCategory[]`) — always use `?? []` when iterating

---

## File Structure

### New Files
- `frontend/components/home/HeroSearch.tsx` — client component, hero with bg image + tabs + search
- `frontend/components/home/StatsRow.tsx` — server component, 5 stats row
- `frontend/components/home/CableCategoryGrid.tsx` — server component, Cable Thomasnet grid
- `frontend/components/home/EquipmentCategoryGrid.tsx` — server component, Equipment Thomasnet grid
- `frontend/public/hero-bg.jpg` — hero background image (~150KB JPG)

### Modified Files
- `frontend/components/layout/Container.tsx` — add `max-w-7xl mx-auto`
- `frontend/app/(site)/page.tsx` — full rewrite of homepage layout

### Not Modified
- `frontend/components/shared/SearchBox.tsx` — kept (still used in `Nav.tsx`)
- `frontend/components/cable/CableCard.tsx` — kept (still used in `/cables` list page)
- `frontend/lib/api.ts` — no changes (all needed methods exist)
- `frontend/lib/types.ts` — no changes (all needed types exist)

---

## Task 1: Download hero background image

**Files:**
- Create: `frontend/public/hero-bg.jpg`

- [ ] **Step 1: Verify frontend/public directory exists**

Run from PowerShell:
```powershell
Test-Path d:\projects\unowire\frontend\public
```
Expected: `True` (directory exists; it already contains favicon and other assets)

- [ ] **Step 2: Download the hero background image**

Run from PowerShell (downloads an Unsplash industrial/factory image to `frontend/public/hero-bg.jpg`):

```powershell
$url = "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1600&q=80&fm=jpg"
$dest = "d:\projects\unowire\frontend\public\hero-bg.jpg"
Invoke-WebRequest -Uri $url -OutFile $dest
Get-Item $dest | Select-Object Name, Length
```

Expected: file `hero-bg.jpg` created, size between 100KB and 300KB.

- [ ] **Step 3: Verify the image is a valid JPG**

```powershell
$bytes = [System.IO.File]::ReadAllBytes("d:\projects\unowire\frontend\public\hero-bg.jpg")[0..1]
$bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8
```

Expected: `True` (JPG files start with bytes `FF D8`)

- [ ] **Step 4: Commit**

```powershell
cd d:\projects\unowire
git add frontend/public/hero-bg.jpg
git commit -m "feat(home): add hero background image"
```

---

## Task 2: Modify Container to add max-w-7xl

**Files:**
- Modify: `frontend/components/layout/Container.tsx`

- [ ] **Step 1: Read current Container.tsx**

Read `frontend/components/layout/Container.tsx` to confirm current state (9 lines total):
```typescript
import { cn } from '@/lib/utils';

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full px-6', className)}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Add max-w-7xl mx-auto to the className**

Edit `frontend/components/layout/Container.tsx` — replace the entire file with:

```typescript
import { cn } from '@/lib/utils';

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-7xl px-6', className)}>
      {children}
    </div>
  );
}
```

The change: `'w-full px-6'` → `'mx-auto w-full max-w-7xl px-6'`

- [ ] **Step 3: Commit**

```powershell
cd d:\projects\unowire
git add frontend/components/layout/Container.tsx
git commit -m "refactor(layout): center Container to max-w-7xl (1280px)

Affects all pages using <Container>. Verified safe: existing pages
already center visually; max-w-7xl is wider than most content needs;
cable/equipment list pages use their own grids inside Container."
```

---

## Task 3: Create HeroSearch client component

**Files:**
- Create: `frontend/components/home/HeroSearch.tsx`

- [ ] **Step 1: Create the components/home directory**

```powershell
New-Item -Path d:\projects\unowire\frontend\components\home -ItemType Directory -Force | Out-Null
```

- [ ] **Step 2: Write HeroSearch.tsx**

Create `frontend/components/home/HeroSearch.tsx` with the following content:

```typescript
'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

type TabKey = 'cable' | 'equipment';

const TABS: { key: TabKey; label: string; placeholder: string; action: string }[] = [
  {
    key: 'cable',
    label: 'Cable',
    placeholder: 'Search cable model, e.g. UL1007, AVSS...',
    action: '/cables',
  },
  {
    key: 'equipment',
    label: 'Equipment',
    placeholder: 'Search equipment model or manufacturer...',
    action: '/equipment',
  },
];

const POPULAR_CABLE_SEARCHES = ['UL1007', 'AVSS', 'UL1015', 'UL2468'];

export function HeroSearch() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('cable');
  const [query, setQuery] = useState('');

  const currentTab = TABS.find(t => t.key === activeTab)!;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      router.push(`${currentTab.action}?q=${encodeURIComponent(q)}`);
    } else {
      router.push(currentTab.action);
    }
  }

  return (
    <section
      className="relative w-full text-white"
      style={{
        backgroundImage:
          "linear-gradient(rgba(15, 23, 42, 0.65), rgba(15, 23, 42, 0.75)), url('/hero-bg.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 text-center">
        <h1 className="mb-3 text-4xl font-bold">
          Cable &amp; Equipment Specs Database
        </h1>
        <p className="mb-8 text-lg opacity-90">
          Query cable and equipment specifications. Browse by brand, category, and technical parameters.
        </p>

        {/* Tabs */}
        <div
          className="mb-0 inline-flex overflow-hidden rounded-t-lg border border-white/30"
          role="tablist"
          aria-label="Search target"
        >
          {TABS.map(tab => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveTab(tab.key);
                  setQuery('');
                }}
                className={
                  'border-r border-white/30 px-6 py-2 text-sm font-medium transition last:border-r-0 ' +
                  (isActive
                    ? 'bg-white text-slate-900'
                    : 'bg-white/15 text-white hover:bg-white/25')
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search bar */}
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-xl overflow-hidden rounded-b-lg rounded-tr-lg border-2 border-white"
        >
          <label htmlFor="hero-search" className="sr-only">
            Search {currentTab.label.toLowerCase()}
          </label>
          <input
            id="hero-search"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={currentTab.placeholder}
            className="flex-1 border-0 px-4 py-3 text-sm text-slate-900 outline-none"
          />
          <button
            type="submit"
            className="bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Search
          </button>
        </form>

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
      </div>
    </section>
  );
}
```

**Key implementation notes:**
- `'use client'` directive at top — needed for `useRouter` + `useState`
- Inline `style` with `backgroundImage` — avoids Tailwind arbitrary value escaping issues with the URL
- `currentTab.action` provides the route prefix (`/cables` or `/equipment`)
- Tab reset clears the query (`setQuery('')`) to avoid confusion
- `POPULAR_CABLE_SEARCHES` only renders when `activeTab === 'cable'`
- `aria-selected` and `role="tab"` for accessibility
- `sr-only` label for screen readers

- [ ] **Step 3: Commit**

```powershell
cd d:\projects\unowire
git add frontend/components/home/HeroSearch.tsx
git commit -m "feat(home): add HeroSearch client component

Client component with Cable|Equipment tab toggle, search input with
tab-specific placeholder, and popular searches chips (Cable tab only).
On submit: router.push to /cables?q= or /equipment?q=. Tab state is
client-only (not URL-synced) per design decision."
```

---

## Task 4: Create StatsRow server component

**Files:**
- Create: `frontend/components/home/StatsRow.tsx`

- [ ] **Step 1: Write StatsRow.tsx**

Create `frontend/components/home/StatsRow.tsx` with the following content:

```typescript
interface StatsRowProps {
  cables: number;
  brands: number;
  industries: number;
  equipment: number;
  manufacturers: number;
}

interface Stat {
  label: string;
  value: number;
}

export function StatsRow({ cables, brands, industries, equipment, manufacturers }: StatsRowProps) {
  const stats: Stat[] = [
    { label: 'Cables', value: cables },
    { label: 'Brands', value: brands },
    { label: 'Industries', value: industries },
    { label: 'Equipment', value: equipment },
    { label: 'Manufacturers', value: manufacturers },
  ];

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
}
```

**Key implementation notes:**
- Server component (no `'use client'` directive)
- `flex-wrap` on the container so stats wrap gracefully on narrow screens
- `gap-8 md:gap-12` for responsive spacing
- 5 stats: Cables, Brands, Industries, Equipment, Manufacturers

- [ ] **Step 2: Commit**

```powershell
cd d:\projects\unowire
git add frontend/components/home/StatsRow.tsx
git commit -m "feat(home): add StatsRow server component

Renders 5 stats (Cables/Brands/Industries/Equipment/Manufacturers) in
a responsive flex-wrap row. Server component — no client JS."
```

---

## Task 5: Create CableCategoryGrid server component

**Files:**
- Create: `frontend/components/home/CableCategoryGrid.tsx`

- [ ] **Step 1: Write CableCategoryGrid.tsx**

Create `frontend/components/home/CableCategoryGrid.tsx` with the following content:

```typescript
import Link from 'next/link';
import type { Taxonomy, TaxonomyIndustry, TaxonomyCategory, ProductTypeConfig } from '@/lib/types';

interface CableCategoryGridProps {
  taxonomy: Taxonomy;
}

export function CableCategoryGrid({ taxonomy }: CableCategoryGridProps) {
  const industries = Object.values(taxonomy);

  return (
    <section className="py-12">
      <h2 className="mb-6 inline-block border-b-2 border-blue-600 pb-1 text-xl font-bold text-gray-900">
        Browse Cables by Industry
      </h2>

      {industries.length === 0 ? (
        <p className="text-gray-500">Categories unavailable.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {industries.map(industry => (
            <IndustryCard key={industry.slug} industry={industry} />
          ))}
        </div>
      )}
    </section>
  );
}

function IndustryCard({ industry }: { industry: TaxonomyIndustry }) {
  const categories = Object.values(industry.categories);
  const industryHref = `/cables?industry=${encodeURIComponent(industry.slug)}`;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h3 className="mb-2 border-b border-gray-200 pb-2">
        <Link href={industryHref} className="font-bold text-blue-600 hover:underline">
          {industry.label}
        </Link>
      </h3>

      {categories.length === 0 ? (
        <p className="text-xs italic text-gray-400">(No categories yet)</p>
      ) : (
        <ul className="space-y-1">
          {categories.map(category => (
            <CategoryListItem
              key={category.slug}
              industrySlug={industry.slug}
              category={category}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryListItem({
  industrySlug,
  category,
}: {
  industrySlug: string;
  category: TaxonomyCategory;
}) {
  const productTypes = Object.values(category.product_types);
  const categoryHref = `/cables?industry=${encodeURIComponent(industrySlug)}&category=${encodeURIComponent(category.slug)}`;

  return (
    <li>
      <Link
        href={categoryHref}
        className="text-sm text-gray-700 hover:text-blue-600 hover:underline"
      >
        ▸ {category.label}
      </Link>
      {productTypes.length > 0 && (
        <ul className="ml-4 mt-0.5 space-y-0.5">
          {productTypes.map(pt => (
            <ProductTypeListItem
              key={pt.slug}
              industrySlug={industrySlug}
              categorySlug={category.slug}
              productType={pt}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ProductTypeListItem({
  industrySlug,
  categorySlug,
  productType,
}: {
  industrySlug: string;
  categorySlug: string;
  productType: ProductTypeConfig;
}) {
  const ptHref = `/cables?industry=${encodeURIComponent(industrySlug)}&category=${encodeURIComponent(categorySlug)}&type=${encodeURIComponent(productType.slug)}`;

  return (
    <li>
      <Link
        href={ptHref}
        className="text-xs text-gray-500 hover:text-blue-600 hover:underline"
      >
        {productType.label}
      </Link>
    </li>
  );
}
```

**Key implementation notes:**
- Server component (no `'use client'`)
- Imports types from `@/lib/types` — `Taxonomy`, `TaxonomyIndustry`, `TaxonomyCategory`, `ProductTypeConfig` all already defined
- `Object.values(taxonomy)` extracts industries from the `Record<string, TaxonomyIndustry>`
- 3-level nesting: Industry card → Category list item → ProductType sub-item
- Each level is a `<Link>` with proper URL params:
  - Industry: `/cables?industry={slug}`
  - Category: `/cables?industry={slug}&category={slug}`
  - ProductType: `/cables?industry={slug}&category={slug}&type={slug}`
- `encodeURIComponent` on all slug values for safety
- Edge cases handled: empty taxonomy → "Categories unavailable.", industry with no categories → "(No categories yet)"
- Visual hierarchy: industry = `text-sm font-bold text-blue-600`, category = `text-sm text-gray-700`, product_type = `text-xs text-gray-500` (indented via `ml-4`)
- Split into 4 sub-components (`IndustryCard`, `CategoryListItem`, `ProductTypeListItem`) for readability — each component has one clear responsibility

- [ ] **Step 2: Commit**

```powershell
cd d:\projects\unowire
git add frontend/components/home/CableCategoryGrid.tsx
git commit -m "feat(home): add CableCategoryGrid server component

Thomasnet-style 3-column grid of industry cards. Each card shows
industry name (link) + nested list of category and product_type
sub-links. 3-level hierarchy rendered as nested <ul> with proper
URL params (?industry=&category=&type=)."
```

---

## Task 6: Create EquipmentCategoryGrid server component

**Files:**
- Create: `frontend/components/home/EquipmentCategoryGrid.tsx`

- [ ] **Step 1: Write EquipmentCategoryGrid.tsx**

Create `frontend/components/home/EquipmentCategoryGrid.tsx` with the following content:

```typescript
import Link from 'next/link';
import type { EquipmentCategory } from '@/lib/types';

interface EquipmentCategoryGridProps {
  tree: EquipmentCategory[];
}

export function EquipmentCategoryGrid({ tree }: EquipmentCategoryGridProps) {
  return (
    <section className="border-t bg-gray-50 py-12">
      <h2 className="mb-6 inline-block border-b-2 border-blue-600 pb-1 text-xl font-bold text-gray-900">
        Browse Equipment by Category
      </h2>

      {tree.length === 0 ? (
        <p className="text-gray-500">Equipment categories coming soon.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tree.map(topLevel => (
            <TopLevelCard key={topLevel.id} category={topLevel} />
          ))}
        </div>
      )}
    </section>
  );
}

function TopLevelCard({ category }: { category: EquipmentCategory }) {
  const children = category.children ?? [];
  const categoryHref = `/equipment?category=${encodeURIComponent(category.id)}`;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-2 border-b border-gray-200 pb-2">
        <Link href={categoryHref} className="font-bold text-blue-600 hover:underline">
          {category.label}
        </Link>
      </h3>

      {children.length === 0 ? (
        <p className="text-xs italic text-gray-400">(No sub-categories yet)</p>
      ) : (
        <ul className="space-y-1">
          {children.map(child => (
            <li key={child.id}>
              <Link
                href={`/equipment?category=${encodeURIComponent(child.id)}`}
                className="text-sm text-gray-700 hover:text-blue-600 hover:underline"
              >
                ▸ {child.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**Key implementation notes:**
- Server component (no `'use client'`)
- Imports `EquipmentCategory` from `@/lib/types` (already defined with optional `children?: EquipmentCategory[]`)
- `category.children ?? []` — defensive fallback for missing children (per global constraint)
- 2-level nesting: Top-level card → Children list items
- Each link uses `/equipment?category={id}` — `id` is the composite ID (e.g., `processing/stripping` for children, `processing` for top-level)
- `encodeURIComponent` on all ID values (composite IDs contain `/`)
- Edge cases handled: empty tree → "Equipment categories coming soon.", top-level with no children → "(No sub-categories yet)"
- Visual style matches CableCategoryGrid for consistency: same card border, same heading style, same link colors
- Background `bg-gray-50` + `border-t` to visually separate from Cable section above

- [ ] **Step 2: Commit**

```powershell
cd d:\projects\unowire
git add frontend/components/home/EquipmentCategoryGrid.tsx
git commit -m "feat(home): add EquipmentCategoryGrid server component

Thomasnet-style 3-column grid matching CableCategoryGrid visual style.
Each top-level category card shows label (link) + nested children list.
2-level hierarchy. Edge cases: empty tree, top-level with no children."
```

---

## Task 7: Rewrite homepage page.tsx

**Files:**
- Modify: `frontend/app/(site)/page.tsx` (full rewrite)

- [ ] **Step 1: Read current page.tsx to confirm what's being replaced**

Read `frontend/app/(site)/page.tsx` (124 lines) to confirm current state — it has 4 sections: Hero (gradient + SearchBox), Stats (3 stats), Browse by Category (industry cards linking to /cables), Featured Cables (first 6 cables with N+1 fetches).

- [ ] **Step 2: Rewrite page.tsx**

Replace the entire content of `frontend/app/(site)/page.tsx` with:

```typescript
import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { HeroSearch } from '@/components/home/HeroSearch';
import { StatsRow } from '@/components/home/StatsRow';
import { CableCategoryGrid } from '@/components/home/CableCategoryGrid';
import { EquipmentCategoryGrid } from '@/components/home/EquipmentCategoryGrid';
import { api } from '@/lib/api';
import { generateHomeMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return generateHomeMetadata();
}

export default async function HomePage() {
  const [
    cables,
    brands,
    taxonomy,
    equipmentTree,
    equipmentManufacturers,
    equipmentList,
  ] = await Promise.all([
    api.cables.all(),
    api.brands.all(),
    api.taxonomy.all(),
    api.equipmentCategories.tree(),
    api.equipmentManufacturers.all(),
    api.recommendedEquipments.all(),
  ]);

  const industryCount = Object.keys(taxonomy).length;

  return (
    <>
      <HeroSearch />
      <Container>
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
    </>
  );
}
```

**Key implementation notes:**
- `HeroSearch` is rendered OUTSIDE `<Container>` so its background image is full-bleed (the component handles its own internal max-w-7xl centering via the inline `max-w-7xl` class on its inner div)
- `StatsRow`, `CableCategoryGrid`, `EquipmentCategoryGrid` are rendered INSIDE `<Container>` so they get the `max-w-7xl mx-auto px-6` wrapper
- 6 parallel API calls via `Promise.all` — no N+1 fetches
- `industryCount = Object.keys(taxonomy).length` — count of top-level industries
- `generateHomeMetadata()` reused from existing `@/lib/seo` (no change to SEO logic)
- `dynamic = 'force-dynamic'` kept from current homepage
- Removed imports: `SearchBox` (replaced by HeroSearch), `CableCard` (Featured Cables section removed), `Link` (no longer used directly in page.tsx)
- Removed sections: old hero (gradient + SearchBox + popular chips inline), old stats (3 stats), old Browse by Category (industry cards linking to /cables), Featured Cables (first 6 cables with N+1 fetches)

- [ ] **Step 3: Commit**

```powershell
cd d:\projects\unowire
git add "frontend/app/(site)/page.tsx"
git commit -m "feat(home): rewrite homepage with new 4-section layout

New layout: HeroSearch (full-bleed bg image + tabs) > StatsRow (5 stats)
> CableCategoryGrid (Thomasnet 3-col industry cards) > EquipmentCategoryGrid
(same grid style for top-level equipment categories).

Removed: old hero (gradient + SearchBox), old 3-stat row, old industry
cards (linked to /cables with no params), Featured Cables section (first
6 cables with N+1 brand/manufacturer fetches).

6 parallel API calls via Promise.all. HeroSearch rendered outside
Container for full-bleed background; other sections inside Container
for max-w-7xl centering."
```

---

## Task 8: Rebuild frontend + verify tsc baseline + smoke test

**Files:**
- No file changes (verification only)

- [ ] **Step 1: Rebuild the frontend Docker container**

```powershell
cd d:\projects\unowire
docker compose --env-file .env.docker build frontend 2>&1 | Select-Object -Last 20
```

Expected: build succeeds with exit code 0. If there are TypeScript errors, the build will fail with `Type error: ...` — fix the error in the source file and re-run the build.

Common errors to watch for:
- `Cannot find module '@/components/home/HeroSearch'` — component file not created or path wrong
- `Property 'children' does not exist on type 'EquipmentCategory'` — forgot `?? []` fallback
- `Type 'string' is not assignable to type 'TabKey'` — tab key mismatch

- [ ] **Step 2: Restart the frontend container**

```powershell
docker compose --env-file .env.docker up -d frontend
Start-Sleep -Seconds 12
docker compose --env-file .env.docker ps frontend
```

Expected: frontend container is `healthy` (or `running`)

- [ ] **Step 3: Verify homepage loads**

```powershell
curl.exe -s -o NUL -w "Homepage: %{http_code}`n" http://localhost:3000/
```

Expected: `Homepage: 200`

- [ ] **Step 4: Verify all 4 sections render**

```powershell
curl.exe -s http://localhost:3000/ | Select-String -Pattern "Cable & Equipment Specs Database|Cables|Brands|Industries|Equipment|Manufacturers|Browse Cables by Industry|Browse Equipment by Category|Automotive|Renewables|Utility|Processing|Stripping|Cutting" | Select-Object -First 15
```

Expected: output contains matches for:
- `Cable & Equipment Specs Database` (hero H1)
- `Cables`, `Brands`, `Industries`, `Equipment`, `Manufacturers` (stats labels)
- `Browse Cables by Industry` (cable section heading)
- `Browse Equipment by Category` (equipment section heading)
- Industry names: `Automotive`, `Renewables`, `Utility`, etc.
- Equipment category names: `Processing`, `Stripping`, `Cutting`

- [ ] **Step 5: Verify hero background image is served**

```powershell
curl.exe -s -o NUL -w "Hero bg: %{http_code}`n" http://localhost:3000/hero-bg.jpg
```

Expected: `Hero bg: 200`

- [ ] **Step 6: Verify tsc baseline (host tsc)**

```powershell
cd d:\projects\unowire\frontend
npx tsc --noEmit 2>&1 | Select-String "error TS" | Measure-Object
```

Expected: `Count: 8` (all 8 pre-existing errors in `.next/dev/types/validator.ts` line 440). No errors should mention `home`, `HeroSearch`, `StatsRow`, `CableCategoryGrid`, `EquipmentCategoryGrid`, or `Container`.

Note: Host tsc with `incremental: true` may not catch all errors — the Docker build in Step 1 is the authoritative type check. If Docker build succeeded, types are valid.

- [ ] **Step 7: Manual browser smoke test (optional but recommended)**

Open http://localhost:3000/ in a browser and verify:
1. Hero section shows background image with dark overlay
2. "Cable & Equipment Specs Database" H1 is visible
3. Two tabs visible: `Cable` (active, white background) and `Equipment` (semi-transparent)
4. Search input has placeholder "Search cable model, e.g. UL1007, AVSS..."
5. Popular searches chips visible: UL1007, AVSS, UL1015, UL2468
6. Click "Equipment" tab → placeholder changes to "Search equipment model or manufacturer...", popular chips disappear
7. Click "Cable" tab → placeholder and chips return
8. Type "UL1007" in search box + Enter → navigates to `/cables?q=UL1007`
9. Go back to homepage, click "Equipment" tab, type "CS-800" + Enter → navigates to `/equipment?q=CS-800`
10. Stats row shows 5 numbers: Cables, Brands, Industries, Equipment, Manufacturers
11. "Browse Cables by Industry" section shows 6 industry cards in a 3-column grid
12. Each industry card has category names (with ▸ prefix) and product_type names (indented, smaller)
13. Clicking an industry name navigates to `/cables?industry={slug}`
14. Clicking a category name navigates to `/cables?industry={slug}&category={slug}`
15. "Browse Equipment by Category" section shows top-level category cards
16. Each top-level card has children names (with ▸ prefix)
17. Clicking a top-level category name navigates to `/equipment?category={id}`
18. Clicking a child category name navigates to `/equipment?category={child.id}`
19. On a wide screen (>1280px), content is centered with whitespace on sides
20. On a narrow screen (<768px), grids collapse to 1 column

- [ ] **Step 8: No commit (verification only)**

This task produces no code changes. If all steps pass, the homepage redesign is complete.

If any step fails, fix the issue in the relevant source file, rebuild the frontend container (`docker compose --env-file .env.docker build frontend`), and re-verify.

---

## Self-Review Checklist

### 1. Spec Coverage

- ✅ Hero with background image + dark overlay + Cable|Equipment tabs + search + popular chips → Task 3 (HeroSearch)
- ✅ Stats row with 5 stats (Cables, Brands, Industries, Equipment, Manufacturers) → Task 4 (StatsRow)
- ✅ Cable category Thomasnet grid with 3-level hierarchy → Task 5 (CableCategoryGrid)
- ✅ Equipment category Thomasnet grid with 2-level hierarchy → Task 6 (EquipmentCategoryGrid)
- ✅ Container max-w-7xl mx-auto → Task 2
- ✅ Hero background image downloaded → Task 1
- ✅ Homepage page.tsx rewrite with 4 sections → Task 7
- ✅ Featured Cables section removed → Task 7 (old code replaced)
- ✅ Docker build + tsc baseline + smoke test → Task 8
- ✅ Tab toggle changes placeholder and popular chips visibility → Task 3 (HeroSearch)
- ✅ Tab does NOT affect category grids (independent) → Task 7 (HeroSearch rendered separately, no state shared)
- ✅ All category links are server-rendered `<a href>` tags → Tasks 5 + 6 (server components using `<Link>`)
- ✅ Edge cases: empty taxonomy, industry with no categories, empty equipment tree, top-level with no children → Tasks 5 + 6

### 2. Placeholder Scan

- ✅ No "TBD", "TODO", "implement later", "fill in details"
- ✅ No "Add appropriate error handling" / "add validation" / "handle edge cases" — all edge cases have explicit code
- ✅ No "Write tests for the above" — project constraint says no frontend tests
- ✅ No "Similar to Task N" — each task has its own complete code
- ✅ All steps have code blocks where code is needed

### 3. Type Consistency

- ✅ `HeroSearch` uses `TabKey = 'cable' | 'equipment'` — consistent throughout
- ✅ `StatsRow` props: `cables`, `brands`, `industries`, `equipment`, `manufacturers` (all `number`) — matches usage in Task 7
- ✅ `CableCategoryGrid` props: `{ taxonomy: Taxonomy }` — matches `api.taxonomy.all()` return type and Task 7 usage
- ✅ `EquipmentCategoryGrid` props: `{ tree: EquipmentCategory[] }` — matches `api.equipmentCategories.tree()` return type and Task 7 usage
- ✅ `TaxonomyIndustry`, `TaxonomyCategory`, `ProductTypeConfig`, `EquipmentCategory` — all imported from `@/lib/types` where they're already defined
- ✅ `EquipmentCategory.children ?? []` — defensive fallback applied consistently in Task 6
- ✅ `Object.values(taxonomy)` returns `TaxonomyIndustry[]` — matches `IndustryCard` props
- ✅ `Object.values(industry.categories)` returns `TaxonomyCategory[]` — matches `CategoryListItem` props
- ✅ `Object.values(category.product_types)` returns `ProductTypeConfig[]` — matches `ProductTypeListItem` props

### 4. Cross-Task Dependencies

- Task 7 imports from Tasks 3, 4, 5, 6 — all component files must exist before Task 7 runs
- Task 8 depends on all prior tasks — runs last
- Task 1 (image) is independent — can run in any order relative to Tasks 2-7
- Task 2 (Container) is independent — can run in any order relative to other tasks
- Recommended execution order: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 (sequential, matches dependency order)
