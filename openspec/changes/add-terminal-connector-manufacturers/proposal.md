## Why

The platform currently has two manufacturer types: Cable (wire/cable specs) and Equipment (processing machinery). Terminal & Connector manufacturers are a distinct industry segment that needs their own catalog, portal access, and product management — following the same proven pattern as the Equipment module.

## What Changes

- Add `TerminalManufacturer`, `TerminalCategory` (2-level self-referential tree), and `Terminal` (product) database models with the same field shape as their equipment counterparts, including `applicable_specs` JSONB for cable-matching
- Add Alembic migration creating 3 new tables (`terminal_manufacturers`, `terminal_categories`, `terminals`)
- Add backend CRUD, Pydantic schemas, and 7 API route modules: public/admin terminal CRUD, terminal manufacturers, terminal categories, admin import, portal terminal CRUD, portal terminal import
- Register new admin modules (`terminal_mfrs`, `terminal_cats`, `terminal_list`) and new scope_type `terminal_manufacturer` in `modules.py`, `scope_resolvers.py`, and portal permission matrix `_FACTORY_ALLOWED_BY_SCOPE`
- Extend media folder provisioning (`CONTAINER_NAMES`) to support the new scope_type with "Terminal Manufacturers" container
- Add frontend public pages (`/terminals`, `/terminals/[slug]`, `/terminals/manufacturers/[slug]`), admin pages (`/admin/terminals/*`), and portal pages (`/portal/terminals/*`)
- Add portal sidebar nav for `terminal_manufacturer` scope_type
- Add "Terminal" as a third category option in the header search box dropdown
- Add seed data and test portal user for terminal manufacturer

## Capabilities

### New Capabilities
- `terminal-connector-module`: Full Terminal & Connector manufacturer catalog — manufacturers, 2-level categories, products with cable-matching specs, public browsing, admin CRUD, portal self-service management, CSV/JSON import, media folder provisioning, inquiry linkage

### Modified Capabilities
<!-- No existing spec-level requirements are changing; integrations with media/inquiry/search are extensions covered by the new capability. -->

## Impact

- **Backend**: New models, migration, CRUD, schemas, routes, module registration, scope resolver, media folder extension, portal permission matrix, seed scripts
- **Frontend**: New public/admin/portal pages, components, API client namespaces, portal sidebar nav, header search category, admin menu registry
- **Database**: 3 new tables; no changes to existing tables
- **API**: ~7 new route modules registered in `main.py`; no changes to existing endpoints
- **Existing code**: Minimal edits to `modules.py`, `scope_resolvers.py`, `deps.py`, `crud/folder.py`, `main.py`, `PortalSidebar.tsx`, `SearchBox.tsx`, `adminMenuRegistry.ts`, `adminModules.ts`, `api.ts`, `adminApi.ts`
