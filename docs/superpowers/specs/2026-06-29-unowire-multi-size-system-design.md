# Unowire Multi-Size-System Design

> **For agentic workers:** This spec defines a data-model and UI change. Implementation plan will be generated via the writing-plans skill.

**Goal:** Extend the cable data model to support multiple wire sizing systems (AWG / metric mm² / kcmil) and organize cables by industry, so the catalog can grow beyond electronic wire to include automotive, industrial power, and telecom cables (including fiber optic).

**Architecture:** Add an `industry` field as the top-level dimension and a `size_system` field per cable. Replace the hardcoded `awg` spec key with a unified `size` key. Move filter configuration into a data-driven JSON file (`data/filter-config.json`) organized by industry → type, so filter sets can be modified without touching component code. Remove the CableCard size badge — size is shown only as a spec row in the card body.

**Tech Stack:** Next.js 16 (App Router), TypeScript, static JSON data, Tailwind CSS.

---

## Background

The current data model assumes every cable variant has an `awg` spec. The `CableCard` component hardcodes an `AWG {value}` badge in the top-right corner, and `CableFilters` renders a fixed set of filter groups including a dedicated AWG group. This works for the 6 existing electronic/automotive wires (all AWG 14–26) but breaks for:

- Large cross-section power cables (≥ AWG 4/0) that use metric mm² (e.g., 240 mm²) or kcmil/MCM (e.g., 500 kcmil)
- Fiber optic cables that have no wire-gauge size at all
- Industry-specific filter needs (power cables need `voltage_class`; electronic wires need `shielding`; fiber needs `wavelength`)

---

## 1. Data Model Changes

### 1.1 New types in `lib/types.ts`

```typescript
export type Industry = "automotive" | "consumer_electronics" | "industrial_power" | "telecom";

export type SizeSystem = "awg" | "mm2" | "kcmil" | "none";
```

### 1.2 Cable interface additions

```typescript
export interface Cable {
  // ...existing fields...
  industry: Industry;        // NEW — top-level dimension
  size_system: SizeSystem;   // NEW — determines size label/filter rendering
  // ...
}
```

`industry` and `size_system` are cable-level (not variant-level) because all variants of a cable share the same industry and sizing system.

### 1.3 Variant spec key rename

The variant spec key `awg` is renamed to `size`. The `label` field is populated per the cable's `size_system`:

| size_system | label example | value example | unit |
|---|---|---|---|
| `awg` | `"AWG"` | `"24"` | `null` |
| `mm2` | `"Cross-Section"` | `"240"` | `"mm²"` |
| `kcmil` | `"kcmil"` | `"500"` | `null` |
| `none` | (no size spec) | — | — |

For `size_system: "none"` (fiber optic), the variant has no `size` spec at all — fiber attributes (core_type, wavelength) are stored as regular specs.

### 1.4 Filter config type

```typescript
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

### 1.5 Query params and facets update

```typescript
export interface CableQueryParams {
  q?: string;
  manufacturer?: string[];
  brand?: string[];
  category?: string[];
  industry?: Industry[];          // NEW (replaces implicit type filtering)
  size?: string[];                // RENAMED from awg
  min_area?: number;
  max_area?: number;
  min_od?: number;
  max_od?: number;
  shielding?: string[];
  jacket?: string[];
  core_structure?: string[];
  insulation_material?: string[]; // NEW — was hardcoded facet, now config-driven
  voltage_class?: string[];       // NEW — for power cables
  temperature_rating?: string[];  // NEW — for automotive/electronic
  impedance?: string[];           // NEW — for telecom
  wavelength?: string[];          // NEW — for fiber optic
  page: number;
  page_size: number;
}

export interface FilterFacets {
  manufacturers: { id: string; name: string; count: number }[];
  brands: { id: string; name: string; count: number }[];
  categories: { id: string; name: string; level: number; count: number }[];
  industries: { value: Industry; count: number }[];   // NEW
  size: { value: string; count: number }[];           // RENAMED from awg
  conductor_area: { min: number; max: number };
  outer_diameter: { min: number; max: number };
  shielding: { value: string; count: number }[];
  jacket: { value: string; count: number }[];
  core_structure: { value: string; count: number }[];
  insulation_material: { value: string; count: number }[];  // NEW
  voltage_class: { value: string; count: number }[];        // NEW
  temperature_rating: { value: string; count: number }[];   // NEW
  impedance: { value: string; count: number }[];            // NEW
  wavelength: { value: string; count: number }[];           // NEW
}
```

---

## 2. Industry → Type → Size System → Filters Mapping

The complete mapping. This is the source of truth for `data/filter-config.json`.

### automotive
| type | size_system | typical cables | filters |
|---|---|---|---|
| `automotive_wire` | awg | AVSS, FLRY (small cross-section) | size + area + OD + shielding + jacket + core + insulation + temp |
| `automotive_cable` | mm2 | Large cross-section automotive cable (≥2 mm²) | size + area + OD + jacket + core + insulation + temp |

### consumer_electronics
| type | size_system | typical cables | filters |
|---|---|---|---|
| `electronic_wire` | awg | UL1007, UL1015, UL2517 | size + area + OD + shielding + jacket + core + insulation + rated_voltage + temp |
| `multi_core_wire` | awg | UL2468 | size + area + OD + shielding + jacket + core + insulation + rated_voltage + temp |
| `shielded_wire` | awg | Shielded electronic wire | size + area + OD + shielding + jacket + core + insulation + rated_voltage + temp |

### industrial_power
| type | size_system | typical cables | filters |
|---|---|---|---|
| `power_cable_metric` | mm2 | YJV, BV (IEC) | size + area + voltage_class + core + insulation + jacket |
| `power_cable_kcmil` | kcmil | THHN, XHHW (North America) | size + area + voltage_class + core + insulation + jacket |

### telecom
| type | size_system | typical cables | filters |
|---|---|---|---|
| `communication_wire` | awg | CAT5e, CAT6 (AWG 23–26) | size + area + OD + shielding + jacket + core + insulation + impedance |
| `coaxial_cable` | awg | RG58, RG6 | size + OD + shielding + jacket + insulation + impedance |
| `fiber_optic` | none | Single-mode, multi-mode fiber | core_type + OD + jacket + wavelength |

**Notes:**
- Power cables have no `shielding` filter but have `voltage_class` (e.g., 0.6/1kV, 8.7/15kV).
- Electronic wires have `shielding` and `rated_voltage` (e.g., 300V, 600V) — distinct from power cable `voltage_class`.
- Fiber optic has `size_system: "none"` — no `size` spec, no `conductor_area`.
- Same `size_system` can appear across industries (mm2 in both automotive and industrial_power).

---

## 3. filter-config.json Structure

File: `data/filter-config.json`

Organized by industry → type. Each type declares its `size_system` and the list of filter entries. `CableFilters.tsx` reads this config at runtime; modifying filter sets does not require component changes.

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

---

## 4. CableCard: Remove Size Badge

**Current:** `CableCard.tsx` renders an `<span>` badge in the top-right of the image area showing `AWG {value}`.

**Change:** Remove the badge entirely. The image area top-right is empty.

Size information remains visible in the card body's mini spec table, where the `size` spec row is rendered with its dynamic label (AWG / Cross-Section / kcmil). For `size_system: "none"` cables (fiber), no size row appears.

No new badge logic is introduced.

---

## 5. CableFilters: Industry → Type → Spec (Config-Driven)

### 5.1 Sidebar layout

```
┌─────────────────────────┐
│ Industry                │  ← top-level filter (checkbox group)
│ ☑ Automotive (3)        │
│ ☑ Consumer Electronics  │
│ ☐ Industrial / Power    │
│ ☐ Telecom               │
├─────────────────────────┤
│ <Spec filters>          │  ← rendered based on selected industries
│ (config-driven)         │
└─────────────────────────┘
```

### 5.2 Rendering logic

1. **Industry group** (always visible at top): checkboxes generated from the result set's `industries` facet. Multi-select.
2. **Spec filter groups** (below industry): rendered based on the union of filter configs for the selected industries' types.
   - If no industry selected: show union of all types in the result set.
   - If one industry selected: show union of that industry's types.
   - If multiple industries selected: show union across selected industries.
3. **Size filter**: labeled dynamically per the size_system of the types in scope.
   - If all in-scope types share one size_system → single size group with that label (e.g., "AWG").
   - If multiple size_systems in scope → multiple size groups, each labeled by system (e.g., "AWG" + "Cross-Section mm²" + "kcmil").
4. **Facet counts**: each spec filter group only counts cables that have that spec. Cables without the spec (e.g., power cables without `shielding`) are excluded from that group's counts but still visible in other groups.

### 5.3 URL parameters

- `industry=automotive,consumer_electronics` (comma-separated, multi-select)
- `size=24,22` (replaces `awg`)
- Other spec filters: `shielding=none,braided`, `voltage_class=0.6/1kV`, etc.
- `size_system` is NOT a URL parameter (implied by industry/type).

No backward compatibility for `awg=` URL parameter (MVP has no external users).

---

## 6. Data Migration

Migrate the 6 existing cables in `data/cables.json`:

| Cable | industry | size_system | spec key change |
|---|---|---|---|
| UL1007 (cable-model-1) | consumer_electronics | awg | `awg` → `size` |
| UL1015 (cable-model-2) | consumer_electronics | awg | `awg` → `size` |
| AVSS (cable-model-3) | automotive | awg | `awg` → `size` |
| UL2468 (cable-model-4) | consumer_electronics | awg | `awg` → `size` |
| UL2517 (cable-model-5) | consumer_electronics | awg | `awg` → `size` |
| AVSS Shielded (cable-model-6) | automotive | awg | `awg` → `size` |

Each cable gains two top-level fields:
```json
"industry": "consumer_electronics",
"size_system": "awg"
```

Each variant's `awg` spec entry:
```json
// before
{ "key": "awg", "label": "AWG", "value": "24", "unit": null, "type": "enum", "filterable": true }
// after
{ "key": "size", "label": "AWG", "value": "24", "unit": null, "type": "enum", "filterable": true }
```

No new cables are added in this change. Adding power/telecom cable data is a separate future data-entry task.

---

## 7. lib Layer Changes

### 7.1 `lib/types.ts`
Add `Industry`, `SizeSystem`, `FilterConfigEntry`, `TypeFilterConfig`, `IndustryFilterConfig` types. Update `Cable`, `CableQueryParams`, `FilterFacets` per section 1.

### 7.2 `lib/api.ts`
Add `getFilterConfig()` loader that reads `data/filter-config.json` once and caches it. Add `industries` facet computation.

### 7.3 `lib/filter.ts`
- Rename `awg` handling to `size`.
- Add `industry` filter logic.
- Refactor spec filtering to be config-driven: iterate the filter config for the in-scope types, apply each filter entry against the cables' variant specs.
- Compute facets dynamically based on the filter config (only compute facets for spec keys that appear in the in-scope types' filter configs).

### 7.4 `lib/utils.ts`
Add `formatSizeLabel(size_system: SizeSystem): string` returning `"AWG"` / `"Cross-Section"` / `"kcmil"` / empty string. Used by CableCard spec table and CableFilters size group label.

### 7.5 `lib/validate.ts`
Add validation rules:
- Every cable has `industry` and `size_system` fields.
- `industry` is one of the 4 valid values.
- `size_system` is one of the 4 valid values.
- If `size_system !== "none"`, every variant has a `size` spec.
- If `size_system === "none"`, no variant has a `size` spec.
- Every `type` value in cables.json exists in filter-config.json.
- Every filter-config.json `spec_key` references a spec that exists in at least one cable of that type.

### 7.6 `lib/equipment-recommend.ts`
Update any reference to `awg` spec key → `size`.

### 7.7 `lib/seo.ts`
No change (SEO does not reference size).

---

## 8. Component Changes

### 8.1 `components/cable/CableCard.tsx`
- Remove the size badge `<span>` from the image area.
- The mini spec table already renders specs dynamically; the `size` row will appear with its label automatically.

### 8.2 `components/cable/CableFilters.tsx`
- Add Industry checkbox group at the top (from `industries` facet).
- Refactor spec filter rendering to read `filter-config.json` for the selected industries' types.
- Render size group(s) with dynamic label(s) based on size_system.
- Render other spec groups (enum → checkbox list, range → min/max inputs) per filter config.

### 8.3 `components/cable/CableSpecTable.tsx` and `VariantComparisonTable.tsx`
No change — they already render specs dynamically by key. The `size` row will appear with its label automatically.

### 8.4 `components/shared/SearchBox.tsx`
No change.

---

## 9. Out of Scope

- Adding new cable data (power cables, telecom cables, fiber) — future data-entry work.
- Backend admin UI for editing filter-config.json — deferred per MVP constraints.
- Backward-compatible URL redirects for `?awg=` — MVP has no external users.
- AWG ↔ mm² ↔ kcmil conversion tables — not needed; each cable declares its own size_system and size value.

---

## 10. Verification

After implementation:
1. `npm run validate` passes (data validation with new rules).
2. `npm run build` succeeds, 0 TypeScript errors.
3. `curl http://localhost:3001/cables` returns 200 with Industry filter group visible.
4. `curl http://localhost:3001/cables?industry=automotive` filters to automotive cables only.
5. `curl http://localhost:3001/cables?size=24` filters by size (replaces awg).
6. CableCard has no size badge in the top-right.
7. Existing 6 cables render correctly with `industry` + `size_system` fields.
