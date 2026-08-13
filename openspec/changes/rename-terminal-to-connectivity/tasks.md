## 1. Backend Core: Module IDs, Scope Types, and Backward-Compat Aliases

- [ ] 1.1 Update `app/core/modules.py`: rename module ids `terminal_mfrs`→`connectivity_mfrs`, `terminal_cats`→`connectivity_cats`, `terminal_list`→`connectivity_list`; update labels to "Connectivity Mfrs", "Connectivity Cats", "Connectivity List"; rename scope_type `terminal_manufacturer`→`connectivity_manufacturer` in VALID_SCOPE_TYPES; add backward-compat alias map (old id → new id) in MODULE_BY_ID resolution
- [ ] 1.2 Update `app/core/scope_resolvers.py`: add `validate_connectivity_manufacturer_exists` function (delegates to existing `crud_terminal_manufacturer`); add `SCOPE_RESOLVERS["connectivity_manufacturer"]` key; keep old `terminal_manufacturer` key as alias pointing to same resolver
- [ ] 1.3 Update `app/api/deps.py`: add JWT scope_type remap in `get_current_portal_user` (map `terminal_manufacturer`→`connectivity_manufacturer` on token decode); update `require_module` to accept both old and new module ids via alias resolution

## 2. Backend API Routes: New Prefixes + 410 Gone Alias Routes

- [ ] 2.1 Update `app/api/routes/terminals.py`: change router prefix to `/api/connectivity`; update all `require_module` calls to use `connectivity_list`; update error messages from "Terminal" to "Connectivity"; add a second legacy router at `/api/terminals` that returns 410 Gone + Location header for all endpoints
- [ ] 2.2 Update `app/api/routes/terminal_manufacturers.py`: change router prefix to `/api/connectivity-manufacturers`; update `require_module` to `connectivity_mfrs`; add 410 alias router at `/api/terminal-manufacturers`
- [ ] 2.3 Update `app/api/routes/terminal_categories.py`: change router prefix to `/api/connectivity-categories`; update `require_module` to `connectivity_cats`; add 410 alias router at `/api/terminal-categories`
- [ ] 2.4 Update `app/api/routes/terminal_import.py`: change router prefix to `/api/admin/connectivity/import`; update `require_module` to `connectivity_list`; add 410 alias router at `/api/admin/terminals/import`
- [ ] 2.5 Update `app/api/routes/terminal_import_templates.py`: change router prefix to `/api/admin/connectivity/import`; add 410 alias at old path
- [ ] 2.6 Update `app/api/routes/portal_terminals.py`: change router prefix to `/api/portal/connectivity`; update scope checks to `connectivity_manufacturer`; add 410 alias router at `/api/portal/terminals`
- [ ] 2.7 Update `app/api/routes/portal_terminal_import.py`: change router prefix to `/api/portal/connectivity/import`; update scope checks; add 410 alias router at `/api/portal/terminals/import`

## 3. Backend Main Router Mounts

- [ ] 3.1 Update `app/main.py`: mount all new-prefix routers; mount all 410 alias routers; ensure no duplicate route conflicts

## 4. Backend Seeds and Scripts

- [ ] 4.1 Update `scripts/seed.py`: use new module ids (`connectivity_mfrs`, `connectivity_cats`, `connectivity_list`) and new scope_type (`connectivity_manufacturer`) in role permission seeds and any terminal-related label strings
- [ ] 4.2 Update `scripts/seed_portal_users.py`: use `scope_type=connectivity_manufacturer` for portal user seeds

## 5. Frontend API Client: New Namespaces + Deprecated Aliases

- [ ] 5.1 Update `lib/api.ts`: rename client namespace `api.terminals`→`api.connectivity`, `api.terminalManufacturers`→`api.connectivityManufacturers`, `api.terminalCategories`→`api.connectivityCategories`; update all fetch URLs from `/api/terminals`→`/api/connectivity`, `/api/terminal-manufacturers`→`/api/connectivity-manufacturers`, `/api/terminal-categories`→`/api/connectivity-categories`; keep deprecated alias exports (`api.terminals` etc.) pointing to same functions
- [ ] 5.2 Update `lib/adminApi.ts`: update all terminal-related endpoint paths to new `/api/connectivity*` paths; update any terminal label strings
- [ ] 5.3 Update `lib/portalApi.ts` and `lib/portalApiClient.ts`: update all terminal-related endpoint paths to new `/api/portal/connectivity*` paths
- [ ] 5.4 Update `lib/clientTerminalImport.ts`: update API endpoint paths to new connectivity import paths

## 6. Frontend Admin Module Registry and Menu

- [ ] 6.1 Update `lib/adminModules.ts`: rename module ids `terminal_mfrs`→`connectivity_mfrs`, `terminal_cats`→`connectivity_cats`, `terminal_list`→`connectivity_list`; update labels to "Connectivity Mfrs/Cats/List"; rename scopeType `terminal_manufacturer`→`connectivity_manufacturer`; update SCOPE_TYPE_LABELS entry to "Connectivity Manufacturer"
- [ ] 6.2 Update `lib/adminMenuRegistry.ts`: update pageId `terminal-mfrs`→`connectivity-mfrs` with href `/admin/connectivity/manufacturers`; update `terminal-cats`→`connectivity-cats` with href `/admin/connectivity/categories`; update `terminals`→`connectivity` with href `/admin/connectivity`; update labels to "Connectivity Manufacturers", "Connectivity Categories", "Connectivity"

## 7. Frontend Next.js App Route Directories

- [ ] 7.1 Move `app/(site)/terminals/` → `app/(site)/connectivity/` (all subdirectories: page.tsx, [slug]/, manufacturers/[slug]/); update internal fetch calls to use new API paths; update page titles/breadcrumbs from "Terminal" to "Connectivity"
- [ ] 7.2 Add 308 redirect route at `app/(site)/terminals/` (old path) pointing to `/connectivity` equivalents
- [ ] 7.3 Move `app/admin/(dashboard)/terminals/` → `app/admin/(dashboard)/connectivity/` (all subdirectories: page.tsx, new/, import/, manufacturers/, categories/, [id]/, etc.); update internal links and labels
- [ ] 7.4 Add 308 redirect route at `app/admin/(dashboard)/terminals/` pointing to `/admin/connectivity` equivalents
- [ ] 7.5 Move `app/portal/terminals/` → `app/portal/connectivity/` (all subdirectories: page.tsx, import/, [id]/, loading.tsx); update internal links and labels
- [ ] 7.6 Add 308 redirect route at `app/portal/terminals/` pointing to `/portal/connectivity` equivalents
- [ ] 7.7 Move Next.js API route handlers: `app/api/admin/terminals/` → `app/api/admin/connectivity/`; `app/api/admin/terminal-categories/` → `app/api/admin/connectivity-categories/`; `app/api/admin/terminal-manufacturers/` → `app/api/admin/connectivity-manufacturers/`; `app/api/portal/terminals/` → `app/api/portal/connectivity/`; update internal fetch calls to new backend API paths
- [ ] 7.8 Add 308 redirect route handlers at old `app/api/admin/terminals/` and `app/api/portal/terminals/` paths pointing to new paths

## 8. Frontend UI Strings and Labels

- [ ] 8.1 Update `components/shared/SearchBox.tsx`: change category value `terminal`→`connectivity`; label "Terminals"→"Connectivity"; placeholder "Search terminal model, brand..."→"Search connectivity model, brand..."; path `/terminals`→`/connectivity`; add stale-cache compatibility shim mapping `terminal`→`connectivity`
- [ ] 8.2 Update `components/layout/Footer.tsx`: change tagline from "cable, equipment, and terminal specifications" to "cable, equipment, and connectivity specifications"
- [ ] 8.3 Update all terminal-related visible strings in `components/terminals/*.tsx` (TerminalCard, TerminalFilters, TerminalCategoryNav, TerminalListClient, ApplicableSpecsTable): labels, breadcrumbs, titles from "Terminal" to "Connectivity"
- [ ] 8.4 Update all terminal-related visible strings in `components/admin/form/TerminalForm.tsx`, `TerminalCategoryForm.tsx`, `TerminalManufacturerForm.tsx`: labels, placeholders, titles
- [ ] 8.5 Update all terminal-related visible strings in `components/portal/form/TerminalCreateForm.tsx`, `TerminalEditForm.tsx`, `TerminalDeleteButton.tsx`, `TerminalFormFields.tsx`: labels, placeholders, titles
- [ ] 8.6 Update `components/portal/terminals/TerminalListToolbar.tsx`: labels
- [ ] 8.7 Update `components/admin/list/TerminalSearchBox.tsx`: labels and placeholder text
- [ ] 8.8 Update `components/admin/layout/AdminSidebar.tsx` and `components/portal/layout/PortalSidebar.tsx`: menu item labels from "Terminal" to "Connectivity"
- [ ] 8.9 Update `components/home/HeroSearch.tsx`: any terminal-related labels
- [ ] 8.10 Update `lib/terminalFilter.ts`: update any visible label strings (function/variable names can stay)

## 9. Frontend Type Aliases (Optional but Recommended)

- [ ] 9.1 Add type alias exports in `lib/types.ts`: `export type Connectivity = Terminal`, `export type ConnectivityManufacturer = TerminalManufacturer`, `export type ConnectivityCategory = TerminalCategory`, `export type ConnectivityFilterParams = TerminalFilterParams`, etc. (old names remain importable)

## 10. OpenSpec Spec and Tests

- [ ] 10.1 Update `openspec/specs/terminal-connector-module/spec.md` (will be synced at archive time from delta spec)
- [ ] 10.2 Update any backend tests that assert on old route paths (`/api/terminals`, `/api/terminal-manufacturers`, `/api/terminal-categories`, `/api/portal/terminals`) to use new paths OR test both old (410) and new (200) paths
- [ ] 10.3 Update any backend tests that assert on old module ids (`terminal_mfrs`, `terminal_cats`, `terminal_list`) to use new ids OR test alias resolution
- [ ] 10.4 Update any backend tests that assert on old scope_type (`terminal_manufacturer`) to use new scope_type OR test JWT remap
- [ ] 10.5 Update any frontend tests or validation scripts that reference old terminal paths/labels
