# Equipment Public Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three public-facing equipment pages (`/equipment`, `/equipment/[slug]`, `/equipment/manufacturers/[slug]`) with a three-column filter/list/ad list layout, device detail with applicable specs table, and manufacturer detail with equipment grid — all using pure frontend in-memory filtering and the existing backend API (zero backend changes).

**Architecture:** Server components load initial data via the existing `api` client (extended with two new namespaces). A client wrapper component owns filter state synced to URL searchParams and calls a pure `filterEquipment()` function to re-filter and rebuild facets in memory. Device/manufacturer detail pages follow the established 3+1 grid layout pattern used by `/manufacturers/[slug]`.

**Tech Stack:** Next.js App Router (server + client components), TypeScript, Tailwind CSS, existing `lib/api.ts` fetchWithCache pattern, existing `Pagination` / `Breadcrumbs` / `Container` / `JsonLd` / `InquiryFormModal` components.

---

## File Structure

**Files to modify (3):**
- `frontend/lib/types.ts` — Extend existing `EquipmentManufacturer` interface with full fields; add filter types
- `frontend/lib/api.ts` — Extend `BackendEquipmentManufacturer` interface + `adaptEquipmentManufacturer` function; add `equipmentManufacturers` and `equipmentCategories` namespaces to `api` object
- `frontend/lib/types.ts` — Already listed above (single edit covers both changes)

**Files to create (10):**
- `frontend/lib/equipmentFilter.ts` — Pure filter + facet logic
- `frontend/components/equipment/EquipmentCard.tsx` — Device card (server component)
- `frontend/components/equipment/ApplicableSpecsTable.tsx` — Applicable specs table (server component)
- `frontend/components/equipment/EquipmentCategoryNav.tsx` — Top sub-category image tag nav (server component)
- `frontend/components/equipment/HotEquipmentRecommendation.tsx` — Right-column top: hot equipment image grid (server component)
- `frontend/components/equipment/EquipmentManufacturerRecommendation.tsx` — Right-column bottom: manufacturer text list (server component)
- `frontend/components/equipment/EquipmentFilters.tsx` — Left-column filter panel (client component)
- `frontend/components/equipment/EquipmentListClient.tsx` — Client wrapper managing filter state (client component)
- `frontend/app/(site)/equipment/page.tsx` — List page (server component)
- `frontend/app/(site)/equipment/[slug]/page.tsx` — Device detail page (server component)
- `frontend/app/(site)/equipment/manufacturers/[slug]/page.tsx` — Manufacturer detail page (server component)

**Key existing patterns to follow:**
- `frontend/app/(site)/manufacturers/[slug]/page.tsx` — Reference for detail page layout (3+1 grid, Breadcrumbs, JsonLd, InquiryFormModal)
- `frontend/lib/filter.ts` — Reference for in-memory filter + facet pattern
- `frontend/components/shared/ManufacturerRecommendations.tsx` — Reference for sidebar recommendation component
- `frontend/components/cable/CableCard.tsx` — Reference for card component pattern

---

## Task 1: Extend Equipment Types

**Files:**
- Modify: `frontend/lib/types.ts` (extend existing `EquipmentManufacturer` interface at lines 128-136, add new filter types at end of file)

- [ ] **Step 1: Read the current state of the EquipmentManufacturer interface**

Read `frontend/lib/types.ts` lines 128-136 to confirm current state:

```typescript
export interface EquipmentManufacturer {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  website: string | null;
  image_url: string | null;
  description: string | null;
}
```

- [ ] **Step 2: Extend the EquipmentManufacturer interface**

Edit `frontend/lib/types.ts` to replace the existing `EquipmentManufacturer` interface (lines 128-136) with the extended version:

```typescript
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
```

- [ ] **Step 3: Append filter types at the end of the file**

Append the following block at the end of `frontend/lib/types.ts` (after the `SiteMenuTreeNode` interface added in a prior task):

```typescript

// === Equipment Filters ===
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
    min?: number; max?: number;
    values?: { value: string; count: number }[];
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

- [ ] **Step 4: Verify tsc baseline**

Run: `cd d:\projects\unowire\frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors in `.next/dev/types/validator.ts` line 440, 0 new errors. The extended `EquipmentManufacturer` interface adds new fields but existing usages assign `null`/omit them, so no new errors should appear. If errors appear mentioning missing fields in `api.ts` adapt functions, those will be fixed in Task 2.

- [ ] **Step 5: Commit**

```powershell
cd d:\projects\unowire; git add frontend/lib/types.ts; git commit -m "feat(types): extend EquipmentManufacturer + add Equipment filter types"
```

---

## Task 2: Extend API Client with Equipment Manufacturer + Category Namespaces

**Files:**
- Modify: `frontend/lib/api.ts` (extend `BackendEquipmentManufacturer` interface at lines 161-169, extend `adaptEquipmentManufacturer` function at lines 346-357, add two new namespaces to `api` object after the existing `recommendedEquipments` namespace ending at line 548)

- [ ] **Step 1: Extend the BackendEquipmentManufacturer interface**

Edit `frontend/lib/api.ts` to replace the existing `BackendEquipmentManufacturer` interface (lines 161-169) with:

```typescript
interface BackendEquipmentManufacturer {
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
```

- [ ] **Step 2: Extend the adaptEquipmentManufacturer function**

Edit `frontend/lib/api.ts` to replace the existing `adaptEquipmentManufacturer` function (lines 346-357) with:

```typescript
function adaptEquipmentManufacturer(m: BackendEquipmentManufacturer | null | undefined): EquipmentManufacturer | null {
  if (!m) return null;
  return {
    id: m.id,
    name: m.name,
    slug: m.slug,
    country: m.country ?? null,
    website: m.website ?? null,
    image_url: m.image_url ?? null,
    description: m.description ?? null,
    founded_year: m.founded_year ?? null,
    address: m.address ?? null,
    phone: m.phone ?? null,
    email: m.email ?? null,
    sort_order: m.sort_order ?? 0,
    created_at: m.created_at ?? '',
    updated_at: m.updated_at ?? '',
  };
}
```

- [ ] **Step 3: Add equipmentManufacturers and equipmentCategories namespaces**

Edit `frontend/lib/api.ts` to add the two new namespaces AFTER the existing `recommendedEquipments` namespace (which ends at line 548 with `},`) and BEFORE the `taxonomy:` namespace (which starts at line 550). Insert:

```typescript
  equipmentManufacturers: {
    async all(): Promise<EquipmentManufacturer[]> {
      const res = await fetchWithCache<{ items: BackendEquipmentManufacturer[]; total: number; page: number; page_size: number }>(
        '/api/equipment-manufacturers?page_size=999'
      );
      return (res.items ?? []).map(adaptEquipmentManufacturer).filter((m): m is EquipmentManufacturer => m !== null);
    },
    async getById(id: string): Promise<EquipmentManufacturer | null> {
      try {
        const data = await fetchWithCache<BackendEquipmentManufacturer>(`/api/equipment-manufacturers/${encodeURIComponent(id)}`);
        return adaptEquipmentManufacturer(data);
      } catch {
        return null;
      }
    },
    async getBySlug(slug: string): Promise<EquipmentManufacturer | null> {
      const all = await this.all();
      return all.find((m) => m.slug === slug) ?? null;
    },
  },

  equipmentCategories: {
    async tree(): Promise<EquipmentCategory[]> {
      const data = await fetchWithCache<BackendEquipmentCategory[]>('/api/equipment-categories');
      return (data ?? []).map(c => adaptEquipmentCategory(c)!).filter((c): c is EquipmentCategory => c !== null);
    },
    async getById(id: string): Promise<EquipmentCategory | null> {
      try {
        const data = await fetchWithCache<BackendEquipmentCategory>(`/api/equipment-categories/${encodeURIComponent(id)}`);
        return adaptEquipmentCategory(data);
      } catch {
        return null;
      }
    },
  },
```

- [ ] **Step 4: Verify tsc baseline**

Run: `cd d:\projects\unowire\frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors only, 0 new errors. The extended adapt function and new namespaces should not introduce errors since the existing `EquipmentManufacturer` type was already extended in Task 1.

- [ ] **Step 5: Commit**

```powershell
cd d:\projects\unowire; git add frontend/lib/api.ts; git commit -m "feat(api): add equipmentManufacturers + equipmentCategories namespaces with full fields"
```

---

## Task 3: Implement Equipment Filter Logic

**Files:**
- Create: `frontend/lib/equipmentFilter.ts`

- [ ] **Step 1: Create the equipmentFilter.ts file**

Create `frontend/lib/equipmentFilter.ts` with the following content:

```typescript
import { api } from './api';
import type {
  ApplicableSpecRule,
  EquipmentCategory,
  EquipmentFilterFacets,
  EquipmentFilterParams,
  EquipmentListResponse,
  EquipmentManufacturer,
  RecommendedEquipment,
} from './types';

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

/** Check if a spec rule's range intersects the user's range. */
function isRangeMatch(
  spec: ApplicableSpecRule,
  userMin: number | undefined,
  userMax: number | undefined
): boolean {
  if (userMin === undefined && userMax === undefined) return true;
  const specMin = spec.min ?? -Infinity;
  const specMax = spec.max ?? Infinity;
  const uMin = userMin ?? -Infinity;
  const uMax = userMax ?? Infinity;
  return specMin <= uMax && specMax >= uMin;
}

/** Check if a spec rule's allowed_values intersects the user's selected values. */
function isEnumMatch(
  spec: ApplicableSpecRule,
  selectedValues: string[] | undefined
): boolean {
  if (!selectedValues || selectedValues.length === 0) return true;
  const allowed = (spec.allowed_values ?? []).map(String);
  return selectedValues.some((v) => allowed.includes(v));
}

/** Main filter function. Loads all data, applies filters, builds facets, paginates. */
export async function filterEquipment(
  params: EquipmentFilterParams & { page?: number; page_size?: number }
): Promise<EquipmentListResponse> {
  const page = Math.max(1, params.page ?? 1);
  const page_size = params.page_size ?? 12;

  const [allEquipment, allManufacturers, categoryTree] = await Promise.all([
    api.recommendedEquipments.all(),
    api.equipmentManufacturers.all(),
    api.equipmentCategories.tree(),
  ]);

  const manufacturerMap = new Map(allManufacturers.map((m) => [m.id, m]));

  // Flatten category tree for id->category lookup
  const categoryMap = new Map<string, EquipmentCategory>();
  for (const top of categoryTree) {
    categoryMap.set(top.id, top);
    for (const child of top.children ?? []) {
      categoryMap.set(child.id, child);
    }
  }

  // 1. Keyword filter
  let filtered = allEquipment;
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.model.toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q)
    );
  }

  // 2. Category filter
  if (params.category_ids && params.category_ids.length > 0) {
    const categorySet = new Set(params.category_ids);
    filtered = filtered.filter((e) => categorySet.has(e.category_id));
  }

  // 3. Manufacturer filter
  if (params.manufacturer_ids && params.manufacturer_ids.length > 0) {
    const manufacturerSet = new Set(params.manufacturer_ids);
    filtered = filtered.filter((e) => manufacturerSet.has(e.manufacturer_id));
  }

  // 4. Spec filters (range + enum)
  if (params.spec_filters) {
    for (const [specKey, filter] of Object.entries(params.spec_filters)) {
      const hasRange = filter.min !== undefined || filter.max !== undefined;
      const hasEnum = filter.values && filter.values.length > 0;
      if (!hasRange && !hasEnum) continue;
      filtered = filtered.filter((e) => {
        const spec = e.applicable_specs.find((s) => s.spec_key === specKey);
        if (!spec) return false;
        if (hasRange && !isRangeMatch(spec, filter.min, filter.max)) return false;
        if (hasEnum && !isEnumMatch(spec, filter.values)) return false;
        return true;
      });
    }
  }

  // 5. Build facets from filtered result set
  const facets = buildFacets(filtered, allManufacturers, categoryMap);

  // 6. Pagination
  const total = filtered.length;
  const start = (page - 1) * page_size;
  const paged = filtered.slice(start, start + page_size);

  return {
    items: paged,
    total,
    page,
    page_size,
    facets,
  };
}

/** Build facets from a filtered equipment list. */
function buildFacets(
  equipmentList: RecommendedEquipment[],
  allManufacturers: EquipmentManufacturer[],
  categoryMap: Map<string, EquipmentCategory>
): EquipmentFilterFacets {
  const manufacturerCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const specRangeMap = new Map<string, { min: number; max: number }>();
  const specEnumMap = new Map<string, Map<string, number>>();

  for (const e of equipmentList) {
    manufacturerCounts.set(
      e.manufacturer_id,
      (manufacturerCounts.get(e.manufacturer_id) ?? 0) + 1
    );
    categoryCounts.set(
      e.category_id,
      (categoryCounts.get(e.category_id) ?? 0) + 1
    );

    for (const spec of e.applicable_specs) {
      if (spec.min !== undefined || spec.max !== undefined) {
        const existing = specRangeMap.get(spec.spec_key);
        const specMin = spec.min ?? -Infinity;
        const specMax = spec.max ?? Infinity;
        if (existing) {
          existing.min = Math.min(existing.min, specMin);
          existing.max = Math.max(existing.max, specMax);
        } else {
          specRangeMap.set(spec.spec_key, { min: specMin, max: specMax });
        }
      } else if (spec.allowed_values && spec.allowed_values.length > 0) {
        if (!specEnumMap.has(spec.spec_key)) specEnumMap.set(spec.spec_key, new Map());
        const valueCounts = specEnumMap.get(spec.spec_key)!;
        for (const v of spec.allowed_values) {
          const valStr = String(v);
          valueCounts.set(valStr, (valueCounts.get(valStr) ?? 0) + 1);
        }
      }
    }
  }

  const manufacturers = allManufacturers
    .map((m) => ({ id: m.id, name: m.name, count: manufacturerCounts.get(m.id) ?? 0 }))
    .filter((m) => m.count > 0);

  const categories: { id: string; label: string; parent_id: string | null; count: number }[] = [];
  for (const [id, count] of categoryCounts.entries()) {
    const cat = categoryMap.get(id);
    if (cat) {
      categories.push({
        id,
        label: cat.label,
        parent_id: cat.parent_id,
        count,
      });
    }
  }

  const spec_facets: EquipmentFilterFacets['spec_facets'] = {};
  for (const [key, range] of specRangeMap.entries()) {
    spec_facets[key] = {
      type: 'range',
      min: range.min === -Infinity ? undefined : range.min,
      max: range.max === Infinity ? undefined : range.max,
    };
  }
  for (const [key, valueCounts] of specEnumMap.entries()) {
    spec_facets[key] = {
      type: 'enum',
      values: Array.from(valueCounts.entries()).map(([value, count]) => ({ value, count })),
    };
  }

  return { manufacturers, categories, spec_facets };
}
```

- [ ] **Step 2: Verify tsc baseline**

Run: `cd d:\projects\unowire\frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors only, 0 new errors. Verify no errors mention `equipmentFilter`, `filterEquipment`, `buildFacets`, `isRangeMatch`, `isEnumMatch`, or `specKeyLabel`.

- [ ] **Step 3: Commit**

```powershell
cd d:\projects\unowire; git add frontend/lib/equipmentFilter.ts; git commit -m "feat(lib): add equipmentFilter with in-memory filter + facet logic"
```

---

## Task 4: Create EquipmentCard + ApplicableSpecsTable Components

**Files:**
- Create: `frontend/components/equipment/EquipmentCard.tsx`
- Create: `frontend/components/equipment/ApplicableSpecsTable.tsx`

- [ ] **Step 1: Create EquipmentCard component**

Create `frontend/components/equipment/EquipmentCard.tsx`:

```tsx
import Link from 'next/link';
import type { RecommendedEquipment } from '@/lib/types';

export function EquipmentCard({ equipment }: { equipment: RecommendedEquipment }) {
  return (
    <Link
      href={`/equipment/${encodeURIComponent(equipment.slug)}`}
      className="group block overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:shadow-md"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
        {equipment.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={equipment.image_url}
            alt={equipment.model}
            className="h-48 w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-48 w-full items-center justify-center text-gray-400">
            No image
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600">
          {equipment.model}
        </h3>
        {equipment.manufacturer && (
          <p className="mt-1 text-sm text-gray-600">
            {equipment.manufacturer.name}
          </p>
        )}
        {equipment.category && (
          <span className="mt-2 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
            {equipment.category.label}
          </span>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create ApplicableSpecsTable component**

Create `frontend/components/equipment/ApplicableSpecsTable.tsx`:

```tsx
import type { ApplicableSpecRule } from '@/lib/types';
import { specKeyLabel } from '@/lib/equipmentFilter';

export function ApplicableSpecsTable({ specs }: { specs: ApplicableSpecRule[] }) {
  if (!specs || specs.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No applicable specifications defined.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
            <th className="px-4 py-3 font-medium">Spec</th>
            <th className="px-4 py-3 font-medium">Range</th>
            <th className="px-4 py-3 font-medium">Allowed Values</th>
          </tr>
        </thead>
        <tbody>
          {specs.map((spec, i) => {
            const isRange = spec.min !== undefined || spec.max !== undefined;
            const isEnum = spec.allowed_values && spec.allowed_values.length > 0;
            return (
              <tr key={`${spec.spec_key}-${i}`} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {specKeyLabel(spec.spec_key)}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {isRange ? (
                    <span>
                      {spec.min !== undefined ? spec.min : '—'}
                      {' – '}
                      {spec.max !== undefined ? spec.max : '—'}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {isEnum ? (
                    <span>{(spec.allowed_values ?? []).join(', ')}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Verify tsc baseline**

Run: `cd d:\projects\unowire\frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors only, 0 new errors.

- [ ] **Step 4: Commit**

```powershell
cd d:\projects\unowire; git add frontend/components/equipment/EquipmentCard.tsx frontend/components/equipment/ApplicableSpecsTable.tsx; git commit -m "feat(equipment): add EquipmentCard + ApplicableSpecsTable components"
```

---

## Task 5: Create EquipmentCategoryNav + Sidebar Recommendation Components

**Files:**
- Create: `frontend/components/equipment/EquipmentCategoryNav.tsx`
- Create: `frontend/components/equipment/HotEquipmentRecommendation.tsx`
- Create: `frontend/components/equipment/EquipmentManufacturerRecommendation.tsx`

- [ ] **Step 1: Create EquipmentCategoryNav component**

Create `frontend/components/equipment/EquipmentCategoryNav.tsx`:

```tsx
import Link from 'next/link';
import type { EquipmentCategory } from '@/lib/types';

export function EquipmentCategoryNav({
  categories,
  activeCategoryId,
}: {
  categories: EquipmentCategory[];
  activeCategoryId?: string;
}) {
  // Extract only sub-categories (those with parent_id !== null)
  const subCategories: EquipmentCategory[] = [];
  for (const top of categories) {
    for (const child of top.children ?? []) {
      subCategories.push(child);
    }
  }

  if (subCategories.length === 0) return null;

  return (
    <div className="mb-6 flex gap-3 overflow-x-auto pb-2">
      {subCategories.map((cat) => {
        const isActive = activeCategoryId === cat.id;
        return (
          <Link
            key={cat.id}
            href={`/equipment?category=${encodeURIComponent(cat.id)}#equipment-list`}
            className={`flex w-32 shrink-0 flex-col overflow-hidden rounded-lg border transition ${
              isActive
                ? 'border-blue-500 ring-2 ring-blue-200'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="h-20 w-full overflow-hidden bg-gray-100">
              {cat.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cat.image_url}
                  alt={cat.label}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                  No image
                </div>
              )}
            </div>
            <div className="p-2 text-center text-xs font-medium text-gray-700">
              {cat.label}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create HotEquipmentRecommendation component**

Create `frontend/components/equipment/HotEquipmentRecommendation.tsx`:

```tsx
import Link from 'next/link';
import type { RecommendedEquipment } from '@/lib/types';

export function HotEquipmentRecommendation({
  equipments,
  excludeId,
}: {
  equipments: RecommendedEquipment[];
  excludeId?: string;
}) {
  const items = equipments
    .filter((e) => e.id !== excludeId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 3);

  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Hot Equipment</h3>
      <div className="grid grid-cols-3 gap-2">
        {items.map((e) => (
          <Link
            key={e.id}
            href={`/equipment/${encodeURIComponent(e.slug)}`}
            className="group block overflow-hidden rounded-md border border-gray-200 transition hover:shadow-sm"
          >
            <div className="aspect-square w-full overflow-hidden bg-gray-100">
              {e.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.image_url}
                  alt={e.model}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                  No image
                </div>
              )}
            </div>
            <div className="p-1 text-center text-[10px] font-medium text-gray-700">
              {e.model}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create EquipmentManufacturerRecommendation component**

Create `frontend/components/equipment/EquipmentManufacturerRecommendation.tsx`:

```tsx
import Link from 'next/link';
import type { EquipmentManufacturer, RecommendedEquipment } from '@/lib/types';

export function EquipmentManufacturerRecommendation({
  manufacturers,
  equipments,
  excludeId,
}: {
  manufacturers: EquipmentManufacturer[];
  equipments: RecommendedEquipment[];
  excludeId?: string;
}) {
  // Count equipment per manufacturer (from the full equipment list)
  const countByManufacturer = new Map<string, number>();
  for (const e of equipments) {
    countByManufacturer.set(
      e.manufacturer_id,
      (countByManufacturer.get(e.manufacturer_id) ?? 0) + 1
    );
  }

  const list = manufacturers
    .filter((m) => m.id !== excludeId)
    .map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      count: countByManufacturer.get(m.id) ?? 0,
    }))
    .filter((m) => m.count > 0);

  if (list.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Equipment Manufacturers</h3>
      <ul className="space-y-1.5">
        {list.slice(0, 10).map((m) => (
          <li key={m.id}>
            <Link
              href={`/equipment/manufacturers/${encodeURIComponent(m.slug)}`}
              className="flex items-center justify-between text-sm text-gray-600 hover:text-blue-600"
            >
              <span>{m.name}</span>
              <span className="text-xs text-gray-400">{m.count}</span>
            </Link>
          </li>
        ))}
      </ul>
      {list.length > 10 && (
        <p className="mt-2 text-xs text-gray-400">
          +{list.length - 10} more manufacturers
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify tsc baseline**

Run: `cd d:\projects\unowire\frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors only, 0 new errors.

- [ ] **Step 5: Commit**

```powershell
cd d:\projects\unowire; git add frontend/components/equipment/EquipmentCategoryNav.tsx frontend/components/equipment/HotEquipmentRecommendation.tsx frontend/components/equipment/EquipmentManufacturerRecommendation.tsx; git commit -m "feat(equipment): add CategoryNav + HotEquipment + ManufacturerRecommendation components"
```

---

## Task 6: Create EquipmentFilters Client Component

**Files:**
- Create: `frontend/components/equipment/EquipmentFilters.tsx`

- [ ] **Step 1: Create the EquipmentFilters component**

Create `frontend/components/equipment/EquipmentFilters.tsx`:

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { EquipmentFilterFacets } from '@/lib/types';

interface Props {
  facets: EquipmentFilterFacets;
  allCategoryTree: {
    id: string;
    label: string;
    parent_id: string | null;
    children: { id: string; label: string }[];
  }[];
}

export function EquipmentFilters({ facets, allCategoryTree }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set((searchParams.get('category') ?? '').split(',').filter(Boolean))
  );
  const [selectedManufacturers, setSelectedManufacturers] = useState<Set<string>>(
    new Set((searchParams.get('manufacturer') ?? '').split(',').filter(Boolean))
  );

  // Spec filter state: { specKey: { min?, max?, values? } }
  const [specFilters, setSpecFilters] = useState<Record<string, { min?: string; max?: string; values?: Set<string> }>>({});

  // Initialize spec filter state from URL once
  useEffect(() => {
    const next: Record<string, { min?: string; max?: string; values?: Set<string> }> = {};
    for (const key of Object.keys(facets.spec_facets)) {
      const min = searchParams.get(`spec.${key}.min`) ?? undefined;
      const max = searchParams.get(`spec.${key}.max`) ?? undefined;
      const values = searchParams.get(`spec.${key}.values`)?.split(',').filter(Boolean);
      if (min || max || (values && values.length > 0)) {
        next[key] = {
          min: min ?? '',
          max: max ?? '',
          values: values ? new Set(values) : undefined,
        };
      }
    }
    setSpecFilters(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced keyword update
  useEffect(() => {
    const t = setTimeout(() => {
      if (keyword !== (searchParams.get('q') ?? '')) {
        updateUrl({ q: keyword || undefined });
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  function updateUrl(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === '') params.delete(k);
      else params.set(k, v);
    }
    params.delete('page'); // reset pagination on filter change
    router.push(`/equipment?${params.toString()}#equipment-list`);
  }

  function toggleCategory(id: string) {
    const next = new Set(selectedCategories);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCategories(next);
    updateUrl({ category: Array.from(next).join(',') || undefined });
  }

  function toggleManufacturer(id: string) {
    const next = new Set(selectedManufacturers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedManufacturers(next);
    updateUrl({ manufacturer: Array.from(next).join(',') || undefined });
  }

  function toggleSpecValue(specKey: string, value: string) {
    setSpecFilters((prev) => {
      const current = prev[specKey] ?? { values: new Set<string>() };
      const values = new Set(current.values ?? new Set<string>());
      if (values.has(value)) values.delete(value);
      else values.add(value);
      return { ...prev, [specKey]: { ...current, values } };
    });
  }

  function commitSpecFilter(specKey: string) {
    const filter = specFilters[specKey];
    if (!filter) return;
    const updates: Record<string, string | undefined> = {};
    updates[`spec.${specKey}.min`] = filter.min || undefined;
    updates[`spec.${specKey}.max`] = filter.max || undefined;
    updates[`spec.${specKey}.values`] =
      filter.values && filter.values.size > 0
        ? Array.from(filter.values).join(',')
        : undefined;
    updateUrl(updates);
  }

  function clearAll() {
    setKeyword('');
    setSelectedCategories(new Set());
    setSelectedManufacturers(new Set());
    setSpecFilters({});
    router.push('/equipment#equipment-list');
  }

  const hasActiveFilters =
    keyword ||
    selectedCategories.size > 0 ||
    selectedManufacturers.size > 0 ||
    Object.values(specFilters).some(
      (f) => f.min || f.max || (f.values && f.values.size > 0)
    );

  return (
    <div className="space-y-6">
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="text-xs text-blue-600 hover:underline"
        >
          Clear all filters
        </button>
      )}

      {/* Keyword search */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Keyword</label>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Search model or description..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {/* Category tree */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-700">Categories</h3>
        <div className="space-y-2">
          {allCategoryTree.map((top) => (
            <div key={top.id}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {top.label}
              </p>
              <div className="ml-3 mt-1 space-y-1">
                {top.children.map((child) => {
                  const facet = facets.categories.find((c) => c.id === child.id);
                  const count = facet?.count ?? 0;
                  const checked = selectedCategories.has(child.id);
                  return (
                    <label
                      key={child.id}
                      className="flex items-center gap-2 text-sm text-gray-600"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(child.id)}
                        className="rounded"
                      />
                      <span className="flex-1">{child.label}</span>
                      <span className="text-xs text-gray-400">{count}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manufacturers */}
      {facets.manufacturers.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-700">Manufacturers</h3>
          <div className="space-y-1">
            {facets.manufacturers.map((m) => {
              const checked = selectedManufacturers.has(m.id);
              return (
                <label
                  key={m.id}
                  className="flex items-center gap-2 text-sm text-gray-600"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleManufacturer(m.id)}
                    className="rounded"
                  />
                  <span className="flex-1">{m.name}</span>
                  <span className="text-xs text-gray-400">{m.count}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Spec facets */}
      {Object.entries(facets.spec_facets).map(([specKey, facet]) => {
        const filter = specFilters[specKey] ?? {};
        return (
          <div key={specKey}>
            <h3 className="mb-2 text-sm font-medium text-gray-700 capitalize">
              {specKey.replace(/_/g, ' ')}
            </h3>
            {facet.type === 'range' && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder={`min ${facet.min ?? ''}`}
                  value={filter.min ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSpecFilters((prev) => ({
                      ...prev,
                      [specKey]: { ...prev[specKey], min: v },
                    }));
                  }}
                  onBlur={() => commitSpecFilter(specKey)}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
                <span className="text-gray-400">–</span>
                <input
                  type="number"
                  placeholder={`max ${facet.max ?? ''}`}
                  value={filter.max ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSpecFilters((prev) => ({
                      ...prev,
                      [specKey]: { ...prev[specKey], max: v },
                    }));
                  }}
                  onBlur={() => commitSpecFilter(specKey)}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
            )}
            {facet.type === 'enum' && facet.values && (
              <div className="space-y-1">
                {facet.values.map((v) => {
                  const checked = filter.values?.has(v.value) ?? false;
                  return (
                    <label
                      key={v.value}
                      className="flex items-center gap-2 text-sm text-gray-600"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSpecValue(specKey, v.value)}
                        onClick={() => setTimeout(() => commitSpecFilter(specKey), 0)}
                        className="rounded"
                      />
                      <span className="flex-1">{v.value}</span>
                      <span className="text-xs text-gray-400">{v.count}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc baseline**

Run: `cd d:\projects\unowire\frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors only, 0 new errors.

- [ ] **Step 3: Commit**

```powershell
cd d:\projects\unowire; git add frontend/components/equipment/EquipmentFilters.tsx; git commit -m "feat(equipment): add EquipmentFilters client component with URL-synced state"
```

---

## Task 7: Create EquipmentListClient Wrapper Component

**Files:**
- Create: `frontend/components/equipment/EquipmentListClient.tsx`

- [ ] **Step 1: Create the EquipmentListClient component**

Create `frontend/components/equipment/EquipmentListClient.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type {
  EquipmentCategory,
  EquipmentFilterFacets,
  EquipmentFilterParams,
  EquipmentListResponse,
  EquipmentManufacturer,
  RecommendedEquipment,
} from '@/lib/types';
import { filterEquipment } from '@/lib/equipmentFilter';
import { EquipmentCard } from './EquipmentCard';
import { EquipmentFilters } from './EquipmentFilters';
import { HotEquipmentRecommendation } from './HotEquipmentRecommendation';
import { EquipmentManufacturerRecommendation } from './EquipmentManufacturerRecommendation';

interface Props {
  initialResponse: EquipmentListResponse;
  allEquipment: RecommendedEquipment[];
  allManufacturers: EquipmentManufacturer[];
  categoryTree: EquipmentCategory[];
}

export function EquipmentListClient({
  initialResponse,
  allEquipment,
  allManufacturers,
  categoryTree,
}: Props) {
  const searchParams = useSearchParams();
  const [response, setResponse] = useState<EquipmentListResponse>(initialResponse);
  const [loading, setLoading] = useState(false);

  // Build a simplified category tree for the filter component
  const filterCategoryTree = categoryTree.map((top) => ({
    id: top.id,
    label: top.label,
    parent_id: top.parent_id,
    children: (top.children ?? []).map((child) => ({
      id: child.id,
      label: child.label,
    })),
  }));

  useEffect(() => {
    let cancelled = false;

    async function refilter() {
      setLoading(true);
      const params: EquipmentFilterParams & { page?: number; page_size?: number } = {
        q: searchParams.get('q') ?? undefined,
        category_ids: (searchParams.get('category') ?? '').split(',').filter(Boolean),
        manufacturer_ids: (searchParams.get('manufacturer') ?? '').split(',').filter(Boolean),
        page: Number(searchParams.get('page') ?? '1') || 1,
        page_size: 12,
      };

      // Parse spec filters from URL
      const specFilters: EquipmentFilterParams['spec_filters'] = {};
      for (const key of searchParams.keys()) {
        if (key.startsWith('spec.')) {
          const match = key.match(/^spec\.([^.]+)\.(min|max|values)$/);
          if (match) {
            const [, specKey, field] = match;
            const value = searchParams.get(key);
            if (!value) continue;
            if (!specFilters[specKey]) specFilters[specKey] = {};
            if (field === 'values') {
              specFilters[specKey]!.values = value.split(',').filter(Boolean);
            } else {
              specFilters[specKey]![field] = Number(value);
            }
          }
        }
      }
      if (Object.keys(specFilters).length > 0) {
        params.spec_filters = specFilters;
      }

      const result = await filterEquipment(params);
      if (!cancelled) {
        setResponse(result);
        setLoading(false);
      }
    }

    refilter();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const activeCategoryId = searchParams.get('category')?.split(',')[0];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
      {/* Left column: filters */}
      <aside className="lg:col-span-1">
        <div className="sticky top-20">
          <EquipmentFilters
            facets={response.facets}
            allCategoryTree={filterCategoryTree}
          />
        </div>
      </aside>

      {/* Center column: equipment list */}
      <div className="lg:col-span-2" id="equipment-list">
        {loading && (
          <div className="mb-4 text-sm text-gray-500">Loading…</div>
        )}
        {response.items.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
            No equipment found. Try adjusting your filters.
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-gray-500">
              Showing {response.items.length} of {response.total} equipment
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {response.items.map((eq) => (
                <EquipmentCard key={eq.id} equipment={eq} />
              ))}
            </div>
            {response.total > response.page_size && (
              <div className="mt-8 flex justify-center gap-2">
                {Array.from({ length: Math.ceil(response.total / response.page_size) }, (_, i) => i + 1)
                  .filter((p) => Math.abs(p - response.page) <= 2 || p === 1 || p === Math.ceil(response.total / response.page_size))
                  .map((p, i, arr) => {
                    const prev = arr[i - 1];
                    const showEllipsis = prev && p - prev > 1;
                    const params = new URLSearchParams(searchParams.toString());
                    params.set('page', String(p));
                    return (
                      <span key={p} className="flex items-center gap-2">
                        {showEllipsis && <span className="text-gray-400">…</span>}
                        <a
                          href={`/equipment?${params.toString()}#equipment-list`}
                          className={`rounded border px-3 py-1 text-sm ${
                            p === response.page
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-gray-300 hover:bg-gray-100'
                          }`}
                        >
                          {p}
                        </a>
                      </span>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Right column: recommendations */}
      <aside className="lg:col-span-1 space-y-6">
        <HotEquipmentRecommendation
          equipments={allEquipment}
          excludeId={undefined}
        />
        <EquipmentManufacturerRecommendation
          manufacturers={allManufacturers}
          equipments={allEquipment}
          excludeId={undefined}
        />
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc baseline**

Run: `cd d:\projects\unowire\frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors only, 0 new errors.

- [ ] **Step 3: Commit**

```powershell
cd d:\projects\unowire; git add frontend/components/equipment/EquipmentListClient.tsx; git commit -m "feat(equipment): add EquipmentListClient wrapper with in-memory refiltering"
```

---

## Task 8: Create List Page Route

**Files:**
- Create: `frontend/app/(site)/equipment/page.tsx`

- [ ] **Step 1: Create the list page**

Create `frontend/app/(site)/equipment/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { EquipmentCategoryNav } from '@/components/equipment/EquipmentCategoryNav';
import { EquipmentListClient } from '@/components/equipment/EquipmentListClient';
import { api } from '@/lib/api';
import { filterEquipment } from '@/lib/equipmentFilter';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Equipment | Unowire',
  description: 'Browse cable processing equipment from leading manufacturers. Filter by category, manufacturer, and technical specifications.',
};

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    manufacturer?: string;
    page?: string;
    [key: string]: string | undefined;
  }>;
}

export default async function EquipmentListPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  // Build filter params from URL
  const categoryIds = (sp.category ?? '').split(',').filter(Boolean);
  const manufacturerIds = (sp.manufacturer ?? '').split(',').filter(Boolean);
  const page = Number(sp.page ?? '1') || 1;

  const specFilters: Record<string, { min?: number; max?: number; values?: string[] }> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (!key.startsWith('spec.') || !value) continue;
    const match = key.match(/^spec\.([^.]+)\.(min|max|values)$/);
    if (!match) continue;
    const [, specKey, field] = match;
    if (!specFilters[specKey]) specFilters[specKey] = {};
    if (field === 'values') {
      specFilters[specKey].values = value.split(',').filter(Boolean);
    } else {
      specFilters[specKey][field] = Number(value);
    }
  }

  // Load initial filtered response + all data for the client wrapper
  const [initialResponse, allEquipment, allManufacturers, categoryTree] = await Promise.all([
    filterEquipment({
      q: sp.q,
      category_ids: categoryIds.length > 0 ? categoryIds : undefined,
      manufacturer_ids: manufacturerIds.length > 0 ? manufacturerIds : undefined,
      spec_filters: Object.keys(specFilters).length > 0 ? specFilters : undefined,
      page,
      page_size: 12,
    }),
    api.recommendedEquipments.all(),
    api.equipmentManufacturers.all(),
    api.equipmentCategories.tree(),
  ]);

  const activeCategoryId = categoryIds[0];

  return (
    <Container className="py-8">
      <Breadcrumbs items={[{ name: 'Home', url: '/' }, { name: 'Equipment' }]} />
      <h1 className="mb-6 text-3xl font-bold text-gray-900">Equipment</h1>

      <EquipmentCategoryNav
        categories={categoryTree}
        activeCategoryId={activeCategoryId}
      />

      <EquipmentListClient
        initialResponse={initialResponse}
        allEquipment={allEquipment}
        allManufacturers={allManufacturers}
        categoryTree={categoryTree}
      />
    </Container>
  );
}
```

- [ ] **Step 2: Verify tsc baseline**

Run: `cd d:\projects\unowire\frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors only, 0 new errors.

- [ ] **Step 3: Commit**

```powershell
cd d:\projects\unowire; git add "frontend/app/(site)/equipment/page.tsx"; git commit -m "feat(equipment): add /equipment list page route with SSR + client hydration"
```

Note: In PowerShell, the path with parentheses may need quoting. If `git add` fails, use `git add frontend/app` to stage all changes under that directory, then verify with `git status` before committing.

---

## Task 9: Create Device Detail Page Route

**Files:**
- Create: `frontend/app/(site)/equipment/[slug]/page.tsx`

- [ ] **Step 1: Create the device detail page**

Create `frontend/app/(site)/equipment/[slug]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { EquipmentCard } from '@/components/equipment/EquipmentCard';
import { ApplicableSpecsTable } from '@/components/equipment/ApplicableSpecsTable';
import { HotEquipmentRecommendation } from '@/components/equipment/HotEquipmentRecommendation';
import { EquipmentManufacturerRecommendation } from '@/components/equipment/EquipmentManufacturerRecommendation';
import { InquiryFormModal } from '@/components/member/InquiryFormModal';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const equipment = await findEquipmentBySlug(slug);
  if (!equipment) return { title: 'Equipment Not Found' };
  const mfrName = equipment.manufacturer?.name ?? 'Unknown';
  return {
    title: `${equipment.model} - ${mfrName} | Unowire`,
    description: equipment.description?.slice(0, 160) ?? `Details and applicable specifications for ${equipment.model} by ${mfrName}.`,
  };
}

async function findEquipmentBySlug(slug: string) {
  const all = await api.recommendedEquipments.all();
  return all.find((e) => e.slug === slug) ?? null;
}

function buildProductJsonLd(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  equipment: any,
  manufacturerName: string,
  categoryName: string
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: equipment.model,
    image: equipment.image_url || undefined,
    description: equipment.description || undefined,
    category: categoryName,
    manufacturer: {
      '@type': 'Organization',
      name: manufacturerName,
    },
  };
}

function buildBreadcrumbJsonLd(model: string, manufacturerName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
      { '@type': 'ListItem', position: 2, name: 'Equipment', item: '/equipment' },
      { '@type': 'ListItem', position: 3, name: `${model} - ${manufacturerName}` },
    ],
  };
}

export default async function EquipmentDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const equipment = await findEquipmentBySlug(slug);
  if (!equipment) notFound();

  const cookieStore = await cookies();
  const memberToken = cookieStore.get('member_token')?.value;

  const [allEquipment, allManufacturers] = await Promise.all([
    api.recommendedEquipments.all(),
    api.equipmentManufacturers.all(),
  ]);

  const manufacturer = equipment.manufacturer;
  const category = equipment.category;
  const manufacturerName = manufacturer?.name ?? 'Unknown';
  const categoryName = category?.label ?? '';

  // Equipment by same manufacturer (for cross-linking if needed)
  const sameManufacturerEquipment = allEquipment.filter(
    (e) => e.manufacturer_id === equipment.manufacturer_id && e.id !== equipment.id
  );

  return (
    <Container className="py-8">
      <Breadcrumbs
        items={[
          { name: 'Home', url: '/' },
          { name: 'Equipment', url: '/equipment' },
          { name: equipment.model },
        ]}
      />

      <JsonLd
        data={[
          buildProductJsonLd(equipment, manufacturerName, categoryName),
          buildBreadcrumbJsonLd(equipment.model, manufacturerName),
        ]}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        {/* Main content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Header block */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-gray-100">
              {equipment.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={equipment.image_url}
                  alt={equipment.model}
                  className="h-80 w-full object-cover"
                />
              ) : (
                <div className="flex h-80 w-full items-center justify-center text-gray-400">
                  No image available
                </div>
              )}
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-bold text-gray-900">{equipment.model}</h1>
              {manufacturer && (
                <Link
                  href={`/equipment/manufacturers/${encodeURIComponent(manufacturer.slug)}`}
                  className="block text-blue-600 hover:underline"
                >
                  {manufacturer.name}
                </Link>
              )}
              {category && (
                <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                  {category.label}
                </span>
              )}
              {equipment.external_url && (
                <a
                  href={equipment.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
                >
                  View Product →
                </a>
              )}
              {/* Inquiry CTA */}
              <div className="pt-2">
                {memberToken ? (
                  manufacturer && (
                    <InquiryFormModal
                      recipientType="equipment_manufacturer"
                      recipientId={manufacturer.id}
                      manufacturerName={manufacturer.name}
                      defaultSubject={`Inquiry about ${equipment.model}`}
                    />
                  )
                ) : (
                  <Link
                    href={`/login?redirect=${encodeURIComponent(`/equipment/${equipment.slug}`)}`}
                    className="inline-block text-sm text-blue-600 hover:underline"
                  >
                    Login to Inquire
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {equipment.description && (
            <div>
              <h2 className="mb-2 text-xl font-semibold text-gray-900">Description</h2>
              <p className="text-gray-700 whitespace-pre-line">{equipment.description}</p>
            </div>
          )}

          {/* Applicable Specs Table */}
          <div>
            <h2 className="mb-2 text-xl font-semibold text-gray-900">Applicable Specifications</h2>
            <ApplicableSpecsTable specs={equipment.applicable_specs} />
          </div>

          {/* More from this manufacturer */}
          {sameManufacturerEquipment.length > 0 && (
            <div>
              <h2 className="mb-4 text-xl font-semibold text-gray-900">
                More from {manufacturerName}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sameManufacturerEquipment.slice(0, 3).map((eq) => (
                  <EquipmentCard key={eq.id} equipment={eq} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right aside */}
        <aside className="lg:col-span-1 space-y-6">
          <HotEquipmentRecommendation
            equipments={allEquipment}
            excludeId={equipment.id}
          />
          <EquipmentManufacturerRecommendation
            manufacturers={allManufacturers}
            equipments={allEquipment}
            excludeId={manufacturer?.id}
          />
        </aside>
      </div>
    </Container>
  );
}
```

- [ ] **Step 2: Verify tsc baseline**

Run: `cd d:\projects\unowire\frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors only, 0 new errors.

- [ ] **Step 3: Commit**

```powershell
cd d:\projects\unowire; git add "frontend/app/(site)/equipment/[slug]/page.tsx"; git commit -m "feat(equipment): add /equipment/[slug] detail page with specs table + inquiry CTA"
```

---

## Task 10: Create Equipment Manufacturer Detail Page Route

**Files:**
- Create: `frontend/app/(site)/equipment/manufacturers/[slug]/page.tsx`

- [ ] **Step 1: Create the manufacturer detail page**

Create `frontend/app/(site)/equipment/manufacturers/[slug]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { EquipmentCard } from '@/components/equipment/EquipmentCard';
import { HotEquipmentRecommendation } from '@/components/equipment/HotEquipmentRecommendation';
import { EquipmentManufacturerRecommendation } from '@/components/equipment/EquipmentManufacturerRecommendation';
import { InquiryFormModal } from '@/components/member/InquiryFormModal';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const manufacturer = await api.equipmentManufacturers.getBySlug(slug);
  if (!manufacturer) return { title: 'Manufacturer Not Found' };
  return {
    title: `${manufacturer.name} | Equipment Manufacturers | Unowire`,
    description: manufacturer.description?.slice(0, 160) ?? `Learn more about ${manufacturer.name} and their cable processing equipment.`,
  };
}

function buildOrganizationJsonLd(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  m: any
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: m.name,
    url: m.website || undefined,
    logo: m.image_url || undefined,
    description: m.description || undefined,
    foundingDate: m.founded_year ? String(m.founded_year) : undefined,
    address: m.address
      ? {
          '@type': 'PostalAddress',
          streetAddress: m.address,
          addressCountry: m.country || undefined,
        }
      : m.country
      ? {
          '@type': 'PostalAddress',
          addressCountry: m.country,
        }
      : undefined,
    email: m.email || undefined,
    telephone: m.phone || undefined,
  };
}

function buildBreadcrumbJsonLd(name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
      { '@type': 'ListItem', position: 2, name: 'Equipment', item: '/equipment' },
      { '@type': 'ListItem', position: 3, name: 'Manufacturers', item: '/equipment#manufacturers' },
      { '@type': 'ListItem', position: 4, name },
    ],
  };
}

export default async function EquipmentManufacturerPage({ params }: PageProps) {
  const { slug } = await params;
  const manufacturer = await api.equipmentManufacturers.getBySlug(slug);
  if (!manufacturer) notFound();

  const cookieStore = await cookies();
  const memberToken = cookieStore.get('member_token')?.value;

  const [allEquipment, allManufacturers] = await Promise.all([
    api.recommendedEquipments.all(),
    api.equipmentManufacturers.all(),
  ]);

  const manufacturerEquipment = allEquipment.filter(
    (e) => e.manufacturer_id === manufacturer.id
  );

  return (
    <Container className="py-8">
      <Breadcrumbs
        items={[
          { name: 'Home', url: '/' },
          { name: 'Equipment', url: '/equipment' },
          { name: 'Manufacturers' },
          { name: manufacturer.name },
        ]}
      />

      <JsonLd
        data={[
          buildOrganizationJsonLd(manufacturer),
          buildBreadcrumbJsonLd(manufacturer.name),
        ]}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        {/* Main content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Header block */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="flex items-center justify-center rounded-lg bg-gray-50 p-4">
              {manufacturer.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={manufacturer.image_url}
                  alt={manufacturer.name}
                  className="h-32 w-32 object-contain"
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center text-gray-400">
                  No logo
                </div>
              )}
            </div>
            <div className="md:col-span-2 space-y-2">
              <h1 className="text-3xl font-bold text-gray-900">{manufacturer.name}</h1>
              {manufacturer.country && (
                <p className="text-sm text-gray-600">{manufacturer.country}</p>
              )}
              {manufacturer.website && (
                <a
                  href={manufacturer.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-blue-600 hover:underline"
                >
                  {manufacturer.website}
                </a>
              )}
              {manufacturer.founded_year && (
                <p className="text-sm text-gray-600">
                  Founded: {manufacturer.founded_year}
                </p>
              )}
              {/* Inquiry CTA */}
              <div className="pt-2">
                {memberToken ? (
                  <InquiryFormModal
                    recipientType="equipment_manufacturer"
                    recipientId={manufacturer.id}
                    manufacturerName={manufacturer.name}
                    defaultSubject={`Inquiry about ${manufacturer.name} equipment`}
                  />
                ) : (
                  <Link
                    href={`/login?redirect=${encodeURIComponent(`/equipment/manufacturers/${manufacturer.slug}`)}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Login to Inquire
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* About */}
          {manufacturer.description && (
            <div>
              <h2 className="mb-2 text-xl font-semibold text-gray-900">About</h2>
              <p className="text-gray-700 whitespace-pre-line">{manufacturer.description}</p>
            </div>
          )}

          {/* Contact Information */}
          {(manufacturer.address || manufacturer.phone || manufacturer.email) && (
            <div>
              <h2 className="mb-2 text-xl font-semibold text-gray-900">Contact Information</h2>
              <dl className="space-y-1 text-sm">
                {manufacturer.address && (
                  <div className="flex gap-2">
                    <dt className="font-medium text-gray-600">Address:</dt>
                    <dd className="text-gray-900">{manufacturer.address}</dd>
                  </div>
                )}
                {manufacturer.phone && (
                  <div className="flex gap-2">
                    <dt className="font-medium text-gray-600">Phone:</dt>
                    <dd className="text-gray-900">{manufacturer.phone}</dd>
                  </div>
                )}
                {manufacturer.email && (
                  <div className="flex gap-2">
                    <dt className="font-medium text-gray-600">Email:</dt>
                    <dd>
                      <a
                        href={`mailto:${manufacturer.email}`}
                        className="text-blue-600 hover:underline"
                      >
                        {manufacturer.email}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Equipment Products */}
          <div>
            <h2 className="mb-4 text-xl font-semibold text-gray-900">
              Equipment ({manufacturerEquipment.length})
            </h2>
            {manufacturerEquipment.length === 0 ? (
              <p className="text-gray-500">No equipment listed yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {manufacturerEquipment.map((eq) => (
                  <EquipmentCard key={eq.id} equipment={eq} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right aside */}
        <aside className="lg:col-span-1 space-y-6">
          <HotEquipmentRecommendation
            equipments={allEquipment.filter(
              (e) => e.manufacturer_id !== manufacturer.id
            )}
            excludeId={undefined}
          />
          <EquipmentManufacturerRecommendation
            manufacturers={allManufacturers}
            equipments={allEquipment}
            excludeId={manufacturer.id}
          />
        </aside>
      </div>
    </Container>
  );
}
```

- [ ] **Step 2: Verify tsc baseline**

Run: `cd d:\projects\unowire\frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors only, 0 new errors.

- [ ] **Step 3: Commit**

```powershell
cd d:\projects\unowire; git add "frontend/app/(site)/equipment/manufacturers/[slug]/page.tsx"; git commit -m "feat(equipment): add /equipment/manufacturers/[slug] detail page"
```

---

## Task 11: Final Verification + tsc Baseline + Smoke Tests

**Files:**
- No new files; verification only

- [ ] **Step 1: Rebuild and restart frontend container**

```powershell
cd d:\projects\unowire; docker compose --env-file .env.docker build frontend; docker compose --env-file .env.docker up -d frontend
```

Wait ~10 seconds, then verify health:
```powershell
cd d:\projects\unowire; docker compose --env-file .env.docker ps frontend
```
Expected: `Up X seconds (healthy)`

- [ ] **Step 2: Verify tsc baseline (final check)**

```powershell
cd d:\projects\unowire\frontend; npx tsc --noEmit
```
Expected: exactly 8 errors in `.next/dev/types/validator.ts` line 440, 0 new errors. Verify no errors mention `equipment`, `Equipment`, `EquipmentCard`, `EquipmentFilters`, `EquipmentListClient`, `filterEquipment`, `EquipmentManufacturer`, `EquipmentCategory`, or any equipment-related symbol.

- [ ] **Step 3: Verify backend endpoints still work**

```powershell
cd d:\projects\unowire; docker compose --env-file .env.docker exec backend python -c "import urllib.request, json; r = urllib.request.urlopen('http://localhost:8000/api/recommended-equipments?page_size=999'); data = json.loads(r.read()); print(f'Equipment count: {len(data[\"items\"])}'); r2 = urllib.request.urlopen('http://localhost:8000/api/equipment-categories'); print(f'Categories: {len(json.loads(r2.read()))}'); r3 = urllib.request.urlopen('http://localhost:8000/api/equipment-manufacturers?page_size=999'); print(f'Manufacturers: {len(json.loads(r3.read())[\"items\"])}')"
```
Expected: Equipment count: 4, Categories: 1 (top-level with 2 children), Manufacturers: 2.

- [ ] **Step 4: Run backend test suite**

```powershell
cd d:\projects\unowire; docker compose --env-file .env.docker exec backend python -m pytest -v
```
Expected: All tests pass (or the 2 pre-existing failures in `test_admin_menu.py` remain — those are unrelated to equipment work).

- [ ] **Step 5: Manual smoke test checklist**

Open `http://localhost:3000/equipment` in the browser and verify:

1. **List page loads**: page renders with breadcrumbs, H1 "Equipment", sub-category image tags at top, three-column layout
2. **Sub-category nav**: 2 sub-category tags visible (Semi-Automatic Stripping Machine, Fully Automatic Cutting & Stripping Machine)
3. **Equipment cards**: 4 equipment cards visible (CS-800, Alpha 488, CS-1500, Gamma 333)
4. **Keyword filter**: type "CS" in keyword box → only CS-800 and CS-1500 remain (after 300ms debounce)
5. **Category filter**: check "Semi-Automatic Stripping Machine" → only CS-800 and CS-1500 remain
6. **Manufacturer filter**: check "Komax" → only Alpha 488 and Gamma 333 remain
7. **Spec filter (range)**: enter min=0.5 in conductor_area → CS-800, Alpha 488, CS-1500 remain (Gamma 333 has min=0.5 so also matches)
8. **Spec filter (enum)**: check "braided" under shielding → only Gamma 333 remains
9. **Clear filters**: click "Clear all filters" → all 4 equipment visible again
10. **Click equipment card**: navigate to `/equipment/rec-eq-1` → detail page shows CS-800 image, model, manufacturer link, category badge, description, applicable specs table, inquiry CTA
11. **Applicable specs table**: 5 rows visible (Conductor Area, Outer Diameter, Shielding, Jacket, Core Structure)
12. **Click manufacturer link**: navigate to `/equipment/manufacturers/kmv` → KMV detail page shows logo, name, country, equipment list (CS-800, CS-1500)
13. **Inquiry CTA (logged out)**: "Login to Inquire" link visible on detail and manufacturer pages
14. **Right sidebar**: Hot Equipment shows 3 image cards, Equipment Manufacturers shows 2 text links with counts

- [ ] **Step 6: Commit any cleanup (if needed)**

If no fixes were needed, this task produces no commit. The implementation is complete.

---

## Manual Smoke Test Scenarios (Reference)

After Task 11 completes, the user should manually verify the following in the browser:

### List Page (`/equipment`)
- [ ] Page loads without errors
- [ ] Breadcrumbs show "Home / Equipment"
- [ ] H1 "Equipment" visible
- [ ] Sub-category image tags visible at top (2 tags)
- [ ] Three-column layout (filters left, equipment center, ads right)
- [ ] 4 equipment cards visible
- [ ] Each card shows image, model, manufacturer, category badge
- [ ] Clicking a card navigates to detail page

### Filters
- [ ] Keyword search works with 300ms debounce
- [ ] Category checkboxes filter equipment
- [ ] Manufacturer checkboxes filter equipment
- [ ] Spec range inputs (conductor_area, outer_diameter) filter equipment
- [ ] Spec enum checkboxes (shielding, jacket, core_structure) filter equipment
- [ ] "Clear all filters" resets everything
- [ ] URL updates with filter params

### Device Detail Page (`/equipment/[slug]`)
- [ ] Page loads with breadcrumbs, image, model, manufacturer link, category badge
- [ ] Description visible (if non-empty)
- [ ] Applicable specs table renders with 3 columns (Spec, Range, Allowed Values)
- [ ] spec_key values rendered with friendly labels (Conductor Area, Outer Diameter, etc.)
- [ ] "View Product →" button visible if external_url exists
- [ ] Inquiry CTA: member sees button, non-member sees login link
- [ ] Right sidebar: Hot Equipment (excluding current) + Manufacturer Recommendations

### Manufacturer Detail Page (`/equipment/manufacturers/[slug]`)
- [ ] Page loads with breadcrumbs, logo, name, country, website, founded year
- [ ] About section visible (if description non-empty)
- [ ] Contact Information visible (if any contact field non-empty)
- [ ] Equipment list shows all equipment by this manufacturer
- [ ] Inquiry CTA works (member/non-member)
- [ ] Right sidebar: Hot Equipment (excluding current manufacturer) + Other Manufacturers

## Self-Review Checklist

**1. Spec coverage:**
- ✅ List page `/equipment` with 3-column layout — Task 8
- ✅ Device detail page `/equipment/[slug]` — Task 9
- ✅ Manufacturer detail page `/equipment/manufacturers/[slug]` — Task 10
- ✅ Types extension — Task 1
- ✅ API client extension — Task 2
- ✅ Filter logic — Task 3
- ✅ EquipmentCard + ApplicableSpecsTable — Task 4
- ✅ EquipmentCategoryNav + HotEquipment + ManufacturerRecommendation — Task 5
- ✅ EquipmentFilters client component — Task 6
- ✅ EquipmentListClient wrapper — Task 7
- ✅ Final verification — Task 11

**2. Placeholder scan:** No TBD, TODO, or vague descriptions. All code blocks are complete.

**3. Type consistency:**
- `EquipmentManufacturer` extended in Task 1 with full fields; used consistently in Tasks 2, 3, 5, 7, 10
- `EquipmentFilterParams`, `EquipmentFilterFacets`, `EquipmentListResponse` defined in Task 1; used in Tasks 3, 6, 7, 8
- `filterEquipment(params)` function defined in Task 3; called in Tasks 7, 8
- `SPEC_KEY_LABELS` and `specKeyLabel()` exported from Task 3; used in Task 4
- `api.equipmentManufacturers` and `api.equipmentCategories` namespaces added in Task 2; used in Tasks 3, 7, 8, 9, 10
- All component prop types match across tasks
