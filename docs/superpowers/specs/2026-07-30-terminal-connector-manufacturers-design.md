---
comet_change: add-terminal-connector-manufacturers
role: technical-design
canonical_spec: openspec
archived-with: 2026-08-12-add-terminal-connector-manufacturers
status: final
---

# Design Doc: Terminal & Connector Manufacturers Module

## Overview

Add a new Terminal & Connector manufacturer module that mirrors the existing Equipment module architecture. The module provides manufacturer catalog, product management, portal self-service, CSV/JSON import, media folder provisioning, inquiry linkage, and header search integration.

## Architecture Decision: Pure Mirror Copy

**Decision:** Duplicate the Equipment module's code structure with renames. Do not extract generic abstractions or refactor existing equipment code.

**Rationale:**
- Equipment code is stable and proven; refactoring introduces regression risk
- MVP phase prioritizes delivery speed over DRY
- The CRUDBase generic already provides backend CRUD reuse; routes and frontend components are duplicated
- A future refactor can extract generics when 3+ similar modules exist

**Alternatives rejected:**
- Generic base class extraction: requires refactoring equipment, higher risk
- Hybrid (backend generic + frontend copy): inconsistent strategy, adds complexity

## Backend Design

### Data Model

Three new tables mirroring equipment schema:

```
terminal_manufacturers          terminal_categories              terminals
├── id (String PK)              ├── id (String PK)               ├── id (String PK)
├── name (unique)               ├── parent_id (self-FK CASCADE)  ├── manufacturer_id (FK RESTRICT)
├── slug (unique)               ├── label                        ├── category_id (FK RESTRICT)
├── country                     ├── slug                         ├── model
├── website                     ├── description                  ├── slug (globally unique)
├── image_url                   ├── image_url                    ├── applicable_specs (JSONB NOT NULL)
├── description                 ├── sort_order                   ├── description
├── founded_year                ├── created_at                   ├── image_url
├── address                     └── updated_at                   ├── external_url
├── phone                       (UniqueConstraint: parent_id,    ├── sort_order
├── email                        slug)                           ├── created_at
├── sort_order                  (Max 2 levels, enforced in API)  └── updated_at
├── created_at
└── updated_at
```

### Alembic Migration

- Create 3 tables with FKs (RESTRICT on product→manufacturer/category), unique constraints on slug, self-referential FK on categories
- Seed admin menu items: `terminal-mfrs`, `terminal-cats`, `terminals` under a "Terminal & Connector" group
- Seed initial category tree (e.g., top-level "Terminals & Connectors" with children like "Ring Terminals", "Spade Terminals", "Bullet Connectors")

### Module Registration

- `modules.py`: Add `terminal_mfrs` (scope_aware, scope_type=`terminal_manufacturer`), `terminal_cats` (not scope_aware), `terminal_list` (scope_aware, scope_type=`terminal_manufacturer`); add `"terminal_manufacturer"` to `VALID_SCOPE_TYPES`
- `scope_resolvers.py`: Add `validate_terminal_manufacturer_exists` checking TerminalManufacturer table; register in `SCOPE_RESOLVERS`
- `deps.py`: Add `"terminal_manufacturer": {"dashboard", "terminals", "inquiries", "media", "me", "messages"}` to `_FACTORY_ALLOWED_BY_SCOPE`
- `crud/folder.py`: Add `"terminal_manufacturer": "Terminal Manufacturers"` to `CONTAINER_NAMES`

### API Routes (7 modules)

| Route file | Mount path | Auth | Purpose |
|-----------|-----------|------|---------|
| `terminals.py` | `/api/terminals` | operator `terminal_list` | Public/admin product CRUD with scope check |
| `terminal_manufacturers.py` | `/api/terminal-manufacturers` | operator `terminal_mfrs` | Manufacturer CRUD + media provisioning |
| `terminal_categories.py` | `/api/terminal-categories` | operator `terminal_cats` | 2-level category tree CRUD |
| `terminal_import.py` | `/api/admin/terminals/import` | operator `terminal_list` | CSV/JSON validate + commit |
| `terminal_import_templates.py` | `/api/admin/terminals/import` | — | CSV template + JSON example |
| `portal_terminals.py` | `/api/portal/terminals` | factory module `terminals` | Portal scope-filtered CRUD, force manufacturer_id |
| `portal_terminal_import.py` | `/api/portal/terminals/import` | factory module `terminals` | Portal CSV/JSON import with manufacturer_id override |

### Portal Security

- `require_factory_module("terminals")` checks user's scope_type against `_FACTORY_ALLOWED_BY_SCOPE["terminal_manufacturer"]`
- Create: server forces `manufacturer_id = user.scope_id`, ignores client value; generates ID `{manufacturer_slug}-{product_slug}`
- Read/Update/Delete: ownership check (`_check_terminal_ownership` — product must belong to user.scope_id, else 404)
- Import: `_force_manufacturer_id(parsed_rows, scope_id)` runs after parse, before validate

### Media Folder Provisioning

On manufacturer create: `crud_folder.provision_for_manufacturer(scope_type="terminal_manufacturer", scope_id=obj.id, name=obj.name)` creates root folder under "Terminal Manufacturers" container + 3 protected subfolders (logos, products, docs).

On rename: `crud_folder.rename_manufacturer_root(...)` updates root folder name.

On delete: `crud_folder.cleanup_for_manufacturer(...)` removes folders + upload records + disk files (before manufacturer deletion).

## Frontend Design

### Public Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/terminals` | Server component | Listing with category/manufacturer/spec filters, in-memory `filterTerminals()` |
| `/terminals/[slug]` | Server component | Product detail: image, manufacturer link, category badge, applicable specs table, inquiry form (`recipientType="terminal_manufacturer"`), JSON-LD |
| `/terminals/manufacturers/[slug]` | Server component | Manufacturer profile: contact info, product grid, inquiry CTA |

### Admin Pages

`/admin/terminals/` — list, new, edit, import
`/admin/terminals/manufacturers/` — list, new, edit
`/admin/terminals/categories/` — list, new, edit (catch-all `[...id]` for composite IDs)

### Portal Pages

`/portal/terminals/` — list (scope-filtered), new, edit, import, loading

### Components

- `components/terminals/`: TerminalCard, TerminalListClient, TerminalFilters, TerminalCategoryNav (mirror equipment components)
- `components/admin/form/`: TerminalManufacturerForm, TerminalForm, TerminalCategoryForm
- `components/portal/form/`: TerminalFormFields, TerminalCreateForm, TerminalEditForm, TerminalDeleteButton
- `components/portal/terminals/`: TerminalListToolbar
- `components/admin/list/`: TerminalSearchBox

### Integration Points

1. **PortalSidebar.tsx**: Add `TERMINAL_MANUFACTURER_NAV` array (Dashboard, Terminals, Inquiries, Messages, Media, Settings), selected by `scope_type === "terminal_manufacturer"`
2. **SearchBox.tsx**: Add "Terminal" as third `<option>` in category dropdown, routing to `/terminals?q=` with placeholder "Search terminal model, brand..."
3. **adminMenuRegistry.ts**: Add `terminals`, `terminal-mfrs`, `terminal-cats` page IDs to `ADMIN_PAGES`
4. **adminModules.ts**: Add scope_type label `"terminal_manufacturer": "Terminal Manufacturer"`, module definitions
5. **AdminSidebar.tsx**: Add `PAGE_ID_TO_MODULE_ID` entries mapping `terminal-mfrs` → `terminal_mfrs`, etc.
6. **api.ts / adminApi.ts / portal API client**: Add terminal namespaces mirroring equipment

### API Client Structure

```
api.terminals.all({q, category_id, manufacturer_id, page})
api.terminals.getById(id)
api.terminalManufacturers.all/({page})
api.terminalManufacturers.getById(id)
api.terminalCategories.tree()

adminApi.terminals.{list,get,create,update,delete}
adminApi.terminalManufacturers.{list,get,create,update,delete}
adminApi.terminalCategories.{tree,get,create,update,delete}

portalApi.terminals.{all,getById,create,update,delete}
portalApi.terminals.{importValidate,importCommit,csvTemplate,jsonExample}
```

## Seed Data

- `frontend/data/recommended-terminals.json`: Array of `{id, brand, model, type, description, applicable_specs, external_url}` — mirror equipment seed data structure
- `backend/scripts/seed.py`: Add `seed_terminals()` function — create manufacturers from `brand`, map `type` to category, create terminal records
- `backend/scripts/seed_portal_users.py`: Add `terminal_manager@test.com` / `test123456` with scope_type `terminal_manufacturer`, scope_id of seeded manufacturer, modules `media`, `terminals`

## Testing Strategy

- **Backend**: Manual API testing via Swagger UI (`/docs`); verify scope isolation (portal user can only access own products), media provisioning on manufacturer create, import manufacturer_id override
- **Frontend**: Manual browser testing; verify public browsing (`/terminals`), admin CRUD flow, portal scope isolation, header search routing to `/terminals?q=`
- **No automated tests** per project MVP convention (frontend MVP does not require automated tests)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| ~2000+ lines duplicated code | Maintenance burden | Accepted for MVP; future refactor can extract generics when 3+ modules exist |
| 38 tasks across 11 groups | Execution complexity | Subagent-Driven Development for parallel execution of independent layers |
| Admin sidebar is DB-driven | Menu items must be seeded | Alembic migration seeds menu items alongside schema |
| Large frontend route surface | Many new files | Mirror equipment directory structure exactly; pattern is proven |
| Category composite IDs contain `/` | URL encoding needed | Use catch-all `[...id]` route (same as equipment categories) |
