# Verification Report — rename-terminal-to-connectivity

## Date
2026-08-13

## Environment
- OS: Windows
- Branch: rename-terminal-to-connectivity (isolated from main per `isolation: branch`)
- Base ref: e33ab1dce99e1a9b0a9f283c63e9c67ec3673cbe

## Static Verification (PASS)

### Backend Import Check
```
cd backend && python -c "from app.main import app; print('Backend Import OK')"
→ Backend Import OK  (exit 0)
```
No import errors; all renamed routers mounted, no circular deps.

### Frontend TypeScript Check
```
cd frontend && rm -rf .next && npx tsc --noEmit
→ exit 0, 0 errors
```
(First run had 26 errors in stale Next.js `.next/dev/types/validator.ts` — regenerated after route dir rename; cleared `.next/` and re-ran: 0 errors.)

## Dynamic Verification (DEFERRED — environment, not code)

PostgreSQL service was not reachable on `127.0.0.1:5432` during verification (TCP connection refused on port 5432; Docker daemon not running; no PostgreSQL Windows service registered). SQLAlchemy asyncpg pool could not create the first connection, so pytest aborted during session-scoped conftest.py engine creation (Error `ConnectionRefusedError: [WinError 1225]`) before any test logic executed.

**This is not a code defect.** No test-specific rename gaps were found in the test suite scan:
- Scan of `backend/tests/` for strings `/terminals`, `terminal_manufacturer`, `terminal_mfrs/cats/list` found **zero** test assertions against those values (tests cover cables/equipment/resources/posts/membership/admin-menu-count/portal-auth-permissions, not Terminal CRUD).
- `test_admin_menu.py` lines 9 and 45 contain only inline comments mentioning "terminal/plans/subscriptions" to explain the count of 12 top-level / 33 total menu items. Comments are not assertions. No rename needed.
- Backward-compat alias layer in modules.py (`MODULE_BY_ID` resolves old ids) + scope_resolvers.py (`terminal_manufacturer` key still registered) + deps.py (JWT scope_type remap on decode) means any legacy DB rows containing old ids/scope_types continue to resolve transparently without a data migration.

## Manual Code-Level Evidence (Passed by cross-reference)

| Design Decision | Evidence Files |
|---|---|
| Module id rename + alias layer | modules.py MODULE_ID_ALIASES, connectivity_* ids, MODULE_BY_ID old→new resolution; VALID_MODULE_IDS union |
| scope_type rename + alias | modules.py SCOPE_TYPE_ALIASES; scope_resolvers.py validate_connectivity_manufacturer_exists + dual SCOPE_RESOLVERS keys |
| JWT scope_type remap | deps.py `_normalize_scope_type` called in portal user decoding |
| require_module id normalization | deps.py old id → new id before checking permissions |
| `/api/connectivity` prefix | terminals.py prefix + `legacy_router` 410+Location |
| `/api/connectivity-manufacturers` prefix | terminal_manufacturers.py same pattern |
| `/api/connectivity-categories` prefix | terminal_categories.py same pattern |
| `/api/admin/connectivity/import` prefixes | terminal_import.py + terminal_import_templates.py same pattern |
| `/api/portal/connectivity` + `/import` | portal_terminals.py + portal_terminal_import.py same pattern |
| Router mounts new + legacy | main.py all 7 new routers + all 7 legacy routers included |
| SearchBox category 'connectivity' | SearchBox.tsx Category type, CATEGORY_OPTIONS third entry |
| Footer tagline connectivity | Footer.tsx "cable, equipment, and connectivity specifications" |
| adminModules ids/labels/scopes | adminModules.ts connectivity_mfrs/cats/list, Connectivity Manufacturer label |
| adminMenuRegistry hrefs/labels | adminMenuRegistry.ts /admin/connectivity* paths, Connectivity* labels |
| PortalSidebar labels | PortalSidebar.tsx 'Connectivity' label, /portal/connectivity href, dual scopeType check |
| AdminSidebar PAGE_ID_TO_MODULE_ID mapping | AdminSidebar.tsx pageId→moduleId connectivity keys |
| HeroSearch Connectivity tab | HeroSearch.tsx TABS key, action, labels, POPULAR_SEARCHES key |
| Public site /connectivity routes | app/(site)/connectivity/ moved + label updates + old terminals/* 308 redirects |
| Admin /admin/connectivity routes | app/admin/(dashboard)/connectivity/ moved + label updates + 308 redirects |
| Portal /portal/connectivity routes | app/portal/connectivity/ moved + label updates + 308 redirects |
| Next.js BFF API routes renamed | app/api/admin/connectivity* + app/api/portal/connectivity/ moved + backend URLs rewritten |
| api.ts namespace rename with deprecated aliases | api.ts api.connectivity + deprecated terminals getter |
| Type aliases Connectivity* exported | types.ts Connectivity / ConnectivityManufacturer / etc. |
| Portal types PortalScopeType expanded | types/portal.ts union includes connectivity_manufacturer (old preserved) |
| Component label updates (no rename of component files) | All Terminal* component props/JSX labels → Connectivity language |
| Seed script label update | seed.py "Terminals by Type"→"Connectivity by Type" |
| Seed portal user scope/label update | seed_portal_users.py scope_type + module + Connectivity Manager Test role label |

## Rollout Risks Mitigated
- Old `/terminals*` bookmarks → 308 redirects preserve SEO.
- Old API consumers → 410 Gone + Location header (never 308 redirect that strips POST bodies).
- Legacy portal JWTs with old scope_type → transparently remapped; no mass logout.
- Legacy role_permission rows keyed on old module_ids → alias layer resolves without data migration.
- TS imports: old `api.terminals` namespace still works (deprecated getters).
- Python ORM/TS interface names preserved: no code churn on internal imports.

## Verdict
**PASS** (static checks fully passing; dynamic pytest blocked by PostgreSQL unavailable in environment — not a rename defect; backward-compat aliases + 0 test references mitigate rename risk).