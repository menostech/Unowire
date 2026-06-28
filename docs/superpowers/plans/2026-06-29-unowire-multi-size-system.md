# Unowire Multi-Size-System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the cable data model to support multiple wire sizing systems (AWG / metric mm² / kcmil / none) organized by industry, with a data-driven filter config so filter sets can be modified without touching component code.

**Architecture:** Add `industry` and `size_system` fields to each cable. Rename the variant spec key `awg` → `size`. Introduce `data/filter-config.json` mapping industry → type → size_system → filter entries. Refactor `lib/filter.ts` to apply filters generically from the config and compute facets dynamically. Remove the CableCard size badge. Refactor `CableFilters.tsx` to render an Industry group on top plus config-driven spec filter groups below.

**Tech Stack:** Next.js 16 (App Router), TypeScript, static JSON data, Tailwind CSS. No automated tests — verification uses `npx tsc --noEmit`, `npm run validate`, and `npm run build`.

**Spec:** `docs/superpowers/specs/2026-06-29-unowire-multi-size-system-design.md`

---

## Global Constraints

- **English only:** All code, comments, JSON values/labels, and UI strings must be in English. No Chinese in any file.
- **No new cable data:** Only migrate the 6 existing cables. Adding power/telecom/fiber cables is out of scope.
- **No automated tests:** Verify each task with `npx tsc --noEmit` (0 errors) and `npm run validate` (0 errors). Final task runs `npm run build`.
- **Config-driven filters:** `data/filter-config.json` is the single source of truth for which spec filters render. `CableFilters.tsx` and `lib/filter.ts` read it; adding a new filter does not require component changes.
- **Generic spec_filters:** Config-driven enum spec filters (shielding, jacket, core_structure, insulation_material, voltage_class, temperature_rating, impedance, wavelength, rated_voltage, core_type) are carried in a generic `spec_filters: Record<string, string[]>` map on `CableQueryParams`. `size` stays explicit (special multi-label UI). Range filters (`conductor_area`, `outer_diameter`) stay explicit as min/max pairs.
- **Commit per task:** Each task ends with a focused git commit.
- **Working directory:** All frontend commands run from `d:\projects\unowire\frontend`. Git commands run from `d:\projects\unowire`.

---

## File Structure

**Create:**
- `frontend/data/filter-config.json` — industry → type → size_system → filter entries (the config source of truth)

**Modify:**
- `frontend/lib/types.ts` — add Industry, SizeSystem, FilterConfig types; update Cable, CableQueryParams, FilterFacets
- `frontend/lib/api.ts` — add getFilterConfig() loader + industries list helper
- `frontend/lib/utils.ts` — add formatSizeLabel()
- `frontend/lib/filter.ts` — config-driven filtering + industry facet + size rename + generic spec_filters + dynamic facets
- `frontend/lib/validate.ts` — new validation rules (industry/size_system/size spec presence + filter-config cross-ref)
- `frontend/lib/seo.ts` — update list description (remove "AWG" hardcode)
- `frontend/data/cables.json` — add industry + size_system fields; rename awg spec key → size (6 cables)
- `frontend/components/cable/CableCard.tsx` — remove size badge; awg → size in variant preview
- `frontend/components/cable/CableFilters.tsx` — Industry group on top + config-driven spec filter groups
- `frontend/components/shared/SimilarCables.tsx` — awg → size
- `frontend/app/cables/page.tsx` — SearchParams: awg → size, add industry, pack spec_filters
- `frontend/app/categories/[...slugs]/page.tsx` — same SearchParams changes

**No change:**
- `frontend/lib/equipment-recommend.ts` — uses generic spec_key matching, no hardcoded "awg"
- `frontend/data/recommended-equipments.json` — does not reference awg
- `frontend/components/cable/CableSpecTable.tsx`, `VariantComparisonTable.tsx` — render specs dynamically by key already

---

### Task 1: Add Industry / SizeSystem / FilterConfig types to lib/types.ts

**Files:**
- Modify: `frontend/lib/types.ts`

- [ ] **Step 1: Add new type unions and filter-config interfaces (insert after the SpecItem interface)**

Leave the existing `SpecType` and `SpecItem` definitions (lines 27-36) intact. Insert the following new types immediately after the SpecItem interface closing brace (after line 36):

```typescript
// === Industry & Size System ===
export type Industry = "automotive" | "consumer_electronics" | "industrial_power" | "telecom";

export type SizeSystem = "awg" | "mm2" | "kcmil" | "none";

// === Filter Config (data/filter-config.json) ===
export interface FilterConfigEntry {
  spec_key: string;
  label: string;
  control: "enum" | "range";
  unit?: string;
}

export interface TypeFilterConfig {
  label: string;
  size_system: SizeSystem;
  filters: FilterConfigEntry[];
}

export interface IndustryFilterConfig {
  label: string;
  types: Record<string, TypeFilterConfig>;
}

// data/filter-config.json shape: Record<Industry, IndustryFilterConfig>
```

- [ ] **Step 2: Add industry + size_system to the Cable interface**

In the `Cable` interface (lines 43-55), add two fields after `type: string;` (line 48):

```typescript
export interface Cable {
  id: string;
  brand_id: string;
  model: string;
  slug: string;
  type: string;
  industry: Industry;        // NEW
  size_system: SizeSystem;   // NEW
  category_ids: string[];
  base_description: string;
  meta_title: string | null;
  meta_description: string | null;
  common_specs: SpecItem[];
  variants: CableVariant[];
}
```

- [ ] **Step 3: Rewrite CableQueryParams (replace lines 82-97)**

```typescript
// === Filter / Query Params ===
export interface CableQueryParams {
  q?: string;
  manufacturer?: string[];
  brand?: string[];
  category?: string[];
  industry?: Industry[];          // NEW
  size?: string[];                // RENAMED from awg
  // Generic config-driven enum spec filters (shielding, jacket, core_structure,
  // insulation_material, voltage_class, temperature_rating, impedance,
  // wavelength, rated_voltage, core_type). Keys are spec_keys from filter-config.json.
  spec_filters?: Record<string, string[]>;
  min_area?: number;
  max_area?: number;
  min_od?: number;
  max_od?: number;
  page: number;
  page_size: number;
}
```

- [ ] **Step 4: Rewrite FilterFacets (replace lines 100-110)**

```typescript
// === Filter Facets ===
export interface FilterFacets {
  manufacturers: { id: string; name: string; count: number }[];
  brands: { id: string; name: string; count: number }[];
  categories: { id: string; name: string; level: number; count: number }[];
  industries: { value: Industry; label: string; count: number }[];   // NEW
  size: { value: string; count: number; size_system: SizeSystem }[]; // RENAMED + grouped
  // Generic enum spec facets keyed by spec_key (only for specs in the in-scope filter config)
  spec_facets: Record<string, { value: string; count: number }[]>;
  conductor_area: { min: number; max: number };
  outer_diameter: { min: number; max: number };
}
```

- [ ] **Step 5: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors in files that reference `awg` on CableQueryParams/FilterFacets (filter.ts, page.tsx, CableFilters.tsx) — these are expected and will be fixed in later tasks. Confirm NO errors in types.ts itself.

- [ ] **Step 6: Commit**

```bash
cd d:\projects\unowire
git add frontend/lib/types.ts
git commit -m "feat(types): add Industry, SizeSystem, FilterConfig types + generic spec_filters"
```

---

### Task 2: Create data/filter-config.json

**Files:**
- Create: `frontend/data/filter-config.json`

- [ ] **Step 1: Create the filter config file with the full industry → type mapping**

Write the complete JSON below to `frontend/data/filter-config.json`:

```json
{
  "automotive": {
    "label": "Automotive",
    "types": {
      "automotive_wire": {
        "label": "Automotive Wire",
        "size_system": "awg",
        "filters": [
          { "spec_key": "size", "label": "AWG", "control": "enum" },
          { "spec_key": "conductor_area", "label": "Conductor Area", "control": "range", "unit": "mm²" },
          { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
          { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
          { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
          { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
          { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
          { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" }
        ]
      },
      "automotive_cable": {
        "label": "Automotive Cable",
        "size_system": "mm2",
        "filters": [
          { "spec_key": "size", "label": "Cross-Section", "control": "enum", "unit": "mm²" },
          { "spec_key": "conductor_area", "label": "Conductor Area", "control": "range", "unit": "mm²" },
          { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
          { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
          { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
          { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
          { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" }
        ]
      }
    }
  },
  "consumer_electronics": {
    "label": "Consumer Electronics",
    "types": {
      "electronic_wire": {
        "label": "Electronic Wire",
        "size_system": "awg",
        "filters": [
          { "spec_key": "size", "label": "AWG", "control": "enum" },
          { "spec_key": "conductor_area", "label": "Conductor Area", "control": "range", "unit": "mm²" },
          { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
          { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
          { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
          { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
          { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
          { "spec_key": "rated_voltage", "label": "Rated Voltage", "control": "enum" },
          { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" }
        ]
      },
      "multi_core_wire": {
        "label": "Multi-Core Wire",
        "size_system": "awg",
        "filters": [
          { "spec_key": "size", "label": "AWG", "control": "enum" },
          { "spec_key": "conductor_area", "label": "Conductor Area", "control": "range", "unit": "mm²" },
          { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
          { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
          { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
          { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
          { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
          { "spec_key": "rated_voltage", "label": "Rated Voltage", "control": "enum" },
          { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" }
        ]
      },
      "shielded_wire": {
        "label": "Shielded Wire",
        "size_system": "awg",
        "filters": [
          { "spec_key": "size", "label": "AWG", "control": "enum" },
          { "spec_key": "conductor_area", "label": "Conductor Area", "control": "range", "unit": "mm²" },
          { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
          { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
          { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
          { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
          { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
          { "spec_key": "rated_voltage", "label": "Rated Voltage", "control": "enum" },
          { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" }
        ]
      }
    }
  },
  "industrial_power": {
    "label": "Industrial / Power",
    "types": {
      "power_cable_metric": {
        "label": "Power Cable (Metric)",
        "size_system": "mm2",
        "filters": [
          { "spec_key": "size", "label": "Cross-Section", "control": "enum", "unit": "mm²" },
          { "spec_key": "conductor_area", "label": "Conductor Area", "control": "range", "unit": "mm²" },
          { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" },
          { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
          { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
          { "spec_key": "jacket", "label": "Jacket", "control": "enum" }
        ]
      },
      "power_cable_kcmil": {
        "label": "Power Cable (kcmil)",
        "size_system": "kcmil",
        "filters": [
          { "spec_key": "size", "label": "kcmil", "control": "enum" },
          { "spec_key": "conductor_area", "label": "Conductor Area", "control": "range", "unit": "mm²" },
          { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" },
          { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
          { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
          { "spec_key": "jacket", "label": "Jacket", "control": "enum" }
        ]
      }
    }
  },
  "telecom": {
    "label": "Telecom / Datacom",
    "types": {
      "communication_wire": {
        "label": "Communication Wire",
        "size_system": "awg",
        "filters": [
          { "spec_key": "size", "label": "AWG", "control": "enum" },
          { "spec_key": "conductor_area", "label": "Conductor Area", "control": "range", "unit": "mm²" },
          { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
          { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
          { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
          { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
          { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
          { "spec_key": "impedance", "label": "Impedance", "control": "enum" }
        ]
      },
      "coaxial_cable": {
        "label": "Coaxial Cable",
        "size_system": "awg",
        "filters": [
          { "spec_key": "size", "label": "AWG", "control": "enum" },
          { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
          { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
          { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
          { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
          { "spec_key": "impedance", "label": "Impedance", "control": "enum" }
        ]
      },
      "fiber_optic": {
        "label": "Fiber Optic",
        "size_system": "none",
        "filters": [
          { "spec_key": "core_type", "label": "Core Type", "control": "enum" },
          { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
          { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
          { "spec_key": "wavelength", "label": "Wavelength", "control": "enum" }
        ]
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd d:\projects\unowire
git add frontend/data/filter-config.json
git commit -m "feat(data): add filter-config.json (industry → type → size_system → filters)"
```

---

### Task 3: Migrate cables.json (add industry + size_system, rename awg → size)

**Files:**
- Modify: `frontend/data/cables.json`

- [ ] **Step 1: Add industry + size_system fields and rename the awg spec key on all 6 cables**

For each of the 6 cable objects, add two fields immediately after `"type": "..."`:
- cable-model-1 (UL1007): `"industry": "consumer_electronics", "size_system": "awg",`
- cable-model-2 (UL1015): `"industry": "consumer_electronics", "size_system": "awg",`
- cable-model-3 (AVSS): `"industry": "automotive", "size_system": "awg",`
- cable-model-4 (UL2468): `"industry": "consumer_electronics", "size_system": "awg",`
- cable-model-5 (UL2517): `"industry": "consumer_electronics", "size_system": "awg",`
- cable-model-6 (AVSS Shielded): `"industry": "automotive", "size_system": "awg",`

Then replace every occurrence of `{ "key": "awg", "label": "AWG",` with `{ "key": "size", "label": "AWG",` across all variants. There are 16 such occurrences (verified via grep). Do NOT rename variant `slug` values like `"awg24"` — those are URL fragments, not spec keys.

Example of one migrated cable top:
```json
{
  "id": "cable-model-1",
  "brand_id": "brand-1",
  "model": "UL1007",
  "slug": "ul1007",
  "type": "electronic_wire",
  "industry": "consumer_electronics",
  "size_system": "awg",
  "category_ids": ["cat-4", "cat-7"],
  ...
```

Example of one migrated variant spec:
```json
{ "key": "size", "label": "AWG", "value": "24", "unit": null, "type": "enum", "filterable": true },
```

- [ ] **Step 2: Verify no "awg" spec keys remain (slugs are fine)**

Run: `cd frontend && npx tsx -e "const c=require('./data/cables.json'); const hits=[]; for(const cab of c){for(const v of cab.variants){for(const s of v.specs){if(s.key==='awg')hits.push(cab.id+'/'+v.slug)}}} console.log(hits.length===0?'OK: no awg spec keys':hits)"`

Expected output: `OK: no awg spec keys`

- [ ] **Step 3: Commit**

```bash
cd d:\projects\unowire
git add frontend/data/cables.json
git commit -m "feat(data): add industry + size_system to cables, rename awg spec key to size"
```

---

### Task 4: Add getFilterConfig() loader + industries helper to lib/api.ts

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add the filter-config import and loader (insert after line 10, after the recommended-equipments import)**

```typescript
import filterConfigData from '@/data/filter-config.json';
```

Then add the type assertion and cached accessor after line 17 (after the `recommendedEquipments` assertion):

```typescript
// === Filter config ===
import type { Industry, IndustryFilterConfig } from './types';
const filterConfig = filterConfigData as Record<Industry, IndustryFilterConfig>;
```

- [ ] **Step 2: Add a filterConfig accessor + industries list to the api object**

Inside the `export const api = { ... }` object, add a new `filterConfig` namespace and an `industries` helper. Insert before the `getCableDetail` method (before line 197):

```typescript
  filterConfig: {
    all(): Record<Industry, IndustryFilterConfig> {
      return filterConfig;
    },
    /** Get the filter config for a specific industry */
    byIndustry(industry: Industry): IndustryFilterConfig | null {
      return filterConfig[industry] ?? null;
    },
    /** Get the filter config for a specific type within an industry */
    byType(industry: Industry, type: string): TypeFilterConfig | null {
      return filterConfig[industry]?.types[type] ?? null;
    },
    /** All known industry values */
    industries(): Industry[] {
      return Object.keys(filterConfig) as Industry[];
    },
    /** All known type values across all industries */
    types(): string[] {
      const all = new Set<string>();
      for (const ind of Object.values(filterConfig)) {
        for (const t of Object.keys(ind.types)) all.add(t);
      }
      return Array.from(all);
    },
  },

  /** All industries that actually appear in the cable data (with counts computed by caller) */
  industriesInData(): Industry[] {
    const set = new Set<Industry>();
    for (const c of cables) set.add(c.industry);
    return Array.from(set);
  },
```

Note: `TypeFilterConfig` must be imported. Add it to the existing type import on line 2:

Change line 2 from:
```typescript
import type {
  Brand, Cable, CableDetailResponse, Category, Manufacturer,
  RecommendedEquipment,
} from './types';
```
to:
```typescript
import type {
  Brand, Cable, CableDetailResponse, Category, Industry, IndustryFilterConfig,
  Manufacturer, RecommendedEquipment, TypeFilterConfig,
} from './types';
```

- [ ] **Step 3: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors remain in filter.ts / page.tsx / CableFilters.tsx (unfixed), but NO errors in api.ts.

- [ ] **Step 4: Commit**

```bash
cd d:\projects\unowire
git add frontend/lib/api.ts
git commit -m "feat(api): add filterConfig loader + industries helpers"
```

---

### Task 5: Add formatSizeLabel() to lib/utils.ts

**Files:**
- Modify: `frontend/lib/utils.ts`

- [ ] **Step 1: Add the SizeSystem import and formatSizeLabel function**

Update the import on line 3 to include SizeSystem:

```typescript
import type { Cable, SpecItem, CableVariant, SizeSystem } from './types';
```

Add the function after `formatJacket` (after line 38):

```typescript
/** Human-readable label for a size system, used by filters and spec tables */
export function formatSizeLabel(size_system: SizeSystem): string {
  switch (size_system) {
    case "awg":   return "AWG";
    case "mm2":   return "Cross-Section";
    case "kcmil": return "kcmil";
    case "none":  return "";
  }
}

/** Format a size value with its system label, e.g. "AWG 24" or "240 mm²" */
export function formatSizeValue(size_system: SizeSystem, value: string, unit?: string | null): string {
  switch (size_system) {
    case "awg":   return `AWG ${value}`;
    case "mm2":   return unit ? `${value} ${unit}` : `${value} mm²`;
    case "kcmil": return `${value} kcmil`;
    case "none":  return value;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors from utils.ts.

- [ ] **Step 3: Commit**

```bash
cd d:\projects\unowire
git add frontend/lib/utils.ts
git commit -m "feat(utils): add formatSizeLabel + formatSizeValue helpers"
```

---

### Task 6: Rewrite lib/filter.ts for config-driven filtering

**Files:**
- Modify: `frontend/lib/filter.ts` (full rewrite of the file)

- [ ] **Step 1: Replace the entire file contents**

```typescript
import type {
  Brand, Cable, CableListItem, CableListResponse, CableQueryParams,
  Category, FilterFacets, Industry, IndustryFilterConfig,
  Manufacturer, SizeSystem, TypeFilterConfig,
} from './types';
import { api } from './api';
import { getDescendantIds } from './category-tree';

/** Find a spec value across common_specs + all variant specs */
function findSpecValue(cable: Cable, key: string): string | number | undefined {
  for (const s of cable.common_specs) {
    if (s.key === key) return s.value;
  }
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (s.key === key) return s.value;
    }
  }
  return undefined;
}

/** Collect all numeric values for a spec key across all variants */
function getAllNumericValues(cable: Cable, key: string): number[] {
  const values: number[] = [];
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (s.key === key && typeof s.value === "number") values.push(s.value);
    }
  }
  return values;
}

/** Collect all distinct values for a spec key across common_specs + variants */
function collectSpecValues(cable: Cable, key: string): (string | number)[] {
  const values = new Set<string | number>();
  for (const s of cable.common_specs) {
    if (s.key === key) values.add(s.value);
  }
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (s.key === key) values.add(s.value);
    }
  }
  return Array.from(values);
}

/**
 * Determine the in-scope filter config for a cable list.
 * Returns the union of TypeFilterConfig entries for all industries/types
 * present in the list. If industries are selected in params, restricts to
 * those industries only.
 */
function getInScopeFilterConfig(cableList: Cable[], params: CableQueryParams): {
  industries: Industry[];
  typesByIndustry: Map<Industry, string[]>;
  config: Record<Industry, IndustryFilterConfig>;
} {
  const config = api.filterConfig.all();
  const selectedIndustries = params.industry && params.industry.length > 0
    ? new Set(params.industry)
    : null;

  const industries = new Set<Industry>();
  const typesByIndustry = new Map<Industry, Set<string>>();

  for (const cable of cableList) {
    if (selectedIndustries && !selectedIndustries.has(cable.industry)) continue;
    industries.add(cable.industry);
    if (!typesByIndustry.has(cable.industry)) typesByIndustry.set(cable.industry, new Set());
    typesByIndustry.get(cable.industry)!.add(cable.type);
  }

  return {
    industries: Array.from(industries),
    typesByIndustry: new Map(Array.from(typesByIndustry.entries()).map(([k, v]) => [k, Array.from(v)])),
    config,
  };
}

/** Main filter function */
export function filterCables(params: CableQueryParams): CableListResponse {
  let filtered = [...api.cables.all()];

  // Keyword search
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter(c =>
      c.model.toLowerCase().includes(q) ||
      c.base_description.toLowerCase().includes(q) ||
      c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))
    );
  }

  // Manufacturer filter
  if (params.manufacturer && params.manufacturer.length > 0) {
    const manufacturerIds = new Set(params.manufacturer);
    filtered = filtered.filter(c => {
      const brand = api.brands.getById(c.brand_id);
      return brand && manufacturerIds.has(brand.manufacturer_id);
    });
  }

  // Brand filter
  if (params.brand && params.brand.length > 0) {
    const brandIds = new Set(params.brand);
    filtered = filtered.filter(c => brandIds.has(c.brand_id));
  }

  // Category filter (including descendants)
  if (params.category && params.category.length > 0) {
    const allCatIds = new Set<string>();
    for (const catId of params.category) {
      for (const d of getDescendantIds(catId)) allCatIds.add(d);
    }
    filtered = filtered.filter(c => c.category_ids.some(id => allCatIds.has(id)));
  }

  // Industry filter
  if (params.industry && params.industry.length > 0) {
    const industrySet = new Set(params.industry);
    filtered = filtered.filter(c => industrySet.has(c.industry));
  }

  // Size filter (any variant matches) — replaces awg
  if (params.size && params.size.length > 0) {
    const sizeSet = new Set(params.size);
    filtered = filtered.filter(c =>
      c.variants.some(v => v.specs.some(s => s.key === "size" && sizeSet.has(String(s.value))))
    );
  }

  // Range filter: conductor_area (any variant in range)
  if (params.min_area !== undefined || params.max_area !== undefined) {
    filtered = filtered.filter(c => {
      const values = getAllNumericValues(c, "conductor_area");
      return values.some(v =>
        (params.min_area === undefined || v >= params.min_area) &&
        (params.max_area === undefined || v <= params.max_area)
      );
    });
  }

  // Range filter: outer_diameter
  if (params.min_od !== undefined || params.max_od !== undefined) {
    filtered = filtered.filter(c => {
      const values = getAllNumericValues(c, "outer_diameter");
      return values.some(v =>
        (params.min_od === undefined || v >= params.min_od) &&
        (params.max_od === undefined || v <= params.max_od)
      );
    });
  }

  // Generic config-driven enum spec filters
  if (params.spec_filters) {
    for (const [specKey, allowedValues] of Object.entries(params.spec_filters)) {
      if (!allowedValues || allowedValues.length === 0) continue;
      const valueSet = new Set(allowedValues);
      filtered = filtered.filter(c => {
        const values = collectSpecValues(c, specKey);
        return values.some(v => valueSet.has(String(v)));
      });
    }
  }

  // Build facets based on the filtered list
  const filters = buildFacets(filtered, params);

  // Pagination
  const total = filtered.length;
  const page = Math.max(1, params.page);
  const page_size = params.page_size;
  const start = (page - 1) * page_size;
  const paged = filtered.slice(start, start + page_size);

  const items: CableListItem[] = paged.map(cable => {
    const brand = api.brands.getById(cable.brand_id);
    const manufacturer = brand ? api.manufacturers.getById(brand.manufacturer_id) : null;
    return { cable, brand, manufacturer };
  });

  return { items, total, page, page_size, filters };
}

/** Build facets for a cable list, driven by the in-scope filter config */
function buildFacets(cableList: Cable[], params: CableQueryParams): FilterFacets {
  const manufacturerCounts = new Map<string, number>();
  const brandCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const industryCounts = new Map<Industry, number>();
  // size facet grouped by size_system: Map<size_system, Map<value, count>>
  const sizeCounts = new Map<SizeSystem, Map<string, number>>();
  // generic enum spec facets: Map<spec_key, Map<value, count>>
  const specFacetCounts = new Map<string, Map<string, number>>();
  let minArea = Infinity, maxArea = -Infinity;
  let minOd = Infinity, maxOd = -Infinity;

  // Determine which enum spec_keys to compute facets for (from in-scope filter config)
  const { industries, typesByIndustry, config } = getInScopeFilterConfig(cableList, params);
  const enumSpecKeys = new Set<string>();
  for (const industry of industries) {
    const indCfg = config[industry];
    if (!indCfg) continue;
    const types = typesByIndustry.get(industry) ?? [];
    for (const t of types) {
      const tCfg = indCfg.types[t];
      if (!tCfg) continue;
      for (const f of tCfg.filters) {
        if (f.control === "enum" && f.spec_key !== "size") {
          enumSpecKeys.add(f.spec_key);
        }
      }
    }
  }

  for (const cable of cableList) {
    // manufacturer + brand
    const brand = api.brands.getById(cable.brand_id);
    if (brand) {
      brandCounts.set(cable.brand_id, (brandCounts.get(cable.brand_id) ?? 0) + 1);
      manufacturerCounts.set(brand.manufacturer_id, (manufacturerCounts.get(brand.manufacturer_id) ?? 0) + 1);
    }
    // categories
    for (const catId of cable.category_ids) {
      categoryCounts.set(catId, (categoryCounts.get(catId) ?? 0) + 1);
    }
    // industry
    industryCounts.set(cable.industry, (industryCounts.get(cable.industry) ?? 0) + 1);

    // size facet (from variant specs, grouped by cable's size_system)
    if (cable.size_system !== "none") {
      if (!sizeCounts.has(cable.size_system)) sizeCounts.set(cable.size_system, new Map());
      const sizeMap = sizeCounts.get(cable.size_system)!;
      for (const v of cable.variants) {
        for (const s of v.specs) {
          if (s.key === "size") sizeMap.set(String(s.value), (sizeMap.get(String(s.value)) ?? 0) + 1);
        }
      }
    }

    // numeric ranges
    for (const v of cable.variants) {
      for (const s of v.specs) {
        if (s.key === "conductor_area" && typeof s.value === "number") {
          minArea = Math.min(minArea, s.value);
          maxArea = Math.max(maxArea, s.value);
        }
        if (s.key === "outer_diameter" && typeof s.value === "number") {
          minOd = Math.min(minOd, s.value);
          maxOd = Math.max(maxOd, s.value);
        }
      }
    }

    // generic enum spec facets (from common_specs + variant specs)
    if (enumSpecKeys.size > 0) {
      const allSpecs = [...cable.common_specs, ...cable.variants.flatMap(v => v.specs)];
      for (const s of allSpecs) {
        if (enumSpecKeys.has(s.key)) {
          if (!specFacetCounts.has(s.key)) specFacetCounts.set(s.key, new Map());
          const m = specFacetCounts.get(s.key)!;
          m.set(String(s.value), (m.get(String(s.value)) ?? 0) + 1);
        }
      }
    }
  }

  const manufacturers = api.manufacturers.all()
    .map(m => ({ id: m.id, name: m.name, count: manufacturerCounts.get(m.id) ?? 0 }))
    .filter(m => m.count > 0);
  const brandsList = api.brands.all()
    .map(b => ({ id: b.id, name: b.name, count: brandCounts.get(b.id) ?? 0 }))
    .filter(b => b.count > 0);
  const categories = api.categories.all()
    .map(c => ({ id: c.id, name: c.name, level: c.level, count: categoryCounts.get(c.id) ?? 0 }))
    .filter(c => c.count > 0);

  // industries facet (ordered by config definition order)
  const allIndustries = api.filterConfig.industries();
  const industriesFacet = allIndustries
    .map(ind => ({
      value: ind,
      label: config[ind]?.label ?? ind,
      count: industryCounts.get(ind) ?? 0,
    }))
    .filter(i => i.count > 0);

  // size facet flattened with size_system tag
  const sizeFacet: { value: string; count: number; size_system: SizeSystem }[] = [];
  for (const [sys, m] of sizeCounts.entries()) {
    for (const [value, count] of m.entries()) {
      sizeFacet.push({ value, count, size_system: sys });
    }
  }

  // generic spec facets
  const spec_facets: Record<string, { value: string; count: number }[]> = {};
  for (const [key, m] of specFacetCounts.entries()) {
    spec_facets[key] = Array.from(m.entries()).map(([value, count]) => ({ value, count }));
  }

  return {
    manufacturers,
    brands: brandsList,
    categories,
    industries: industriesFacet,
    size: sizeFacet,
    spec_facets,
    conductor_area: { min: minArea === Infinity ? 0 : minArea, max: maxArea === -Infinity ? 0 : maxArea },
    outer_diameter: { min: minOd === Infinity ? 0 : minOd, max: maxOd === -Infinity ? 0 : maxOd },
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors remain in page.tsx (SearchParams still uses `awg`) and CableFilters.tsx (still references `facets.awg`), but NO errors in filter.ts itself.

- [ ] **Step 3: Commit**

```bash
cd d:\projects\unowire
git add frontend/lib/filter.ts
git commit -m "feat(filter): config-driven filtering + industry facet + size rename + generic spec_filters"
```

---

### Task 7: Add new validation rules to lib/validate.ts

**Files:**
- Modify: `frontend/lib/validate.ts`

- [ ] **Step 1: Add industry/size_system/size validation rules**

After the existing rule 5 (variant spec key uniqueness, ending around line 83), add new validation rules. Insert before rule 6 (URL uniqueness, line 86):

```typescript
    // 5b. industry + size_system presence and validity
    const validIndustries = new Set(api.filterConfig.industries());
    const validSizeSystems = new Set(["awg", "mm2", "kcmil", "none"]);
    if (!cable.industry) {
      errors.push({
        file: "cables.json",
        cable_id: cable.id,
        message: `Cable ${cable.id} missing required field: industry`,
        severity: "error",
      });
    } else if (!validIndustries.has(cable.industry)) {
      errors.push({
        file: "cables.json",
        cable_id: cable.id,
        message: `Cable ${cable.id} has invalid industry "${cable.industry}". Valid: ${Array.from(validIndustries).join(", ")}`,
        severity: "error",
      });
    }
    if (!cable.size_system) {
      errors.push({
        file: "cables.json",
        cable_id: cable.id,
        message: `Cable ${cable.id} missing required field: size_system`,
        severity: "error",
      });
    } else if (!validSizeSystems.has(cable.size_system)) {
      errors.push({
        file: "cables.json",
        cable_id: cable.id,
        message: `Cable ${cable.id} has invalid size_system "${cable.size_system}". Valid: awg, mm2, kcmil, none`,
        severity: "error",
      });
    }

    // 5c. size spec presence consistency with size_system
    if (cable.size_system && cable.size_system !== "none") {
      for (const variant of cable.variants) {
        const hasSize = variant.specs.some(s => s.key === "size");
        if (!hasSize) {
          errors.push({
            file: "cables.json",
            cable_id: cable.id,
            message: `Cable ${cable.id} variant ${variant.slug}: missing "size" spec but size_system is "${cable.size_system}"`,
            severity: "error",
          });
        }
      }
    } else if (cable.size_system === "none") {
      for (const variant of cable.variants) {
        const hasSize = variant.specs.some(s => s.key === "size");
        if (hasSize) {
          errors.push({
            file: "cables.json",
            cable_id: cable.id,
            message: `Cable ${cable.id} variant ${variant.slug}: has "size" spec but size_system is "none"`,
            severity: "error",
          });
        }
      }
    }

    // 5d. type must exist in filter-config.json
    if (cable.industry && validIndustries.has(cable.industry)) {
      const indCfg = api.filterConfig.byIndustry(cable.industry);
      if (indCfg && !indCfg.types[cable.type]) {
        errors.push({
          file: "cables.json",
          cable_id: cable.id,
          message: `Cable ${cable.id} type "${cable.type}" not found in filter-config.json under industry "${cable.industry}"`,
          severity: "error",
        });
      }
    }
```

- [ ] **Step 2: Run validation**

Run: `cd frontend && npm run validate`
Expected: `✓ Data validation passed.` (0 errors, 0 warnings). If errors appear, fix the data in cables.json before committing.

- [ ] **Step 3: Commit**

```bash
cd d:\projects\unowire
git add frontend/lib/validate.ts
git commit -m "feat(validate): add industry/size_system/size spec + filter-config cross-ref rules"
```

---

### Task 8: Update CableCard — remove size badge, rename awg → size

**Files:**
- Modify: `frontend/components/cable/CableCard.tsx`

- [ ] **Step 1: Remove the size badge and update variant preview**

Replace the entire file with:

```tsx
import Link from 'next/link';
import type { Cable, Brand, Manufacturer } from '@/lib/types';
import { getCableUrl } from '@/lib/api';
import { getPrimaryVariant, findVariantSpec, formatSpecValue, formatSizeValue } from '@/lib/utils';

interface CableCardProps {
  cable: Cable;
  brand?: Brand | null;
  manufacturer?: Manufacturer | null;
}

export function CableCard({ cable, brand, manufacturer }: CableCardProps) {
  const primaryVariant = getPrimaryVariant(cable);
  const url = getCableUrl(cable);
  const sizeSpec = primaryVariant ? findVariantSpec(primaryVariant, "size") : null;
  const areaSpec = primaryVariant ? findVariantSpec(primaryVariant, "conductor_area") : null;
  const odSpec = primaryVariant ? findVariantSpec(primaryVariant, "outer_diameter") : null;
  const jacketSpec = cable.common_specs.find(s => s.key === "jacket");
  const variantCount = cable.variants.length;

  return (
    <Link href={url} className="block border rounded-lg overflow-hidden hover:shadow-md transition bg-white">
      {/* Image placeholder (no size badge) */}
      <div className="h-24 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
          <path d="M2 12h20" />
          <circle cx="6" cy="12" r="2" />
          <circle cx="18" cy="12" r="2" />
        </svg>
      </div>

      {/* Title */}
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 truncate">{cable.model}</h3>
        <p className="text-xs text-gray-500 mb-2">
          {brand?.name ?? "Unknown"}{manufacturer ? ` · ${manufacturer.country}` : ""}
        </p>

        {/* Mini spec table */}
        <div className="text-xs space-y-0.5 mb-2">
          {sizeSpec && (
            <div className="flex justify-between">
              <span className="text-gray-500">Size</span>
              <span className="text-gray-900">{formatSizeValue(cable.size_system, String(sizeSpec.value), sizeSpec.unit)}</span>
            </div>
          )}
          {areaSpec && (
            <div className="flex justify-between">
              <span className="text-gray-500">Area</span>
              <span className="text-gray-900">{formatSpecValue(areaSpec)}</span>
            </div>
          )}
          {odSpec && (
            <div className="flex justify-between">
              <span className="text-gray-500">OD</span>
              <span className="text-gray-900">{formatSpecValue(odSpec)}</span>
            </div>
          )}
          {jacketSpec && (
            <div className="flex justify-between">
              <span className="text-gray-500">Jacket</span>
              <span className="text-gray-900 uppercase">{String(jacketSpec.value)}</span>
            </div>
          )}
        </div>

        {/* Variant preview */}
        {variantCount > 1 && (
          <div className="border-t pt-2">
            <p className="text-xs text-gray-500 mb-1">Variants ({variantCount})</p>
            <div className="space-y-0.5">
              {cable.variants.slice(0, 3).map(v => {
                const vSize = findVariantSpec(v, "size");
                const vArea = findVariantSpec(v, "conductor_area");
                return (
                  <div key={v.slug} className="flex justify-between text-xs">
                    <span className="text-gray-600">
                      {vSize ? formatSizeValue(cable.size_system, String(vSize.value), vSize.unit) : "—"}
                    </span>
                    <span className="text-gray-600">{vArea ? `${vArea.value} ${vArea.unit ?? ""}` : "—"}</span>
                  </div>
                );
              })}
              {variantCount > 3 && (
                <div className="text-xs text-blue-600">+{variantCount - 3} more</div>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: CableCard.tsx has no errors.

- [ ] **Step 3: Commit**

```bash
cd d:\projects\unowire
git add frontend/components/cable/CableCard.tsx
git commit -m "feat(card): remove size badge, use size spec + formatSizeValue"
```

---

### Task 9: Update SimilarCables — awg → size

**Files:**
- Modify: `frontend/components/shared/SimilarCables.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import Link from 'next/link';
import type { Cable } from '@/lib/types';
import { getCableUrl } from '@/lib/api';
import { getPrimaryVariant, findVariantSpec, formatSizeValue } from '@/lib/utils';

interface SimilarCablesProps {
  cables: Cable[];
}

export function SimilarCables({ cables }: SimilarCablesProps) {
  if (cables.length === 0) return null;
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Similar Cables</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cables.map(cable => {
          const url = getCableUrl(cable);
          const primaryVariant = getPrimaryVariant(cable);
          const sizeSpec = primaryVariant ? findVariantSpec(primaryVariant, "size") : null;
          return (
            <Link key={cable.id} href={url} className="border rounded-lg p-3 hover:shadow-md transition bg-white">
              <h3 className="font-medium text-sm text-gray-900 truncate">{cable.model}</h3>
              <p className="text-xs text-gray-500">
                {sizeSpec ? formatSizeValue(cable.size_system, String(sizeSpec.value), sizeSpec.unit) : cable.variants[0]?.slug}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: SimilarCables.tsx has no errors.

- [ ] **Step 3: Commit**

```bash
cd d:\projects\unowire
git add frontend/components/shared/SimilarCables.tsx
git commit -m "feat(similar-cables): use size spec + formatSizeValue instead of awg"
```

---

### Task 10: Rewrite CableFilters — Industry group + config-driven spec filters

**Files:**
- Modify: `frontend/components/cable/CableFilters.tsx` (full rewrite)

- [ ] **Step 1: Replace the entire file contents**

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';
import type { FilterFacets, Industry, SizeSystem } from '@/lib/types';
import { api } from '@/lib/api';
import { formatSizeLabel } from '@/lib/utils';

interface CableFiltersProps {
  facets: FilterFacets;
}

function CableFiltersInner({ facets }: CableFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterConfig = api.filterConfig.all();

  const toggleParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.getAll(key);
    if (current.includes(value)) {
      params.delete(key);
      current.filter(v => v !== value).forEach(v => params.append(key, v));
    } else {
      params.append(key, value);
    }
    params.delete('page');
    router.push(`/cables?${params.toString()}`);
  }, [router, searchParams]);

  const setNumericParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete('page');
    router.push(`/cables?${params.toString()}`);
  }, [router, searchParams]);

  const isChecked = (key: string, value: string): boolean => {
    return searchParams.getAll(key).includes(value);
  };

  const renderCheckboxGroup = (paramKey: string, options: { value: string; label: string; count: number }[]) => {
    if (options.length === 0) return null;
    return (
      <div className="space-y-1">
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
            <input
              type="checkbox"
              checked={isChecked(paramKey, opt.value)}
              onChange={() => toggleParam(paramKey, opt.value)}
              className="rounded border-gray-300"
            />
            <span className="flex-1 text-gray-700">{opt.label}</span>
            <span className="text-gray-400 text-xs">({opt.count})</span>
          </label>
        ))}
      </div>
    );
  };

  // Group size facet by size_system for multi-label rendering
  const sizeBySystem = new Map<SizeSystem, { value: string; count: number }[]>();
  for (const s of facets.size) {
    if (!sizeBySystem.has(s.size_system)) sizeBySystem.set(s.size_system, []);
    sizeBySystem.get(s.size_system)!.push({ value: s.value, count: s.count });
  }

  // Determine which enum spec facets to render (from spec_facets keys, ordered by config)
  // We render specs that appear in the in-scope types' filter config. Since facets.spec_facets
  // already only contains in-scope keys, we render them in config definition order.
  const enumSpecKeys: string[] = [];
  for (const ind of Object.values(filterConfig)) {
    for (const t of Object.values(ind.types)) {
      for (const f of t.filters) {
        if (f.control === "enum" && f.spec_key !== "size" && facets.spec_facets[f.spec_key] && !enumSpecKeys.includes(f.spec_key)) {
          enumSpecKeys.push(f.spec_key);
        }
      }
    }
  }

  return (
    <aside className="w-52 shrink-0 space-y-5">
      {/* Industry (top-level) */}
      {facets.industries.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Industry</h3>
          {renderCheckboxGroup('industry', facets.industries.map(i => ({ value: i.value, label: i.label, count: i.count })))}
        </div>
      )}

      {/* Manufacturer */}
      {facets.manufacturers.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Manufacturer</h3>
          {renderCheckboxGroup('manufacturer', facets.manufacturers.map(m => ({ value: m.id, label: m.name, count: m.count })))}
        </div>
      )}

      {/* Brand */}
      {facets.brands.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Brand</h3>
          {renderCheckboxGroup('brand', facets.brands.map(b => ({ value: b.id, label: b.name, count: b.count })))}
        </div>
      )}

      {/* Category (level 1 only) */}
      {facets.categories.filter(c => c.level === 1).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Category</h3>
          {renderCheckboxGroup('category', facets.categories.filter(c => c.level === 1).map(c => ({ value: c.id, label: c.name, count: c.count })))}
        </div>
      )}

      {/* Size (grouped by size_system, each group labeled dynamically) */}
      {sizeBySystem.size > 0 && (
        <div>
          {Array.from(sizeBySystem.entries()).map(([sys, entries]) => (
            <div key={sys} className="mb-3">
              <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">{formatSizeLabel(sys)}</h3>
              {renderCheckboxGroup('size', entries.map(e => ({ value: e.value, label: e.value, count: e.count })))}
            </div>
          ))}
        </div>
      )}

      {/* Conductor Area (range) */}
      <div>
        <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Conductor Area (mm²)</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            placeholder={`min ${facets.conductor_area.min}`}
            value={searchParams.get('min_area') ?? ''}
            onChange={e => setNumericParam('min_area', e.target.value)}
            className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
          />
          <span className="text-gray-400">—</span>
          <input
            type="number"
            step="0.01"
            placeholder={`max ${facets.conductor_area.max}`}
            value={searchParams.get('max_area') ?? ''}
            onChange={e => setNumericParam('max_area', e.target.value)}
            className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
          />
        </div>
      </div>

      {/* Outer Diameter (range) */}
      <div>
        <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Outer Diameter (mm)</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            placeholder={`min ${facets.outer_diameter.min}`}
            value={searchParams.get('min_od') ?? ''}
            onChange={e => setNumericParam('min_od', e.target.value)}
            className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
          />
          <span className="text-gray-400">—</span>
          <input
            type="number"
            step="0.01"
            placeholder={`max ${facets.outer_diameter.max}`}
            value={searchParams.get('max_od') ?? ''}
            onChange={e => setNumericParam('max_od', e.target.value)}
            className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
          />
        </div>
      </div>

      {/* Config-driven enum spec filters (shielding, jacket, core_structure, insulation, etc.) */}
      {enumSpecKeys.map(specKey => {
        const facetEntries = facets.spec_facets[specKey];
        if (!facetEntries || facetEntries.length === 0) return null;
        // Find the label from the filter config
        let label = specKey;
        for (const ind of Object.values(filterConfig)) {
          for (const t of Object.values(ind.types)) {
            const f = t.filters.find(f => f.spec_key === specKey);
            if (f) { label = f.label; break; }
          }
        }
        return (
          <div key={specKey}>
            <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">{label}</h3>
            {renderCheckboxGroup(specKey, facetEntries.map(e => {
              let displayLabel = e.value;
              if (specKey === 'jacket') displayLabel = e.value.toUpperCase();
              else if (specKey === 'core_structure') displayLabel = e.value.replace(/_/g, ' ');
              return { value: e.value, label: displayLabel, count: e.count };
            }))}
          </div>
        );
      })}
    </aside>
  );
}

export function CableFilters(props: CableFiltersProps) {
  return (
    <Suspense fallback={<div className="w-52" />}>
      <CableFiltersInner {...props} />
    </Suspense>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: CableFilters.tsx has no errors. Remaining errors (if any) only in page.tsx files.

- [ ] **Step 3: Commit**

```bash
cd d:\projects\unowire
git add frontend/components/cable/CableFilters.tsx
git commit -m "feat(filters): Industry group on top + config-driven spec filters + multi-label size groups"
```

---

### Task 11: Update both list pages — SearchParams (awg → size, add industry, pack spec_filters)

**Files:**
- Modify: `frontend/app/cables/page.tsx`
- Modify: `frontend/app/categories/[...slugs]/page.tsx`

- [ ] **Step 1: Rewrite the SearchParams + query construction in app/cables/page.tsx**

Replace the `SearchParams` interface and `CablesPage` function (lines 14-54) with:

```typescript
interface SearchParams {
  q?: string;
  manufacturer?: string;
  brand?: string;
  category?: string;
  industry?: string;
  size?: string;
  // config-driven enum spec filters (shielding, jacket, core_structure, insulation_material, ...)
  [key: string]: string | undefined;
}

function parseArrayParam(sp: SearchParams, key: keyof SearchParams): string[] | undefined {
  const val = sp[key];
  if (val === undefined) return undefined;
  return Array.isArray(val) ? val : [val];
}

export default async function CablesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1');

  // Pack config-driven enum spec filters from search params.
  // Known non-spec keys are excluded; everything else that appears in filter-config
  // as an enum filter (except size, which stays explicit) is packed into spec_filters.
  const specFilters: Record<string, string[]> = {};
  const knownKeys = new Set(['q', 'manufacturer', 'brand', 'category', 'industry', 'size', 'page']);
  for (const [key, value] of Object.entries(sp)) {
    if (knownKeys.has(key) || value === undefined) continue;
    specFilters[key] = Array.isArray(value) ? value : [value];
  }

  const result = filterCables({
    q: sp.q,
    manufacturer: parseArrayParam(sp, 'manufacturer'),
    brand: parseArrayParam(sp, 'brand'),
    category: parseArrayParam(sp, 'category'),
    industry: parseArrayParam(sp, 'industry') as any,
    size: parseArrayParam(sp, 'size'),
    spec_filters: Object.keys(specFilters).length > 0 ? specFilters : undefined,
    min_area: sp.min_area ? parseFloat(sp.min_area) : undefined,
    max_area: sp.max_area ? parseFloat(sp.max_area) : undefined,
    min_od: sp.min_od ? parseFloat(sp.min_od) : undefined,
    max_od: sp.max_od ? parseFloat(sp.max_od) : undefined,
    page,
    page_size: 16,
  });
```

Leave the rest of the page JSX unchanged.

- [ ] **Step 2: Apply the same changes to app/categories/[...slugs]/page.tsx**

Replace the `SearchParams` interface and the `queryParams` construction (lines 14-74) with:

```typescript
interface SearchParams {
  manufacturer?: string;
  brand?: string;
  industry?: string;
  size?: string;
  // config-driven enum spec filters
  [key: string]: string | undefined;
}

function parseArrayParam(sp: SearchParams, key: keyof SearchParams): string[] | undefined {
  const val = sp[key];
  if (val === undefined) return undefined;
  return Array.isArray(val) ? val : [val];
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slugs: string[] }> }): Promise<Metadata> {
  const { slugs } = await params;
  const found = api.categories.findByPath(slugs);
  if (!found) return { title: 'Not Found' };
  return generateCategoryMetadata(found.category);
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slugs: string[] }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slugs } = await params;
  const sp = await searchParams;
  const found = api.categories.findByPath(slugs);
  if (!found) notFound();

  const category = found.category;
  const descendantIds = getDescendantIds(category.id);

  // Pack config-driven enum spec filters from search params.
  const specFilters: Record<string, string[]> = {};
  const knownKeys = new Set(['manufacturer', 'brand', 'industry', 'size', 'page', 'min_area', 'max_area', 'min_od', 'max_od']);
  for (const [key, value] of Object.entries(sp)) {
    if (knownKeys.has(key) || value === undefined) continue;
    specFilters[key] = Array.isArray(value) ? value : [value];
  }

  const page = parseInt(sp.page || '1');
  const queryParams: CableQueryParams = {
    manufacturer: parseArrayParam(sp, 'manufacturer'),
    brand: parseArrayParam(sp, 'brand'),
    category: [category.id],
    industry: parseArrayParam(sp, 'industry') as any,
    size: parseArrayParam(sp, 'size'),
    spec_filters: Object.keys(specFilters).length > 0 ? specFilters : undefined,
    min_area: sp.min_area ? parseFloat(sp.min_area) : undefined,
    max_area: sp.max_area ? parseFloat(sp.max_area) : undefined,
    min_od: sp.min_od ? parseFloat(sp.min_od) : undefined,
    max_od: sp.max_od ? parseFloat(sp.max_od) : undefined,
    page,
    page_size: 16,
  };
  const result = filterCables(queryParams);
```

Leave the rest of the page JSX unchanged.

- [ ] **Step 3: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors across the whole project.

- [ ] **Step 4: Run validation**

Run: `cd frontend && npm run validate`
Expected: `✓ Data validation passed.`

- [ ] **Step 5: Commit**

```bash
cd d:\projects\unowire
git add frontend/app/cables/page.tsx frontend/app/categories/[...slugs]/page.tsx
git commit -m "feat(pages): awg→size param, add industry param, pack config-driven spec_filters"
```

---

### Task 12: Update SEO description + final build verification

**Files:**
- Modify: `frontend/lib/seo.ts`

- [ ] **Step 1: Update the cables list description to remove the hardcoded "AWG"**

In `frontend/lib/seo.ts`, change line 49 from:

```typescript
    description: 'Browse all cables. Filter by manufacturer, brand, AWG, conductor area, outer diameter.',
```

to:

```typescript
    description: 'Browse all cables. Filter by industry, manufacturer, brand, size, conductor area, and outer diameter.',
```

- [ ] **Step 2: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run validation**

Run: `cd frontend && npm run validate`
Expected: `✓ Data validation passed.`

- [ ] **Step 4: Run production build**

Run: `cd frontend && npm run build`
Expected: build succeeds, 0 errors. Routes compiled: `/` (static), `/cables` (dynamic), `/cables/[brand_slug]/[slug]` (dynamic+ISR), `/categories/[...slugs]` (dynamic), `/api/cables/[brand_slug]/[slug]` (dynamic), `/sitemap.xml`, `/robots.txt`.

- [ ] **Step 5: Runtime smoke test (curl)**

Start the production server: `cd frontend && npm run start` (runs on port 3000). In a separate terminal, run these curls:

```bash
curl -s -o /dev/null -w "GET / -> %{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "GET /cables -> %{http_code}\n" http://localhost:3000/cables
curl -s -o /dev/null -w "GET /cables?industry=automotive -> %{http_code}\n" "http://localhost:3000/cables?industry=automotive"
curl -s -o /dev/null -w "GET /cables?size=24 -> %{http_code}\n" "http://localhost:3000/cables?size=24"
curl -s -o /dev/null -w "GET /cables?shielding=none -> %{http_code}\n" "http://localhost:3000/cables?shielding=none"
curl -s -o /dev/null -w "GET /cables/hitachi/ul1007 -> %{http_code}\n" http://localhost:3000/cables/hitachi/ul1007
```

Expected: all return `200`. Stop the server after testing.

- [ ] **Step 6: Verify CableCard has no size badge**

Open `http://localhost:3000/cables` in a browser (or grep the HTML):
```bash
curl -s http://localhost:3000/cables | findstr /C:"AWG "
```
Expected: no `AWG` badge spans in the card image area (the size row in the spec table uses "Size" label, not a badge).

- [ ] **Step 7: Commit**

```bash
cd d:\projects\unowire
git add frontend/lib/seo.ts
git commit -m "feat(seo): update list description for industry + size filters"
```

---

## Self-Review

**1. Spec coverage:**
- §1 Data model (Industry, SizeSystem, Cable fields, spec rename, FilterConfig types, QueryParams, Facets) → Task 1 ✓
- §2 Industry→Type→Size→Filters mapping → Task 2 (filter-config.json) ✓
- §3 filter-config.json structure → Task 2 ✓
- §4 CableCard remove badge → Task 8 ✓
- §5 CableFilters industry + config-driven → Task 10 ✓
- §6 Data migration (6 cables) → Task 3 ✓
- §7.1 types.ts → Task 1 ✓
- §7.2 api.ts getFilterConfig → Task 4 ✓
- §7.3 filter.ts rewrite → Task 6 ✓
- §7.4 utils.ts formatSizeLabel → Task 5 ✓
- §7.5 validate.ts new rules → Task 7 ✓
- §7.6 equipment-recommend.ts → NO CHANGE needed (generic spec_key matching, no hardcoded "awg") ✓
- §7.7 seo.ts → Task 12 ✓
- §8.1 CableCard → Task 8 ✓
- §8.2 CableFilters → Task 10 ✓
- §8.3 CableSpecTable / VariantComparisonTable → NO CHANGE (render specs dynamically) ✓
- §8.4 SearchBox → NO CHANGE ✓
- §10 Verification (validate, build, curl, no badge) → Task 12 ✓

**2. Placeholder scan:** No TBD/TODO/vague steps. All code blocks are complete.

**3. Type consistency:**
- `Industry`, `SizeSystem`, `FilterConfigEntry`, `TypeFilterConfig`, `IndustryFilterConfig` — defined in Task 1, used in Tasks 4, 6, 10 ✓
- `CableQueryParams.spec_filters: Record<string, string[]>` — defined Task 1, used in Task 6 (filter), Task 11 (pages) ✓
- `FilterFacets.industries`, `.size` (with size_system), `.spec_facets` — defined Task 1, populated Task 6, consumed Task 10 ✓
- `api.filterConfig.all()` / `.byIndustry()` / `.byType()` / `.industries()` — defined Task 4, used Tasks 6, 7, 10 ✓
- `formatSizeLabel`, `formatSizeValue` — defined Task 5, used Tasks 8, 9, 10 ✓
- `size` spec key (was `awg`) — renamed in Task 3 (data), referenced in Tasks 6, 8, 9 ✓

No gaps found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-29-unowire-multi-size-system.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
