## Context

The platform has two established manufacturer modules:
- **Cable** (`manufacturers`, `cables`, `cable_variants`, `spec_items`) — wire/cable specifications with industry/category/product-type taxonomy
- **Equipment** (`equipment_manufacturers`, `equipment_categories`, `recommended_equipments`) — processing machinery with 2-level category tree and `applicable_specs` JSONB cable-matching

Each module has parallel layers: backend models → CRUD → schemas → API routes (public + admin + portal) → frontend pages (public + admin + portal) → components → API clients. Portal users are scoped by `scope_type` (`manufacturer` for cable, `equipment_manufacturer` for equipment), with a fixed permission matrix in `_FACTORY_ALLOWED_BY_SCOPE`.

The Terminal & Connector industry segment needs the same capabilities: manufacturer catalog, product listing, portal self-service, and cable-matching specs.

## Goals / Non-Goals

**Goals:**
- Mirror the Equipment module's architecture exactly for Terminal & Connector
- Full CRUD across admin, portal, and public layers
- Cable-matching via `applicable_specs` JSONB (same as equipment)
- Portal self-service with scope isolation (`terminal_manufacturer` scope_type)
- Media folder auto-provisioning on manufacturer creation
- CSV/JSON import (admin + portal)
- Inquiry linkage to terminal manufacturers
- Header search integration (3rd category option)

**Non-Goals:**
- Modifications to existing cable or equipment modules
- Internationalization (i18n)
- Automated frontend tests
- Product variants (equipment doesn't have them; terminals won't either)
- Showcase fields (`featured_cable_ids` etc. — cable-only feature)

## Decisions

### D1: Separate tables, not a shared manufacturer table
**Decision:** Create `terminal_manufacturers`, `terminal_categories`, `terminals` as separate tables mirroring the equipment schema.
**Rationale:** Cable and Equipment already use separate tables. A shared polymorphic manufacturer table would require refactoring existing modules and complicate scope validation. Mirroring the proven pattern is lower risk.
**Alternatives:** Generic `manufacturers` table with `type` column — rejected for migration complexity and scope-validation overhead.

### D2: Product model named `Terminal` (table `terminals`)
**Decision:** Name the product model `Terminal` with table `terminals`, not `RecommendedTerminal`.
**Rationale:** Equipment's `RecommendedEquipment` is a legacy name from when it was a recommendation feature. The new module should use a clean name from the start.
**Alternatives:** `RecommendedTerminal` for consistency — rejected; the "recommended" prefix is misleading for a product catalog.

### D3: scope_type `terminal_manufacturer`
**Decision:** Use `terminal_manufacturer` as the scope_type string.
**Rationale:** Follows the `{entity}_manufacturer` convention from `equipment_manufacturer`. The portal permission matrix adds `"terminal_manufacturer": {"dashboard", "terminals", "inquiries", "media", "me", "messages"}`.

### D4: URL slug `/terminals`
**Decision:** Public pages at `/terminals`, admin at `/admin/terminals`, portal at `/portal/terminals`.
**Rationale:** Mirrors `/equipment` pattern. Short, intuitive, consistent.

### D5: 2-level self-referential category tree (same as equipment)
**Decision:** `terminal_categories` with `parent_id` self-FK, max 2 levels enforced in API route.
**Rationale:** Identical to equipment categories. Composite IDs (`parent_slug/child_slug`) for hierarchical addressing.

### D6: Portal module name `terminals` (singular concept)
**Decision:** Portal permission matrix uses module name `"terminals"` (matching `"equipment"` pattern).
**Rationale:** Portal uses singular concept names for modules, while admin RBAC uses granular module IDs (`terminal_mfrs`, `terminal_cats`, `terminal_list`).

### D7: Media container "Terminal Manufacturers"
**Decision:** Add `"terminal_manufacturer": "Terminal Manufacturers"` to `CONTAINER_NAMES` in `crud/folder.py`.
**Rationale:** Follows the existing `manufacturer` → "Cable Manufacturers" and `equipment_manufacturer` → "Equipment Manufacturers" pattern.

## Risks / Trade-offs

- **[Code duplication]** The terminal module largely duplicates equipment code. → **Mitigation:** Acceptable for MVP; a future refactor could extract a generic manufacturer abstraction. Duplicating now is lower risk than refactoring working code.
- **[Large migration surface]** ~7 new route files, ~20 new frontend files. → **Mitigation:** Follow the equipment blueprint exactly; use subagent-driven development to parallelize independent layers.
- **[Admin menu seeding]** Admin sidebar is DB-driven via `admin_menu` table. → **Mitigation:** Add an Alembic migration to seed the 3 new menu items (`terminal-mfrs`, `terminal-cats`, `terminals`) alongside the schema migration.
