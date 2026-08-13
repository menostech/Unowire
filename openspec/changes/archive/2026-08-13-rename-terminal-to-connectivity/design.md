---
comet_change: rename-terminal-to-connectivity
role: technical-design
canonical_spec: openspec
---

## Context

The Unowire platform ships a "Terminal Manufacturers" module that covers both terminal products (ring, spade, butt) and connector products (RJ45, fiber optic, splice, adapter). The current naming — "Terminal" everywhere in the UI, routes, module IDs, and scope types — is too narrow and makes connector manufacturers feel misclassified. Connector manufacturers are equally important customers, so we need an umbrella term that covers all hardware connection products.

This change re-brands the entire public-facing and admin/portal surface from "Terminal" to "Connectivity" without changing the underlying data model, SQL tables, Python class names, or TS interface names. The underlying model (manufacturers / 2-level categories / products with applicable_specs JSONB) and the permission boundary (one manufacturer scope owns its manufacturers, categories, and products) remain identical — only names, labels, route segments, module ids, and scope_type identifiers change.

### Current State (before change)

**Backend** (key anchors):
- `app/core/modules.py` — `terminal_mfrs`, `terminal_cats`, `terminal_list` module ids; label strings "Terminal Mfrs / Cats / List"; scope_type `"terminal_manufacturer"`; VALID_SCOPE_TYPES includes it.
- `app/core/scope_resolvers.py` — `validate_terminal_manufacturer_exists` resolver; `SCOPE_RESOLVERS["terminal_manufacturer"]` key.
- `app/api/routes/terminals.py`, `terminal_categories.py`, `terminal_manufacturers.py`, `terminal_import.py`, `terminal_import_templates.py`, `portal_terminals.py`, `portal_terminal_import.py` — route prefixes `/api/terminals`, `/api/terminal-*`, `/api/portal/terminals/*`.
- `app/main.py` — mounts all above routers.
- `app/api/deps.py` — `require_module("terminal_list")`, `require_module("terminal_mfrs")`, `require_scope_type("terminal_manufacturer")` calls inside route dependencies.
- `app/crud/terminal.py` — CRUD classes (identifiers untouched per this design).
- `app/models/terminal.py`, `app/schemas/terminal.py` — ORM class names (TerminalManufacturer, TerminalCategory, Terminal) preserved; only export/visible schema labels change.
- `alembic/versions/*_seed_admin_terminal_permissions.py` and `*_add_terminal_manufacturers_and_categories.py` — existing menu seeds with old labels.
- `scripts/seed.py`, `scripts/seed_portal_users.py` — may reference scope_type and labels.

**Frontend** (key anchors):
- `lib/adminMenuRegistry.ts` — page entries `terminal-mfrs`, `terminal-cats`, `terminals` with hrefs `/admin/terminals/...` and labels "Terminal Manufacturers", "Terminal Categories", "Terminals".
- `lib/adminModules.ts` — mirrors backend modules: `terminal_mfrs`/`terminal_cats`/`terminal_list` ids, labels, scopeType `"terminal_manufacturer"`; `SCOPE_TYPE_LABELS` with "Terminal Manufacturer".
- `lib/types.ts` — TS interfaces `TerminalManufacturer`, `TerminalCategory`, `Terminal`, plus `TerminalFilterParams/Facets/ListResponse` and `BackendTerminal*` adapters.
- `lib/api.ts` — client namespace `api.terminals.*`, `api.terminalManufacturers.*`, `api.terminalCategories.*` hitting `/api/terminals`, `/api/terminal-manufacturers`, `/api/terminal-categories`.
- `lib/adminApi.ts`, `lib/portalApi.ts`, `lib/portalApiClient.ts`, `lib/clientTerminalImport.ts` — similar endpoint paths.
- `app/(site)/terminals/**` — public list/detail/manufacturer pages.
- `app/admin/(dashboard)/terminals/**` — admin list/manufacturers/categories/new/import/detail sub-pages + Next.js route handlers under `app/api/admin/terminals/**` and `app/api/admin/terminal-{categories,manufacturers}/**`.
- `app/portal/terminals/**` — portal list/import/[id] + `app/api/portal/terminals/**` route handlers.
- `components/terminals/**` — `TerminalCard`, `TerminalFilters`, `TerminalCategoryNav`, `TerminalListClient`, `ApplicableSpecsTable`.
- `components/admin/form/*` — `TerminalForm`, `TerminalCategoryForm`, `TerminalManufacturerForm`.
- `components/admin/list/TerminalSearchBox.tsx`.
- `components/portal/form/*` — `TerminalCreateForm`, `TerminalEditForm`, `TerminalDeleteButton`, `TerminalFormFields`.
- `components/portal/terminals/TerminalListToolbar.tsx`.
- `components/shared/SearchBox.tsx` — dropdown category `terminal` → label "Terminals", placeholder "Search terminal model, brand...", path `/terminals`.
- `components/layout/Footer.tsx` — tagline "cable, equipment, and terminal specifications".
- `lib/terminalFilter.ts`, `data/recommended-terminals.json`.

**OpenSpec main specs**:
- `openspec/specs/terminal-connector-module/spec.md` — 10 requirements all worded with "Terminal" labels, route paths `/terminals`, `/api/terminals`, scope_type `terminal_manufacturer`, module ids `terminal_mfrs`, `terminal_cats`, `terminal_list`, category "Terminal" in the header search.

### Constraints

- No DB schema migration. Tables, columns, FK names stay.
- Python ORM class names (`TerminalManufacturer`, `TerminalCategory`, `Terminal`) and TS interface names stay — avoid a huge refactor and preserve import stability for internal callers; we rename exported route prefixes, labels, ids, and the api client namespace *and* add deprecated-alias exports.
- Backward compatibility for 1 release: old API routes respond with 410 + Location header (not 308 on API because POST/PUT bodies would break on redirect); old Next.js page routes 308-redirect to new paths; old scope_type transparently remapped in `get_current_portal_user` so existing JWT sessions don't require re-login; old folder container name "Terminal Manufacturers" still resolves.
- Language: all artifacts (design.md, specs, tasks) in English per `language: en` in `.comet.yaml`.

## Goals / Non-Goals

**Goals:**
- Every user-visible string that says "Terminal" or "Terminals" in admin/portal/public UI reads "Connectivity" or (where appropriate) "Connectivity Products".
- Admin/portal/public route segments `/terminals*` → `/connectivity*` with 308 redirects from old URLs.
- API route segments `/api/terminals`, `/api/terminal-{manufacturers,categories}`, `/api/portal/terminals*` → `/api/connectivity`, `/api/connectivity-{manufacturers,categories}`, `/api/portal/connectivity*` with 410 Gone + `Location` header from old paths.
- Admin module ids `terminal_mfrs`/`terminal_cats`/`terminal_list` → `connectivity_mfrs`/`connectivity_cats`/`connectivity_list`.
- scope_type `terminal_manufacturer` → `connectivity_manufacturer`; transparent JWT remap for existing sessions.
- OpenSpec main spec `terminal-connector-module` delta-renamed to reflect Connectivity terminology.
- Header search box third category "Terminals" → "Connectivity"; Footer tagline updated.

**Non-Goals:**
- Do NOT rename SQL tables/columns (no alembic data migration).
- Do NOT rename Python ORM classes or TS interfaces (`TerminalManufacturer` → stays; only exported API surface and labels change).
- Do NOT change the data model, applicable_specs JSON shape, import CSV schema, or permission boundary semantics.
- Do NOT rewrite `crud/terminal.py` or `services/terminal_import.py` identifiers (only import aliases where needed).
- Do NOT change file paths on disk for `models/terminal.py`, `schemas/terminal.py`, `crud/terminal.py`, `services/terminal_import.py`, or `data/recommended-terminals.json`.

## Decisions

### D1. Scope: identifier rename vs. label rename

**Decision:** Split changes into 3 buckets:

| Bucket | Rename? | Examples |
|---|---|---|
| (A) User-visible strings & labels | YES — fully rename | "Terminal Manufacturers" → "Connectivity Manufacturers"; page titles, breadcrumbs, form labels, button text, placeholders, footer tagline, search dropdown label, menu items |
| (B) API surface & routing (public contract) | YES — rename + backward-compat alias | route segments `/terminals` → `/connectivity`; API path `/api/terminals` → `/api/connectivity`; admin module_id; scope_type; admin page pageId/hrefs; frontend api.ts namespace exports |
| (C) Internal code identifiers (implementation detail) | NO — preserve ORM/TS interface names | Python: `TerminalManufacturer`, `TerminalCategory`, `Terminal`; TS interfaces: `Terminal` etc; file names `models/terminal.py` stay; CRUD class names stay |

**Rationale:** Bucket C rename is the largest diff (thousands of lines) and adds zero user value; it only creates churn risk and merge conflicts. The proposal explicitly says "PRESERVED Database table names, SQL column names, Python/TS model class names... — no schema migration needed." We extend that to internal class names. Buckets A and B are what users and clients see; those are the rename that matters for the business goal (connector manufacturers feel correctly classified).

**Alternatives considered:**
- Rename everything (A+B+C): too risky, value unclear, rejected.
- Rename only labels (A) and keep routes/modules ids: leaves "terminal_*" in URLs, permissions JSON, JWT payloads — URL still reads "Terminal" to the outside world. Rejected because external bookmarks/share links still have the old semantic.

### D2. Backward compatibility strategy

**Decision:**

- **Public UI routes (Next.js page routes `/terminals/**`, `/admin/terminals/**`, `/portal/terminals/**`):** Add permanent 308 redirects via Next.js middleware OR dedicated redirect page stubs that redirect to the new `/connectivity*` equivalents.
- **Public API routes (`/api/terminals/**`, `/api/terminal-{manufacturers,categories}/**`, `/api/portal/terminals/**`):** Old paths return HTTP 410 Gone with a `Location` response header pointing to the equivalent new URL. Do NOT 307/308 redirect API calls because browsers and fetch() clients don't preserve bodies on 308 for non-GET; a 410 with Location is explicit, machine-readable, and tells clients to update.
- **JWT scope_type remap:** `get_current_portal_user` in deps.py maps any incoming token with `scope_type="terminal_manufacturer"` to `scope_type="connectivity_manufacturer"` in the decoded identity. This way logged-in portal users don't get logged out after deploy. After the scope remap, all downstream checks only see the new name.
- **Admin module_id backward alias:** `MODULE_BY_ID` and permission checks accept both old ids (`terminal_mfrs` etc.) and new ids (`connectivity_mfrs` etc.) for one release. Any role_permission rows still keyed on old ids continue to resolve; seed data inserts the new ids.
- **Media folder container name:** "Terminal Manufacturers" container still works (don't rename the DB container row); new manufacturers also provision under it. In a later release we can rename the container row.
- **Frontend `api.ts` exports:** export new namespace `api.connectivity.*`, `api.connectivityManufacturers.*`, `api.connectivityCategories.*`; re-export `api.terminals.*` as deprecated aliases pointing to the same functions. Internal files can be migrated to the new names in one pass, and the deprecated aliases remain callable for 1 release.

**Rationale:** We want a one-release overlap window so (a) portal users with live sessions stay logged in, (b) any saved bookmarks work, (c) external API consumers (if any) get an explicit error with a machine-readable location rather than a silent 404. 410 is better than 404 for API because it signals "moved permanently, not missing."

**Alternatives considered:**
- Hard cutover with no redirects: bookmarks break, SEO is damaged, portal users get logged out. Rejected.
- 308 on API endpoints: unsafe for POST/PUT; fetch() follow-redirect behavior strips body. Rejected.
- Scope type hard cutover: every portal manufacturer user has to re-login. Poor UX. Rejected.

### D3. Header search box "terminal" → "connectivity" as a category value

**Decision:** The internal TS `type Category = 'cable' | 'equipment' | 'terminal'` gets a new variant `'connectivity'`. The variant `'terminal'` is still accepted but internally mapped to `'connectivity'` so old client code (if any cached JS bundle) doesn't crash. CATEGORY_OPTIONS updates:

```
{ value: 'connectivity', label: 'Connectivity', code: '03',
  placeholder: 'Search connectivity model, brand...', path: '/connectivity' }
```

The old `{ value: 'terminal', ... }` option is removed from the visible list but a compatibility shim maps `terminal` → `connectivity'` on mount of a stale cached bundle.

**Rationale:** URL query params and cached JS are the only consumers of the variant string; adding `'connectivity'` as the canonical value keeps the URL path `/connectivity` consistent.

### D4. Admin pageId, href, module_id 1:1 rename

**Decision:** In both backend `modules.py` and frontend `adminMenuRegistry.ts` / `adminModules.ts`:

| Old | New |
|---|---|
| `terminal_mfrs` (module id) / "Terminal Mfrs" (label) | `connectivity_mfrs` / "Connectivity Mfrs" |
| `terminal_cats` (module id) / "Terminal Cats" (label) | `connectivity_cats` / "Connectivity Cats" |
| `terminal_list` (module id) / "Terminal List" (label) | `connectivity_list` / "Connectivity List" |
| `pageId: "terminal-mfrs"` → `href: "/admin/terminals/manufacturers"` | `pageId: "connectivity-mfrs"` → `href: "/admin/connectivity/manufacturers"` |
| `pageId: "terminal-cats"` → `href: "/admin/terminals/categories"` | `pageId: "connectivity-cats"` → `href: "/admin/connectivity/categories"` |
| `pageId: "terminals"` → `href: "/admin/terminals"` | `pageId: "connectivity"` → `href: "/admin/connectivity"` |
| scope_type `"terminal_manufacturer"` / label "Terminal Manufacturer" | scope_type `"connectivity_manufacturer"` / "Connectivity Manufacturer" |

The deps `require_module("terminal_list")` calls inside each route get the new id string; backward-compat alias layer handles old ids still present in the DB from old role_permission seeds.

### D5. Files NOT renamed on disk

**Decision (following proposal "PRESERVED..."):**

Do NOT rename these files on disk (avoids cascading import edits with zero user value):

- backend: `app/models/terminal.py`, `app/schemas/terminal.py`, `app/crud/terminal.py`, `app/services/terminal_import.py`, `app/api/routes/terminals.py`, `app/api/routes/terminal_categories.py`, `app/api/routes/terminal_manufacturers.py`, `app/api/routes/terminal_import.py`, `app/api/routes/terminal_import_templates.py`, `app/api/routes/portal_terminals.py`, `app/api/routes/portal_terminal_import.py`
  → Instead, change the `router = APIRouter(prefix="/api/terminals", ...)` prefix inside each file; file name stays.
- frontend: `components/terminals/*.tsx`, `components/admin/form/TerminalForm.tsx` etc., `components/portal/form/TerminalCreateForm.tsx` etc., `lib/terminalFilter.ts`, `lib/clientTerminalImport.ts`, `data/recommended-terminals.json`.
  → Move only the Next.js *app route* directories (`app/(site)/terminals` → `app/(site)/connectivity`, `app/admin/(dashboard)/terminals` → `app/admin/(dashboard)/connectivity`, `app/portal/terminals` → `app/portal/connectivity`, and their `app/api/...` route handler mirrors) because those directories define the *actual URL segments* — Next.js routes are derived from directory names, so renaming them is how we change URLs. The old paths get separate redirect route directories OR a middleware rewrite rule. Component file names inside `components/terminals/*` can stay for now (internal naming).

**Rationale:** Minimizes churn. Next.js app router directories ARE the URL contract so those MUST be moved. Component filenames not used in URLs don't matter to users.

### D6. Rollout order in tasks.md

Execution order:
1. Backend core (modules.py, scope_resolvers.py, deps.py backward-compat aliases + new ids).
2. Backend API route prefixes + backward-compat alias routes returning 410+Location.
3. Backend main.py router mounts (new + old alias routes).
4. Frontend API client: new connectivity* namespaces + deprecated alias exports.
5. Frontend type aliases (export type Connectivity = Terminal etc. for any new code that wants the naming; old names still importable).
6. Frontend adminMenuRegistry + adminModules new ids/labels.
7. Move Next.js app route directories (terminals → connectivity) + add redirect routes for old paths.
8. Update all UI strings/labels/placeholders/breadcrumbs across components and pages (SearchBox dropdown, Footer, form labels, page titles).
9. Update portal/permission JWT remap in backend auth deps.
10. Update seed scripts and (optional) menu seed data update.
11. Update OpenSpec main spec delta + tests (adjust route assertions, label assertions).

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| [Role permissions still keyed on old `terminal_*` module ids in production DB after deploy → admins lose access] | Backward-compat module id alias layer (modules.py MODULE_BY_ID accepts both old+new ids; deps.py require_module maps old→new). No data migration needed this release. |
| [Portal manufacturer JWT sessions have `scope_type=terminal_manufacturer` → 403 after deploy] | `get_current_portal_user` transparently remaps scope_type on token decode; no re-login required. |
| [308 redirect on POST API import routes] | API backward-compat uses 410 Gone + Location header (never 308) so bodies aren't stripped; UI calls the new endpoints directly; old URLs only used by external callers who get a clear error. |
| [SEO: Google-indexed `/terminals/{slug}` pages 404] | Next.js 308 redirect from `/terminals/**` → `/connectivity/**` preserves link juice; site map regenerated with new URLs. |
| [Some import uses old `api.terminals` and breaks] | `api.ts` re-exports deprecated aliases (`terminals` keys still present, delegate to new functions). |
| [Menu seeds in existing DB still label "Terminal ..." instead of "Connectivity ..."] | Menu registry in Python renders labels; DB stores menu entries with module_id keys; as long as admin regenerates menu or we run an optional UPDATE in seed: labels reflect new strings. Provide a one-off `python -m scripts.update_menu_labels_connectivity` script (optional, not a migration) — documented in the migration plan. |
| [Large diff across many files → merge conflicts with concurrent work] | Confined to mostly label string changes and URL prefix constants; semantic changes are small. Backward-compat aliases mean partial rollouts are safe. |
| [Search engine cache: old dropdown value "terminal" in cached JS] | SearchBox accepts old category value as input and maps it to "connectivity" on read; no crash, just silently corrects. |

## Migration Plan

**Deploy steps (in order, single deploy):**

1. Merge code. Backend container starts.
   - Backend accepts both scope_type values (old via remap), both module_ids (alias layer).
   - Old API paths respond with 410 + Location. New paths active.
   - Next.js starts with new page route dirs `/connectivity*` active; old page route dirs either removed with separate redirect route files OR handled by a single middleware rule → 308 to new URLs.
2. After deploy, optionally run: `python -m scripts.update_menu_labels_connectivity` to update admin/site menu DB row labels from "Terminal ..." → "Connectivity ..." (purely cosmetic, not blocking; admin UI uses code labels if DB rows are stale — depends on whether menu is DB-stored or rendered from registry). If menu is 100% registry-driven, this is a no-op.
3. Regenerate sitemap so `/connectivity*` URLs are picked up.
4. Notify users via changelog: BREAKING API route rename, old paths → 410; UI renamed.

**Rollback:**
- Revert merge. Old `/terminals` routes and `/api/terminals*` active again. No DB changes happened (no migration) so rollback is pure code revert.

## Open Questions

- None (all decisions resolved above; scope is a mechanical rename + backward-compat layer).
