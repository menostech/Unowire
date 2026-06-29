# Industry-Category-ProductType Routing & Taxonomy Design

> **Status:** Design approved by user on 2026-06-29. Ready for implementation plan.
> **Replaces:** The 4-industry `filter-config.json` model introduced in the 2026-06-29 multi-size-system refactor.

## 1. Goal & Motivation

The current site uses a single generic query page (`/cables`) with all filters visible across all industries. This produces a cluttered experience because industries differ significantly in their spec dimensions (e.g., fiber optic has `core_type`/`wavelength`, power cables have `voltage_class`, automotive has `temperature_rating`). A flat filter sidebar either shows irrelevant facets or hides them dynamically, both of which are confusing.

This redesign introduces a **4-layer taxonomy** (Industry → Category → Product Type) where each Product Type page renders only the filters relevant to that type. Routing follows the taxonomy, giving users a clear drill-down path and producing SEO-friendly URLs like `/cables/renewables/solar/solar-dc-cable`.

## 2. Scope

**In scope (current phase):**
- 6 core industries: Consumer Electronics, Automotive & EV, Data Centers, Renewables, Telecom Power, Utility
- New `taxonomy.json` as the single source of truth (replaces `filter-config.json` + `categories.json`)
- 4-layer routing: `/cables/[industry]/[category]/[product-type]`
- Remove `conductor_area` spec_key; `size` absorbs its semantic via a new `enum_range` control type
- Redirect legacy `/categories/[...slugs]` to the new taxonomy routes

**Out of scope (deferred to later phases):**
- 8 additional industries: Mass Transit, Oil Gas & Petrochem, Ports, Marine, Factory Power & Automation, Building Solutions, Healthcare, Airports
- Admin UI for taxonomy editing (MVP edits JSON directly)
- Level 4+ taxonomy depth
- Automated tests (project constraint: verify via `tsc` + `validate` + `build`)
- Internationalization (English only per project constraint)
- Equipment recommendation changes (uses generic spec_key matching, unaffected)

## 3. Routing Structure

| Route | Page Type | Responsibility |
|-------|-----------|----------------|
| `/cables` | Overview | Lists 6 industry entry cards + cross-industry text search (no facet filters) |
| `/cables/[industry]` | Industry | Industry description + lists L2 category cards |
| `/cables/[industry]/[category]` | Category | Lists L3 product type cards under this category |
| `/cables/[industry]/[category]/[product-type]` | **Main query** | CableCard grid + sidebar filters (only this product type's specs) + pagination |
| `/cables/[brand_slug]/[slug]` | Detail | Unchanged |
| `/categories/[...slugs]` | Redirect | 301 to the closest new taxonomy route |

**URL examples:**
- `/cables/renewables/solar/solar-dc-cable` — Solar DC cable query page
- `/cables/telecom-power/communications/fiber-optic-cable?core_type=single-mode` — Fiber optic filtered by core type
- `/cables/utility/power-transmission/power-cable-metric?min_size=10&max_size=50` — Power cable filtered by cross-section range
- `/cables/consumer-electronics/internal-wiring/electronic-wire?size=24` — Electronic wire filtered by AWG

**Key decisions:**
- Level 3 (product type) is the filter-bearing layer. The route itself fixes industry+category+product_type, so the sidebar only renders specs for that product type.
- `/cables` overview does **not** render facet filters. It shows industry cards + a text search box that submits to `/cables?q=...` (cross-industry text-only search, no facets).
- Legacy `/categories/[...slugs]` is 301-redirected (not deleted) to preserve external links and indexed URLs.

## 4. Data Model — taxonomy.json

`data/taxonomy.json` is the single source of truth for the 4-layer tree, replacing both `data/filter-config.json` and `data/categories.json`.

### 4.1 Structure

```json
{
  "<industry_key>": {
    "label": "Human-readable industry name",
    "slug": "kebab-case-slug-for-url",
    "description": "One-sentence industry description for SEO and the industry page.",
    "categories": {
      "<category_key>": {
        "label": "Human-readable category name",
        "slug": "kebab-case-slug-for-url",
        "product_types": {
          "<product_type_key>": {
            "label": "Human-readable product type name",
            "slug": "kebab-case-slug-for-url",
            "size_system": "awg | mm2 | kcmil | none",
            "filters": [
              {
                "spec_key": "size | outer_diameter | shielding | ...",
                "label": "Display label",
                "control": "enum | range | enum_range",
                "unit": "optional unit string"
              }
            ]
          }
        }
      }
    }
  }
}
```

### 4.2 Filter Control Types

| Control | Behavior | Used For |
|---------|----------|----------|
| `enum` | Checkbox list (multi-select) | AWG size, shielding, jacket, core_structure, voltage_class, etc. |
| `range` | min/max numeric inputs | outer_diameter |
| `enum_range` | Checkbox list **+** min/max inputs | size (Cross-Section/kcmil only — combines enum selection with range filtering) |

**`enum_range` semantics:** The size filter on `mm2`/`kcmil` systems renders both a checkbox list of discrete size values AND min/max numeric inputs. A cable passes the filter if it matches any checked enum value OR falls within the min/max range. (If both are specified, the union applies — this lets users either pick specific sizes or scan a range.)

**`size` filter rules:**
- `awg` system: `control: "enum"` only (AWG numbers are a reverse scale; range filtering is counterintuitive)
- `mm2` system: `control: "enum_range"`, label = "Cross-Section", unit = "mm²"
- `kcmil` system: `control: "enum_range"`, label = "kcmil", unit = "kcmil"
- `none` system: no size filter in the filters array

### 4.3 Cable Data Changes — cables.json

Each cable gains two new fields; `category_ids` is retained only for migration mapping:

```json
{
  "id": "cable-model-1",
  "industry": "consumer_electronics",
  "category": "internal_wiring",
  "product_type": "electronic_wire",
  "category_ids": ["cat-4", "cat-7"],
  ...
}
```

| Field | Type | Description |
|-------|------|-------------|
| `industry` | string (existing) | Industry key in taxonomy.json (e.g., `"consumer_electronics"`) |
| `category` | string (new) | Category key within the industry (e.g., `"internal_wiring"`) |
| `product_type` | string (new) | Product type key within the category (e.g., `"electronic_wire"`) |
| `category_ids` | string[] (existing) | Retained for legacy redirect mapping; removed after migration period |

**`conductor_area` spec_key removal:** The `conductor_area` spec_key is removed from all variants' `specs` arrays. Its semantic is absorbed by `size` (on `mm2`/`kcmil` systems, `size` IS the cross-section). On `awg` systems, `size` is the AWG number; users who need the metric equivalent can infer it from standard AWG-to-mm² conversion tables (not exposed as a separate filter). Existing cables' `conductor_area` specs are deleted in the data migration.

### 4.4 Complete Taxonomy — 6 Industries

**Node count:** 6 industries / 12 categories / 26 product types (tree totals, not a Cartesian product)

#### 4.4.1 Consumer Electronics (`consumer-electronics`)

| Category | Product Type | size_system | Filter spec_keys |
|----------|--------------|-------------|------------------|
| Internal Wiring (`internal-wiring`) | Electronic Wire (`electronic-wire`) | awg | size, outer_diameter, shielding, jacket, core_structure, insulation_material, rated_voltage, temperature_rating |
| Internal Wiring | Multi-Core Wire (`multi-core-wire`) | awg | (same as electronic_wire) |
| Internal Wiring | Shielded Wire (`shielded-wire`) | awg | (same as electronic_wire) |

#### 4.4.2 Automotive & Electric Vehicles (`automotive-ev`)

| Category | Product Type | size_system | Filter spec_keys |
|----------|--------------|-------------|------------------|
| Automotive (`automotive`) | Automotive Wire (`automotive-wire`) | awg | size, outer_diameter, shielding, jacket, core_structure, insulation_material, temperature_rating |
| Automotive | Automotive Cable (`automotive-cable`) | mm2 | size, outer_diameter, jacket, core_structure, insulation_material, temperature_rating |
| Automotive | Shielded Wire (`shielded-wire`) | awg | (same as automotive_wire) |
| E-Mobility (`e-mobility`) | EV Charging Cable (`ev-charging-cable`) | mm2 | size, outer_diameter, jacket, insulation_material, temperature_rating, charging_level |
| E-Mobility | EV High Voltage Cable (`ev-high-voltage-cable`) | mm2 | size, outer_diameter, shielding, jacket, insulation_material, temperature_rating, voltage_class |

#### 4.4.3 Data Centers (`data-centers`)

| Category | Product Type | size_system | Filter spec_keys |
|----------|--------------|-------------|------------------|
| Data Centres (`data-centres`) | Fiber Optic Cable (`fiber-optic-cable`) | none | core_type, outer_diameter, jacket, wavelength, connector_type, fire_rating |
| Data Centres | Patch Cable (`patch-cable`) | awg | size, outer_diameter, shielding, jacket, category_rating |
| Data Centres | Power Cable Metric (`power-cable-metric`) | mm2 | size, outer_diameter, voltage_class, core_structure, insulation_material, jacket, fire_rating |

#### 4.4.4 Renewables (`renewables`)

| Category | Product Type | size_system | Filter spec_keys |
|----------|--------------|-------------|------------------|
| Solar (`solar`) | Solar DC Cable (`solar-dc-cable`) | mm2 | size, outer_diameter, insulation_material, jacket, temperature_rating, voltage_class, uv_resistance |
| Solar | Solar AC Cable (`solar-ac-cable`) | mm2 | (same as solar_dc_cable) |
| Wind Farms (`wind-farms`) | Wind Power Cable (`wind-power-cable`) | mm2 | size, outer_diameter, shielding, jacket, core_structure, insulation_material, temperature_rating, voltage_class, torsion_resistance |
| Wind Farms | Wind Control Cable (`wind-control-cable`) | mm2 | size, outer_diameter, shielding, jacket, core_structure, insulation_material, temperature_rating, torsion_resistance |
| BESS (`bess`) | BESS Power Cable (`bess-power-cable`) | mm2 | size, outer_diameter, shielding, jacket, insulation_material, temperature_rating, voltage_class, fire_rating |

#### 4.4.5 Telecom Power (`telecom-power`)

| Category | Product Type | size_system | Filter spec_keys |
|----------|--------------|-------------|------------------|
| Communications (`communications`) | Fiber Optic Cable (`fiber-optic-cable`) | none | core_type, outer_diameter, jacket, wavelength, connector_type |
| Communications | Coaxial Cable (`coaxial-cable`) | awg | size, outer_diameter, shielding, jacket, insulation_material, impedance |
| Communications | Communication Wire (`communication-wire`) | awg | size, outer_diameter, shielding, jacket, core_structure, insulation_material, impedance |
| Communications | Base Station Power Cable (`base-station-power-cable`) | mm2 | size, outer_diameter, shielding, jacket, insulation_material, temperature_rating, voltage_class, fire_rating |

#### 4.4.6 Utility (`utility`)

| Category | Product Type | size_system | Filter spec_keys |
|----------|--------------|-------------|------------------|
| Power Transmission (`power-transmission`) | Power Cable Metric (`power-cable-metric`) | mm2 | size, outer_diameter, voltage_class, core_structure, insulation_material, jacket, shielding, temperature_rating |
| Power Transmission | Power Cable kcmil (`power-cable-kcmil`) | kcmil | size, outer_diameter, voltage_class, core_structure, insulation_material, jacket, shielding, temperature_rating |
| Power Transmission | Overhead Conductor (`overhead-conductor`) | mm2 | size, outer_diameter, conductor_material, core_structure, tensile_strength |
| Switchboards (`switchboards`) | Switchboard Cable (`switchboard-cable`) | mm2 | size, outer_diameter, voltage_class, core_structure, insulation_material, jacket, temperature_rating, fire_rating |
| Utilities (`utilities`) | Utility Power Cable (`utility-power-cable`) | mm2 | size, outer_diameter, voltage_class, core_structure, insulation_material, jacket, shielding, temperature_rating |
| Water Treatment (`water-treatment`) | Water Treatment Cable (`water-treatment-cable`) | mm2 | size, outer_diameter, voltage_class, insulation_material, jacket, temperature_rating, water_resistance, corrosion_resistance |

## 5. TypeScript Types

```typescript
// lib/types.ts additions

type FilterControl = "enum" | "range" | "enum_range";

interface TaxonomyFilter {
  spec_key: string;
  label: string;
  control: FilterControl;
  unit?: string;
}

interface ProductTypeConfig {
  label: string;
  slug: string;
  size_system: SizeSystem;
  filters: TaxonomyFilter[];
}

interface TaxonomyCategory {
  label: string;
  slug: string;
  product_types: Record<string, ProductTypeConfig>;
}

interface TaxonomyIndustry {
  label: string;
  slug: string;
  description: string;
  categories: Record<string, TaxonomyCategory>;
}

type Taxonomy = Record<string, TaxonomyIndustry>;
```

**CableQueryParams changes:**
```typescript
interface CableQueryParams {
  // Route params (required, from [industry]/[category]/[product-type])
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
  spec_filters: Record<string, string[]>;
  min_od?: number;
  max_od?: number;

  // Pagination
  page: number;
  page_size: number;
}
```

**Removed fields:** `industry` (was optional query param, now required route param), `category_ids`, `min_area`/`max_area` (replaced by `min_size`/`max_size`), `conductor_area` from spec semantics.

**FilterFacets changes:**
```typescript
interface FilterFacets {
  manufacturers: { id: string; name: string; count: number }[];
  brands: { id: string; name: string; count: number }[];
  size: { value: string; count: number }[];        // removed size_system grouping (route fixes product_type → size_system)
  size_range: { min: number; max: number } | null;  // new: for enum_range rendering; null when size_system=none or no cables
  spec_facets: Record<string, { value: string; count: number }[]>;
  outer_diameter: { min: number; max: number } | null;  // null when no cables in scope
}
```

The `industries` facet is removed (route fixes industry). The `size` facet no longer groups by `size_system` (route fixes product_type → size_system). A new `size_range` facet provides min/max for the `enum_range` inputs.

## 6. lib Layer Changes

### 6.1 lib/api.ts — taxonomy namespace

```typescript
import taxonomyData from '@/data/taxonomy.json';

export const api = {
  // ... existing cables/brands/manufacturers namespaces unchanged

  taxonomy: {
    all(): Taxonomy { return taxonomyData as Taxonomy; },

    industries(): TaxonomyIndustry[] {
      return Object.values(taxonomyData as Taxonomy);
    },

    industry(industryKey: string): TaxonomyIndustry | null {
      return (taxonomyData as Taxonomy)[industryKey] ?? null;
    },

    category(industryKey: string, categoryKey: string): TaxonomyCategory | null {
      return this.industry(industryKey)?.categories[categoryKey] ?? null;
    },

    productType(industryKey: string, categoryKey: string, ptKey: string): ProductTypeConfig | null {
      return this.category(industryKey, categoryKey)?.product_types[ptKey] ?? null;
    },

    // Route resolution: lookup by slugs (URL → config)
    findBySlug(
      industrySlug: string,
      categorySlug?: string,
      productTypeSlug?: string
    ): {
      industry: TaxonomyIndustry;
      category: TaxonomyCategory;
      productType: ProductTypeConfig;
      industryKey: string;
      categoryKey: string;
      productTypeKey: string;
    } | null {
      for (const [indKey, ind] of Object.entries(taxonomyData as Taxonomy)) {
        if (ind.slug !== industrySlug) continue;
        if (!categorySlug) {
          // industry-level lookup
          return null; // caller should use industry() directly
        }
        for (const [catKey, cat] of Object.entries(ind.categories)) {
          if (cat.slug !== categorySlug) continue;
          if (!productTypeSlug) {
            return null; // caller should use category() directly
          }
          for (const [ptKey, pt] of Object.entries(cat.product_types)) {
            if (pt.slug === productTypeSlug) {
              return { industry: ind, category: cat, productType: pt, industryKey: indKey, categoryKey: catKey, productTypeKey: ptKey };
            }
          }
        }
      }
      return null;
    }
  },

  // Legacy: keep categories.findByPath for /categories/[...slugs] redirect resolution
  categories: { /* existing, reads from old categories.json for redirect mapping only */ }
};
```

**Removed:** `api.filterConfig.*` (replaced by `api.taxonomy.*`).

### 6.2 lib/filter.ts — route-scoped filtering

```typescript
export function filterCables(params: CableQueryParams): CableListResponse {
  const { industry, category, product_type, ...filterParams } = params;

  // 1. Hard filter by route identity (no longer inferred from query string)
  let cables = allCables.filter(c =>
    c.industry === industry &&
    c.category === category &&
    c.product_type === product_type
  );

  // 2. Apply text search
  cables = applySearch(cables, filterParams.q);

  // 3. Apply manufacturer, brand filters
  cables = applyManufacturer(cables, filterParams.manufacturer);
  cables = applyBrand(cables, filterParams.brand);

  // 4. Apply size filter (enum + range union for mm2/kcmil; enum only for awg)
  cables = applySizeFilter(cables, filterParams.size, filterParams.min_size, filterParams.max_size);

  // 5. Apply spec_filters (config-driven enum specs)
  cables = applySpecFilters(cables, filterParams.spec_filters);

  // 6. Apply outer_diameter range
  cables = applyOuterDiameter(cables, filterParams.min_od, filterParams.max_od);

  // 7. Paginate
  // 8. buildFacets (no industries facet, no size_system grouping)
  const facets = buildFacets(cables, product_type);
  return { items, total, page, page_size, filters: facets };
}
```

**`applySizeFilter` logic (new):**
- For `awg` system: match if cable's size is in the `size[]` enum array (no range)
- For `mm2`/`kcmil` system: match if cable's size is in `size[]` enum array OR (size value >= `min_size` AND <= `max_size`). Union semantics.
- `size` values are stored as strings (e.g., "240", "500"); comparison parses to number for mm2/kcmil.

**`buildFacets` changes:**
- No longer returns `industries` facet (route fixes industry)
- `size` facet no longer groups by `size_system` (route fixes product_type → size_system)
- New `size_range` facet: `{ min: number, max: number }` computed from all cables' size values (parsed to number), used to populate min/max input placeholders. Null if product_type is `none` system or no cables.

### 6.3 lib/validate.ts — new rules

Existing rules 5b/5c/5d (from multi-size-system refactor) are updated; new rules added:

- **Rule 5e:** Every cable's `category` must exist in `taxonomy[industry].categories`
- **Rule 5f:** Every cable's `product_type` must exist in `taxonomy[industry].categories[category].product_types`
- **Rule 5g:** Every cable's `size_system` must equal `taxonomy[industry].categories[category].product_types[product_type].size_system`
- **Rule 5h:** For each product_type, if `size_system="none"`, filters must not contain `spec_key="size"`; otherwise filters must contain exactly one `spec_key="size"` entry whose `control` is `"enum"` (awg) or `"enum_range"` (mm2/kcmil)
- **Rule 5i:** No cable's variant specs may contain `spec_key="conductor_area"` (removed in this refactor)
- **Rule 5j:** Every `spec_key` in a product_type's filters (except `size`/`outer_diameter`) must appear in at least one cable of that product_type (warns about orphan filter configs)

### 6.4 lib/seo.ts — new metadata generators

```typescript
export function generateIndustryMetadata(industry: TaxonomyIndustry): Metadata {
  return {
    title: `${industry.label} Cables`,
    description: industry.description,
    alternates: { canonical: `/cables/${industry.slug}` },
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
  };
}

export function generateProductTypeMetadata(
  industry: TaxonomyIndustry,
  category: TaxonomyCategory,
  productType: ProductTypeConfig
): Metadata {
  return {
    title: `${productType.label} | ${category.label} | ${industry.label}`,
    description: `Browse ${productType.label.toLowerCase()} cables. Filter by ${productType.filters.map(f => f.label.toLowerCase()).join(', ')}.`,
    alternates: { canonical: `/cables/${industry.slug}/${category.slug}/${productType.slug}` },
  };
}

// generateCablesListMetadata retained for /cables overview page
```

## 7. Component Layer

### 7.1 New Components

**`components/taxonomy/IndustryCard.tsx`** — used on `/cables` overview:
```tsx
interface IndustryCardProps {
  industry: TaxonomyIndustry;
  categoryCount: number;
  cableCount: number;
}
// Renders: industry label + description + stats, links to /cables/[industry-slug]
```

**`components/taxonomy/CategoryCard.tsx`** — used on `/cables/[industry]`:
```tsx
interface CategoryCardProps {
  industry: TaxonomyIndustry;
  category: TaxonomyCategory;
  categoryKey: string;
  productTypeCount: number;
  cableCount: number;
}
// Renders: category label + product type count + cable count, links to /cables/[industry-slug]/[category-slug]
```

**`components/taxonomy/ProductTypeCard.tsx`** — used on `/cables/[industry]/[category]`:
```tsx
interface ProductTypeCardProps {
  industry: TaxonomyIndustry;
  category: TaxonomyCategory;
  productType: ProductTypeConfig;
  productTypeKey: string;
  cableCount: number;
}
// Renders: product type label + size_system badge + cable count, links to /cables/[industry-slug]/[category-slug]/[pt-slug]
```

### 7.2 Modified Components

**`components/cable/CableFilters.tsx`** — major simplification:
- Remove Industry facet group, Category facet group
- Accept `industry`, `category`, `productType` props (route identity)
- Read filters from `api.taxonomy.productType(industry, category, productType).filters`
- `enumSpecKeys` derived directly from productType.filters (no cross-industry walk)
- Size rendering: if `control="enum"`, render checkbox list only; if `control="enum_range"`, render checkbox list + min/max inputs; if `size_system="none"`, render nothing for size
- `toggleParam`/`setNumericParam` use `usePathname()` to infer basePath (e.g., `/cables/renewables/solar/solar-dc-cable`)

**`components/cable/CableCard.tsx`** — unchanged (already uses `cable.size_system` + `formatSizeValue`)

**`components/shared/SimilarCables.tsx`** — unchanged (already uses size spec)

**`components/shared/Pagination.tsx`** — unchanged (already accepts `basePath` prop)

### 7.3 Removed Components
- None. Existing components are reused or modified.

## 8. Page Layer

### 8.1 `/cables` Overview (rewrite)

```tsx
export default async function CablesOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  if (sp.q) {
    // Cross-industry text search (no facets)
    const result = filterCablesByText(sp.q, { page: parseInt(sp.page || '1'), page_size: 16 });
    return <SearchResults q={sp.q} result={result} />;
  }
  // Default: industry cards
  const industries = api.taxonomy.industries();
  const stats = industries.map(ind => ({
    industry: ind,
    categoryCount: Object.keys(ind.categories).length,
    cableCount: countCablesByIndustry(/* indKey */),
  }));
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', url: '/' }, { name: 'Cables' }]} />
      <h1>Cable Directory</h1>
      <p>Browse cables by industry. Select an industry to explore its categories.</p>
      <SearchBox basePath="/cables" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map(s => <IndustryCard key={s.industry.slug} {...s} />)}
      </div>
    </Container>
  );
}
```

### 8.2 `/cables/[industry]` Industry Page (new)

```tsx
export default async function IndustryPage({ params }: { params: Promise<{ industry: string }> }) {
  const { industry: industrySlug } = await params;
  const industry = api.taxonomy.industries().find(i => i.slug === industrySlug);
  if (!industry) notFound();
  const industryKey = /* resolved from taxonomy lookup */;
  const categories = Object.entries(industry.categories).map(([key, cat]) => ({
    categoryKey: key,
    category: cat,
    productTypeCount: Object.keys(cat.product_types).length,
    cableCount: countCablesByCategory(industryKey, key),
  }));
  return (
    <Container>
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: industry.label },
      ]} />
      <h1>{industry.label}</h1>
      <p>{industry.description}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {categories.map(c => <CategoryCard key={c.categoryKey} industry={industry} {...c} />)}
      </div>
    </Container>
  );
}
```

### 8.3 `/cables/[industry]/[category]` Category Page (new)

```tsx
export default async function CategoryPage({
  params,
}: { params: Promise<{ industry: string; category: string }> }) {
  const { industry: industrySlug, category: categorySlug } = await params;
  const found = api.taxonomy.findBySlug(industrySlug, categorySlug);
  if (!found) notFound();
  const { industry, category, industryKey, categoryKey } = found;
  const productTypes = Object.entries(category.product_types).map(([key, pt]) => ({
    productTypeKey: key,
    productType: pt,
    cableCount: countCablesByProductType(industryKey, categoryKey, key),
  }));
  return (
    <Container>
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: industry.label, url: `/cables/${industrySlug}` },
        { name: category.label },
      ]} />
      <h1>{category.label}</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {productTypes.map(pt => <ProductTypeCard key={pt.productTypeKey} industry={industry} category={category} {...pt} />)}
      </div>
    </Container>
  );
}
```

### 8.4 `/cables/[industry]/[category]/[product-type]` Product Type Page (new — main query)

```tsx
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

  const specFilters = packSpecFilters(sp, productType.filters);
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
    spec_filters: specFilters,
    min_od: sp.min_od ? parseFloat(sp.min_od) : undefined,
    max_od: sp.max_od ? parseFloat(sp.max_od) : undefined,
    page,
    page_size: 16,
  });

  const basePath = `/cables/${indSlug}/${catSlug}/${ptSlug}`;
  return (
    <Container>
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: industry.label, url: `/cables/${indSlug}` },
        { name: category.label, url: `/cables/${indSlug}/${catSlug}` },
        { name: productType.label },
      ]} />
      <h1>{productType.label}</h1>
      <div className="flex gap-6">
        <CableFilters
          facets={result.filters}
          industry={industryKey}
          category={categoryKey}
          productType={productTypeKey}
        />
        <div className="flex-1">
          {result.items.length === 0 ? <EmptyState basePath={basePath} /> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {result.items.map(item => <CableCard key={item.cable.id} {...item} />)}
              </div>
              <Pagination page={page} totalPages={Math.ceil(result.total / result.page_size)} basePath={basePath} searchParams={sp} />
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
```

### 8.5 `/categories/[...slugs]` Redirect (rewrite)

```tsx
import { permanentRedirect } from 'next/navigation';

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

export default async function LegacyCategoryPage({ params }: { params: Promise<{ slugs: string[] }> }) {
  const { slugs } = await params;
  const key = slugs.join('/');
  const target = LEGACY_REDIRECTS[key];
  if (target) {
    permanentRedirect(target);  // 308 permanent redirect
  }
  notFound();
}
```

**Note:** `permanentRedirect()` from `next/navigation` issues a 308 permanent redirect. The 9 legacy entries are hardcoded based on the old `categories.json` node structure.

## 9. File Operations Summary

| File | Operation | Reason |
|------|-----------|--------|
| `data/taxonomy.json` | **Create** | Single source of truth for 4-layer tree |
| `data/filter-config.json` | **Delete** | Merged into taxonomy.json |
| `data/categories.json` | **Keep (migration period)** | Used for legacy redirect mapping reference; delete after migration |
| `data/cables.json` | **Modify** | Add `category` + `product_type` fields; remove `conductor_area` specs |
| `lib/types.ts` | **Modify** | Add Taxonomy types; update CableQueryParams (route-scoped); update FilterFacets |
| `lib/api.ts` | **Modify** | Add `taxonomy` namespace; remove `filterConfig` namespace |
| `lib/filter.ts` | **Modify** | Route-scoped filterCables; new applySizeFilter (enum+range union); buildFacets without industries |
| `lib/validate.ts` | **Modify** | Add rules 5e/5f/5g/5h/5i/5j |
| `lib/seo.ts` | **Modify** | Add generateIndustryMetadata, generateCategoryMetadata, generateProductTypeMetadata |
| `lib/utils.ts` | **Unchanged** | formatSizeLabel/formatSizeValue already generic |
| `app/cables/page.tsx` | **Rewrite** | Overview page (industries + search) |
| `app/cables/[industry]/page.tsx` | **Create** | Industry page |
| `app/cables/[industry]/[category]/page.tsx` | **Create** | Category page |
| `app/cables/[industry]/[category]/[product-type]/page.tsx` | **Create** | Product type query page |
| `app/cables/[brand_slug]/[slug]/page.tsx` | **Unchanged** | Detail page |
| `app/categories/[...slugs]/page.tsx` | **Rewrite** | Legacy redirect |
| `components/taxonomy/IndustryCard.tsx` | **Create** | Overview page card |
| `components/taxonomy/CategoryCard.tsx` | **Create** | Industry page card |
| `components/taxonomy/ProductTypeCard.tsx` | **Create** | Category page card |
| `components/cable/CableCard.tsx` | **Unchanged** | Already generic |
| `components/cable/CableFilters.tsx` | **Modify** | Route-scoped, read from taxonomy, enum_range rendering |
| `components/shared/SimilarCables.tsx` | **Unchanged** | Already generic |
| `components/shared/Pagination.tsx` | **Unchanged** | Already accepts basePath |
| `scripts/validate-data.ts` | **Modify** | Add new validation rules |

## 10. Migration Plan

### 10.1 Existing 6 Cables Mapping

| Cable | industry | category | product_type | size_system |
|-------|----------|----------|--------------|-------------|
| UL1007 | consumer_electronics | internal_wiring | electronic_wire | awg |
| UL1015 | consumer_electronics | internal_wiring | electronic_wire | awg |
| AVSS | automotive_ev | automotive | automotive_wire | awg |
| UL2468 | consumer_electronics | internal_wiring | multi_core_wire | awg |
| UL2517 | consumer_electronics | internal_wiring | electronic_wire | awg |
| AVSS Shielded | automotive_ev | automotive | shielded_wire | awg |

### 10.2 conductor_area Spec Removal

All 6 cables' variant specs that contain `conductor_area` entries are deleted in the migration. The exact count is determined during implementation by scanning `data/cables.json`. The `size` spec on `awg` system retains AWG values; no separate cross-section field is needed.

### 10.3 Legacy Redirect Mapping

9 entries from old `categories.json` mapped to new taxonomy routes (see §8.5). Mapping is hardcoded in `app/categories/[...slugs]/page.tsx`.

## 11. Verification Checklist

1. `npx tsc --noEmit` → 0 errors
2. `npm run validate` → 0 errors (includes new rules 5e–5j)
3. `npm run build` → success. Expected routes:
   - `/cables` (static)
   - `/cables/[industry]` (dynamic)
   - `/cables/[industry]/[category]` (dynamic)
   - `/cables/[industry]/[category]/[product-type]` (dynamic)
   - `/cables/[brand_slug]/[slug]` (dynamic + ISR)
   - `/categories/[...slugs]` (dynamic, redirect)
   - `/api/cables/[brand_slug]/[slug]` (dynamic)
   - `/sitemap.xml`, `/robots.txt`
4. Curl smoke tests (all 200):
   - `GET /cables`
   - `GET /cables/renewables`
   - `GET /cables/renewables/solar`
   - `GET /cables/renewables/solar/solar-dc-cable`
   - `GET /cables/telecom-power/communications/fiber-optic-cable?core_type=single-mode`
   - `GET /cables/consumer-electronics/internal-wiring/electronic-wire?size=24`
   - `GET /cables/utility/power-transmission/power-cable-metric?min_size=10&max_size=50`
   - `GET /cables/hitachi/ul1007` (detail page unchanged)
5. Redirect verification:
   - `GET /categories/automotive` → 308 → `/cables/automotive-ev`
   - `GET /categories/consumer-electronics/internal-wiring` → 308 → `/cables/consumer-electronics/internal-wiring`
   - `GET /categories/industrial` → 308 → `/cables/utility`
6. Filter behavior verification:
   - `/cables/renewables/solar/solar-dc-cable` shows only solar DC cable filters (size enum_range, uv_resistance, etc.)
   - `/cables/telecom-power/communications/fiber-optic-cable` shows no size filter (size_system=none)
   - `/cables/utility/power-transmission/power-cable-kcmil` size filter label is "kcmil" with enum_range control

## 12. Open Questions for Implementation

These are deferred to the implementation plan (not blocking the spec):

1. **`enum_range` union semantics edge case:** If a user checks "240 mm²" AND enters min_size=10, max_size=50, should the union include 240 (yes, per spec) or should the range override the enum (no, per spec)? Spec says union — implement accordingly.
2. **Size value parsing:** `size` is stored as string ("240", "AWG 24", "500"). For `mm2`/`kcmil` range comparison, parse the numeric prefix. For `awg`, no range comparison.
3. **`size_range` facet computation:** When a product_type has no cables, `size_range` is null. The CableFilters component should hide the min/max inputs when null.
4. **Cross-industry search on `/cables`:** `filterCablesByText` is a new helper that searches across all cables by `q` without route scoping. It does not apply facet filters. Pagination is supported.
5. **Sitemap generation:** `app/sitemap.ts` should enumerate all taxonomy routes (6 industries + 12 categories + 26 product types = 44 URLs) plus detail pages.
