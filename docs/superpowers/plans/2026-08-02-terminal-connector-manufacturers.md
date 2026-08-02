---
change: add-terminal-connector-manufacturers
design-doc: docs/superpowers/specs/2026-07-30-terminal-connector-manufacturers-design.md
base-ref: 62319248623b63e63223edd5ccf3860e79d4ab42
---

# Terminal & Connector Manufacturers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Terminal & Connector manufacturer module that mirrors the existing Equipment module end-to-end — backend models/migration, schemas, CRUD, 7 API route modules, import service, scope + media-folder integration; frontend public/admin/portal pages, components, API clients, sidebar/search integration, and seed data + test portal user.

**Architecture:** Pure mirror copy of the Equipment module. No generic abstractions are extracted from existing equipment code. Backend reuses `CRUDBase`; routes and frontend components are duplicated with `Terminal*` renames. Portal security forces `manufacturer_id = user.scope_id` on create and server-generates product IDs as `{manufacturer_slug}-{product_slug}`. Media folder provisioning (root + `logos`, `products`, `docs`) runs on manufacturer create/rename/delete.

**Tech Stack:** Python 3, FastAPI, SQLAlchemy 2.x, Pydantic v2, Alembic, PostgreSQL (JSONB); Next.js 16 App Router, TypeScript 5, React 19, Tailwind CSS 4, ESLint 9.

## Global Constraints

- **Mirror policy:** Every new file mirrors the named Equipment file by structure, field shape, and naming. Do not invent new patterns. Rename `equipment`→`terminal` / `Equipment`→`Terminal` (singular product) and `EquipmentManufacturer`→`TerminalManufacturer`, `EquipmentCategory`→`TerminalCategory`.
- **Backend class names:** `TerminalManufacturer`, `TerminalCategory`, `Terminal` (product).
- **Scope/module IDs:** scope_type `terminal_manufacturer`; admin modules `terminal_mfrs`, `terminal_cats`, `terminal_list`; portal factory module string `"terminals"`.
- **Route prefixes:** `/api/terminals`, `/api/terminal-manufacturers`, `/api/terminal-categories`, `/api/admin/terminals/import`, `/api/portal/terminals`, `/api/portal/terminals/import`.
- **FK behavior:** `RESTRICT` on `terminals.manufacturer_id` and `terminals.category_id`; `CASCADE` on `terminal_categories.parent_id`. Unique constraints on `slug` (and composite `parent_id, slug` for categories). `terminals.slug` is globally unique.
- **Category depth:** Max 2 levels, enforced in API. Composite IDs: `slug` for top-level, `{parent_id}/{slug}` for children. Use catch-all `[...id]` admin route.
- **Portal scope:** Always force `manufacturer_id = user.scope_id` on create/update/import; ignore client value. Product ID = `{manufacturer_slug}-{product_slug}`. Ownership check (`_check_terminal_ownership`) returns 404 for other manufacturers' products.
- **Media container:** `"Terminal Manufacturers"` for `terminal_manufacturer` scope_type; root folder named after manufacturer; 3 protected subfolders `logos`, `products`, `docs`.
- **Inquiry linkage:** `recipient_type="terminal_manufacturer"`, `recipient_id=<manufacturer_id>`.
- **No automated tests:** Project MVP convention. Verify backend via Swagger UI (`/docs`); verify frontend manually in the browser. Where a task says "Run verification," use the listed lint/typecheck/migration commands — these are not unit tests.
- **Commits:** One commit per task, conventional commits format (e.g. `feat(terminals): add models and migration`).
- **base-ref:** `62319248623b63e63223edd5ccf3860e79d4ab42` (git HEAD before implementation; do not rebase past this).
- **Working directory:** All relative paths below are rooted at the repo root `d:\projects\unowire`. Backend commands run from `backend/`; frontend commands run from `frontend/`.

## File Structure

**Backend — new files:**
- `backend/app/models/terminal.py` — `TerminalManufacturer`, `TerminalCategory`, `Terminal` ORM models.
- `backend/app/schemas/terminal.py` — all Pydantic schemas.
- `backend/app/crud/terminal.py` — `CRUDTerminalManufacturer`, `CRUDTerminalCategory`, `CRUDTerminal` + singletons.
- `backend/app/api/routes/terminals.py` — public/admin product CRUD.
- `backend/app/api/routes/terminal_manufacturers.py` — manufacturer CRUD + media provisioning.
- `backend/app/api/routes/terminal_categories.py` — 2-level category tree CRUD.
- `backend/app/api/routes/terminal_import.py` — admin import validate/commit.
- `backend/app/api/routes/terminal_import_templates.py` — admin csv-template/json-example.
- `backend/app/api/routes/portal_terminals.py` — portal scope-filtered CRUD.
- `backend/app/api/routes/portal_terminal_import.py` — portal import validate/commit + templates.
- `backend/app/services/terminal_import.py` — CSV/JSON parse + validate + commit service.
- `backend/alembic/versions/<new>_add_terminal_manufacturers_and_categories.py` — schema + menu seed.

**Backend — modified files:**
- `backend/app/models/__init__.py` — export new models.
- `backend/app/core/modules.py` — add 3 admin modules + `terminal_manufacturer` to `VALID_SCOPE_TYPES`.
- `backend/app/core/scope_resolvers.py` — add `validate_terminal_manufacturer_exists` + register.
- `backend/app/api/deps.py` — add `_FACTORY_ALLOWED_BY_SCOPE["terminal_manufacturer"]`.
- `backend/app/crud/folder.py` — add `"terminal_manufacturer"` to `CONTAINER_NAMES`.
- `backend/app/main.py` — register all 7 terminal routers.
- `backend/scripts/seed.py` — add `seed_terminals()`.
- `backend/scripts/seed_portal_users.py` — add terminal test user.

**Frontend — new files:**
- `frontend/lib/terminalFilter.ts`, `frontend/lib/clientTerminalImport.ts`.
- `frontend/components/terminals/` — `TerminalCard.tsx`, `TerminalListClient.tsx`, `TerminalFilters.tsx`, `TerminalCategoryNav.tsx`.
- `frontend/components/admin/form/` — `TerminalManufacturerForm.tsx`, `TerminalForm.tsx`, `TerminalCategoryForm.tsx`.
- `frontend/components/admin/list/TerminalSearchBox.tsx`.
- `frontend/components/portal/form/` — `TerminalFormFields.tsx`, `TerminalCreateForm.tsx`, `TerminalEditForm.tsx`, `TerminalDeleteButton.tsx`.
- `frontend/components/portal/terminals/TerminalListToolbar.tsx`.
- `frontend/app/(site)/terminals/` — `page.tsx`, `[slug]/page.tsx`, `manufacturers/[slug]/page.tsx`.
- `frontend/app/admin/(dashboard)/terminals/` — list, new, `[id]`, `manufacturers/{list,new,[id]}`, `categories/{list,new,[...id]}`, `import`.
- `frontend/app/portal/terminals/` — list, new, `[id]`, `import`, `loading.tsx`.
- `frontend/app/api/admin/terminals/`, `frontend/app/api/admin/terminal-manufacturers/`, `frontend/app/api/admin/terminal-categories/`, `frontend/app/api/portal/terminals/` — Next.js route handlers.
- `frontend/data/recommended-terminals.json`.

**Frontend — modified files:**
- `frontend/lib/api.ts`, `frontend/lib/adminApi.ts`, `frontend/lib/portalApi.ts` (and/or `portalApiClient.ts`) — add terminal namespaces.
- `frontend/lib/adminMenuRegistry.ts`, `frontend/lib/adminModules.ts` — add terminal page IDs + module defs.
- `frontend/components/shared/SearchBox.tsx` — add "Terminal" option.
- `frontend/components/portal/layout/PortalSidebar.tsx` — add `TERMINAL_MANUFACTURER_NAV`.
- `frontend/components/admin/layout/AdminSidebar.tsx` — add `PAGE_ID_TO_MODULE_ID` entries (if present).

---

## Group 1 — Backend Models & Migration

### Task 1.1: Create `backend/app/models/terminal.py`

**Files:**
- Create: `backend/app/models/terminal.py`
- Mirror source: `backend/app/models/equipment.py`

**Interfaces:**
- Produces: ORM classes `TerminalManufacturer`, `TerminalCategory`, `Terminal` with `__tablename__` `terminal_manufacturers`, `terminal_categories`, `terminals`; columns per Design Doc §Backend Design → Data Model (id String PK; `applicable_specs` JSONB NOT NULL on `Terminal`; self-ref `parent_id` on `TerminalCategory` with `ondelete="CASCADE"`; FKs on `Terminal` with `ondelete="RESTRICT"`; `TerminalCategory` has `UniqueConstraint("parent_id", "slug")`; `Terminal.slug` globally unique; `sort_order`/`created_at`/`updated_at` on all).

**Acceptance Criteria:**
- Three ORM classes exist with table names and columns matching the design doc exactly.
- `TerminalCategory.parent_id` is a self-referential FK with `CASCADE`; `Terminal.manufacturer_id` and `Terminal.category_id` use `RESTRICT`.
- `Terminal.applicable_specs` is `JSONB` and `nullable=False`.
- `Terminal.slug` has a unique constraint; `TerminalCategory` has composite unique `(parent_id, slug)`.
- `python -m py_compile backend/app/models/terminal.py` succeeds.

**Steps:**
- [x] **Step 1: Read mirror source.** Read `backend/app/models/equipment.py` in full.
- [x] **Step 2: Create `backend/app/models/terminal.py`** by copying the equipment file and renaming: `EquipmentManufacturer`→`TerminalManufacturer` (`__tablename__="terminal_manufacturers"`), `EquipmentCategory`→`TerminalCategory` (`__tablename__="terminal_categories"`), `Equipment`→`Terminal` (`__tablename__="terminals"`). Keep all column names identical (`id`, `name`, `slug`, `country`, `website`, `image_url`, `description`, `founded_year`, `address`, `phone`, `email`, `sort_order`, `created_at`, `updated_at` for manufacturers; `id`, `parent_id`, `label`, `slug`, `description`, `image_url`, `sort_order`, `created_at`, `updated_at` for categories; `id`, `manufacturer_id`, `category_id`, `model`, `slug`, `applicable_specs`, `description`, `image_url`, `external_url`, `sort_order`, `created_at`, `updated_at` for terminals). Preserve relationships (`manufacturer`, `category`, `children`, `parent`) with the renamed classes.
- [x] **Step 3: Verify it compiles.** Run: `cd backend && python -m py_compile app/models/terminal.py`
  Expected: no output (success).
- [x] **Step 4: Commit.** `git add backend/app/models/terminal.py && git commit -m "feat(terminals): add ORM models for manufacturers, categories, products"`

### Task 1.2: Export new models in `backend/app/models/__init__.py`

**Files:**
- Modify: `backend/app/models/__init__.py`
- Mirror source: the existing equipment exports in the same file.

**Interfaces:**
- Produces: `TerminalManufacturer`, `TerminalCategory`, `Terminal` importable from `backend.app.models`.

**Acceptance Criteria:**
- `from backend.app.models import TerminalManufacturer, TerminalCategory, Terminal` succeeds.
- Ordering/naming convention matches the equipment exports.

**Steps:**
- [x] **Step 1: Read the current file.** Read `backend/app/models/__init__.py`.
- [x] **Step 2: Add exports.** Append imports/exports for the three new classes, mirroring how `EquipmentManufacturer`, `EquipmentCategory`, `Equipment` are exported (same `__all__` ordering style).
- [x] **Step 3: Verify import.** Run: `cd backend && python -c "from app.models import TerminalManufacturer, TerminalCategory, Terminal; print('ok')"`
  Expected: prints `ok`.
- [x] **Step 4: Commit.** `git add backend/app/models/__init__.py && git commit -m "feat(terminals): export new models from models package"`

### Task 1.3: Create Alembic migration for the three tables

**Files:**
- Create: `backend/alembic/versions/<new_revision>_add_terminal_manufacturers_and_categories.py`
- Mirror source: `backend/alembic/versions/e3f4a5b6c7d8_add_equipment_manufacturers_and_categories.py`

**Interfaces:**
- Consumes: models from Task 1.1.
- Produces: `upgrade()` creates `terminal_manufacturers`, `terminal_categories`, `terminals`; `downgrade()` drops them in reverse dependency order.

**Acceptance Criteria:**
- `alembic upgrade head` applies cleanly on top of base-ref.
- `alembic downgrade -1` reverses cleanly.
- FKs use `RESTRICT` (products) and `CASCADE` (category self-ref); unique constraints on `slug` and composite `(parent_id, slug)` exist.
- `down_revision` points at the current Alembic head (verify with `alembic heads` before generating).

**Steps:**
- [x] **Step 1: Read mirror source.** Read `backend/alembic/versions/e3f4a5b6c7d8_add_equipment_manufacturers_and_categories.py`.
- [x] **Step 2: Determine current head.** Run: `cd backend && alembic heads`
  Note the current head revision ID — it becomes `down_revision`.
- [x] **Step 3: Create the migration file.** Mirror the equipment migration: rename tables to `terminal_manufacturers`, `terminal_categories`, `terminals`; keep identical column definitions, FK `ondelete` rules, and unique constraints. Set `revision = "<new_id>"` and `down_revision = "<current_head>"`. Create tables in dependency order (manufacturers, categories, terminals); drop in reverse.
- [x] **Step 4: Apply and verify.** Run: `cd backend && alembic upgrade head`
  Expected: applies the new revision with no errors. Then run `alembic downgrade -1 && alembic upgrade head` to confirm reversibility.
- [x] **Step 5: Commit.** `git add backend/alembic/versions/<new_file>.py && git commit -m "feat(terminals): add alembic migration for terminal tables"`

### Task 1.4: Add admin menu seed entries to the migration

**Files:**
- Modify: `backend/alembic/versions/<new_revision>_add_terminal_manufacturers_and_categories.py` (the file from Task 1.3)
- Mirror source: the menu-seed portion of `e3f4a5b6c7d8` (and any companion equipment menu seed).

**Interfaces:**
- Consumes: existing `admin_menu` (or equivalent) table seeded by equipment migration.
- Produces: three menu rows `terminal-mfrs`, `terminal-cats`, `terminals` under a "Terminal & Connector" group.

**Acceptance Criteria:**
- After `alembic upgrade head`, the admin menu table contains `terminal-mfrs`, `terminal-cats`, `terminals` page IDs grouped under "Terminal & Connector".
- Menu rows have the same field shape as the equipment menu seed (label, page_id, group, sort_order, icon if applicable).
- `downgrade()` removes the seeded rows.

**Steps:**
- [x] **Step 1: Inspect equipment menu seed.** Re-read `e3f4a5b6c7d8` and locate the `op.bulk_insert` (or INSERT) block for admin menu items.
- [x] **Step 2: Add a terminal menu insert block** to the migration `upgrade()` after table creation, mirroring equipment's menu seed. Add three rows under group label `"Terminal & Connector"`: `terminal-mfrs` (Manufacturers), `terminal-cats` (Categories), `terminals` (Terminals). Use distinct `sort_order` values that do not collide with equipment rows.
- [x] **Step 3: Add the matching delete block** to `downgrade()` (delete the three page IDs before dropping tables).
- [x] **Step 4: Verify.** Run: `cd backend && alembic downgrade -1 && alembic upgrade head`
  Then confirm via DB query / Swagger that the three menu rows exist.
- [x] **Step 5: Commit.** `git add backend/alembic/versions/<new_file>.py && git commit -m "feat(terminals): seed admin menu entries in migration"`

---

## Group 2 — Backend Schemas & CRUD

### Task 2.1: Create `backend/app/schemas/terminal.py`

**Files:**
- Create: `backend/app/schemas/terminal.py`
- Mirror source: `backend/app/schemas/equipment.py`

**Interfaces:**
- Consumes: models from Task 1.1.
- Produces: Pydantic v2 schemas — `TerminalManufacturerCreate`, `TerminalManufacturerUpdate`, `TerminalManufacturerRead` (and list variant); `TerminalCategoryCreate`, `TerminalCategoryUpdate`, `TerminalCategoryRead`, `TerminalCategoryTreeNode` (flat + tree); `TerminalCreate`, `TerminalUpdate`, `TerminalRead` (with `manufacturer` and `category` nested reads); `PortalTerminalCreate` (omits `id` and `manufacturer_id`, keeps `category_id`, `model`, `slug`, `applicable_specs`, etc.); `TerminalImportRow`/`TerminalImportResult` if present in equipment.

**Acceptance Criteria:**
- All schema names above exist with `model_config = ConfigDict(from_attributes=True)` (or matching equipment pattern).
- `PortalTerminalCreate` does not declare `id` or `manufacturer_id`.
- `TerminalRead.applicable_specs` is typed as `dict` / `JSONB`-equivalent.
- `python -m py_compile backend/app/schemas/terminal.py` succeeds.

**Steps:**
- [x] **Step 1: Read mirror source.** Read `backend/app/schemas/equipment.py` in full.
- [x] **Step 2: Create `backend/app/schemas/terminal.py`** by mirroring with `Equipment`→`Terminal` renames. Keep all field names identical. Add `PortalTerminalCreate` mirroring `PortalEquipmentCreate` (omit `id`, `manufacturer_id`).
- [x] **Step 3: Verify it compiles.** Run: `cd backend && python -m py_compile app/schemas/terminal.py`
- [x] **Step 4: Verify importability.** Run: `cd backend && python -c "from app.schemas.terminal import TerminalManufacturerRead, TerminalCategoryTreeNode, TerminalRead, PortalTerminalCreate; print('ok')"`
- [x] **Step 5: Commit.** `git add backend/app/schemas/terminal.py && git commit -m "feat(terminals): add pydantic schemas"`

### Task 2.2: Create `backend/app/crud/terminal.py`

**Files:**
- Create: `backend/app/crud/terminal.py`
- Mirror source: `backend/app/crud/equipment.py`

**Interfaces:**
- Consumes: models (Task 1.1), `CRUDBase` (existing).
- Produces: classes `CRUDTerminalManufacturer`, `CRUDTerminalCategory` (methods `get_with_children`, `get_all_top_level_with_children`, `get_all_flat`), `CRUDTerminal` (methods `get_with_relations`, `get_all_with_relations`, `list_by_manufacturer`, `count_by_manufacturer`, `get_matching_cable`); module-level singletons `crud_terminal_manufacturer`, `crud_terminal_category`, `crud_terminal`.

**Acceptance Criteria:**
- All three classes and the three singletons exist with the exact method names above.
- `get_matching_cable(cable_id)` mirrors `CRUDEquipment.get_matching_cable` — uses `applicable_specs` JSONB matching.
- `get_all_top_level_with_children` returns the 2-level tree; `get_all_flat` returns all categories flat.
- `list_by_manufacturer(manufacturer_id)` / `count_by_manufacturer(manufacturer_id)` exist.
- `python -m py_compile backend/app/crud/terminal.py` succeeds.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `backend/app/crud/equipment.py` in full.
- [ ] **Step 2: Create `backend/app/crud/terminal.py`** by mirroring with class/method renames. Bind to `TerminalManufacturer`, `TerminalCategory`, `Terminal` models. Preserve all query logic (joins, JSONB matching, ordering by `sort_order`).
- [ ] **Step 3: Verify it compiles.** Run: `cd backend && python -m py_compile app/crud/terminal.py`
- [ ] **Step 4: Verify singletons.** Run: `cd backend && python -c "from app.crud.terminal import crud_terminal_manufacturer, crud_terminal_category, crud_terminal; print('ok')"`
- [ ] **Step 5: Commit.** `git add backend/app/crud/terminal.py && git commit -m "feat(terminals): add CRUD classes and singletons"`

---

## Group 3 — Backend Core Registration

### Task 3.1: Register admin modules in `modules.py`

**Files:**
- Modify: `backend/app/core/modules.py`
- Mirror source: the equipment module entries (`equipment_mfrs`, `equipment_cats`, `equipment_list`) in the same file.

**Interfaces:**
- Produces: `ADMIN_MODULES` entries `terminal_mfrs` (scope_aware=True, scope_type=`"terminal_manufacturer"`), `terminal_cats` (scope_aware=False), `terminal_list` (scope_aware=True, scope_type=`"terminal_manufacturer"`); `"terminal_manufacturer"` added to `VALID_SCOPE_TYPES`.

**Acceptance Criteria:**
- `terminal_mfrs`, `terminal_cats`, `terminal_list` are present in `ADMIN_MODULES` with the scope settings above.
- `"terminal_manufacturer"` is in `VALID_SCOPE_TYPES`.
- Importing `app.core.modules` succeeds.

**Steps:**
- [ ] **Step 1: Read the file.** Read `backend/app/core/modules.py`; locate the equipment module definitions and `VALID_SCOPE_TYPES`.
- [ ] **Step 2: Add the three terminal modules** mirroring the equipment entries (same fields: id, label, scope_aware, scope_type, icon/sort if present).
- [ ] **Step 3: Append `"terminal_manufacturer"`** to `VALID_SCOPE_TYPES`.
- [ ] **Step 4: Verify.** Run: `cd backend && python -c "from app.core.modules import ADMIN_MODULES, VALID_SCOPE_TYPES; assert 'terminal_mfrs' in ADMIN_MODULES and 'terminal_manufacturer' in VALID_SCOPE_TYPES; print('ok')"`
- [ ] **Step 5: Commit.** `git add backend/app/core/modules.py && git commit -m "feat(terminals): register admin modules and scope type"`

### Task 3.2: Add scope resolver in `scope_resolvers.py`

**Files:**
- Modify: `backend/app/core/scope_resolvers.py`
- Mirror source: `validate_equipment_manufacturer_exists` in the same file.

**Interfaces:**
- Consumes: `crud_terminal_manufacturer` from Task 2.2.
- Produces: async function `validate_terminal_manufacturer_exists(db, scope_id) -> bool` (or raising shape matching the equipment resolver); registered in the `SCOPE_RESOLVERS` map under key `"terminal_manufacturer"`.

**Acceptance Criteria:**
- `validate_terminal_manufacturer_exists` exists and queries `terminal_manufacturers` by `id`.
- `SCOPE_RESOLVERS["terminal_manufacturer"]` is set to it.
- Behavior (returns bool / raises) matches the equipment resolver exactly.

**Steps:**
- [ ] **Step 1: Read the file.** Read `backend/app/core/scope_resolvers.py`; note the equipment resolver's signature and return/raise convention.
- [ ] **Step 2: Add `validate_terminal_manufacturer_exists`** mirroring the equipment resolver, using `crud_terminal_manufacturer.get(db, scope_id)`.
- [ ] **Step 3: Register it** in `SCOPE_RESOLVERS` under `"terminal_manufacturer"`.
- [ ] **Step 4: Verify.** Run: `cd backend && python -c "from app.core.scope_resolvers import SCOPE_RESOLVERS, validate_terminal_manufacturer_exists; assert 'terminal_manufacturer' in SCOPE_RESOLVERS; print('ok')"`
- [ ] **Step 5: Commit.** `git add backend/app/core/scope_resolvers.py && git commit -m "feat(terminals): add terminal_manufacturer scope resolver"`

### Task 3.3: Add portal permission matrix entry in `deps.py`

**Files:**
- Modify: `backend/app/api/deps.py`
- Mirror source: the `equipment_manufacturer` entry in `_FACTORY_ALLOWED_BY_SCOPE`.

**Interfaces:**
- Produces: `_FACTORY_ALLOWED_BY_SCOPE["terminal_manufacturer"] = {"dashboard", "terminals", "inquiries", "media", "me", "messages"}`.

**Acceptance Criteria:**
- The key/value above exists in `_FACTORY_ALLOWED_BY_SCOPE`.
- `require_factory_module("terminals")` will accept a user whose `scope_type == "terminal_manufacturer"`.

**Steps:**
- [ ] **Step 1: Read the file.** Read `backend/app/api/deps.py`; locate `_FACTORY_ALLOWED_BY_SCOPE` and `require_factory_module`.
- [ ] **Step 2: Add the entry** mirroring the equipment row, with the exact module set `{"dashboard", "terminals", "inquiries", "media", "me", "messages"}`.
- [ ] **Step 3: Verify.** Run: `cd backend && python -c "from app.api.deps import _FACTORY_ALLOWED_BY_SCOPE; assert _FACTORY_ALLOWED_BY_SCOPE['terminal_manufacturer'] == {'dashboard','terminals','inquiries','media','me','messages'}; print('ok')"`
- [ ] **Step 4: Commit.** `git add backend/app/api/deps.py && git commit -m "feat(terminals): allow terminal_manufacturer scope in portal permission matrix"`

### Task 3.4: Add container name in `crud/folder.py`

**Files:**
- Modify: `backend/app/crud/folder.py`
- Mirror source: the `equipment_manufacturer` entry in `CONTAINER_NAMES`.

**Interfaces:**
- Produces: `CONTAINER_NAMES["terminal_manufacturer"] = "Terminal Manufacturers"`.

**Acceptance Criteria:**
- `CONTAINER_NAMES["terminal_manufacturer"] == "Terminal Manufacturers"`.
- `crud_folder.provision_for_manufacturer(scope_type="terminal_manufacturer", ...)` will use this container name.

**Steps:**
- [ ] **Step 1: Read the file.** Read `backend/app/crud/folder.py`; locate `CONTAINER_NAMES`, `provision_for_manufacturer`, `rename_manufacturer_root`, `cleanup_for_manufacturer`.
- [ ] **Step 2: Add the entry** `"terminal_manufacturer": "Terminal Manufacturers"` to `CONTAINER_NAMES`, mirroring the equipment row.
- [ ] **Step 3: Verify.** Run: `cd backend && python -c "from app.crud.folder import CONTAINER_NAMES; assert CONTAINER_NAMES['terminal_manufacturer'] == 'Terminal Manufacturers'; print('ok')"`
- [ ] **Step 4: Commit.** `git add backend/app/crud/folder.py && git commit -m "feat(terminals): add Terminal Manufacturers folder container name"`

---

## Group 4 — Backend API Routes (Public/Admin)

> **Mirror convention for this group:** each route file mirrors the corresponding equipment route file exactly — same dependency wiring (`get_db`, operator dep with the right module, scope check for `terminal_manufacturer` role), same response models, same error codes. Replace `equipment`→`terminal` in paths, tags, and `crud_*` references.

### Task 4.1: Create `backend/app/api/routes/terminals.py`

**Files:**
- Create: `backend/app/api/routes/terminals.py`
- Mirror source: `backend/app/api/routes/equipment.py`

**Interfaces:**
- Consumes: `crud_terminal`, `crud_terminal_category`, `crud_terminal_manufacturer` (Task 2.2); schemas (Task 2.1); operator deps for module `terminal_list`; scope check for `terminal_manufacturer` role.
- Produces: router mounted at `/api/terminals`, tag `terminals`; endpoints: `GET /` (list with `q`, `category_id`, `manufacturer_id`, `cable_id` matching, pagination), `GET /{id}` (detail), `POST /` (create, operator `terminal_list`), `PUT /{id}` (update), `DELETE /{id}` (delete).

**Acceptance Criteria:**
- `GET /api/terminals` supports query params `q`, `category_id`, `manufacturer_id`, `cable_id`, `page` and returns paginated `TerminalRead` rows.
- `cable_id` matching uses `crud_terminal.get_matching_cable`.
- Operator create/update/delete require the `terminal_list` module; a portal-user-style `terminal_manufacturer` role triggers a scope check (mirroring equipment's `terminal_manufacturer`-equivalent guard).
- `python -m py_compile backend/app/api/routes/terminals.py` succeeds.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `backend/app/api/routes/equipment.py` in full.
- [ ] **Step 2: Create the route file** mirroring equipment: rename router/tag to `terminals`, swap `crud_equipment`→`crud_terminal`, swap schema imports, change the operator module dep to `terminal_list`, change the role scope check from equipment manufacturer to `terminal_manufacturer`.
- [ ] **Step 3: Verify it compiles.** Run: `cd backend && python -m py_compile app/api/routes/terminals.py`
- [ ] **Step 4: Commit.** `git add backend/app/api/routes/terminals.py && git commit -m "feat(terminals): add public/admin product CRUD route"`

### Task 4.2: Create `backend/app/api/routes/terminal_manufacturers.py`

**Files:**
- Create: `backend/app/api/routes/terminal_manufacturers.py`
- Mirror source: `backend/app/api/routes/equipment_manufacturers.py`

**Interfaces:**
- Consumes: `crud_terminal_manufacturer` (Task 2.2); `crud_folder.provision_for_manufacturer` / `rename_manufacturer_root` / `cleanup_for_manufacturer` (existing in `crud/folder.py`); operator dep for module `terminal_mfrs`; scope check for `terminal_manufacturer` role.
- Produces: router mounted at `/api/terminal-manufacturers`, tag `terminal-manufacturers`; endpoints: list, get, create (provisions media folders), update (renames root folder when name changes), delete (cleans up folders/uploads/disk before delete).

**Acceptance Criteria:**
- `POST /api/terminal-manufacturers` creates the manufacturer then calls `crud_folder.provision_for_manufacturer(scope_type="terminal_manufacturer", scope_id=obj.id, name=obj.name)` — creates root + `logos`, `products`, `docs` subfolders under "Terminal Manufacturers".
- `PUT /api/terminal-manufacturers/{id}` calls `crud_folder.rename_manufacturer_root(...)` when the name changes.
- `DELETE /api/terminal-manufacturers/{id}` calls `crud_folder.cleanup_for_manufacturer(...)` **before** deleting the manufacturer; deleting a manufacturer with products returns 409 (RESTRICT FK).
- Operator endpoints require `terminal_mfrs`.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `backend/app/api/routes/equipment_manufacturers.py` in full.
- [ ] **Step 2: Create the route file** mirroring equipment manufacturers: rename to terminal, swap CRUD/schema imports, change module dep to `terminal_mfrs`, change scope check to `terminal_manufacturer`, change `scope_type="equipment_manufacturer"` → `"terminal_manufacturer"` in all `crud_folder` calls.
- [ ] **Step 3: Verify it compiles.** Run: `cd backend && python -m py_compile app/api/routes/terminal_manufacturers.py`
- [ ] **Step 4: Commit.** `git add backend/app/api/routes/terminal_manufacturers.py && git commit -m "feat(terminals): add manufacturer CRUD route with media provisioning"`

### Task 4.3: Create `backend/app/api/routes/terminal_categories.py`

**Files:**
- Create: `backend/app/api/routes/terminal_categories.py`
- Mirror source: `backend/app/api/routes/equipment_categories.py`

**Interfaces:**
- Consumes: `crud_terminal_category` (Task 2.2); operator dep for module `terminal_cats`.
- Produces: router mounted at `/api/terminal-categories`, tag `terminal-categories`; endpoints: `GET /tree` (2-level tree), `GET /{id}`, `POST /`, `PUT /{id}`, `DELETE /{id}`.

**Acceptance Criteria:**
- `GET /api/terminal-categories/tree` returns the 2-level tree via `crud_terminal_category.get_all_top_level_with_children`.
- Creating a top-level category sets `id = slug`; creating a child sets `id = f"{parent_id}/{slug}"`.
- Creating a 3rd-level category (parent already has a parent) returns 400 Bad Request.
- Deleting a category that has children returns 409 Conflict.
- Operator endpoints require `terminal_cats`.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `backend/app/api/routes/equipment_categories.py` in full.
- [ ] **Step 2: Create the route file** mirroring equipment categories: rename to terminal, swap CRUD/schema imports, change module dep to `terminal_cats`, keep the 2-level depth enforcement and child-existence delete guard logic intact.
- [ ] **Step 3: Verify it compiles.** Run: `cd backend && python -m py_compile app/api/routes/terminal_categories.py`
- [ ] **Step 4: Commit.** `git add backend/app/api/routes/terminal_categories.py && git commit -m "feat(terminals): add 2-level category tree CRUD route"`

### Task 4.4: Create `backend/app/api/routes/terminal_import.py`

**Files:**
- Create: `backend/app/api/routes/terminal_import.py`
- Mirror source: `backend/app/api/routes/equipment_import.py`

**Interfaces:**
- Consumes: `terminal_import` service (Task 4.6); operator dep for module `terminal_list`.
- Produces: router mounted at `/api/admin/terminals/import`, tag `terminal-import`; endpoints: `POST /validate` (parse + validate, no persist), `POST /commit` (create terminal records).

**Acceptance Criteria:**
- `POST /api/admin/terminals/import/validate` returns per-row success/error status without writing.
- `POST /api/admin/terminals/import/commit` creates terminal records for validated rows.
- Both endpoints require operator `terminal_list`.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `backend/app/api/routes/equipment_import.py` in full. (If Task 4.6 service is not yet created, create the route against the expected service interface and note the dependency.)
- [ ] **Step 2: Create the route file** mirroring equipment import: rename to terminal, swap the service import to `app.services.terminal_import`, change module dep to `terminal_list`, keep endpoint paths `/validate` and `/commit`.
- [ ] **Step 3: Verify it compiles.** Run: `cd backend && python -m py_compile app/api/routes/terminal_import.py`
- [ ] **Step 4: Commit.** `git add backend/app/api/routes/terminal_import.py && git commit -m "feat(terminals): add admin import validate/commit route"`

### Task 4.5: Create `backend/app/api/routes/terminal_import_templates.py`

**Files:**
- Create: `backend/app/api/routes/terminal_import_templates.py`
- Mirror source: `backend/app/api/routes/equipment_import_templates.py`

**Interfaces:**
- Consumes: template strings/CSV from the terminal import service (Task 4.6) or inline constants mirroring equipment.
- Produces: router mounted at `/api/admin/terminals/import`, tag `terminal-import-templates`; endpoints: `GET /csv-template`, `GET /json-example`.

**Acceptance Criteria:**
- `GET /api/admin/terminals/import/csv-template` returns a CSV template with terminal columns.
- `GET /api/admin/terminals/import/json-example` returns a JSON example payload.
- Both endpoints are public (no operator dep) mirroring equipment templates.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `backend/app/api/routes/equipment_import_templates.py` in full.
- [ ] **Step 2: Create the route file** mirroring equipment templates: rename columns to terminal fields (`manufacturer_id`, `category_id`, `model`, `slug`, `applicable_specs`, etc.); keep the same response content types.
- [ ] **Step 3: Verify it compiles.** Run: `cd backend && python -m py_compile app/api/routes/terminal_import_templates.py`
- [ ] **Step 4: Commit.** `git add backend/app/api/routes/terminal_import_templates.py && git commit -m "feat(terminals): add admin import template endpoints"`

### Task 4.6: Create `backend/app/services/terminal_import.py`

**Files:**
- Create: `backend/app/services/terminal_import.py`
- Mirror source: `backend/app/services/equipment_import.py`

**Interfaces:**
- Consumes: `crud_terminal`, `crud_terminal_manufacturer`, `crud_terminal_category` (Task 2.2); schemas (Task 2.1).
- Produces: functions `validate_rows(parsed_rows) -> list[ValidationResult]` and `commit_rows(db, parsed_rows) -> CommitResult` (names/signatures mirroring equipment); plus a parser for CSV/JSON input. CSV/JSON column set matches the template from Task 4.5.

**Acceptance Criteria:**
- The service parses CSV and JSON inputs into rows, validates each (manufacturer exists, category exists, slug uniqueness, `applicable_specs` is valid JSON), and returns per-row status.
- `commit_rows` persists valid rows as `Terminal` records.
- No `manufacturer_id` forcing here (admin context); portal forcing is added in Task 5.2.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `backend/app/services/equipment_import.py` in full.
- [ ] **Step 2: Create the service** mirroring equipment import: rename to terminal, swap CRUD/schema imports, keep parse/validate/commit phases.
- [ ] **Step 3: Verify it compiles.** Run: `cd backend && python -m py_compile app/services/terminal_import.py`
- [ ] **Step 4: Commit.** `git add backend/app/services/terminal_import.py && git commit -m "feat(terminals): add CSV/JSON import service"`

### Task 4.7: Register public/admin terminal routers in `main.py`

**Files:**
- Modify: `backend/app/main.py`
- Mirror source: the equipment router registrations in the same file.

**Interfaces:**
- Consumes: routers from Tasks 4.1–4.5.
- Produces: `app.include_router(...)` calls for `terminals`, `terminal_manufacturers`, `terminal_categories`, `terminal_import`, `terminal_import_templates` with the prefixes/tags from Group 4.

**Acceptance Criteria:**
- All five public/admin terminal routers are mounted at the prefixes listed in Global Constraints.
- `uvicorn app.main:app` (or the project's run command) starts without import errors.
- `/docs` lists the new `terminals`, `terminal-manufacturers`, `terminal-categories`, `terminal-import`, `terminal-import-templates` tags.

**Steps:**
- [ ] **Step 1: Read the file.** Read `backend/app/main.py`; locate the equipment `include_router` block.
- [ ] **Step 2: Add five `include_router` calls** for the terminal routers, mirroring equipment's prefix/tag/dependency wiring.
- [ ] **Step 3: Verify the app imports.** Run: `cd backend && python -c "from app.main import app; print(len(app.routes))"`
- [ ] **Step 4: (Optional) start the API** and confirm `/docs` shows the new tags.
- [ ] **Step 5: Commit.** `git add backend/app/main.py && git commit -m "feat(terminals): register public/admin terminal routers"`

---

## Group 5 — Backend API Routes (Portal)

### Task 5.1: Create `backend/app/api/routes/portal_terminals.py`

**Files:**
- Create: `backend/app/api/routes/portal_terminals.py`
- Mirror source: `backend/app/api/routes/portal_equipment.py`

**Interfaces:**
- Consumes: `crud_terminal`, `crud_terminal_manufacturer` (Task 2.2); `require_factory_module("terminals")` dep (Task 3.3); current portal user with `scope_type="terminal_manufacturer"`; schemas (Task 2.1, including `PortalTerminalCreate`).
- Produces: router with prefix `/api/portal/terminals`, tag `portal-terminals` (note: spec text says `portal-termals` in tasks.md — use the spelling consistent with the mirror source; prefer `portal-terminals`); endpoints: list (scope-filtered), get, create, update, delete.

**Acceptance Criteria:**
- All endpoints require `require_factory_module("terminals")`, which accepts `terminal_manufacturer` scope (Task 3.3).
- `GET /api/portal/terminals` returns only rows where `manufacturer_id == user.scope_id`.
- `POST /api/portal/terminals` forces `manufacturer_id = user.scope_id` (ignores client value) and generates `id = f"{manufacturer_slug}-{product_slug}"`.
- `GET/PUT/DELETE /api/portal/terminals/{id}` for products not owned by `user.scope_id` return 404 via `_check_terminal_ownership` (mirror `_check_equipment_ownership`).
- `python -m py_compile backend/app/api/routes/portal_terminals.py` succeeds.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `backend/app/api/routes/portal_equipment.py` in full; note `_check_equipment_ownership` and the ID-generation helper.
- [ ] **Step 2: Create the route file** mirroring portal_equipment: rename to terminal, swap CRUD/schema imports, rename `_check_equipment_ownership`→`_check_terminal_ownership`, keep the `manufacturer_id` forcing and `{manufacturer_slug}-{slug}` ID generation.
- [ ] **Step 3: Verify it compiles.** Run: `cd backend && python -m py_compile app/api/routes/portal_terminals.py`
- [ ] **Step 4: Commit.** `git add backend/app/api/routes/portal_terminals.py && git commit -m "feat(terminals): add portal scope-filtered CRUD route"`

### Task 5.2: Create `backend/app/api/routes/portal_terminal_import.py`

**Files:**
- Create: `backend/app/api/routes/portal_terminal_import.py`
- Mirror source: `backend/app/api/routes/portal_equipment_import.py`

**Interfaces:**
- Consumes: `terminal_import` service (Task 4.6); `require_factory_module("terminals")` dep; current portal user.
- Produces: router with prefix `/api/portal/terminals/import`, tag `portal-terminal-import`; endpoints: `POST /validate`, `POST /commit` (both call `_force_manufacturer_id(parsed_rows, user.scope_id)` after parse, before validate), `GET /csv-template`, `GET /json-example`.

**Acceptance Criteria:**
- `POST /api/portal/terminals/import/validate` overwrites every parsed row's `manufacturer_id` with `user.scope_id` before validation, then returns per-row status.
- `POST /api/portal/terminals/import/commit` does the same forcing then persists valid rows.
- `GET /csv-template` and `GET /json-example` mirror the admin templates (Task 4.5).
- All endpoints require `require_factory_module("terminals")`.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `backend/app/api/routes/portal_equipment_import.py` in full; note `_force_manufacturer_id`.
- [ ] **Step 2: Create the route file** mirroring portal_equipment_import: rename to terminal, swap service import to `app.services.terminal_import`, keep `_force_manufacturer_id(parsed_rows, scope_id)` running after parse and before validate/commit.
- [ ] **Step 3: Verify it compiles.** Run: `cd backend && python -m py_compile app/api/routes/portal_terminal_import.py`
- [ ] **Step 4: Commit.** `git add backend/app/api/routes/portal_terminal_import.py && git commit -m "feat(terminals): add portal import route with manufacturer_id forcing"`

### Task 5.3: Register portal terminal routers in `main.py`

**Files:**
- Modify: `backend/app/main.py`
- Mirror source: the portal equipment router registrations.

**Interfaces:**
- Consumes: routers from Tasks 5.1, 5.2.
- Produces: `app.include_router(...)` calls for `portal_terminals` (prefix `/api/portal/terminals`) and `portal_terminal_import` (prefix `/api/portal/terminals/import`).

**Acceptance Criteria:**
- Both portal terminal routers are mounted.
- `/docs` lists `portal-terminals` and `portal-terminal-import` tags.

**Steps:**
- [ ] **Step 1: Read the file.** Read `backend/app/main.py`; locate the portal equipment `include_router` block.
- [ ] **Step 2: Add two `include_router` calls** for the portal terminal routers, mirroring equipment's prefix/tag/dependency wiring.
- [ ] **Step 3: Verify the app imports.** Run: `cd backend && python -c "from app.main import app; print(len(app.routes))"`
- [ ] **Step 4: Commit.** `git add backend/app/main.py && git commit -m "feat(terminals): register portal terminal routers"`

---

## Group 6 — Frontend API Clients & Lib

> **Mirror convention:** the frontend API client namespaces mirror equipment exactly — same method names, same param shapes, same adapter functions. Only the URL paths and type names change.

### Task 6.1: Add terminal namespaces to `frontend/lib/api.ts`

**Files:**
- Modify: `frontend/lib/api.ts`
- Mirror source: the `terminals`/`equipmentManufacturers`/`equipmentCategories`-equivalent (i.e. `equipment`, `equipmentManufacturers`, `equipmentCategories`) namespaces in the same file.

**Interfaces:**
- Produces: `api.terminals.all({ q, category_id, manufacturer_id, page })`, `api.terminals.getById(id)`; `api.terminalManufacturers.all({ page })`, `api.terminalManufacturers.getById(id)`; `api.terminalCategories.tree()`; with adapter functions that map backend payloads to the frontend `Terminal`/`TerminalManufacturer`/`TerminalCategory` types.

**Acceptance Criteria:**
- The three namespaces exist with the methods above.
- Adapter functions mirror the equipment adapters (same field mapping, renamed types).
- TypeScript compiles (`npm run lint` clean for this file).

**Steps:**
- [ ] **Step 1: Read the file.** Read `frontend/lib/api.ts`; locate the equipment namespaces and adapter functions.
- [ ] **Step 2: Add `terminals`, `terminalManufacturers`, `terminalCategories` namespaces** mirroring equipment, pointing at `/api/terminals`, `/api/terminal-manufacturers`, `/api/terminal-categories`.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add frontend/lib/api.ts && git commit -m "feat(terminals): add public API client namespaces"`

### Task 6.2: Add admin terminal namespaces to `frontend/lib/adminApi.ts`

**Files:**
- Modify: `frontend/lib/adminApi.ts`
- Mirror source: the `adminApi.equipment`, `adminApi.equipmentManufacturers`, `adminApi.equipmentCategories` namespaces.

**Interfaces:**
- Produces: `adminApi.terminals.{list, get, create, update, delete}`; `adminApi.terminalManufacturers.{list, get, create, update, delete}`; `adminApi.terminalCategories.{tree, get, create, update, delete}`.

**Acceptance Criteria:**
- All methods above exist with the same signatures as the equipment equivalents.
- URLs point at `/api/terminals`, `/api/terminal-manufacturers`, `/api/terminal-categories`.
- TypeScript compiles.

**Steps:**
- [ ] **Step 1: Read the file.** Read `frontend/lib/adminApi.ts`; locate the equipment admin namespaces.
- [ ] **Step 2: Add the three admin terminal namespaces** mirroring equipment.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add frontend/lib/adminApi.ts && git commit -m "feat(terminals): add admin API client namespaces"`

### Task 6.3: Add portal terminal methods to portal API client

**Files:**
- Modify: `frontend/lib/portalApi.ts` (and `frontend/lib/portalApiClient.ts` if methods live there)
- Mirror source: the portal equipment methods.

**Interfaces:**
- Produces: `portalApi.terminals.{all, getById, create, update, delete}` and `portalApi.terminals.{importValidate, importCommit, csvTemplate, jsonExample}`.

**Acceptance Criteria:**
- All methods above exist, mirroring the portal equipment client.
- URLs point at `/api/portal/terminals` and `/api/portal/terminals/import/*`.
- `create` payload type omits `id` and `manufacturer_id` (matches `PortalTerminalCreate`).
- TypeScript compiles.

**Steps:**
- [ ] **Step 1: Read the files.** Read `frontend/lib/portalApi.ts` and `frontend/lib/portalApiClient.ts`; locate the equipment methods.
- [ ] **Step 2: Add the portal terminal methods** mirroring equipment, including import validate/commit and csv-template/json-example.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add frontend/lib/portalApi.ts frontend/lib/portalApiClient.ts && git commit -m "feat(terminals): add portal API client methods"`

### Task 6.4: Create `frontend/lib/terminalFilter.ts`

**Files:**
- Create: `frontend/lib/terminalFilter.ts`
- Mirror source: `frontend/lib/equipmentFilter.ts`

**Interfaces:**
- Consumes: `Terminal`, `TerminalCategory`, `TerminalManufacturer` types.
- Produces: pure functions `filterTerminals(rows, filters)` and a facet builder (mirroring `filterEquipment` + facets), operating in-memory on the client.

**Acceptance Criteria:**
- `filterTerminals` supports filters: `q` (model/brand text), `category_id`, `manufacturer_id`, and `applicable_specs` facets (mirror equipment).
- Facet builder returns available categories/manufacturers/spec values from the current result set.
- Pure functions, no network calls.
- TypeScript compiles.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `frontend/lib/equipmentFilter.ts` in full.
- [ ] **Step 2: Create `frontend/lib/terminalFilter.ts`** mirroring equipment filter with `Equipment`→`Terminal` renames.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add frontend/lib/terminalFilter.ts && git commit -m "feat(terminals): add in-memory filter and facet builder"`

### Task 6.5: Create `frontend/lib/clientTerminalImport.ts`

**Files:**
- Create: `frontend/lib/clientTerminalImport.ts`
- Mirror source: `frontend/lib/clientEquipmentImport.ts`

**Interfaces:**
- Consumes: `adminApi.terminals` / `portalApi.terminals` import methods (Tasks 6.2, 6.3).
- Produces: client helpers for uploading CSV/JSON to validate and commit (admin + portal variants), mirroring `clientEquipmentImport`.

**Acceptance Criteria:**
- The client exposes `validateImport(file, { portal })` and `commitImport(rows, { portal })` (or the equipment-equivalent API surface).
- CSV/JSON file reading matches the equipment client.
- TypeScript compiles.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `frontend/lib/clientEquipmentImport.ts` in full.
- [ ] **Step 2: Create `frontend/lib/clientTerminalImport.ts`** mirroring equipment, swapping API calls to terminal namespaces.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add frontend/lib/clientTerminalImport.ts && git commit -m "feat(terminals): add import client helpers"`

---

## Group 7 — Frontend Public Pages & Components

### Task 7.1: Create `frontend/app/(site)/terminals/page.tsx`

**Files:**
- Create: `frontend/app/(site)/terminals/page.tsx`
- Mirror source: `frontend/app/(site)/equipment/page.tsx`

**Interfaces:**
- Consumes: `api.terminals.all`, `api.terminalCategories.tree`, `api.terminalManufacturers.all` (Task 6.1); `TerminalListClient`, `TerminalFilters`, `TerminalCategoryNav` (Task 7.4); `filterTerminals` (Task 6.4).
- Produces: server component rendering the listing with category/manufacturer/spec filters.

**Acceptance Criteria:**
- `/terminals` renders all terminals with category navigation and faceted filters.
- Server-side data load fetches terminals, categories, manufacturers; client-side `filterTerminals` filters in-memory.
- Lint passes; page renders without runtime errors.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `frontend/app/(site)/equipment/page.tsx` in full.
- [ ] **Step 2: Create the page** mirroring equipment: swap API calls and component imports to terminal equivalents.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add "frontend/app/(site)/terminals/page.tsx" && git commit -m "feat(terminals): add public listing page"`

### Task 7.2: Create `frontend/app/(site)/terminals/[slug]/page.tsx`

**Files:**
- Create: `frontend/app/(site)/terminals/[slug]/page.tsx`
- Mirror source: `frontend/app/(site)/equipment/[slug]/page.tsx`

**Interfaces:**
- Consumes: `api.terminals.getById` (Task 6.1); `ApplicableSpecsTable` (shared, mirror equipment's usage); inquiry form component with `recipientType="terminal_manufacturer"`.
- Produces: server component rendering product detail.

**Acceptance Criteria:**
- `/terminals/{slug}` renders image, manufacturer link, category badge, applicable specs table, and an inquiry form with `recipientType="terminal_manufacturer"`.
- JSON-LD script block mirrors equipment (renamed to Terminal schema).
- Lint passes.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `frontend/app/(site)/equipment/[slug]/page.tsx` in full.
- [ ] **Step 2: Create the page** mirroring equipment: swap API call, set `recipientType="terminal_manufacturer"`, rename JSON-LD to Terminal.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add "frontend/app/(site)/terminals/[slug]/page.tsx" && git commit -m "feat(terminals): add public product detail page"`

### Task 7.3: Create `frontend/app/(site)/terminals/manufacturers/[slug]/page.tsx`

**Files:**
- Create: `frontend/app/(site)/terminals/manufacturers/[slug]/page.tsx`
- Mirror source: `frontend/app/(site)/equipment/manufacturers/[slug]/page.tsx`

**Interfaces:**
- Consumes: `api.terminalManufacturers.getById` and `api.terminals.all({ manufacturer_id })` (Task 6.1).
- Produces: server component rendering manufacturer profile with contact info and product grid + inquiry CTA.

**Acceptance Criteria:**
- `/terminals/manufacturers/{slug}` renders contact info, product grid, and inquiry CTA.
- Lint passes.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `frontend/app/(site)/equipment/manufacturers/[slug]/page.tsx` in full.
- [ ] **Step 2: Create the page** mirroring equipment: swap API calls to terminal namespaces.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add "frontend/app/(site)/terminals/manufacturers/[slug]/page.tsx" && git commit -m "feat(terminals): add public manufacturer profile page"`

### Task 7.4: Create terminal components in `frontend/components/terminals/`

**Files:**
- Create: `frontend/components/terminals/TerminalCard.tsx`, `TerminalListClient.tsx`, `TerminalFilters.tsx`, `TerminalCategoryNav.tsx`
- Mirror source: `frontend/components/equipment/EquipmentCard.tsx`, `EquipmentListClient.tsx`, `EquipmentFilters.tsx`, `EquipmentCategoryNav.tsx`

**Interfaces:**
- Consumes: types and `filterTerminals` (Task 6.4); `api` namespaces (Task 6.1).
- Produces: four client/server components used by Task 7.1.

**Acceptance Criteria:**
- All four components exist and mirror their equipment counterparts' props and behavior.
- `TerminalListClient` uses `filterTerminals` and renders `TerminalCard`s.
- `TerminalFilters` exposes q/category/manufacturer/spec controls.
- `TerminalCategoryNav` renders the 2-level category tree.
- Lint passes.

**Steps:**
- [ ] **Step 1: Read mirror sources.** Read the four equipment components.
- [ ] **Step 2: Create the four terminal components** mirroring equipment with `Equipment`→`Terminal` renames. (Skip `RecommendedEquipmentCard`, `HotEquipmentRecommendation`, `EquipmentManufacturerRecommendation`, `ApplicableSpecsTable` unless referenced by the listing — `ApplicableSpecsTable` is reused as-is from equipment; do not duplicate it.)
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add frontend/components/terminals/ && git commit -m "feat(terminals): add public listing components"`

---

## Group 8 — Frontend Admin Pages & Components

### Task 8.1: Create admin pages under `frontend/app/admin/(dashboard)/terminals/`

**Files:**
- Create: `frontend/app/admin/(dashboard)/terminals/page.tsx` (list)
- Create: `frontend/app/admin/(dashboard)/terminals/new/page.tsx`
- Create: `frontend/app/admin/(dashboard)/terminals/[id]/page.tsx` (edit)
- Create: `frontend/app/admin/(dashboard)/terminals/manufacturers/page.tsx` + `new/page.tsx` + `[id]/page.tsx`
- Create: `frontend/app/admin/(dashboard)/terminals/categories/page.tsx` + `new/page.tsx` + `[...id]/page.tsx`
- Create: `frontend/app/admin/(dashboard)/terminals/import/page.tsx`
- Mirror source: `frontend/app/admin/(dashboard)/equipment/` (same sub-tree).

**Interfaces:**
- Consumes: `adminApi.terminals`, `adminApi.terminalManufacturers`, `adminApi.terminalCategories` (Task 6.2); admin form components (Task 8.2); `TerminalSearchBox` (Task 8.3); `clientTerminalImport` (Task 6.5).

**Acceptance Criteria:**
- All listed pages exist and render without runtime errors.
- List pages call the corresponding `adminApi` namespace.
- New/edit pages render the matching admin form component.
- Categories edit page uses catch-all `[...id]` for composite IDs.
- Import page uses `clientTerminalImport`.
- Lint passes.

**Steps:**
- [ ] **Step 1: Read mirror sources.** Read all pages under `frontend/app/admin/(dashboard)/equipment/`.
- [ ] **Step 2: Create the matching terminal pages** mirroring equipment, swapping API calls and form imports.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add "frontend/app/admin/(dashboard)/terminals/" && git commit -m "feat(terminals): add admin pages for products, manufacturers, categories, import"`

### Task 8.2: Create admin form components in `frontend/components/admin/form/`

**Files:**
- Create: `frontend/components/admin/form/TerminalManufacturerForm.tsx`, `TerminalForm.tsx`, `TerminalCategoryForm.tsx`
- Mirror source: `frontend/components/admin/form/EquipmentManufacturerForm.tsx`, `EquipmentForm.tsx`, `EquipmentCategoryForm.tsx`

**Interfaces:**
- Consumes: `adminApi.terminalManufacturers`, `adminApi.terminals`, `adminApi.terminalCategories` (Task 6.2); schemas/types.
- Produces: three controlled form components used by Task 8.1.

**Acceptance Criteria:**
- All three forms exist and mirror their equipment counterparts' props (initial values, onSubmit, fields).
- `TerminalForm` includes `manufacturer_id`, `category_id`, `model`, `slug`, `applicable_specs` (JSON editor), `description`, `image_url`, `external_url`, `sort_order`.
- `TerminalCategoryForm` handles both top-level and child (composite ID) creation.
- Lint passes.

**Steps:**
- [ ] **Step 1: Read mirror sources.** Read the three equipment admin form components.
- [ ] **Step 2: Create the three terminal form components** mirroring equipment.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add frontend/components/admin/form/ && git commit -m "feat(terminals): add admin form components"`

### Task 8.3: Create `frontend/components/admin/list/TerminalSearchBox.tsx`

**Files:**
- Create: `frontend/components/admin/list/TerminalSearchBox.tsx`
- Mirror source: `frontend/components/admin/list/EquipmentSearchBox.tsx`

**Interfaces:**
- Consumes: `adminApi.terminals` (Task 6.2).
- Produces: search box used by the admin terminals list page.

**Acceptance Criteria:**
- The component mirrors `EquipmentSearchBox` props and behavior, querying `adminApi.terminals`.
- Lint passes.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `frontend/components/admin/list/EquipmentSearchBox.tsx`.
- [ ] **Step 2: Create `TerminalSearchBox.tsx`** mirroring equipment.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add frontend/components/admin/list/TerminalSearchBox.tsx && git commit -m "feat(terminals): add admin list search box"`

---

## Group 9 — Frontend Portal Pages & Components

### Task 9.1: Create portal pages under `frontend/app/portal/terminals/`

**Files:**
- Create: `frontend/app/portal/terminals/page.tsx` (list, scope-filtered)
- Create: `frontend/app/portal/terminals/new/page.tsx`
- Create: `frontend/app/portal/terminals/[id]/page.tsx` (edit)
- Create: `frontend/app/portal/terminals/import/page.tsx`
- Create: `frontend/app/portal/terminals/loading.tsx`
- Mirror source: `frontend/app/portal/equipment/` (same sub-tree).

**Interfaces:**
- Consumes: `portalApi.terminals` (Task 6.3); portal form components (Task 9.2); `TerminalListToolbar` (Task 9.3); `clientTerminalImport` (Task 6.5).

**Acceptance Criteria:**
- All listed pages exist and mirror equipment portal pages.
- List page calls `portalApi.terminals.all` (server pre-filters by scope on the backend).
- New/edit pages render the matching portal form component; new page omits `manufacturer_id` from the form (server forces it).
- Import page uses `clientTerminalImport` with `portal: true`.
- `loading.tsx` renders a skeleton mirroring equipment.
- Lint passes.

**Steps:**
- [ ] **Step 1: Read mirror sources.** Read all pages under `frontend/app/portal/equipment/`.
- [ ] **Step 2: Create the matching terminal portal pages** mirroring equipment, swapping API calls and form imports.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add "frontend/app/portal/terminals/" && git commit -m "feat(terminals): add portal pages for list, new, edit, import, loading"`

### Task 9.2: Create portal form components in `frontend/components/portal/form/`

**Files:**
- Create: `frontend/components/portal/form/TerminalFormFields.tsx`, `TerminalCreateForm.tsx`, `TerminalEditForm.tsx`, `TerminalDeleteButton.tsx`
- Mirror source: `frontend/components/portal/form/EquipmentFormFields.tsx`, `EquipmentCreateForm.tsx`, `EquipmentEditForm.tsx`, `EquipmentDeleteButton.tsx`

**Interfaces:**
- Consumes: `portalApi.terminals` (Task 6.3); schemas/types.
- Produces: four portal form components used by Task 9.1.

**Acceptance Criteria:**
- All four components exist and mirror their equipment counterparts.
- `TerminalCreateForm` payload omits `id` and `manufacturer_id` (matches `PortalTerminalCreate`).
- `TerminalEditForm` loads existing product via `portalApi.terminals.getById` and submits via `update`.
- `TerminalDeleteButton` calls `portalApi.terminals.delete`.
- Lint passes.

**Steps:**
- [ ] **Step 1: Read mirror sources.** Read the four equipment portal form components.
- [ ] **Step 2: Create the four terminal portal form components** mirroring equipment.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add frontend/components/portal/form/ && git commit -m "feat(terminals): add portal form components"`

### Task 9.3: Create `frontend/components/portal/terminals/TerminalListToolbar.tsx`

**Files:**
- Create: `frontend/components/portal/terminals/TerminalListToolbar.tsx`
- Mirror source: `frontend/components/portal/equipment/EquipmentListToolbar.tsx`

**Interfaces:**
- Consumes: portal routing/state for the terminals list.
- Produces: toolbar used by the portal terminals list page.

**Acceptance Criteria:**
- The component mirrors `EquipmentListToolbar` props and behavior.
- Lint passes.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `frontend/components/portal/equipment/EquipmentListToolbar.tsx`.
- [ ] **Step 2: Create `TerminalListToolbar.tsx`** mirroring equipment.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add frontend/components/portal/terminals/TerminalListToolbar.tsx && git commit -m "feat(terminals): add portal list toolbar"`

---

## Group 10 — Frontend Integration

### Task 10.1: Add `TERMINAL_MANUFACTURER_NAV` to `PortalSidebar.tsx`

**Files:**
- Modify: `frontend/components/portal/layout/PortalSidebar.tsx`
- Mirror source: `EQUIPMENT_MANUFACTURER_NAV` in the same file.

**Interfaces:**
- Produces: `TERMINAL_MANUFACTURER_NAV` array (Dashboard, Terminals, Inquiries, Messages, Media, Settings); selected when `scope_type === "terminal_manufacturer"`.

**Acceptance Criteria:**
- A portal user with `scope_type="terminal_manufacturer"` sees the terminal nav (with a Terminals link to `/portal/terminals`).
- Other scope types are unaffected.
- Lint passes.

**Steps:**
- [ ] **Step 1: Read the file.** Read `frontend/components/portal/layout/PortalSidebar.tsx`; locate `EQUIPMENT_MANUFACTURER_NAV` and the scope_type selection logic.
- [ ] **Step 2: Add `TERMINAL_MANUFACTURER_NAV`** mirroring equipment (Terminals entry → `/portal/terminals`), and add a branch selecting it when `scope_type === "terminal_manufacturer"`.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add frontend/components/portal/layout/PortalSidebar.tsx && git commit -m "feat(terminals): add portal sidebar nav for terminal_manufacturer scope"`

### Task 10.2: Add "Terminal" option to `SearchBox.tsx`

**Files:**
- Modify: `frontend/components/shared/SearchBox.tsx`
- Mirror source: the existing "Equipment" option in the same file.

**Interfaces:**
- Produces: a third `<option>` "Terminal" in the category dropdown routing to `/terminals?q=` with placeholder "Search terminal model, brand...".

**Acceptance Criteria:**
- Selecting "Terminal" sets the form target to `/terminals` and the placeholder to "Search terminal model, brand...".
- Submitting navigates to `/terminals?q={query}`.
- Lint passes.

**Steps:**
- [ ] **Step 1: Read the file.** Read `frontend/components/shared/SearchBox.tsx`; locate the category dropdown and the equipment option/placeholder logic.
- [ ] **Step 2: Add the "Terminal" option** as the third option, with its route and placeholder mirroring how equipment is wired.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add frontend/components/shared/SearchBox.tsx && git commit -m "feat(terminals): add Terminal option to header search box"`

### Task 10.3: Add terminal entries to admin menu registry and modules

**Files:**
- Modify: `frontend/lib/adminMenuRegistry.ts`
- Modify: `frontend/lib/adminModules.ts`
- Modify: `frontend/components/admin/layout/AdminSidebar.tsx` (if `PAGE_ID_TO_MODULE_ID` lives here)
- Mirror source: the equipment entries in each file.

**Interfaces:**
- Produces: `ADMIN_PAGES` entries `terminals`, `terminal-mfrs`, `terminal-cats`; `adminModules.ts` scope_type label `"terminal_manufacturer": "Terminal Manufacturer"` and module definitions; `PAGE_ID_TO_MODULE_ID` mappings `terminal-mfrs`→`terminal_mfrs`, `terminal-cats`→`terminal_cats`, `terminals`→`terminal_list`.

**Acceptance Criteria:**
- The three page IDs appear in `ADMIN_PAGES` with labels/paths matching the admin pages from Task 8.1.
- `adminModules.ts` defines the three modules and the scope_type label.
- `PAGE_ID_TO_MODULE_ID` maps each terminal page ID to its module so the admin sidebar renders them only when the operator has the matching module.
- Lint passes.

**Steps:**
- [ ] **Step 1: Read the files.** Read `frontend/lib/adminMenuRegistry.ts`, `frontend/lib/adminModules.ts`, and `frontend/components/admin/layout/AdminSidebar.tsx`; locate the equipment entries and `PAGE_ID_TO_MODULE_ID`.
- [ ] **Step 2: Add terminal entries** to all three files mirroring equipment.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add frontend/lib/adminMenuRegistry.ts frontend/lib/adminModules.ts "frontend/components/admin/layout/AdminSidebar.tsx" && git commit -m "feat(terminals): register admin menu, modules, and sidebar mappings"`

### Task 10.4: Create terminal Next.js route handlers under `frontend/app/api/`

**Files:**
- Create: `frontend/app/api/admin/terminals/route.ts`, `frontend/app/api/admin/terminals/[id]/route.ts`, `frontend/app/api/admin/terminals/import/validate/route.ts`, `frontend/app/api/admin/terminals/import/commit/route.ts`
- Create: `frontend/app/api/admin/terminal-manufacturers/route.ts`, `frontend/app/api/admin/terminal-manufacturers/[id]/route.ts`
- Create: `frontend/app/api/admin/terminal-categories/route.ts`, `frontend/app/api/admin/terminal-categories/[...id]/route.ts`
- Create: `frontend/app/api/portal/terminals/route.ts`, `frontend/app/api/portal/terminals/[id]/route.ts`, `frontend/app/api/portal/terminals/import/validate/route.ts`, `frontend/app/api/portal/terminals/import/commit/route.ts`
- Mirror source: the matching `frontend/app/api/admin/equipment*/**` and `frontend/app/api/portal/equipment/**` route handlers.

**Interfaces:**
- Consumes: `adminApi` / `portalApi` terminal namespaces (Tasks 6.2, 6.3).
- Produces: Next.js route handlers proxying to the backend terminal endpoints.

**Acceptance Criteria:**
- All listed route handlers exist and mirror their equipment counterparts (same HTTP methods, same request/response shape).
- `terminal-categories` uses catch-all `[...id]` for composite IDs (mirror `equipment-categories`).
- Lint passes.

**Steps:**
- [ ] **Step 1: Read mirror sources.** Read all `frontend/app/api/admin/equipment*/**/route.ts` and `frontend/app/api/portal/equipment/**/route.ts` files.
- [ ] **Step 2: Create the terminal route handlers** mirroring equipment, swapping API client calls to terminal namespaces.
- [ ] **Step 3: Verify lint.** Run: `cd frontend && npm run lint`
- [ ] **Step 4: Commit.** `git add "frontend/app/api/admin/terminals/" "frontend/app/api/admin/terminal-manufacturers/" "frontend/app/api/admin/terminal-categories/" "frontend/app/api/portal/terminals/" && git commit -m "feat(terminals): add Next.js route handlers for admin and portal"`

---

## Group 11 — Seed Data & Test Users

### Task 11.1: Add `seed_terminals()` to `backend/scripts/seed.py`

**Files:**
- Modify: `backend/scripts/seed.py`
- Mirror source: `seed_equipment()` in the same file.

**Interfaces:**
- Consumes: `crud_terminal_manufacturer`, `crud_terminal_category`, `crud_terminal` (Task 2.2); seed data file from Task 11.2.
- Produces: `seed_terminals()` that creates sample manufacturers, maps `type` → category, and creates terminal products; idempotent (skip if already seeded).

**Acceptance Criteria:**
- Running `python backend/scripts/seed.py` (or the project's seed command) creates terminal manufacturers, categories, and products from `frontend/data/recommended-terminals.json`.
- Re-running is idempotent (no duplicate rows).
- The function is called from the seed script's main entrypoint alongside `seed_equipment()`.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `seed_equipment()` in `backend/scripts/seed.py`.
- [ ] **Step 2: Add `seed_terminals()`** mirroring equipment: load `frontend/data/recommended-terminals.json`, create manufacturers from `brand`, map `type` to a category (create categories as needed), create terminal records. Add the call to the main seed entrypoint.
- [ ] **Step 3: Verify it imports.** Run: `cd backend && python -c "from scripts.seed import seed_terminals; print('ok')"` (adjust import path if the script is run differently).
- [ ] **Step 4: Commit.** `git add backend/scripts/seed.py && git commit -m "feat(terminals): add seed_terminals function"`

### Task 11.2: Create `frontend/data/recommended-terminals.json`

**Files:**
- Create: `frontend/data/recommended-terminals.json`
- Mirror source: `frontend/data/recommended-equipments.json`

**Interfaces:**
- Consumes: the JSON schema enforced by `frontend/scripts/validate-data.ts` (run via `npm run validate`).
- Produces: array of `{ id, brand, model, type, description, applicable_specs, external_url }`.

**Acceptance Criteria:**
- The file exists and contains a representative sample (≥5 rows) of terminal/connector products across multiple brands and types (e.g., Ring Terminals, Spade Terminals, Bullet Connectors).
- `npm run validate` passes (the data validator accepts the new file — if the validator enumerates files explicitly, update it to include the new file mirroring how equipment is registered).
- Field names match `recommended-equipments.json`.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `frontend/data/recommended-equipments.json` and `frontend/scripts/validate-data.ts` to learn the schema and whether files are explicitly enumerated.
- [ ] **Step 2: Create `frontend/data/recommended-terminals.json`** mirroring the equipment structure. If `validate-data.ts` enumerates files explicitly, add the new file to its list mirroring the equipment entry.
- [ ] **Step 3: Verify.** Run: `cd frontend && npm run validate`
  Expected: validation passes.
- [ ] **Step 4: Commit.** `git add frontend/data/recommended-terminals.json frontend/scripts/validate-data.ts && git commit -m "feat(terminals): add recommended-terminals seed data"`

### Task 11.3: Add terminal test user to `seed_portal_users.py`

**Files:**
- Modify: `backend/scripts/seed_portal_users.py`
- Mirror source: the equipment manufacturer test user in the same file.

**Interfaces:**
- Consumes: a seeded terminal manufacturer from Task 11.1; module strings `media`, `terminals`.
- Produces: portal user `terminal_manager@test.com` / `test123456` with `scope_type="terminal_manufacturer"`, `scope_id` of a seeded manufacturer, and modules `media`, `terminals`.

**Acceptance Criteria:**
- Running the portal-user seed script creates the terminal manager user with the credentials and scope above.
- The user can log in to `/portal` and see the `TERMINAL_MANUFACTURER_NAV` (Task 10.1).
- Re-running is idempotent.

**Steps:**
- [ ] **Step 1: Read mirror source.** Read `backend/scripts/seed_portal_users.py`; locate the equipment manufacturer test user.
- [ ] **Step 2: Add the terminal manager user** mirroring equipment, with `scope_type="terminal_manufacturer"`, `scope_id` set to a seeded terminal manufacturer's id, and modules `["media", "terminals"]`.
- [ ] **Step 3: Verify it imports.** Run: `cd backend && python -c "from scripts.seed_portal_users import *; print('ok')"` (adjust to the script's actual entrypoint).
- [ ] **Step 4: Commit.** `git add backend/scripts/seed_portal_users.py && git commit -m "feat(terminals): add terminal_manager test portal user"`

---

## Manual End-to-End Verification (post-implementation)

After all 38 tasks are complete, run this checklist before declaring done. (Not a code task — verification only.)

- [ ] `cd backend && alembic upgrade head` applies cleanly from base-ref.
- [ ] `cd backend && python -c "from app.main import app"` succeeds.
- [ ] Start backend; open `/docs` — confirm tags: `terminals`, `terminal-manufacturers`, `terminal-categories`, `terminal-import`, `terminal-import-templates`, `portal-terminals`, `portal-terminal-import`.
- [ ] `cd frontend && npm run lint` is clean.
- [ ] `cd frontend && npm run build` succeeds.
- [ ] Run seed scripts; confirm manufacturers/categories/products + terminal_manager user exist.
- [ ] Browser: `/terminals` lists products; filters work; `/terminals/{slug}` shows detail + inquiry form; `/terminals/manufacturers/{slug}` shows profile.
- [ ] Browser: header search "Terminal" option routes to `/terminals?q=`.
- [ ] Browser: admin can CRUD manufacturers/categories/products; deleting a manufacturer with products returns 409; creating a 3rd-level category returns 400.
- [ ] Browser: portal login as `terminal_manager@test.com` shows terminal nav; list is scope-filtered; create forces manufacturer_id; accessing another manufacturer's product returns 404.
- [ ] Browser: portal CSV import with a foreign `manufacturer_id` column is overwritten with the user's scope_id.
- [ ] Confirm media folders (root + `logos`, `products`, `docs`) are provisioned on manufacturer create, renamed on update, removed on delete.

---

## Self-Review Notes

- **Spec coverage:** All 9 ADDED Requirements in `spec.md` are covered — manufacturer CRUD + media provisioning (Tasks 1.1, 1.3, 2.1, 2.2, 3.4, 4.2, 10.1); category 2-level tree (Tasks 1.1, 2.1, 2.2, 4.3); admin product CRUD (Tasks 1.1, 2.1, 2.2, 4.1); portal scope-filtered CRUD with forced manufacturer_id + server-generated ID (Tasks 3.3, 5.1); public browsing (Tasks 7.1–7.4); admin import (Tasks 4.4–4.6); portal import with forcing (Tasks 5.2, 6.5); media folder provisioning/cleanup (Tasks 3.4, 4.2); inquiry linkage via `recipientType="terminal_manufacturer"` (Task 7.2); header search "Terminal" (Task 10.2).
- **Task coverage:** All 38 tasks from `tasks.md` mapped 1:1 to Tasks 1.1–11.3 above.
- **Type/name consistency:** Singletons `crud_terminal_manufacturer`, `crud_terminal_category`, `crud_terminal`; scope_type `terminal_manufacturer`; module IDs `terminal_mfrs`, `terminal_cats`, `terminal_list`; portal factory module `"terminals"`; tag `portal-terminals` (note: tasks.md typo `portal-termals` corrected to `portal-terminals` — confirm against mirror source `portal_equipment.py`'s tag spelling at implementation time and use whatever the equipment source uses).
- **No placeholders:** Every step has a concrete action; no "TBD" / "add error handling" / "similar to Task N" without the actual mirroring instruction.
- **base-ref preserved:** All commits sit on top of `62319248623b63e63223edd5ccf3860e79d4ab42`.
