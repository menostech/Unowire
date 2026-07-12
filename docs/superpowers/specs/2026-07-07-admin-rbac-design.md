# Admin RBAC (Role-Based Access Control) Design

**Date:** 2026-07-07
**Status:** Approved
**Scope:** Backend admin role & permission management system (frontend Member system is a separate spec)

---

## 1. Goal

Replace the current hardcoded `role` string column (`admin`/`editor`) with a fully configurable RBAC system. Admin can create custom roles, assign module-level permissions per role, and assign scoped roles to users (e.g., a Cable Manager scoped to one specific Manufacturer). The system must support adding new modules in the future without schema migrations.

## 2. Background & Current State

- `User.role` is a string column with CHECK constraint: `'admin'` or `'editor'`
- `get_current_admin` dependency: all-or-nothing check (`role != "admin"` → 403)
- No Role/Permission tables, no fine-grained permissions
- ~11 admin modules (dashboard, cables, brands, manufacturers, industries, equipment-mfrs, equipment-cats, equipment-list, media, menu-config, users)
- Two classification systems: cable taxonomy (Industry→Category→ProductType, 3 levels) and equipment categories (self-referencing 2 levels) — each module has its own independent classification table (per-module tables, not unified)

## 3. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Role management | Fully admin-configurable | Admin can create/edit/delete roles, configure permissions per role |
| Permission granularity | Module-level + automatic scope | Role has access to a module or not; scope is determined by role's `scope_type` and applied automatically by CRUD layer |
| Scope mechanism | Generic `scope_id` + role-defined `scope_type` | One column supports all scope types; adding new scoped modules needs no User schema change |
| Classification management | Per-module independent tables; managed by admin only | Cable taxonomy and equipment categories are separate tables; only admin can manage classifications |
| Frontend Member system | Out of scope (separate spec) | Member (C-end registered users, favorites, browsing history) is a separate subsystem |

## 4. Data Model

### 4.1 New Tables

#### `roles`

```sql
roles (
  id          VARCHAR(100) PRIMARY KEY,              -- e.g., 'admin', 'cable_manager'
  name        VARCHAR(100) NOT NULL,                 -- display name, e.g., 'Cable Manager'
  description TEXT,
  scope_type  VARCHAR(50) NULLABLE,                  -- null=global | 'manufacturer' | 'equipment_manufacturer'
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,        -- true=preset role, cannot be deleted (admin only)
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
)
```

**`scope_type` values:**
- `NULL` — global role, no data scoping (e.g., admin, content_editor)
- `'manufacturer'` — `scope_id` points to `manufacturers.id` (Cable Manufacturer)
- `'equipment_manufacturer'` — `scope_id` points to `equipment_manufacturers.id`

Future scope types (connector_manufacturer, raw_material_manufacturer, etc.) can be added without schema change — just a new value in `scope_type` and a new entry in the application-layer `SCOPE_RESOLVERS` map.

#### `role_permissions`

```sql
role_permissions (
  role_id     VARCHAR(100) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module      VARCHAR(100) NOT NULL,                 -- e.g., 'cables', 'brands', 'equipment_list'
  PRIMARY KEY (role_id, module)
)
```

### 4.2 Modified Tables

#### `users` (modify)

```sql
-- Before:
--   role VARCHAR(20) NOT NULL DEFAULT 'admin'  -- CHECK constraint: 'admin' | 'editor'

-- After:
users (
  ...
  role_id    VARCHAR(100) NOT NULL REFERENCES roles(id),  -- replaces role string
  scope_id   VARCHAR(100) NULLABLE,                        -- generic scope column, meaning depends on role.scope_type
  ...
)
```

**Data migration:** Existing `role='admin'` users → `role_id='admin'`; existing `role='editor'` users → `role_id='content_editor'`. All existing users get `scope_id=NULL`.

### 4.3 Application-Layer Constants

#### `backend/app/core/modules.py`

```python
ADMIN_MODULES = [
    {"id": "dashboard",       "label": "Dashboard",       "scope_aware": False, "scope_type": None},
    {"id": "cables",          "label": "Cables",          "scope_aware": True,  "scope_type": "manufacturer"},
    {"id": "brands",          "label": "Brands",          "scope_aware": True,  "scope_type": "manufacturer"},
    {"id": "manufacturers",   "label": "Manufacturers",   "scope_aware": True,  "scope_type": "manufacturer"},
    {"id": "industries",      "label": "Industries",      "scope_aware": False, "scope_type": None},
    {"id": "equipment_mfrs",  "label": "Equipment Mfrs",  "scope_aware": True,  "scope_type": "equipment_manufacturer"},
    {"id": "equipment_cats",  "label": "Equipment Cats",  "scope_aware": False, "scope_type": None},
    {"id": "equipment_list",  "label": "Equipment List",  "scope_aware": True,  "scope_type": "equipment_manufacturer"},
    {"id": "media",           "label": "Media",           "scope_aware": False, "scope_type": None},
    {"id": "menu_config",     "label": "Menu Config",     "scope_aware": False, "scope_type": None},
    {"id": "users",           "label": "Users",           "scope_aware": False, "scope_type": None},
    {"id": "roles",           "label": "Roles",           "scope_aware": False, "scope_type": None},
]

MODULE_BY_ID = {m["id"]: m for m in ADMIN_MODULES}
```

**`scope_aware`** = the module's data can be scoped (CRUD filters by `user.scope_id`).
**`scope_type`** = which manufacturer table the `scope_id` points to.

#### `backend/app/core/scope_resolvers.py`

```python
# Maps scope_type → async function that validates scope_id exists in the target table.
# Used when assigning a user to a scoped role (validates scope_id is valid).
SCOPE_RESOLVERS = {
    "manufacturer": validate_manufacturer_exists,
    "equipment_manufacturer": validate_equipment_manufacturer_exists,
}
```

Frontend mirrors `ADMIN_MODULES` in `frontend/lib/adminModules.ts` for the role permission editor UI.

### 4.4 Seed Data

```sql
-- 4 preset roles (is_system=true, cannot be deleted)
INSERT INTO roles (id, name, description, scope_type, is_system, sort_order) VALUES
  ('admin',             'Admin',             'Full access to all modules',                        NULL,                     TRUE, 0),
  ('content_editor',    'Content Editor',    'Manage cables, brands, manufacturers, equipment, media', NULL,                  TRUE, 1),
  ('equipment_manager', 'Equipment Manager', 'Manage own equipment manufacturer data',            'equipment_manufacturer', TRUE, 2),
  ('cable_manager',     'Cable Manager',     'Manage own manufacturer cables/brands',             'manufacturer',          TRUE, 3);

-- Default permissions per role
-- admin: all modules (including roles)
INSERT INTO role_permissions (role_id, module) VALUES
  ('admin', 'dashboard'), ('admin', 'cables'), ('admin', 'brands'), ('admin', 'manufacturers'),
  ('admin', 'industries'), ('admin', 'equipment_mfrs'), ('admin', 'equipment_cats'),
  ('admin', 'equipment_list'), ('admin', 'media'), ('admin', 'menu_config'),
  ('admin', 'users'), ('admin', 'roles');

-- content_editor: dashboard, cables, brands, manufacturers, equipment_mfrs, equipment_list, media
INSERT INTO role_permissions (role_id, module) VALUES
  ('content_editor', 'dashboard'), ('content_editor', 'cables'), ('content_editor', 'brands'),
  ('content_editor', 'manufacturers'), ('content_editor', 'equipment_mfrs'),
  ('content_editor', 'equipment_list'), ('content_editor', 'media');

-- equipment_manager: dashboard, equipment_mfrs, equipment_list, media
INSERT INTO role_permissions (role_id, module) VALUES
  ('equipment_manager', 'dashboard'), ('equipment_manager', 'equipment_mfrs'),
  ('equipment_manager', 'equipment_list'), ('equipment_manager', 'media');

-- cable_manager: dashboard, cables, brands, manufacturers, media
INSERT INTO role_permissions (role_id, module) VALUES
  ('cable_manager', 'dashboard'), ('cable_manager', 'cables'), ('cable_manager', 'brands'),
  ('cable_manager', 'manufacturers'), ('cable_manager', 'media');
```

## 5. Permission Model

### 5.1 Permission Check Flow

```
1. Auth: get_current_user (decode token, load user with role + role_permissions)
2. Module access: check if (role_id, module) exists in role_permissions
   - If not → 403
3. Scope application (if module.scope_aware AND role.scope_type is not null):
   - List endpoints: filter query by user.scope_id
   - Mutation endpoints: verify target resource belongs to user.scope_id
   - If user.scope_id is null but role requires scope → 403
```

### 5.2 Backend Dependencies

**Eager loading requirement:** `get_current_user` must eager-load the user's `role` (with `role_permissions`) using `selectinload` to avoid async `MissingGreenlet` errors when the permission check accesses `user.role_permissions`. The loaded `role_permissions` is stored on the User object as a set of module ID strings for O(1) lookup.

```python
# In get_current_user — eager load role + role_permissions
stmt = (
    select(User)
    .where(User.id == user_id)
    .options(
        selectinload(User.role).selectinload(Role.permissions)
    )
)
# After loading, populate a convenience set on the user object:
user.role_permissions = {rp.module for rp in user.role.permissions}
```

**Two dependency functions:**

```python
# 1. For endpoints that only need authentication (no specific module check)
#    e.g., /api/admin/me/permissions, /api/admin/auth/logout
async def get_current_admin_user(user: User = Depends(get_current_user)) -> User:
    """Any authenticated admin user (any role)."""
    return user

# 2. For endpoints that require access to a specific module
#    Factory: returns a dependency that checks the user's role has the module in role_permissions
async def require_module(module: str):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if module not in (user.role_permissions or set()):
            raise HTTPException(403, detail={"code": 403, "message": f"No access to module: {module}"})
        return user
    return checker

# Usage in routes:
@router.post("/cables")
async def create_cable(
    user: User = Depends(require_module("cables")),
    ...
):
    # CRUD layer checks user.role.scope_type and filters by user.scope_id
    ...
```

**Note on `get_current_admin` replacement:** The existing `get_current_admin` (used by 14 route files) is replaced by `require_module(...)`. Each route file's imports change from `get_current_admin` to `require_module`, and each endpoint specifies its module. GET (public list/detail) endpoints remain public (no auth) since they serve the public website.

### 5.3 Scope Filtering Pattern (CRUD layer, replicable per module)

```python
# Cable CRUD — replicable pattern for equipment, connectors, etc.
async def list_cables(db, user, ...):
    stmt = select(Cable)
    if user.role.scope_type == "manufacturer":
        # Join through Brand to filter by manufacturer
        stmt = stmt.join(Brand).where(Brand.manufacturer_id == user.scope_id)
    return await db.execute(stmt)

async def update_cable(db, user, cable_id, ...):
    cable = await get(db, cable_id)
    if user.role.scope_type == "manufacturer":
        if cable.brand.manufacturer_id != user.scope_id:
            raise HTTPException(403, detail={"code": 403, "message": "Cannot modify resource outside your scope"})
    ...

# Equipment CRUD — same pattern
async def list_equipment(db, user, ...):
    stmt = select(RecommendedEquipment)
    if user.role.scope_type == "equipment_manufacturer":
        stmt = stmt.where(RecommendedEquipment.manufacturer_id == user.scope_id)
    return await db.execute(stmt)
```

### 5.4 Admin Role Safeguard

The `admin` role must always have the `users` and `menu_config` module permissions. The API layer enforces this:

- When updating `admin` role's permissions, the API rejects requests that remove `users` or `menu_config` from the admin role
- This prevents lockout (no admin can manage users or menus)

## 6. API Endpoints

### 6.1 Role Management (admin only)

```
GET    /api/admin/roles              — list all roles (with permissions)
GET    /api/admin/roles/{id}         — get single role (with permissions)
POST   /api/admin/roles              — create custom role
PUT    /api/admin/roles/{id}         — update role (name, description, scope_type, permissions)
DELETE /api/admin/roles/{id}         — delete role (is_system=true → 403)
GET    /api/admin/modules            — list all available modules (for permission editor UI)
```

### 6.2 User Management (admin only)

```
GET    /api/admin/users              — list users (with role + scope info)
GET    /api/admin/users/{id}         — get single user
POST   /api/admin/users              — create user (email, password, role_id, scope_id)
PUT    /api/admin/users/{id}         — update user (role_id, scope_id, is_active, password)
DELETE /api/admin/users/{id}         — delete user (cannot delete self)
```

### 6.3 Scope Validation

```
GET    /api/admin/scopes/{scope_type}  — list entities for a scope_type (e.g., all manufacturers)
                                         Used by frontend user editor to populate scope_id dropdown
```

### 6.4 Current User Permissions (for sidebar)

```
GET    /api/admin/me/permissions  — returns current user's role, allowed modules, scope info
                                    Used by frontend sidebar to filter visible menu items
```

## 7. Frontend Changes

### 7.1 New Pages

- `/admin/roles` — role list (4 preset + custom roles)
- `/admin/roles/new` — create role form
- `/admin/roles/[id]` — edit role form (name, description, scope_type selector, module permission checkbox matrix)
- `/admin/users` — user list (existing, expanded with role + scope columns)
- `/admin/users/new` — create user form (email, password, role selector, conditional scope selector)
- `/admin/users/[id]` — edit user form

### 7.2 Sidebar Integration

The existing `AdminSidebar` (which fetches `/api/admin/menu/tree`) needs additional filtering:

1. Fetch `/api/admin/me/permissions` to get the user's allowed modules
2. Filter the menu tree: only render items whose `page_id` is in the allowed modules set
3. This runs client-side after the menu tree is loaded

### 7.3 Frontend Constants

```typescript
// frontend/lib/adminModules.ts — mirrors backend ADMIN_MODULES
export const ADMIN_MODULES = [
  { id: "dashboard",      label: "Dashboard",      scopeAware: false, scopeType: null },
  { id: "cables",         label: "Cables",         scopeAware: true,  scopeType: "manufacturer" },
  { id: "brands",         label: "Brands",         scopeAware: true,  scopeType: "manufacturer" },
  { id: "manufacturers",  label: "Manufacturers",  scopeAware: true,  scopeType: "manufacturer" },
  { id: "industries",     label: "Industries",     scopeAware: false, scopeType: null },
  { id: "equipment_mfrs", label: "Equipment Mfrs", scopeAware: true,  scopeType: "equipment_manufacturer" },
  { id: "equipment_cats", label: "Equipment Cats", scopeAware: false, scopeType: null },
  { id: "equipment_list", label: "Equipment List", scopeAware: true,  scopeType: "equipment_manufacturer" },
  { id: "media",          label: "Media",          scopeAware: false, scopeType: null },
  { id: "menu_config",    label: "Menu Config",    scopeAware: false, scopeType: null },
  { id: "users",          label: "Users",          scopeAware: false, scopeType: null },
];
```

### 7.4 Menu Registry Update

The existing `ADMIN_PAGES` registry (in `adminMenuRegistry.ts`) and the backend `ALLOWED_PAGE_IDS` (in `crud/menu.py`) need to add `roles` as a new page:

```python
# backend ALLOWED_PAGE_IDS — add 'roles'
ALLOWED_PAGE_IDS = {
    "dashboard", "cables", "brands", "manufacturers", "industries",
    "equipment-mfrs", "equipment-cats", "equipment-list",
    "media", "menu-config", "users", "roles",  # NEW
}
```

```typescript
// frontend ADMIN_PAGES — add roles entry
{ pageId: "roles", href: "/admin/roles", defaultLabel: "Roles", defaultIcon: "Shield" },
```

Seed migration adds a `roles` menu item under the `settings` group (alongside `menu-config` → "Menus").

## 8. Migration Strategy

### 8.1 Schema Migration

Single Alembic migration:
1. Create `roles` table
2. Create `role_permissions` table
3. Add `role_id` column to `users` (nullable initially)
4. Add `scope_id` column to `users` (nullable)
5. Seed 4 preset roles + default permissions
6. Migrate existing users: `role='admin'` → `role_id='admin'`; `role='editor'` → `role_id='content_editor'`
7. Drop old `role` column (or keep as deprecated, set NOT NULL on `role_id`)
8. Add FK constraint on `users.role_id`

### 8.2 Application Code Migration

1. Add `Role` and `RolePermission` models
2. Update `User` model (replace `role` with `role_id` + `scope_id`, add relationship to `Role`)
3. Add `modules.py` and `scope_resolvers.py` constants
4. Replace `get_current_admin` with `require_module(module)` factory
5. Update all 14 admin route files to use `require_module(...)` instead of `get_current_admin`
6. Add scope filtering to cable/brand/manufacturer/equipment CRUD
7. Add role/user management routes
8. Update auth `/me` endpoint to return permissions

### 8.3 Existing Tests

- Update `test_admin_menu.py` and any test using `admin_headers` fixture — the fixture user's role changes from string to FK, but the token-based auth flow is unchanged
- Add new tests for RBAC: permission denial, scope filtering, role CRUD, user CRUD

## 9. Out of Scope (Deferred)

- **Frontend Member system** — registered members, favorites, browsing history. Separate spec.
- **Action-level permissions** (view/create/edit/delete per module) — current design is module-level only. Can be extended later by adding an `actions` JSONB column to `role_permissions`.
- **Per-manufacturer custom sub-categories** — classifications remain global.
- **Audit log for role/user changes** — existing `AuditLog` table can capture this, but explicit logging of permission changes is not in scope.

## 10. Future Extension: New Module

To add a new module (e.g., Connectors):

1. **Backend:**
   - Create `connector_manufacturers` and `connectors` tables
   - Add `{"id": "connectors", "label": "Connectors", "scope_aware": true, "scope_type": "connector_manufacturer"}` to `ADMIN_MODULES`
   - Add `validate_connector_manufacturer_exists` to `SCOPE_RESOLVERS`
   - Add connector CRUD with scope filtering pattern
   - Add `"connector_manufacturer"` as a valid `scope_type` value

2. **Frontend:**
   - Mirror the module entry in `adminModules.ts`
   - Add connector pages to `ADMIN_PAGES`
   - Add `"connector_manufacturer"` to scope type handling in user editor

3. **No User schema migration needed** — the generic `scope_id` column already supports new scope types.

4. **Admin configures permissions** — the new module automatically appears in the role permission editor's checkbox matrix. Admin assigns it to roles as needed.

## 11. Testing Strategy

- **Unit tests:** Role CRUD, permission check logic, scope validation
- **Integration tests:** Each module's endpoints with different roles (admin, content_editor, cable_manager scoped, equipment_manager scoped, custom role)
- **Scope tests:** Cable Manager can only see/edit own manufacturer's data; Equipment Manager same for equipment
- **Safeguard tests:** Cannot delete `admin` role; cannot remove `users`/`menu_config` from admin role; cannot delete self
- **Migration tests:** Existing users correctly mapped to new role_id
