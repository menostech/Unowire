# Tasks: Add Terminal & Connector Manufacturers

## 1. Backend Models & Migration

- [x] 1.1 Create `backend/app/models/terminal.py` with `TerminalManufacturer`, `TerminalCategory` (2-level self-ref tree), and `Terminal` (product with `applicable_specs` JSONB) — mirror `equipment.py` field shapes
- [x] 1.2 Export new models in `backend/app/models/__init__.py`
- [x] 1.3 Create Alembic migration for `terminal_manufacturers`, `terminal_categories`, `terminals` tables (mirror `e3f4a5b6c7d8` structure: FKs with RESTRICT on delete, unique constraints on slug, self-ref FK on categories)
- [x] 1.4 Add admin menu seed entries to the migration: `terminal-mfrs`, `terminal-cats`, `terminals` page IDs under a "Terminal & Connector" group

## 2. Backend Schemas & CRUD

- [x] 2.1 Create `backend/app/schemas/terminal.py` with all Pydantic schemas: `TerminalManufacturer*`, `TerminalCategory*` (flat + tree read), `Terminal*` (read/create/update), `PortalTerminalCreate` (omits id + manufacturer_id) — mirror `schemas/equipment.py`
- [x] 2.2 Create `backend/app/crud/terminal.py` with `CRUDTerminalManufacturer`, `CRUDTerminalCategory` (get_with_children, get_all_top_level_with_children, get_all_flat), `CRUDTerminal` (get_with_relations, get_all_with_relations, list_by_manufacturer, count_by_manufacturer, get_matching_cable) — mirror `crud/equipment.py`; export singletons `crud_terminal_manufacturer`, `crud_terminal_category`, `crud_terminal`

## 3. Backend Core Registration

- [x] 3.1 Add admin modules `terminal_mfrs`, `terminal_cats`, `terminal_list` to `backend/app/core/modules.py` `ADMIN_MODULES` with scope_type `terminal_manufacturer` for mfrs/list; add `"terminal_manufacturer"` to `VALID_SCOPE_TYPES`
- [x] 3.2 Add `validate_terminal_manufacturer_exists` to `backend/app/core/scope_resolvers.py` and register in `SCOPE_RESOLVERS` map
- [x] 3.3 Add portal permission matrix entry `"terminal_manufacturer": {"dashboard", "terminals", "inquiries", "media", "me", "messages"}` to `_FACTORY_ALLOWED_BY_SCOPE` in `backend/app/api/deps.py`
- [x] 3.4 Add `"terminal_manufacturer": "Terminal Manufacturers"` to `CONTAINER_NAMES` in `backend/app/crud/folder.py`

## 4. Backend API Routes (Public/Admin)

- [x] 4.1 Create `backend/app/api/routes/terminals.py` → mounted at `/api/terminals` — list (with cable_id matching, q, category_id, manufacturer_id filters), detail, create/update/delete (operator deps `terminal_list`, scope check for terminal_manufacturer role) — mirror `routes/equipment.py`
- [x] 4.2 Create `backend/app/api/routes/terminal_manufacturers.py` → `/api/terminal-manufacturers` — CRUD with media folder provisioning on create, rename on update, cleanup on delete; scope check for terminal_manufacturer role — mirror `routes/equipment_manufacturers.py`
- [x] 4.3 Create `backend/app/api/routes/terminal_categories.py` → `/api/terminal-categories` — tree list, detail, create/update/delete with 2-level depth enforcement and child-existence delete guard — mirror `routes/equipment_categories.py`
- [ ] 4.4 Create `backend/app/api/routes/terminal_import.py` → `/api/admin/terminals/import` — POST /validate, POST /commit (dep `terminal_list`) — mirror `routes/equipment_import.py`
- [ ] 4.5 Create `backend/app/api/routes/terminal_import_templates.py` → `/api/admin/terminals/import` — GET /csv-template, GET /json-example — mirror `routes/equipment_import_templates.py`
- [ ] 4.6 Create `backend/app/services/terminal_import.py` import service — mirror `services/equipment_import.py`
- [ ] 4.7 Register all public/admin terminal routers in `backend/app/main.py`

## 5. Backend API Routes (Portal)

- [ ] 5.1 Create `backend/app/api/routes/portal_terminals.py` → prefix `/api/portal/terminals`, tag `portal-termals` (dep `require_factory_module("terminals")`) — scope-filtered list/detail/update/create/delete, force manufacturer_id on create, server-generate ID — mirror `routes/portal_equipment.py`
- [ ] 5.2 Create `backend/app/api/routes/portal_terminal_import.py` → prefix `/api/portal/terminals/import` — POST /validate, POST /commit with `_force_manufacturer_id`, GET /csv-template, GET /json-example — mirror `routes/portal_equipment_import.py`
- [ ] 5.3 Register portal terminal routers in `backend/app/main.py`

## 6. Frontend API Clients & Lib

- [ ] 6.1 Add `terminals`, `terminalManufacturers`, `terminalCategories` namespaces to `frontend/lib/api.ts` (public client) with adapter functions — mirror equipment namespaces
- [ ] 6.2 Add `adminApi.terminals`, `adminApi.terminalManufacturers`, `adminApi.terminalCategories` to `frontend/lib/adminApi.ts` — mirror equipment admin namespaces
- [ ] 6.3 Add portal terminal API methods to portal API client (list, getById, create, update, delete, import validate/commit, csv-template, json-example) — mirror portal equipment methods
- [ ] 6.4 Create `frontend/lib/terminalFilter.ts` — pure in-memory filter + facet builder — mirror `lib/equipmentFilter.ts`
- [ ] 6.5 Create `frontend/lib/clientTerminalImport.ts` — import client — mirror `lib/clientEquipmentImport.ts`

## 7. Frontend Public Pages & Components

- [ ] 7.1 Create `frontend/app/(site)/terminals/page.tsx` — listing with category/manufacturer/spec filters, server-side data load — mirror `equipment/page.tsx`
- [ ] 7.2 Create `frontend/app/(site)/terminals/[slug]/page.tsx` — product detail with image, manufacturer link, category badge, applicable specs table, inquiry form (`recipientType="terminal_manufacturer"`), JSON-LD — mirror `equipment/[slug]/page.tsx`
- [ ] 7.3 Create `frontend/app/(site)/terminals/manufacturers/[slug]/page.tsx` — manufacturer profile with contact info and product grid — mirror `equipment/manufacturers/[slug]/page.tsx`
- [ ] 7.4 Create terminal components in `frontend/components/terminals/`: `TerminalCard.tsx`, `TerminalListClient.tsx`, `TerminalFilters.tsx`, `TerminalCategoryNav.tsx` — mirror `components/equipment/`

## 8. Frontend Admin Pages & Components

- [ ] 8.1 Create admin pages under `frontend/app/admin/(dashboard)/terminals/`: `page.tsx` (list), `new/page.tsx`, `[id]/page.tsx` (edit), `manufacturers/page.tsx` + `new` + `[id]`, `categories/page.tsx` + `new` + `[...id]`, `import/page.tsx` — mirror `admin/(dashboard)/equipment/` structure
- [ ] 8.2 Create admin form components in `frontend/components/admin/form/`: `TerminalManufacturerForm.tsx`, `TerminalForm.tsx`, `TerminalCategoryForm.tsx` — mirror equipment form components
- [ ] 8.3 Create `frontend/components/admin/list/TerminalSearchBox.tsx` — mirror `EquipmentSearchBox.tsx`

## 9. Frontend Portal Pages & Components

- [ ] 9.1 Create portal pages under `frontend/app/portal/terminals/`: `page.tsx` (list), `new/page.tsx`, `[id]/page.tsx` (edit), `import/page.tsx`, `loading.tsx` — mirror `portal/equipment/` structure
- [ ] 9.2 Create portal form components in `frontend/components/portal/form/`: `TerminalFormFields.tsx`, `TerminalCreateForm.tsx`, `TerminalEditForm.tsx`, `TerminalDeleteButton.tsx` — mirror equipment portal form components
- [ ] 9.3 Create `frontend/components/portal/terminals/TerminalListToolbar.tsx` — mirror `EquipmentListToolbar.tsx`

## 10. Frontend Integration

- [ ] 10.1 Add `TERMINAL_MANUFACTURER_NAV` array to `frontend/components/portal/layout/PortalSidebar.tsx` and select it by `scope_type === "terminal_manufacturer"` — mirror `EQUIPMENT_MANUFACTURER_NAV`
- [ ] 10.2 Add "Terminal" as third option in `frontend/components/shared/SearchBox.tsx` category dropdown, routing to `/terminals?q=` with placeholder "Search terminal model, brand..."
- [ ] 10.3 Add terminal entries to `frontend/lib/adminMenuRegistry.ts` `ADMIN_PAGES` and `frontend/lib/adminModules.ts` (scope_type label, module definitions) — mirror equipment entries
- [ ] 10.4 Add terminal route handler pages under `frontend/app/api/admin/terminals/`, `frontend/app/api/admin/terminal-manufacturers/`, `frontend/app/api/admin/terminal-categories/`, `frontend/app/api/portal/terminals/` — mirror equipment route handlers

## 11. Seed Data & Test Users

- [ ] 11.1 Add `seed_terminals()` function to `backend/scripts/seed.py` — create sample terminal manufacturers, categories, and products from a data file — mirror `seed_equipment()`
- [ ] 11.2 Create `frontend/data/recommended-terminals.json` seed data file — mirror `recommended-equipments.json` structure
- [ ] 11.3 Add terminal test user to `backend/scripts/seed_portal_users.py` — `terminal_manager@test.com` / `test123456` with scope_type `terminal_manufacturer`, scope_id of a seeded terminal manufacturer, modules `media`, `terminals`
