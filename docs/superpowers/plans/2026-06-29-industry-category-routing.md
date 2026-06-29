# Industry-Category-ProductType Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single generic `/cables` query page with a 4-layer taxonomy-driven routing (`/cables/[industry]/[category]/[product-type]`) where each product type page renders only its own relevant filters.

**Architecture:** New `taxonomy.json` is the single source of truth (replaces `filter-config.json` + `categories.json`). Routing follows the taxonomy tree. `filterCables` becomes route-scoped (industry+category+product_type are required route params, not query params). The `conductor_area` spec_key is removed; `size` absorbs its semantic via a new `enum_range` control type for mm2/kcmil systems.

**Tech Stack:** Next.js 16 App Router, TypeScript, static JSON data, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-06-29-industry-category-routing-design.md` (commit `14adc38`)

---

## Global Constraints

- **English only** in all code, comments, JSON values/labels, UI strings. No Chinese comments (an existing violation in `lib/utils.ts:60` and `lib/validate.ts` headers should be left as pre-existing — out of scope for this refactor).
- **No new cable data** — only the 6 existing cables are migrated to the new taxonomy fields.
- **No automated tests** — verify via `npx tsc --noEmit`, `npm run validate`, and `npm run build`.
- **PowerShell compatibility** — use `;` not `&&` to chain commands.
- **Config-driven filters** — sidebar renders filters from `taxonomy.json`, never hardcoded.
- **Generic `spec_filters`** — `Record<string, string[]>` carries config-driven enum filters. `size` and `outer_diameter` stay explicit fields (they need special rendering).
- **One commit per task** — each task ends with a focused commit.
- **`category_ids` field retained** on cables for migration period (do not delete).
- **`api.categories.*` retained** for legacy redirect resolution (reads old `categories.json`).
- **Pre-existing Chinese comments** in `lib/utils.ts:60` and `lib/validate.ts` rule headers are out of scope — do not modify.

---

## File Structure

**New files:**
- `frontend/data/taxonomy.json` — single source of truth for 4-layer tree
- `frontend/app/cables/[industry]/page.tsx` — industry page
- `frontend/app/cables/[industry]/[category]/page.tsx` — category page
- `frontend/app/cables/[industry]/[category]/[product-type]/page.tsx` — product type query page (main)
- `frontend/components/taxonomy/IndustryCard.tsx` — overview page card
- `frontend/components/taxonomy/CategoryCard.tsx` — industry page card
- `frontend/components/taxonomy/ProductTypeCard.tsx` — category page card

**Modified files:**
- `frontend/lib/types.ts` — add Taxonomy types; update CableQueryParams, FilterFacets, Cable, Industry
- `frontend/lib/api.ts` — add `taxonomy` namespace; remove `filterConfig` namespace
- `frontend/lib/filter.ts` — route-scoped filterCables; applySizeFilter union; buildFacets without industries
- `frontend/lib/validate.ts` — add rules 5e/5f/5g/5h/5i/5j
- `frontend/lib/seo.ts` — add generateIndustryMetadata, generateCategoryMetadata (new), generateProductTypeMetadata
- `frontend/data/cables.json` — add `category` + `product_type` fields; remove `conductor_area` specs
- `frontend/app/cables/page.tsx` — rewrite as overview page
- `frontend/app/categories/[...slugs]/page.tsx` — rewrite as redirect
- `frontend/components/cable/CableFilters.tsx` — route-scoped, read from taxonomy, enum_range rendering
- `frontend/components/cable/CableCard.tsx` — remove conductor_area references
- `frontend/app/sitemap.ts` — enumerate taxonomy routes

**Deleted files:**
- `frontend/data/filter-config.json` — merged into taxonomy.json

---

### Task 1: Add Taxonomy types to lib/types.ts

**Files:**
- Modify: `frontend/lib/types.ts`

This task adds the new Taxonomy type hierarchy, expands the `Industry` union, adds `category` + `product_type` to `Cable`, rewrites `CableQueryParams` (route-scoped) and `FilterFacets` (no industries, no conductor_area, add size_range). It does NOT remove the old `FilterConfigEntry`/`TypeFilterConfig`/`IndustryFilterConfig` types yet — Task 4 removes the `filterConfig` API that uses them, and Task 6 removes the types themselves. Keeping them temporarily avoids breaking compilation mid-refactor.

- [ ] **Step 1: Expand Industry union and add category/product_type to Cable**

In `frontend/lib/types.ts`, replace the existing `Industry` type and `Cable` interface:

```typescript
// === Industry & Size System ===
export type Industry =
  | "consumer_electronics"
  | "automotive_ev"
  | "data_centers"
  | "renewables"
  | "telecom_power"
  | "utility";

export type SizeSystem = "awg" | "mm2" | "kcmil" | "none";
```

Update the `Cable` interface to add `category` and `product_type` (keep `type` for backward compat during migration — it will be removed in Task 3 once cables.json is migrated):

```typescript
export interface Cable {
  id: string;
  brand_id: string;
  model: string;
  slug: string;
  type: string;              // legacy, retained for migration; same value as product_type
  industry: Industry;
  category: string;          // NEW: category key in taxonomy.json
  product_type: string;      // NEW: product type key in taxonomy.json
  size_system: SizeSystem;
  category_ids: string[];
  base_description: string;
  meta_title: string | null;
  meta_description: string | null;
  common_specs: SpecItem[];
  variants: CableVariant[];
}
```

- [ ] **Step 2: Add Taxonomy types**

Append after the `Industry`/`SizeSystem` section:

```typescript
// === Taxonomy (data/taxonomy.json) ===
export type FilterControl = "enum" | "range" | "enum_range";

export interface TaxonomyFilter {
  spec_key: string;
  label: string;
  control: FilterControl;
  unit?: string;
}

export interface ProductTypeConfig {
  label: string;
  slug: string;
  size_system: SizeSystem;
  filters: TaxonomyFilter[];
}

export interface TaxonomyCategory {
  label: string;
  slug: string;
  product_types: Record<string, ProductTypeConfig>;
}

export interface TaxonomyIndustry {
  label: string;
  slug: string;
  description: string;
  categories: Record<string, TaxonomyCategory>;
}

export type Taxonomy = Record<string, TaxonomyIndustry>;
```

- [ ] **Step 3: Rewrite CableQueryParams (route-scoped)**

Replace the entire `CableQueryParams` interface:

```typescript
// === Filter / Query Params ===
// NOTE: industry/category/product_type are REQUIRED route params (not query string).
// They are part of this interface so filterCables receives a single params object.
export interface CableQueryParams {
  // Route identity (required)
  industry: string;
  category: string;
  product_type: string;

  // Filter params (query string)
  q?: string;
  manufacturer?: string[];
  brand?: string[];
  size?: string[];              // enum values (for awg) or discrete selections (for mm2/kcmil)
  min_size?: number;            // range lower bound (mm2/kcmil only)
  max_size?: number;            // range upper bound (mm2/kcmil only)
  spec_filters?: Record<string, string[]>;
  min_od?: number;
  max_od?: number;

  // Pagination
  page: number;
  page_size: number;
}
```

Also add a separate params type for the cross-industry text search on `/cables`:

```typescript
// === Cross-industry text search params (for /cables overview) ===
export interface TextSearchParams {
  q: string;
  page: number;
  page_size: number;
}
```

- [ ] **Step 4: Rewrite FilterFacets**

Replace the entire `FilterFacets` interface:

```typescript
// === Filter Facets ===
export interface FilterFacets {
  manufacturers: { id: string; name: string; count: number }[];
  brands: { id: string; name: string; count: number }[];
  size: { value: string; count: number }[];                  // no size_system grouping (route fixes it)
  size_range: { min: number; max: number } | null;           // null when size_system=none or no cables
  spec_facets: Record<string, { value: string; count: number }[]>;
  outer_diameter: { min: number; max: number } | null;       // null when no cables in scope
}
```

- [ ] **Step 5: Verify typecheck (expect errors in filter.ts/api.ts/validate.ts — they reference removed fields)**

Run from `frontend/`:
```bash
npx tsc --noEmit
```

Expected: errors in `lib/filter.ts` (references `params.industry`, `params.category`, `conductor_area`, `min_area`/`max_area`), `lib/seo.ts` (references old `Category` type), `app/cables/page.tsx` (references old params), `app/categories/[...slugs]/page.tsx` (references old params), `components/cable/CableFilters.tsx` (references `facets.industries`, `facets.conductor_area`, `facets.categories`). These will be fixed in subsequent tasks. Do NOT fix them here.

Confirm: the errors are all in the expected files and all reference removed/changed fields. If any error is unexpected, stop and investigate.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/types.ts
git commit -m "refactor(types): add Taxonomy types and route-scoped CableQueryParams"
```

---

### Task 2: Create data/taxonomy.json

**Files:**
- Create: `frontend/data/taxonomy.json`

This task creates the complete 6-industry taxonomy as a single source of truth. The structure follows §4.1 of the spec. Filter spec_keys match the 6 existing cables' specs (so Task 3's migration validates cleanly) plus forward-looking industry-specific specs (uv_resistance, torsion_resistance, etc.) for product types that have no cables yet.

- [ ] **Step 1: Create taxonomy.json with all 6 industries**

Create `frontend/data/taxonomy.json` with this exact content:

```json
{
  "consumer_electronics": {
    "label": "Consumer Electronics",
    "slug": "consumer-electronics",
    "description": "Cables for consumer electronic devices, internal wiring, and accessories.",
    "categories": {
      "internal_wiring": {
        "label": "Internal Wiring",
        "slug": "internal-wiring",
        "product_types": {
          "electronic_wire": {
            "label": "Electronic Wire",
            "slug": "electronic-wire",
            "size_system": "awg",
            "filters": [
              { "spec_key": "size", "label": "AWG", "control": "enum" },
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
            "slug": "multi-core-wire",
            "size_system": "awg",
            "filters": [
              { "spec_key": "size", "label": "AWG", "control": "enum" },
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
            "slug": "shielded-wire",
            "size_system": "awg",
            "filters": [
              { "spec_key": "size", "label": "AWG", "control": "enum" },
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
      }
    }
  },
  "automotive_ev": {
    "label": "Automotive & Electric Vehicles",
    "slug": "automotive-ev",
    "description": "Cables for vehicles, wiring harnesses, and electric vehicle charging systems.",
    "categories": {
      "automotive": {
        "label": "Automotive",
        "slug": "automotive",
        "product_types": {
          "automotive_wire": {
            "label": "Automotive Wire",
            "slug": "automotive-wire",
            "size_system": "awg",
            "filters": [
              { "spec_key": "size", "label": "AWG", "control": "enum" },
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
            "slug": "automotive-cable",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" }
            ]
          },
          "shielded_wire": {
            "label": "Automotive Shielded Wire",
            "slug": "shielded-wire",
            "size_system": "awg",
            "filters": [
              { "spec_key": "size", "label": "AWG", "control": "enum" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" }
            ]
          }
        }
      },
      "e_mobility": {
        "label": "E-Mobility",
        "slug": "e-mobility",
        "product_types": {
          "ev_charging_cable": {
            "label": "EV Charging Cable",
            "slug": "ev-charging-cable",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" },
              { "spec_key": "charging_level", "label": "Charging Level", "control": "enum" }
            ]
          },
          "ev_high_voltage_cable": {
            "label": "EV High Voltage Cable",
            "slug": "ev-high-voltage-cable",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" },
              { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" }
            ]
          }
        }
      }
    }
  },
  "data_centers": {
    "label": "Data Centers",
    "slug": "data-centers",
    "description": "Cables for data center infrastructure, including power distribution, networking, and server racks.",
    "categories": {
      "data_centres": {
        "label": "Data Centres",
        "slug": "data-centres",
        "product_types": {
          "fiber_optic": {
            "label": "Fiber Optic Cable",
            "slug": "fiber-optic-cable",
            "size_system": "none",
            "filters": [
              { "spec_key": "core_type", "label": "Core Type", "control": "enum" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "wavelength", "label": "Wavelength", "control": "enum" },
              { "spec_key": "connector_type", "label": "Connector Type", "control": "enum" },
              { "spec_key": "fire_rating", "label": "Fire Rating", "control": "enum" }
            ]
          },
          "patch_cable": {
            "label": "Patch Cable",
            "slug": "patch-cable",
            "size_system": "awg",
            "filters": [
              { "spec_key": "size", "label": "AWG", "control": "enum" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "category_rating", "label": "Category Rating", "control": "enum" }
            ]
          },
          "power_cable_metric": {
            "label": "Power Cable (Metric)",
            "slug": "power-cable-metric",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" },
              { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "fire_rating", "label": "Fire Rating", "control": "enum" }
            ]
          }
        }
      }
    }
  },
  "renewables": {
    "label": "Renewables",
    "slug": "renewables",
    "description": "Cables for renewable energy systems, including solar, wind, and battery energy storage.",
    "categories": {
      "solar": {
        "label": "Solar",
        "slug": "solar",
        "product_types": {
          "solar_dc_cable": {
            "label": "Solar DC Cable",
            "slug": "solar-dc-cable",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" },
              { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" },
              { "spec_key": "uv_resistance", "label": "UV Resistance", "control": "enum" }
            ]
          },
          "solar_ac_cable": {
            "label": "Solar AC Cable",
            "slug": "solar-ac-cable",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" },
              { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" },
              { "spec_key": "uv_resistance", "label": "UV Resistance", "control": "enum" }
            ]
          }
        }
      },
      "wind_farms": {
        "label": "Wind Farms",
        "slug": "wind-farms",
        "product_types": {
          "wind_power_cable": {
            "label": "Wind Power Cable",
            "slug": "wind-power-cable",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" },
              { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" },
              { "spec_key": "torsion_resistance", "label": "Torsion Resistance", "control": "enum" }
            ]
          },
          "wind_control_cable": {
            "label": "Wind Control Cable",
            "slug": "wind-control-cable",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" },
              { "spec_key": "torsion_resistance", "label": "Torsion Resistance", "control": "enum" }
            ]
          }
        }
      },
      "bess": {
        "label": "BESS",
        "slug": "bess",
        "product_types": {
          "bess_power_cable": {
            "label": "BESS Power Cable",
            "slug": "bess-power-cable",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" },
              { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" },
              { "spec_key": "fire_rating", "label": "Fire Rating", "control": "enum" }
            ]
          }
        }
      }
    }
  },
  "telecom_power": {
    "label": "Telecom Power",
    "slug": "telecom-power",
    "description": "Cables for telecommunications networks, including fiber optics, copper communication, and base station power.",
    "categories": {
      "communications": {
        "label": "Communications",
        "slug": "communications",
        "product_types": {
          "fiber_optic": {
            "label": "Fiber Optic Cable",
            "slug": "fiber-optic-cable",
            "size_system": "none",
            "filters": [
              { "spec_key": "core_type", "label": "Core Type", "control": "enum" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "wavelength", "label": "Wavelength", "control": "enum" },
              { "spec_key": "connector_type", "label": "Connector Type", "control": "enum" }
            ]
          },
          "coaxial_cable": {
            "label": "Coaxial Cable",
            "slug": "coaxial-cable",
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
          "communication_wire": {
            "label": "Communication Wire",
            "slug": "communication-wire",
            "size_system": "awg",
            "filters": [
              { "spec_key": "size", "label": "AWG", "control": "enum" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "impedance", "label": "Impedance", "control": "enum" }
            ]
          },
          "base_station_power_cable": {
            "label": "Base Station Power Cable",
            "slug": "base-station-power-cable",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" },
              { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" },
              { "spec_key": "fire_rating", "label": "Fire Rating", "control": "enum" }
            ]
          }
        }
      }
    }
  },
  "utility": {
    "label": "Utility",
    "slug": "utility",
    "description": "Cables for public utility infrastructure, including power transmission, switchboards, and water treatment.",
    "categories": {
      "power_transmission": {
        "label": "Power Transmission",
        "slug": "power-transmission",
        "product_types": {
          "power_cable_metric": {
            "label": "Power Cable (Metric)",
            "slug": "power-cable-metric",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" },
              { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" }
            ]
          },
          "power_cable_kcmil": {
            "label": "Power Cable (kcmil)",
            "slug": "power-cable-kcmil",
            "size_system": "kcmil",
            "filters": [
              { "spec_key": "size", "label": "kcmil", "control": "enum_range", "unit": "kcmil" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" },
              { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" }
            ]
          },
          "overhead_conductor": {
            "label": "Overhead Conductor",
            "slug": "overhead-conductor",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "conductor_material", "label": "Conductor Material", "control": "enum" },
              { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
              { "spec_key": "tensile_strength", "label": "Tensile Strength", "control": "enum" }
            ]
          }
        }
      },
      "switchboards": {
        "label": "Switchboards",
        "slug": "switchboards",
        "product_types": {
          "switchboard_cable": {
            "label": "Switchboard Cable",
            "slug": "switchboard-cable",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" },
              { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" },
              { "spec_key": "fire_rating", "label": "Fire Rating", "control": "enum" }
            ]
          }
        }
      },
      "utilities": {
        "label": "Utilities",
        "slug": "utilities",
        "product_types": {
          "utility_power_cable": {
            "label": "Utility Power Cable",
            "slug": "utility-power-cable",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" },
              { "spec_key": "core_structure", "label": "Core Structure", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "shielding", "label": "Shielding", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" }
            ]
          }
        }
      },
      "water_treatment": {
        "label": "Water Treatment",
        "slug": "water-treatment",
        "product_types": {
          "water_treatment_cable": {
            "label": "Water Treatment Cable",
            "slug": "water-treatment-cable",
            "size_system": "mm2",
            "filters": [
              { "spec_key": "size", "label": "Cross-Section", "control": "enum_range", "unit": "mm²" },
              { "spec_key": "outer_diameter", "label": "Outer Diameter", "control": "range", "unit": "mm" },
              { "spec_key": "voltage_class", "label": "Voltage Class", "control": "enum" },
              { "spec_key": "insulation_material", "label": "Insulation", "control": "enum" },
              { "spec_key": "jacket", "label": "Jacket", "control": "enum" },
              { "spec_key": "temperature_rating", "label": "Temperature", "control": "enum" },
              { "spec_key": "water_resistance", "label": "Water Resistance", "control": "enum" },
              { "spec_key": "corrosion_resistance", "label": "Corrosion Resistance", "control": "enum" }
            ]
          }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Verify JSON is valid**

Run from `frontend/`:
```bash
node -e "const t = require('./data/taxonomy.json'); console.log('industries:', Object.keys(t).length); let cats=0, pts=0; for (const ind of Object.values(t)) { cats += Object.keys(ind.categories).length; for (const c of Object.values(ind.categories)) { pts += Object.keys(c.product_types).length; } } console.log('categories:', cats, 'product_types:', pts);"
```

Expected output:
```
industries: 6
categories: 12
product_types: 26
```

- [ ] **Step 3: Commit**

```bash
git add frontend/data/taxonomy.json
git commit -m "feat(data): add taxonomy.json as single source of truth (6 industries)"
```

---

### Task 3: Migrate cables.json — add category/product_type, remove conductor_area

**Files:**
- Modify: `frontend/data/cables.json`

This task adds `category` and `product_type` fields to all 6 cables per the §10.1 mapping table, and removes all `conductor_area` spec entries from all variants. The `type` field is retained but set to the same value as `product_type` (it will be removed in a later cleanup task once all `type` references in code are gone).

**Migration mapping (from spec §10.1):**

| Cable id | industry | category | product_type |
|----------|----------|----------|--------------|
| cable-model-1 (UL1007) | consumer_electronics | internal_wiring | electronic_wire |
| cable-model-2 (UL1015) | consumer_electronics | internal_wiring | electronic_wire |
| cable-model-3 (AVSS) | automotive_ev | automotive | automotive_wire |
| cable-model-4 (UL2468) | consumer_electronics | internal_wiring | multi_core_wire |
| cable-model-5 (UL2517) | consumer_electronics | internal_wiring | electronic_wire |
| cable-model-6 (AVSS Shielded) | automotive_ev | automotive | shielded_wire |

- [ ] **Step 1: Read current cables.json to confirm exact structure**

Read `frontend/data/cables.json` in full. Note the line numbers of each cable object and each `conductor_area` spec entry. There are 6 cables; confirm by counting `"id":` occurrences.

- [ ] **Step 2: Add category + product_type fields and remove conductor_area specs**

For each of the 6 cable objects, add `"category"` and `"product_type"` fields immediately after `"industry"`, and set `"type"` to the same value as `"product_type"`. Remove every `conductor_area` spec object from every variant's `specs` array.

**cable-model-1 (UL1007):**
- Change `"type": "electronic_wire"` (already correct)
- Add `"category": "internal_wiring"`, `"product_type": "electronic_wire"` after `"industry": "consumer_electronics"`
- Remove the `conductor_area` spec from variants `awg24`, `awg22`, `awg26`

**cable-model-2 (UL1015):**
- Change `"type": "electronic_wire"` (already correct)
- Add `"category": "internal_wiring"`, `"product_type": "electronic_wire"`
- Remove the `conductor_area` spec from variant `awg20`

**cable-model-3 (AVSS):**
- Change `"industry": "automotive"` to `"industry": "automotive_ev"`
- Change `"type": "automotive_wire"` (already correct)
- Add `"category": "automotive"`, `"product_type": "automotive_wire"`
- Remove the `conductor_area` spec from all variants

**cable-model-4 (UL2468):**
- Change `"type": "multi_core_wire"` (already correct)
- Add `"category": "internal_wiring"`, `"product_type": "multi_core_wire"`
- Remove the `conductor_area` spec from all variants

**cable-model-5 (UL2517):**
- Change `"type": "electronic_wire"` (already correct)
- Add `"category": "internal_wiring"`, `"product_type": "electronic_wire"`
- Remove the `conductor_area` spec from all variants

**cable-model-6 (AVSS Shielded):**
- Change `"industry": "automotive"` to `"industry": "automotive_ev"`
- Change `"type": "shielded_wire"` (already correct)
- Add `"category": "automotive"`, `"product_type": "shielded_wire"`
- Remove the `conductor_area` spec from all variants

- [ ] **Step 3: Verify no conductor_area remains**

Run from `frontend/`:
```bash
node -e "const c = require('./data/cables.json'); let count=0; for (const cable of c) { for (const v of cable.variants) { for (const s of v.specs) { if (s.key === 'conductor_area') count++; } } } console.log('conductor_area specs remaining:', count);"
```

Expected output:
```
conductor_area specs remaining: 0
```

- [ ] **Step 4: Verify all 6 cables have category + product_type**

Run from `frontend/`:
```bash
node -e "const c = require('./data/cables.json'); for (const cable of c) { console.log(cable.id, '|', cable.industry, '|', cable.category, '|', cable.product_type); }"
```

Expected output:
```
cable-model-1 | consumer_electronics | internal_wiring | electronic_wire
cable-model-2 | consumer_electronics | internal_wiring | electronic_wire
cable-model-3 | automotive_ev | automotive | automotive_wire
cable-model-4 | consumer_electronics | internal_wiring | multi_core_wire
cable-model-5 | consumer_electronics | internal_wiring | electronic_wire
cable-model-6 | automotive_ev | automotive | shielded_wire
```

- [ ] **Step 5: Commit**

```bash
git add frontend/data/cables.json
git commit -m "refactor(data): migrate cables to taxonomy (category+product_type, remove conductor_area)"
```

---

### Task 4: Add taxonomy namespace to lib/api.ts; remove filterConfig

**Files:**
- Modify: `frontend/lib/api.ts`

This task adds the `api.taxonomy.*` namespace (per spec §6.1), removes the `api.filterConfig.*` namespace, removes the `api.industriesInData()` method (replaced by taxonomy), and removes the now-unused imports (`Industry`, `IndustryFilterConfig`, `TypeFilterConfig`). The `api.categories.*` namespace is retained for legacy redirect resolution.

- [ ] **Step 1: Update imports**

In `frontend/lib/api.ts`, replace the type import line:

```typescript
import type {
  Brand, Cable, CableDetailResponse, Category, Industry, IndustryFilterConfig,
  Manufacturer, RecommendedEquipment, TypeFilterConfig,
} from './types';
```

with:

```typescript
import type {
  Brand, Cable, CableDetailResponse, Category,
  Manufacturer, ProductTypeConfig, RecommendedEquipment,
  Taxonomy, TaxonomyCategory, TaxonomyIndustry,
} from './types';
```

- [ ] **Step 2: Replace filter-config import with taxonomy import**

Replace:

```typescript
import filterConfigData from '@/data/filter-config.json';
```

with:

```typescript
import taxonomyData from '@/data/taxonomy.json';
```

- [ ] **Step 3: Remove the filterConfig constant**

Delete this line:

```typescript
// === Filter config ===
const filterConfig = filterConfigData as Record<Industry, IndustryFilterConfig>;
```

- [ ] **Step 4: Add taxonomyData cast**

Add after the existing data casts (near line 18):

```typescript
// === Taxonomy ===
const taxonomy = taxonomyData as Taxonomy;
```

- [ ] **Step 5: Add api.taxonomy namespace and remove api.filterConfig + api.industriesInData**

In the `api` object, remove the entire `filterConfig: { ... }` block and the `industriesInData()` method. Add the `taxonomy` namespace in their place:

```typescript
  taxonomy: {
    all(): Taxonomy {
      return taxonomy;
    },
    industries(): TaxonomyIndustry[] {
      return Object.values(taxonomy);
    },
    industry(industryKey: string): TaxonomyIndustry | null {
      return taxonomy[industryKey] ?? null;
    },
    category(industryKey: string, categoryKey: string): TaxonomyCategory | null {
      return this.industry(industryKey)?.categories[categoryKey] ?? null;
    },
    productType(industryKey: string, categoryKey: string, ptKey: string): ProductTypeConfig | null {
      return this.category(industryKey, categoryKey)?.product_types[ptKey] ?? null;
    },
    /** Find industry key by slug */
    industryKeyBySlug(industrySlug: string): string | null {
      for (const [key, ind] of Object.entries(taxonomy)) {
        if (ind.slug === industrySlug) return key;
      }
      return null;
    },
    /** Find category key by slug within an industry */
    categoryKeyBySlug(industryKey: string, categorySlug: string): string | null {
      const ind = taxonomy[industryKey];
      if (!ind) return null;
      for (const [key, cat] of Object.entries(ind.categories)) {
        if (cat.slug === categorySlug) return key;
      }
      return null;
    },
    /** Find product type key by slug within a category */
    productTypeKeyBySlug(industryKey: string, categoryKey: string, ptSlug: string): string | null {
      const cat = this.category(industryKey, categoryKey);
      if (!cat) return null;
      for (const [key, pt] of Object.entries(cat.product_types)) {
        if (pt.slug === ptSlug) return key;
      }
      return null;
    },
    /** Route resolution: lookup by slugs (URL → config + keys) */
    findBySlug(
      industrySlug: string,
      categorySlug: string,
      productTypeSlug: string
    ): {
      industry: TaxonomyIndustry;
      category: TaxonomyCategory;
      productType: ProductTypeConfig;
      industryKey: string;
      categoryKey: string;
      productTypeKey: string;
    } | null {
      const industryKey = this.industryKeyBySlug(industrySlug);
      if (!industryKey) return null;
      const categoryKey = this.categoryKeyBySlug(industryKey, categorySlug);
      if (!categoryKey) return null;
      const productTypeKey = this.productTypeKeyBySlug(industryKey, categoryKey, productTypeSlug);
      if (!productTypeKey) return null;
      const industry = taxonomy[industryKey];
      const category = industry.categories[categoryKey];
      const productType = category.product_types[productTypeKey];
      return { industry, category, productType, industryKey, categoryKey, productTypeKey };
    },
  },
```

- [ ] **Step 6: Verify typecheck (expect errors only in filter.ts and validate.ts — they still reference api.filterConfig)**

Run from `frontend/`:
```bash
npx tsc --noEmit
```

Expected: errors in `lib/filter.ts` (references `api.filterConfig`), `lib/validate.ts` (references `api.filterConfig`), `app/cables/page.tsx` (references old params), `app/categories/[...slugs]/page.tsx` (references old params), `components/cable/CableFilters.tsx` (references `api.filterConfig` + old facets). These will be fixed in subsequent tasks.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "refactor(api): add taxonomy namespace, remove filterConfig"
```

---

### Task 5: Rewrite lib/filter.ts — route-scoped filtering

**Files:**
- Modify: `frontend/lib/filter.ts`

This task rewrites `filterCables` to be route-scoped (industry+category+product_type are required), adds `applySizeFilter` with enum+range union semantics, adds `filterCablesByText` for cross-industry search, and rewrites `buildFacets` to remove industries facet and conductor_area, add size_range.

- [ ] **Step 1: Replace the entire file content**

Replace `frontend/lib/filter.ts` with:

```typescript
import type {
  Cable, CableListItem, CableListResponse, CableQueryParams,
  FilterFacets, SizeSystem, TextSearchParams,
} from './types';
import { api } from './api';

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

/** Parse a size value string to a number for range comparison (mm2/kcmil systems). */
function parseSizeValue(value: string): number | null {
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

/** Apply size filter: enum match OR range match (union for mm2/kcmil; enum only for awg). */
function applySizeFilter(
  cables: Cable[],
  sizeEnum: string[] | undefined,
  minSize: number | undefined,
  maxSize: number | undefined,
  sizeSystem: SizeSystem
): Cable[] {
  if (sizeSystem === "none") return cables;
  const hasEnum = sizeEnum && sizeEnum.length > 0;
  const hasRange = minSize !== undefined || maxSize !== undefined;
  if (!hasEnum && !hasRange) return cables;

  const sizeSet = hasEnum ? new Set(sizeEnum!) : null;

  return cables.filter(c => {
    // Gather all size values from this cable's variants
    const sizeValues: string[] = [];
    for (const v of c.variants) {
      for (const s of v.specs) {
        if (s.key === "size") sizeValues.push(String(s.value));
      }
    }

    // Enum match: any variant's size value is in sizeSet
    if (sizeSet) {
      if (sizeValues.some(v => sizeSet.has(v))) return true;
    }

    // Range match (mm2/kcmil only): any variant's numeric size is in [minSize, maxSize]
    if (hasRange && sizeSystem !== "awg") {
      for (const v of sizeValues) {
        const n = parseSizeValue(v);
        if (n === null) continue;
        if ((minSize === undefined || n >= minSize) && (maxSize === undefined || n <= maxSize)) {
          return true;
        }
      }
    }

    return false;
  });
}

/** Main filter function — route-scoped (industry+category+product_type required). */
export function filterCables(params: CableQueryParams): CableListResponse {
  const { industry, category, product_type, ...filterParams } = params;

  // 1. Hard filter by route identity
  let filtered = api.cables.all().filter(c =>
    c.industry === industry &&
    c.category === category &&
    c.product_type === product_type
  );

  // 2. Keyword search
  if (filterParams.q) {
    const q = filterParams.q.toLowerCase();
    filtered = filtered.filter(c =>
      c.model.toLowerCase().includes(q) ||
      c.base_description.toLowerCase().includes(q) ||
      c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))
    );
  }

  // 3. Manufacturer filter
  if (filterParams.manufacturer && filterParams.manufacturer.length > 0) {
    const manufacturerIds = new Set(filterParams.manufacturer);
    filtered = filtered.filter(c => {
      const brand = api.brands.getById(c.brand_id);
      return brand && manufacturerIds.has(brand.manufacturer_id);
    });
  }

  // 4. Brand filter
  if (filterParams.brand && filterParams.brand.length > 0) {
    const brandIds = new Set(filterParams.brand);
    filtered = filtered.filter(c => brandIds.has(c.brand_id));
  }

  // 5. Size filter (enum + range union)
  const ptConfig = api.taxonomy.productType(industry, category, product_type);
  const sizeSystem = ptConfig?.size_system ?? "none";
  filtered = applySizeFilter(
    filtered,
    filterParams.size,
    filterParams.min_size,
    filterParams.max_size,
    sizeSystem
  );

  // 6. Generic config-driven enum spec filters
  if (filterParams.spec_filters) {
    for (const [specKey, allowedValues] of Object.entries(filterParams.spec_filters)) {
      if (!allowedValues || allowedValues.length === 0) continue;
      const valueSet = new Set(allowedValues);
      filtered = filtered.filter(c => {
        const values = collectSpecValues(c, specKey);
        return values.some(v => valueSet.has(String(v)));
      });
    }
  }

  // 7. Range filter: outer_diameter
  if (filterParams.min_od !== undefined || filterParams.max_od !== undefined) {
    filtered = filtered.filter(c => {
      const values = getAllNumericValues(c, "outer_diameter");
      return values.some(v =>
        (filterParams.min_od === undefined || v >= filterParams.min_od) &&
        (filterParams.max_od === undefined || v <= filterParams.max_od)
      );
    });
  }

  // 8. Build facets
  const filters = buildFacets(filtered, sizeSystem);

  // 9. Pagination
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

/** Cross-industry text search (for /cables overview). No facet filters applied. */
export function filterCablesByText(params: TextSearchParams): CableListResponse {
  const q = params.q.toLowerCase();
  let filtered = api.cables.all().filter(c =>
    c.model.toLowerCase().includes(q) ||
    c.base_description.toLowerCase().includes(q) ||
    c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))
  );

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

  // Empty facets — overview search has no sidebar
  const filters: FilterFacets = {
    manufacturers: [],
    brands: [],
    size: [],
    size_range: null,
    spec_facets: {},
    outer_diameter: null,
  };

  return { items, total, page, page_size, filters };
}

/** Build facets for a route-scoped cable list. */
function buildFacets(cableList: Cable[], sizeSystem: SizeSystem): FilterFacets {
  const manufacturerCounts = new Map<string, number>();
  const brandCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  const specFacetCounts = new Map<string, Map<string, number>>();
  let minSize = Infinity, maxSize = -Infinity;
  let minOd = Infinity, maxOd = -Infinity;

  // Determine which enum spec_keys to compute facets for (from the fixed product type config)
  // The caller passes sizeSystem; the product type config is looked up by the caller's route.
  // We compute facets for all enum spec_keys that appear in any cable's specs (common + variant)
  // AND are not size/outer_diameter (those have dedicated facet slots).
  const enumSpecKeys = new Set<string>();
  for (const cable of cableList) {
    const allSpecs = [...cable.common_specs, ...cable.variants.flatMap(v => v.specs)];
    for (const s of allSpecs) {
      if (s.key !== "size" && s.key !== "outer_diameter") {
        enumSpecKeys.add(s.key);
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

    // size facet + size_range (from variant specs)
    if (sizeSystem !== "none") {
      for (const v of cable.variants) {
        for (const s of v.specs) {
          if (s.key === "size") {
            const valStr = String(s.value);
            sizeCounts.set(valStr, (sizeCounts.get(valStr) ?? 0) + 1);
            const n = parseSizeValue(valStr);
            if (n !== null) {
              minSize = Math.min(minSize, n);
              maxSize = Math.max(maxSize, n);
            }
          }
        }
      }
    }

    // outer_diameter range
    for (const v of cable.variants) {
      for (const s of v.specs) {
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

  const sizeFacet: { value: string; count: number }[] = Array.from(sizeCounts.entries())
    .map(([value, count]) => ({ value, count }));

  const size_range = (sizeSystem !== "none" && minSize !== Infinity)
    ? { min: minSize, max: maxSize }
    : null;

  const outer_diameter = (minOd !== Infinity) ? { min: minOd, max: maxOd } : null;

  const spec_facets: Record<string, { value: string; count: number }[]> = {};
  for (const [key, m] of specFacetCounts.entries()) {
    spec_facets[key] = Array.from(m.entries()).map(([value, count]) => ({ value, count }));
  }

  return {
    manufacturers,
    brands: brandsList,
    size: sizeFacet,
    size_range,
    spec_facets,
    outer_diameter,
  };
}
```

- [ ] **Step 2: Verify typecheck (filter.ts errors gone; remaining errors in validate.ts, pages, CableFilters)**

Run from `frontend/`:
```bash
npx tsc --noEmit
```

Expected: errors remain in `lib/validate.ts`, `app/cables/page.tsx`, `app/categories/[...slugs]/page.tsx`, `components/cable/CableFilters.tsx`. No new errors in `lib/filter.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/filter.ts
git commit -m "refactor(filter): route-scoped filterCables + applySizeFilter union + filterCablesByText"
```

---

### Task 6: Update lib/validate.ts — new taxonomy rules 5e-5j

**Files:**
- Modify: `frontend/lib/validate.ts`

This task rewrites rules 5b/5c/5d to read from taxonomy instead of filterConfig, adds new rules 5e (category exists), 5f (product_type exists), 5g (size_system consistency), 5h (size filter presence/control), 5i (no conductor_area), 5j (orphan filter warning). Removes `api.filterConfig` references.

- [ ] **Step 1: Replace rules 5b-5d and add 5e-5j**

In `frontend/lib/validate.ts`, locate the block starting with `// 5b. industry + size_system presence and validity` and ending with the close of rule 5d (the `}` after the `if (cable.industry && validIndustries.has(cable.industry))` block). Replace that entire block with:

```typescript
    // 5b. industry presence and validity (now reads from taxonomy)
    const validIndustries = new Set(api.taxonomy.industries().map(i => {
      // Find the key for this industry object
      for (const [k, v] of Object.entries(api.taxonomy.all())) {
        if (v === i) return k;
      }
      return "";
    }));
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

    // 5e. cable.category must exist in taxonomy[industry].categories
    if (cable.industry && validIndustries.has(cable.industry)) {
      const indConfig = api.taxonomy.industry(cable.industry);
      if (indConfig && !indConfig.categories[cable.category]) {
        errors.push({
          file: "cables.json",
          cable_id: cable.id,
          message: `Cable ${cable.id} category "${cable.category}" not found in taxonomy.json under industry "${cable.industry}"`,
          severity: "error",
        });
      }

      // 5f. cable.product_type must exist in taxonomy[industry].categories[category].product_types
      if (indConfig && indConfig.categories[cable.category]) {
        const catConfig = indConfig.categories[cable.category];
        if (!catConfig.product_types[cable.product_type]) {
          errors.push({
            file: "cables.json",
            cable_id: cable.id,
            message: `Cable ${cable.id} product_type "${cable.product_type}" not found in taxonomy.json under ${cable.industry}/${cable.category}`,
            severity: "error",
          });
        }

        // 5g. cable.size_system must equal taxonomy product_type size_system
        const ptConfig = catConfig.product_types[cable.product_type];
        if (ptConfig && ptConfig.size_system !== cable.size_system) {
          errors.push({
            file: "cables.json",
            cable_id: cable.id,
            message: `Cable ${cable.id} size_system "${cable.size_system}" does not match taxonomy product_type size_system "${ptConfig.size_system}" for ${cable.industry}/${cable.category}/${cable.product_type}`,
            severity: "error",
          });
        }
      }
    }

    // 5i. no conductor_area spec (removed in this refactor)
    for (const variant of cable.variants) {
      for (const s of variant.specs) {
        if (s.key === "conductor_area") {
          errors.push({
            file: "cables.json",
            cable_id: cable.id,
            message: `Cable ${cable.id} variant ${variant.slug}: "conductor_area" spec is no longer allowed (use "size" with size_system instead)`,
            severity: "error",
          });
        }
      }
    }
```

- [ ] **Step 2: Add rule 5h (size filter presence/control) and 5j (orphan filter) after the cables loop**

After the closing `}` of the `for (const cable of cables)` loop (but before rule 6), add:

```typescript
  // 5h. For each product_type in taxonomy, size filter presence and control consistency
  for (const [indKey, ind] of Object.entries(api.taxonomy.all())) {
    for (const [catKey, cat] of Object.entries(ind.categories)) {
      for (const [ptKey, pt] of Object.entries(cat.product_types)) {
        const sizeFilters = pt.filters.filter(f => f.spec_key === "size");
        if (pt.size_system === "none") {
          if (sizeFilters.length > 0) {
            errors.push({
              file: "taxonomy.json",
              message: `Product type ${indKey}/${catKey}/${ptKey} has size_system="none" but defines a size filter`,
              severity: "error",
            });
          }
        } else {
          if (sizeFilters.length !== 1) {
            errors.push({
              file: "taxonomy.json",
              message: `Product type ${indKey}/${catKey}/${ptKey} must have exactly one size filter (found ${sizeFilters.length})`,
              severity: "error",
            });
          } else {
            const expectedControl = pt.size_system === "awg" ? "enum" : "enum_range";
            if (sizeFilters[0].control !== expectedControl) {
              errors.push({
                file: "taxonomy.json",
                message: `Product type ${indKey}/${catKey}/${ptKey} size filter has control "${sizeFilters[0].control}" but should be "${expectedControl}" for size_system="${pt.size_system}"`,
                severity: "error",
              });
            }
          }
        }
      }
    }
  }

  // 5j. Warn about orphan filter spec_keys (defined in taxonomy but no cable has that spec)
  for (const [indKey, ind] of Object.entries(api.taxonomy.all())) {
    for (const [catKey, cat] of Object.entries(ind.categories)) {
      for (const [ptKey, pt] of Object.entries(cat.product_types)) {
        const cablesOfThisType = cables.filter(c =>
          c.industry === indKey && c.category === catKey && c.product_type === ptKey
        );
        if (cablesOfThisType.length === 0) continue; // no cables to check against
        for (const f of pt.filters) {
          if (f.spec_key === "size" || f.spec_key === "outer_diameter") continue;
          const anyCableHasSpec = cablesOfThisType.some(c => {
            const allSpecs = [...c.common_specs, ...c.variants.flatMap(v => v.specs)];
            return allSpecs.some(s => s.key === f.spec_key);
          });
          if (!anyCableHasSpec) {
            errors.push({
              file: "taxonomy.json",
              message: `Product type ${indKey}/${catKey}/${ptKey} defines filter "${f.spec_key}" but no cable has that spec (orphan filter)`,
              severity: "warning",
            });
          }
        }
      }
    }
  }
```

- [ ] **Step 3: Run validation**

Run from `frontend/`:
```bash
npm run validate
```

Expected: `✓ Data validation passed.` with possibly some warnings (orphan filters for product types that have cables but the cable doesn't have a spec the filter expects). If there are errors, investigate — likely a cable's category/product_type/size_system doesn't match taxonomy.

Note: rule 5j may produce warnings for forward-looking filters (e.g., `rated_voltage` on automotive_wire if AVSS doesn't have that spec). Warnings are acceptable and do not block the build.

- [ ] **Step 4: Verify typecheck**

Run from `frontend/`:
```bash
npx tsc --noEmit
```

Expected: no errors in `lib/validate.ts`. Remaining errors in `app/cables/page.tsx`, `app/categories/[...slugs]/page.tsx`, `components/cable/CableFilters.tsx`.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/validate.ts
git commit -m "refactor(validate): add taxonomy rules 5e-5j, remove filterConfig references"
```

---

### Task 7: Update lib/seo.ts — new taxonomy metadata generators

**Files:**
- Modify: `frontend/lib/seo.ts`

This task adds `generateIndustryMetadata`, `generateProductTypeMetadata`, and replaces `generateCategoryMetadata` (which currently takes the old `Category` type) with a new overload that takes `TaxonomyIndustry` + `TaxonomyCategory`. The old `generateCategoryMetadata(category: Category)` signature is removed; callers (the legacy `/categories/[...slugs]` page) will be rewritten in Task 12 to not call it.

- [ ] **Step 1: Update imports**

In `frontend/lib/seo.ts`, replace the import line:

```typescript
import type { Cable, Category, Manufacturer, Brand } from './types';
```

with:

```typescript
import type {
  Cable, Category, Manufacturer, Brand,
  TaxonomyIndustry, TaxonomyCategory, ProductTypeConfig,
} from './types';
```

Note: `Category` is still imported because `buildCableJsonLd` uses it for the category path. Keep it.

- [ ] **Step 2: Replace generateCategoryMetadata and add new generators**

Replace the existing `generateCategoryMetadata` function:

```typescript
// === Category Metadata ===
export function generateCategoryMetadata(category: Category): Metadata {
  const pathSlugs = getCategoryPathSlugs(category.id);
  const title = `${category.name} Cables`;
  const description = `Browse cables in the ${category.name} category.`;
  return {
    title,
    description,
    alternates: { canonical: `/categories/${pathSlugs.join('/')}` },
    robots: { index: true, follow: true },
  };
}
```

with:

```typescript
// === Taxonomy Metadata ===
export function generateIndustryMetadata(industry: TaxonomyIndustry): Metadata {
  return {
    title: `${industry.label} Cables`,
    description: industry.description,
    alternates: { canonical: `/cables/${industry.slug}` },
    robots: { index: true, follow: true },
  };
}

export function generateCategoryMetadata(
  industry: TaxonomyIndustry,
  category: TaxonomyCategory
): Metadata {
  return {
    title: `${category.label} | ${industry.label} Cables`,
    description: `Browse ${category.label.toLowerCase()} cables for ${industry.label.toLowerCase()} applications.`,
    alternates: { canonical: `/cables/${industry.slug}/${category.slug}` },
    robots: { index: true, follow: true },
  };
}

export function generateProductTypeMetadata(
  industry: TaxonomyIndustry,
  category: TaxonomyCategory,
  productType: ProductTypeConfig
): Metadata {
  const filterLabels = productType.filters.map(f => f.label.toLowerCase()).join(', ');
  return {
    title: `${productType.label} | ${category.label} | ${industry.label}`,
    description: `Browse ${productType.label.toLowerCase()} cables. Filter by ${filterLabels}.`,
    alternates: { canonical: `/cables/${industry.slug}/${category.slug}/${productType.slug}` },
    robots: { index: true, follow: true },
  };
}
```

- [ ] **Step 3: Update generateCablesListMetadata description**

Replace the existing `generateCablesListMetadata`:

```typescript
// === Cables List Metadata ===
export function generateCablesListMetadata(): Metadata {
  return {
    title: 'Cable Directory',
    description: 'Browse all cables. Filter by industry, manufacturer, brand, size, conductor area, and outer diameter.',
    alternates: { canonical: '/cables' },
    robots: { index: true, follow: true },
  };
}
```

with:

```typescript
// === Cables Overview Metadata ===
export function generateCablesListMetadata(): Metadata {
  return {
    title: 'Cable Directory',
    description: 'Browse cables by industry. Select an industry to explore its categories and product types.',
    alternates: { canonical: '/cables' },
    robots: { index: true, follow: true },
  };
}
```

- [ ] **Step 4: Verify typecheck**

Run from `frontend/`:
```bash
npx tsc --noEmit
```

Expected: `lib/seo.ts` compiles. Error in `app/categories/[...slugs]/page.tsx` (still calls old `generateCategoryMetadata(category)` signature) — will be fixed in Task 12.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/seo.ts
git commit -m "refactor(seo): add taxonomy metadata generators (industry/category/productType)"
```

---

### Task 8: Remove conductor_area references from CableCard.tsx

**Files:**
- Modify: `frontend/components/cable/CableCard.tsx`

This task removes the `areaSpec` and `vArea` references from CableCard since `conductor_area` is no longer a spec key. The mini spec table and variant preview no longer show an "Area" row.

- [ ] **Step 1: Remove areaSpec lookup and rendering**

In `frontend/components/cable/CableCard.tsx`, delete the line:

```typescript
  const areaSpec = primaryVariant ? findVariantSpec(primaryVariant, "conductor_area") : null;
```

Delete the block:

```tsx
          {areaSpec && (
            <div className="flex justify-between">
              <span className="text-gray-500">Area</span>
              <span className="text-gray-900">{formatSpecValue(areaSpec)}</span>
            </div>
          )}
```

- [ ] **Step 2: Remove vArea from variant preview**

In the variant preview map, replace:

```tsx
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
```

with:

```tsx
              {cable.variants.slice(0, 3).map(v => {
                const vSize = findVariantSpec(v, "size");
                return (
                  <div key={v.slug} className="flex justify-between text-xs">
                    <span className="text-gray-600">
                      {vSize ? formatSizeValue(cable.size_system, String(vSize.value), vSize.unit) : "—"}
                    </span>
                    <span className="text-gray-400">·</span>
                  </div>
                );
              })}
```

- [ ] **Step 3: Remove unused import formatSpecValue if no longer used**

Check if `formatSpecValue` is still used in the file. It was used for `areaSpec` and `odSpec`. After removing `areaSpec`, check `odSpec` usage — it still uses `formatSpecValue`. So keep the import.

- [ ] **Step 4: Verify typecheck**

Run from `frontend/`:
```bash
npx tsc --noEmit
```

Expected: no new errors in `CableCard.tsx`.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/cable/CableCard.tsx
git commit -m "refactor(CableCard): remove conductor_area references"
```

---

### Task 9: Rewrite CableFilters.tsx — route-scoped, enum_range rendering

**Files:**
- Modify: `frontend/components/cable/CableFilters.tsx`

This task rewrites CableFilters to accept `industry` + `category` + `productType` props, read filters from `api.taxonomy.productType(...)`, remove Industry/Category facet groups, use `usePathname()` for basePath, and render `enum_range` size filters with both checkboxes and min/max inputs.

- [ ] **Step 1: Replace the entire file content**

Replace `frontend/components/cable/CableFilters.tsx` with:

```tsx
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';
import type { FilterFacets } from '@/lib/types';
import { api } from '@/lib/api';
import { formatSizeLabel } from '@/lib/utils';

interface CableFiltersProps {
  facets: FilterFacets;
  industry: string;
  category: string;
  productType: string;
}

function CableFiltersInner({ facets, industry, category, productType }: CableFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const ptConfig = api.taxonomy.productType(industry, category, productType);
  if (!ptConfig) return null;

  const sizeFilter = ptConfig.filters.find(f => f.spec_key === "size");
  const sizeSystem = ptConfig.size_system;
  const sizeControl = sizeFilter?.control; // "enum" | "enum_range" | undefined (none)

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
    router.push(`${pathname}?${params.toString()}`);
  }, [router, searchParams, pathname]);

  const setNumericParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }, [router, searchParams, pathname]);

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

  // Enum spec keys from product type config (exclude size + outer_diameter which have dedicated UI)
  const enumSpecKeys: string[] = ptConfig.filters
    .filter(f => f.control === "enum" && f.spec_key !== "size" && f.spec_key !== "outer_diameter")
    .map(f => f.spec_key);

  // Build a lookup for filter labels
  const filterLabelByKey = new Map<string, string>();
  for (const f of ptConfig.filters) filterLabelByKey.set(f.spec_key, f.label);

  return (
    <aside className="w-52 shrink-0 space-y-5">
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

      {/* Size (enum only for awg; enum + range for mm2/kcmil; hidden for none) */}
      {sizeControl === "enum" && facets.size.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">{sizeFilter!.label}</h3>
          {renderCheckboxGroup('size', facets.size.map(e => ({ value: e.value, label: e.value, count: e.count })))}
        </div>
      )}
      {sizeControl === "enum_range" && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">
            {sizeFilter!.label}{sizeFilter!.unit ? ` (${sizeFilter!.unit})` : ''}
          </h3>
          {facets.size.length > 0 && (
            <div className="mb-2">
              {renderCheckboxGroup('size', facets.size.map(e => ({ value: e.value, label: e.value, count: e.count })))}
            </div>
          )}
          {facets.size_range && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                placeholder={`min ${facets.size_range.min}`}
                value={searchParams.get('min_size') ?? ''}
                onChange={e => setNumericParam('min_size', e.target.value)}
                className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
              />
              <span className="text-gray-400">—</span>
              <input
                type="number"
                step="0.01"
                placeholder={`max ${facets.size_range.max}`}
                value={searchParams.get('max_size') ?? ''}
                onChange={e => setNumericParam('max_size', e.target.value)}
                className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
              />
            </div>
          )}
        </div>
      )}

      {/* Outer Diameter (range) */}
      {facets.outer_diameter && (
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
      )}

      {/* Config-driven enum spec filters (shielding, jacket, core_structure, etc.) */}
      {enumSpecKeys.map(specKey => {
        const facetEntries = facets.spec_facets[specKey];
        if (!facetEntries || facetEntries.length === 0) return null;
        const label = filterLabelByKey.get(specKey) ?? specKey;
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

Run from `frontend/`:
```bash
npx tsc --noEmit
```

Expected: no errors in `CableFilters.tsx`. Remaining errors in `app/cables/page.tsx` and `app/categories/[...slugs]/page.tsx` (they pass the old `facets` without the new props, and reference removed facet fields).

- [ ] **Step 3: Commit**

```bash
git add frontend/components/cable/CableFilters.tsx
git commit -m "refactor(CableFilters): route-scoped, read from taxonomy, enum_range rendering"
```

---

### Task 10: Create 3 taxonomy card components

**Files:**
- Create: `frontend/components/taxonomy/IndustryCard.tsx`
- Create: `frontend/components/taxonomy/CategoryCard.tsx`
- Create: `frontend/components/taxonomy/ProductTypeCard.tsx`

This task creates the three card components used on the overview, industry, and category pages. Each card links to the next level down in the taxonomy.

- [ ] **Step 1: Create IndustryCard.tsx**

Create `frontend/components/taxonomy/IndustryCard.tsx`:

```tsx
import Link from 'next/link';
import type { TaxonomyIndustry } from '@/lib/types';

interface IndustryCardProps {
  industry: TaxonomyIndustry;
  categoryCount: number;
  cableCount: number;
}

export function IndustryCard({ industry, categoryCount, cableCount }: IndustryCardProps) {
  return (
    <Link
      href={`/cables/${industry.slug}`}
      className="block border rounded-lg p-4 hover:shadow-md transition bg-white"
    >
      <h3 className="font-semibold text-gray-900 mb-1">{industry.label}</h3>
      <p className="text-xs text-gray-600 mb-3 line-clamp-2">{industry.description}</p>
      <div className="flex gap-3 text-xs text-gray-500">
        <span>{categoryCount} categor{categoryCount !== 1 ? 'ies' : 'y'}</span>
        <span>·</span>
        <span>{cableCount} cable{cableCount !== 1 ? 's' : ''}</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create CategoryCard.tsx**

Create `frontend/components/taxonomy/CategoryCard.tsx`:

```tsx
import Link from 'next/link';
import type { TaxonomyIndustry, TaxonomyCategory } from '@/lib/types';

interface CategoryCardProps {
  industry: TaxonomyIndustry;
  category: TaxonomyCategory;
  productTypeCount: number;
  cableCount: number;
}

export function CategoryCard({ industry, category, productTypeCount, cableCount }: CategoryCardProps) {
  return (
    <Link
      href={`/cables/${industry.slug}/${category.slug}`}
      className="block border rounded-lg p-4 hover:shadow-md transition bg-white"
    >
      <h3 className="font-semibold text-gray-900 mb-1">{category.label}</h3>
      <div className="flex gap-3 text-xs text-gray-500">
        <span>{productTypeCount} product type{productTypeCount !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>{cableCount} cable{cableCount !== 1 ? 's' : ''}</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Create ProductTypeCard.tsx**

Create `frontend/components/taxonomy/ProductTypeCard.tsx`:

```tsx
import Link from 'next/link';
import type { TaxonomyIndustry, TaxonomyCategory, ProductTypeConfig } from '@/lib/types';
import { formatSizeLabel } from '@/lib/utils';

interface ProductTypeCardProps {
  industry: TaxonomyIndustry;
  category: TaxonomyCategory;
  productType: ProductTypeConfig;
  cableCount: number;
}

export function ProductTypeCard({ industry, category, productType, cableCount }: ProductTypeCardProps) {
  const sizeBadge = productType.size_system !== "none" ? formatSizeLabel(productType.size_system) : null;
  return (
    <Link
      href={`/cables/${industry.slug}/${category.slug}/${productType.slug}`}
      className="block border rounded-lg p-4 hover:shadow-md transition bg-white"
    >
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-semibold text-gray-900">{productType.label}</h3>
        {sizeBadge && <span className="text-xs text-gray-500">{sizeBadge}</span>}
      </div>
      <p className="text-xs text-gray-500">{cableCount} cable{cableCount !== 1 ? 's' : ''}</p>
    </Link>
  );
}
```

- [ ] **Step 4: Verify typecheck**

Run from `frontend/`:
```bash
npx tsc --noEmit
```

Expected: no errors in the new files. Remaining errors in `app/cables/page.tsx` and `app/categories/[...slugs]/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/taxonomy/
git commit -m "feat(components): add IndustryCard, CategoryCard, ProductTypeCard"
```

---

### Task 11: Create 3 new pages + rewrite /cables overview

**Files:**
- Rewrite: `frontend/app/cables/page.tsx`
- Create: `frontend/app/cables/[industry]/page.tsx`
- Create: `frontend/app/cables/[industry]/[category]/page.tsx`
- Create: `frontend/app/cables/[industry]/[category]/[product-type]/page.tsx`

This task creates the 4-layer routing: overview (rewrite), industry, category, and product-type (main query) pages. The product-type page is the main query page that uses `filterCables` + `CableFilters` + `CableCard` + `Pagination`.

- [ ] **Step 1: Rewrite /cables overview page**

Replace the entire content of `frontend/app/cables/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableCard } from '@/components/cable/CableCard';
import { IndustryCard } from '@/components/taxonomy/IndustryCard';
import { Pagination } from '@/components/shared/Pagination';
import { SearchBox } from '@/components/shared/SearchBox';
import { api } from '@/lib/api';
import { filterCablesByText } from '@/lib/filter';
import { generateCablesListMetadata } from '@/lib/seo';

export function generateMetadata(): Metadata {
  return generateCablesListMetadata();
}

interface SearchParams {
  q?: string;
  page?: string;
  [key: string]: string | undefined;
}

export default async function CablesOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  // Cross-industry text search mode
  if (sp.q) {
    const page = parseInt(sp.page || '1');
    const result = filterCablesByText({ q: sp.q, page, page_size: 16 });
    const totalPages = Math.ceil(result.total / result.page_size);
    return (
      <Container className="py-6">
        <Breadcrumbs items={[
          { name: 'Home', url: '/' },
          { name: 'Cables', url: '/cables' },
          { name: `Search: ${sp.q}` },
        ]} />
        <h1 className="text-2xl font-bold mb-1">Search Results</h1>
        <p className="text-sm text-gray-600 mb-4">
          {result.total} cable{result.total !== 1 ? 's' : ''} matching &ldquo;{sp.q}&rdquo;
        </p>
        <div className="mb-6">
          <SearchBox />
        </div>
        {result.items.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="mb-4">No cables found. Try a different search term.</p>
            <a href="/cables" className="text-blue-600 hover:underline text-sm">Back to Cable Directory</a>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {result.items.map(item => (
                <CableCard
                  key={item.cable.id}
                  cable={item.cable}
                  brand={item.brand}
                  manufacturer={item.manufacturer}
                />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              basePath="/cables"
              searchParams={{ q: sp.q }}
            />
          </>
        )}
      </Container>
    );
  }

  // Default: industry cards
  const industries = api.taxonomy.industries();
  const allCables = api.cables.all();
  const stats = industries.map(ind => {
    // Find the industry key by slug match
    let industryKey = "";
    for (const [k, v] of Object.entries(api.taxonomy.all())) {
      if (v === ind) { industryKey = k; break; }
    }
    const cableCount = allCables.filter(c => c.industry === industryKey).length;
    const categoryCount = Object.keys(ind.categories).length;
    return { industry: ind, categoryCount, cableCount };
  });

  return (
    <Container className="py-6">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables' },
      ]} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Cable Directory</h1>
        <p className="text-sm text-gray-600 mb-4">
          Browse cables by industry. Select an industry to explore its categories and product types.
        </p>
        <SearchBox />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(s => (
          <IndustryCard
            key={s.industry.slug}
            industry={s.industry}
            categoryCount={s.categoryCount}
            cableCount={s.cableCount}
          />
        ))}
      </div>
    </Container>
  );
}
```

- [ ] **Step 2: Create industry page**

Create `frontend/app/cables/[industry]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CategoryCard } from '@/components/taxonomy/CategoryCard';
import { api } from '@/lib/api';
import { generateIndustryMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: { params: Promise<{ industry: string }> }): Promise<Metadata> {
  const { industry: industrySlug } = await params;
  const industryKey = api.taxonomy.industryKeyBySlug(industrySlug);
  if (!industryKey) return { title: 'Not Found' };
  const industry = api.taxonomy.industry(industryKey)!;
  return generateIndustryMetadata(industry);
}

export default async function IndustryPage({ params }: { params: Promise<{ industry: string }> }) {
  const { industry: industrySlug } = await params;
  const industryKey = api.taxonomy.industryKeyBySlug(industrySlug);
  if (!industryKey) notFound();
  const industry = api.taxonomy.industry(industryKey)!;

  const allCables = api.cables.all();
  const categories = Object.entries(industry.categories).map(([key, cat]) => {
    const productTypeCount = Object.keys(cat.product_types).length;
    const cableCount = allCables.filter(c => c.industry === industryKey && c.category === key).length;
    return { categoryKey: key, category: cat, productTypeCount, cableCount };
  });

  return (
    <Container className="py-6">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: industry.label },
      ]} />

      <h1 className="text-2xl font-bold mb-1">{industry.label}</h1>
      <p className="text-sm text-gray-600 mb-6">{industry.description}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map(c => (
          <CategoryCard
            key={c.categoryKey}
            industry={industry}
            category={c.category}
            productTypeCount={c.productTypeCount}
            cableCount={c.cableCount}
          />
        ))}
      </div>
    </Container>
  );
}
```

- [ ] **Step 3: Create category page**

Create `frontend/app/cables/[industry]/[category]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { ProductTypeCard } from '@/components/taxonomy/ProductTypeCard';
import { api } from '@/lib/api';
import { generateCategoryMetadata } from '@/lib/seo';
import type { TaxonomyIndustry, TaxonomyCategory } from '@/lib/types';

export async function generateMetadata({
  params,
}: { params: Promise<{ industry: string; category: string }> }): Promise<Metadata> {
  const { industry: industrySlug, category: categorySlug } = await params;
  const industryKey = api.taxonomy.industryKeyBySlug(industrySlug);
  if (!industryKey) return { title: 'Not Found' };
  const categoryKey = api.taxonomy.categoryKeyBySlug(industryKey, categorySlug);
  if (!categoryKey) return { title: 'Not Found' };
  const industry = api.taxonomy.industry(industryKey)!;
  const category = api.taxonomy.category(industryKey, categoryKey)!;
  return generateCategoryMetadata(industry, category);
}

export default async function CategoryPage({
  params,
}: { params: Promise<{ industry: string; category: string }> }) {
  const { industry: industrySlug, category: categorySlug } = await params;
  const industryKey = api.taxonomy.industryKeyBySlug(industrySlug);
  if (!industryKey) notFound();
  const categoryKey = api.taxonomy.categoryKeyBySlug(industryKey, categorySlug);
  if (!categoryKey) notFound();
  const industry = api.taxonomy.industry(industryKey)!;
  const category = api.taxonomy.category(industryKey, categoryKey)!;

  const allCables = api.cables.all();
  const productTypes = Object.entries(category.product_types).map(([key, pt]) => {
    const cableCount = allCables.filter(c =>
      c.industry === industryKey && c.category === categoryKey && c.product_type === key
    ).length;
    return { productTypeKey: key, productType: pt, cableCount };
  });

  return (
    <Container className="py-6">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: industry.label, url: `/cables/${industrySlug}` },
        { name: category.label },
      ]} />

      <h1 className="text-2xl font-bold mb-6">{category.label}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {productTypes.map(pt => (
          <ProductTypeCard
            key={pt.productTypeKey}
            industry={industry}
            category={category}
            productType={pt.productType}
            cableCount={pt.cableCount}
          />
        ))}
      </div>
    </Container>
  );
}
```

- [ ] **Step 4: Create product-type query page**

Create `frontend/app/cables/[industry]/[category]/[product-type]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableCard } from '@/components/cable/CableCard';
import { CableFilters } from '@/components/cable/CableFilters';
import { Pagination } from '@/components/shared/Pagination';
import { api } from '@/lib/api';
import { filterCables } from '@/lib/filter';
import { generateProductTypeMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: { params: Promise<{ industry: string; category: string; 'product-type': string }> }): Promise<Metadata> {
  const { industry: industrySlug, category: categorySlug, 'product-type': ptSlug } = await params;
  const found = api.taxonomy.findBySlug(industrySlug, categorySlug, ptSlug);
  if (!found) return { title: 'Not Found' };
  return generateProductTypeMetadata(found.industry, found.category, found.productType);
}

interface SearchParams {
  q?: string;
  manufacturer?: string;
  brand?: string;
  size?: string;
  min_size?: string;
  max_size?: string;
  min_od?: string;
  max_od?: string;
  page?: string;
  // config-driven enum spec filters
  [key: string]: string | undefined;
}

function parseArrayParam(sp: SearchParams, key: keyof SearchParams): string[] | undefined {
  const val = sp[key];
  if (val === undefined) return undefined;
  return Array.isArray(val) ? val : [val];
}

export default async function ProductTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ industry: string; category: string; 'product-type': string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { industry: indSlug, category: catSlug, 'product-type': ptSlug } = await params;
  const found = api.taxonomy.findBySlug(indSlug, catSlug, ptSlug);
  if (!found) notFound();
  const { industry, category, productType, industryKey, categoryKey, productTypeKey } = found;

  const sp = await searchParams;
  const page = parseInt(sp.page || '1');

  // Pack config-driven enum spec filters from search params.
  // Known non-spec keys are excluded; everything else that appears in the product type's
  // filter config as an enum filter (except size + outer_diameter) is packed into spec_filters.
  const knownKeys = new Set([
    'q', 'manufacturer', 'brand', 'size', 'min_size', 'max_size',
    'min_od', 'max_od', 'page',
  ]);
  const specFilters: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (knownKeys.has(key) || value === undefined) continue;
    specFilters[key] = Array.isArray(value) ? value : [value];
  }

  const result = filterCables({
    industry: industryKey,
    category: categoryKey,
    product_type: productTypeKey,
    q: sp.q,
    manufacturer: parseArrayParam(sp, 'manufacturer'),
    brand: parseArrayParam(sp, 'brand'),
    size: parseArrayParam(sp, 'size'),
    min_size: sp.min_size ? parseFloat(sp.min_size) : undefined,
    max_size: sp.max_size ? parseFloat(sp.max_size) : undefined,
    spec_filters: Object.keys(specFilters).length > 0 ? specFilters : undefined,
    min_od: sp.min_od ? parseFloat(sp.min_od) : undefined,
    max_od: sp.max_od ? parseFloat(sp.max_od) : undefined,
    page,
    page_size: 16,
  });

  const totalPages = Math.ceil(result.total / result.page_size);
  const basePath = `/cables/${indSlug}/${catSlug}/${ptSlug}`;

  return (
    <Container className="py-6">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: industry.label, url: `/cables/${indSlug}` },
        { name: category.label, url: `/cables/${indSlug}/${catSlug}` },
        { name: productType.label },
      ]} />

      <div className="mb-4">
        <h1 className="text-2xl font-bold">{productType.label}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {result.total} cable{result.total !== 1 ? 's' : ''} in {category.label} · {industry.label}
        </p>
      </div>

      <div className="flex gap-6">
        <CableFilters
          facets={result.filters}
          industry={industryKey}
          category={categoryKey}
          productType={productTypeKey}
        />
        <div className="flex-1 min-w-0">
          {result.items.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="mb-4">No cables found. Try adjusting your filters.</p>
              <a href={basePath} className="text-blue-600 hover:underline text-sm">Clear all filters</a>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {result.items.map(item => (
                  <CableCard
                    key={item.cable.id}
                    cable={item.cable}
                    brand={item.brand}
                    manufacturer={item.manufacturer}
                  />
                ))}
              </div>
              <div className="mt-6">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  basePath={basePath}
                  searchParams={sp as Record<string, string | undefined>}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
```

- [ ] **Step 5: Verify typecheck**

Run from `frontend/`:
```bash
npx tsc --noEmit
```

Expected: no errors in the new/rewritten page files. Remaining errors in `app/categories/[...slugs]/page.tsx` (will be fixed in Task 12).

- [ ] **Step 6: Run validation**

Run from `frontend/`:
```bash
npm run validate
```

Expected: `✓ Data validation passed.` (with possible warnings).

- [ ] **Step 7: Commit**

```bash
git add frontend/app/cables/
git commit -m "feat(routing): add industry/category/product-type pages, rewrite /cables overview"
```

---

### Task 12: Rewrite /categories/[...slugs] as redirect; update sitemap; final build

**Files:**
- Rewrite: `frontend/app/categories/[...slugs]/page.tsx`
- Modify: `frontend/app/sitemap.ts`
- Delete: `frontend/data/filter-config.json`

This task rewrites the legacy category page as a 308 redirect to the new taxonomy routes, updates the sitemap to enumerate taxonomy routes, deletes the now-unused `filter-config.json`, and runs the final build verification.

- [ ] **Step 1: Rewrite /categories/[...slugs] as redirect**

Replace the entire content of `frontend/app/categories/[...slugs]/page.tsx`:

```tsx
import { permanentRedirect, notFound } from 'next/navigation';

// Legacy /categories/[...slugs] → new /cables/[industry]/[category] routes.
// 9 entries mapped from the old categories.json node structure.
const LEGACY_REDIRECTS: Record<string, string> = {
  'automotive': '/cables/automotive-ev',
  'automotive/wiring-harness': '/cables/automotive-ev/automotive',
  'automotive/wiring-harness/pvc-insulated': '/cables/automotive-ev/automotive',
  'automotive/wiring-harness/pvc-insulated/thin-wall': '/cables/automotive-ev/automotive',
  'consumer-electronics': '/cables/consumer-electronics',
  'consumer-electronics/internal-wiring': '/cables/consumer-electronics/internal-wiring',
  'consumer-electronics/internal-wiring/pvc-insulated': '/cables/consumer-electronics/internal-wiring',
  'industrial': '/cables/utility',
  'industrial/power-transmission': '/cables/utility/power-transmission',
};

export default async function LegacyCategoryPage({
  params,
}: { params: Promise<{ slugs: string[] }> }) {
  const { slugs } = await params;
  const key = slugs.join('/');
  const target = LEGACY_REDIRECTS[key];
  if (target) {
    permanentRedirect(target);  // 308 permanent redirect
  }
  notFound();
}
```

- [ ] **Step 2: Update sitemap.ts to enumerate taxonomy routes**

Replace the entire content of `frontend/app/sitemap.ts`:

```tsx
import type { MetadataRoute } from 'next';
import { api, getCableUrl } from '@/lib/api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const cables = api.cables.all();
  const taxonomy = api.taxonomy.all();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/cables`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
  ];

  // Taxonomy routes: industries, categories, product types
  const taxonomyPages: MetadataRoute.Sitemap = [];
  for (const ind of Object.values(taxonomy)) {
    taxonomyPages.push({
      url: `${SITE_URL}/cables/${ind.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    });
    for (const cat of Object.values(ind.categories)) {
      taxonomyPages.push({
        url: `${SITE_URL}/cables/${ind.slug}/${cat.slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      });
      for (const pt of Object.values(cat.product_types)) {
        taxonomyPages.push({
          url: `${SITE_URL}/cables/${ind.slug}/${cat.slug}/${pt.slug}`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.6,
        });
      }
    }
  }

  const cablePages: MetadataRoute.Sitemap = cables.map(cable => ({
    url: `${SITE_URL}${getCableUrl(cable)}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [...staticPages, ...taxonomyPages, ...cablePages];
}
```

- [ ] **Step 3: Delete filter-config.json**

Delete the file `frontend/data/filter-config.json`.

- [ ] **Step 4: Remove unused old filter config types from types.ts**

In `frontend/lib/types.ts`, delete the now-unused type definitions:

```typescript
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

These are superseded by `TaxonomyFilter`, `ProductTypeConfig`, and `Taxonomy` from Task 1.

- [ ] **Step 5: Verify typecheck**

Run from `frontend/`:
```bash
npx tsc --noEmit
```

Expected: 0 errors. If errors remain, they indicate a missed reference to `filter-config.json`, `FilterConfigEntry`, `TypeFilterConfig`, `IndustryFilterConfig`, or old `generateCategoryMetadata(category: Category)` — fix them.

- [ ] **Step 6: Run validation**

Run from `frontend/`:
```bash
npm run validate
```

Expected: `✓ Data validation passed.` (warnings about orphan filters are acceptable).

- [ ] **Step 7: Run build**

Run from `frontend/`:
```bash
npm run build
```

Expected: successful build. Route table should include:
- `/cables` (static)
- `/cables/[industry]` (dynamic)
- `/cables/[industry]/[category]` (dynamic)
- `/cables/[industry]/[category]/[product-type]` (dynamic)
- `/cables/[brand_slug]/[slug]` (dynamic + ISR)
- `/categories/[...slugs]` (dynamic, redirect)
- `/api/cables/[brand_slug]/[slug]` (dynamic)
- `/sitemap.xml`, `/robots.txt`

- [ ] **Step 8: Smoke test with dev server**

Start the dev server:
```bash
npm run dev
```

In a separate terminal, run these curl smoke tests (all should return 200):
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/cables
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/cables/consumer-electronics
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/cables/consumer-electronics/internal-wiring
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/cables/consumer-electronics/internal-wiring/electronic-wire
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/cables/automotive-ev/automotive/automotive-wire
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/cables/consumer-electronics/internal-wiring/electronic-wire?size=24"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/cables/hitachi/ul1007
```

Expected: all return `200`.

Verify redirect (should return 308):
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/categories/automotive
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/categories/industrial
```

Expected: both return `308`.

Verify 404 for invalid taxonomy slugs:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/cables/nonexistent-industry
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/cables/consumer-electronics/nonexistent-category
```

Expected: both return `404`.

Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add frontend/app/categories/[...slugs]/page.tsx frontend/app/sitemap.ts frontend/lib/types.ts
git rm frontend/data/filter-config.json
git commit -m "feat(routing): legacy category redirects, sitemap taxonomy routes, remove filter-config.json"
```

---

## Self-Review Checklist

After all 12 tasks complete, verify:

1. **Spec coverage:**
   - §3 Routing: Tasks 1-2 (data), 4-5 (lib), 9-11 (components/pages) ✓
   - §4 Data Model: Task 2 (taxonomy.json), Task 3 (cables migration) ✓
   - §5 Types: Task 1 ✓
   - §6 lib Layer: Task 4 (api), Task 5 (filter), Task 6 (validate), Task 7 (seo) ✓
   - §7 Components: Task 8 (CableCard), Task 9 (CableFilters), Task 10 (3 cards) ✓
   - §8 Pages: Task 11 (4 pages), Task 12 (redirect) ✓
   - §9 File Operations: all covered ✓
   - §10 Migration: Task 3 ✓
   - §11 Verification: Task 12 Step 7-8 ✓

2. **Type consistency:**
   - `TaxonomyIndustry`, `TaxonomyCategory`, `ProductTypeConfig` used consistently across Tasks 1, 4, 7, 10, 11 ✓
   - `CableQueryParams.industry/category/product_type` (route params) consistent across Tasks 1, 5, 11 ✓
   - `FilterFacets.size_range` and `outer_diameter` nullable — handled in Task 9 (conditional rendering) ✓
   - `api.taxonomy.findBySlug` returns `{ industry, category, productType, industryKey, categoryKey, productTypeKey }` — used in Task 11 ✓

3. **Placeholder scan:** No TBD/TODO. All steps have complete code. ✓
