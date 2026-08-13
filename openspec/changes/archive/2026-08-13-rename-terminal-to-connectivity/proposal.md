## Why

The existing "Terminal Manufacturers" scope is too narrow: the module already supports both terminal/connector product lines (Ring Terminals, Spade Terminals, Butt Connectors, RJ45/Fiber Optic Connectors) but the UI labels, route segments, module names, and scope type name all read "Terminal", which makes connector manufacturers feel misclassified. A semantic umbrella name — "Connectivity" — better communicates that one manufacturer scope covers all hardware connection products: terminals, connectors, splices, adapters, and cable accessories.

## What Changes

- **MODIFIED User-visible labels**: "Terminal" and "Terminals" → "Connectivity" and "Connectivity Products"; "Terminal Manufacturers" → "Connectivity Manufacturers"; "Terminal Category" → "Connectivity Category". All admin/portal/public breadcrumbs, page titles, nav items, form labels, placeholders, and menu items.
- **MODIFIED** Frontend route segments: `/terminals` → `/connectivity` (public list/detail/manufacturers); `/admin/terminals` → `/admin/connectivity`; `/portal/terminals` → `/portal/connectivity` (with 308 redirects from old paths).
- **MODIFIED** API route segments: `/api/terminals` → `/api/connectivity`; `/api/terminal-manufacturers` → `/api/connectivity-manufacturers`; `/api/terminal-categories` → `/api/connectivity-categories`. Portal/admin sub-routes similarly renamed. **BREAKING** for clients using old paths.
- **MODIFIED** Scope type: `terminal_manufacturer` → `connectivity_manufacturer` (portal role assignments, deps permission matrix, folder container names, scope resolvers, portal user seeds, admin module ids). **BREAKING** for existing portal tokens encoded with the old scope.
- **MODIFIED** Admin module ids: `terminal_mfrs` → `connectivity_mfrs`; `terminal_cats` → `connectivity_cats`; `terminal_list` → `connectivity_list` (admin menu registry, sidebar, RBAC).
- **MODIFIED** OpenSpec main spec: existing `terminal-connector-module` spec headers and capability names re-branded to `connectivity-module` semantics.
- **PRESERVED** Database table names, SQL column names, Python/TS model class names, and the existing `applicable_specs` JSON shape — no schema migration needed.

## Capabilities

### New Capabilities

- `connectivity-route-redirects`: Inbound URL compatibility — 308 redirect from `/terminals/**`, `/admin/terminals/**`, `/portal/terminals/**` to the new `/connectivity` segments so old bookmarks and external links keep working.

### Modified Capabilities

- `terminal-connector-module`: All user-visible names, module ids, route paths, and the scope_type identifier change from "Terminal" to "Connectivity". The underlying data model (manufacturers / 2-level categories / products with applicable_specs JSONB) and the permission boundary (one manufacturer scope owns its manufacturers, categories, and products) do not change behavior — only their labels and API surface identifiers.

## Impact

- **Backend**: `app/models/terminal.py`, `app/schemas/terminal.py`, `app/crud/terminal.py`, `app/services/terminal_import.py` (identifiers stay, exported API contracts stay); `app/api/routes/terminal*` (new route prefixes + backward-compat aliases); `app/core/modules.py`, `app/core/scope_resolvers.py`, `app/api/deps.py`, `app/crud/folder.py` (new scope_type keys; keep old as aliases for one release); `app/main.py` router mounts; `scripts/seed.py` and `scripts/seed_portal_users.py` (new + legacy labels coexist); `alembic` — no data migration, only optional menu seed update for new labels.
- **Frontend**: All `/terminals` page routes moved to `/connectivity` with Next.js rewrites or redirects; SearchBox, PortalSidebar, AdminMenuRegistry, AdminModules, breadcrumb/labels across admin/portal/public form/list components; API clients (`api.terminals.*` → `api.connectivity.*` with deprecated-alias exports); data file `recommended-terminals.json` reads renamed but file path stays to avoid breaking existing media references.
- **Public API**: Documented **BREAKING** route rename in changelog; `/api/terminals/**` returns 410 Gone with a `Location` header pointing at `/api/connectivity/**` for one release before full removal.
- **Portal sessions**: Any extant JWT tokens encoding `scope_type: terminal_manufacturer` are transparently remapped to the new scope_type by `get_current_portal_user` so logged-in factory users do not need to re-login after deploy.
