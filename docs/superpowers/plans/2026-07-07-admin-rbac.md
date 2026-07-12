# Admin RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `User.role` string with a fully configurable RBAC system: `roles` + `role_permissions` tables, generic `scope_id` on users, admin-managed role/permission CRUD, and module-level access checks via `require_module()` dependency.

**Architecture:** Two new tables (`roles`, `role_permissions`) + User schema change (`role` → `role_id` + `scope_id`). `get_current_admin` is replaced by a `require_module(module)` factory that checks the user's role has the module in `role_permissions`. Scope filtering is applied at the CRUD layer based on `role.scope_type` + `user.scope_id`. Frontend adds role/user admin pages and sidebar permission filtering.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (async) + Pydantic v2 + Alembic; Next.js 16 App Router + TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-07-admin-rbac-design.md`

---

## File Structure

**Backend (create):**
- `backend/app/models/role.py` — `Role` and `RolePermission` models
- `backend/app/schemas/role.py` — Pydantic schemas for Role/RolePermission
- `backend/app/schemas/user.py` — Pydantic schemas for User (admin management)
- `backend/app/crud/role.py` — `CRUDRole` with permission management
- `backend/app/crud/user.py` — `CRUDUser` with scope validation
- `backend/app/api/routes/admin_roles.py` — Role management endpoints
- `backend/app/api/routes/admin_users.py` — User management endpoints
- `backend/app/core/modules.py` — `ADMIN_MODULES` constant
- `backend/app/core/scope_resolvers.py` — `SCOPE_RESOLVERS` + `validate_scope_id`
- `backend/alembic/versions/b3c4d5e6f7a8_add_rbac_tables.py` — Migration + seed
- `backend/tests/api/test_admin_roles.py` — Role endpoint tests
- `backend/tests/api/test_admin_users.py` — User endpoint tests
- `backend/tests/api/test_rbac_permissions.py` — Permission denial + scope tests

**Backend (modify):**
- `backend/app/models/user.py` — Replace `role` with `role_id` + `scope_id`, add `role` relationship
- `backend/app/models/__init__.py` — Register `Role`, `RolePermission`
- `backend/app/api/deps.py` — Eager-load role in `get_current_user`; add `require_module` factory; replace `get_current_admin`
- `backend/app/api/routes/auth.py` — `/me` returns permissions
- `backend/app/api/routes/*.py` — 15 route files: replace `get_current_admin` with `require_module(...)`
- `backend/app/crud/cable.py` — Add scope filtering to `get_filtered`
- `backend/app/crud/equipment.py` — Add scope filtering to `get_all_with_relations`
- `backend/app/crud/manufacturer.py` — Add scope filtering
- `backend/app/crud/equipment_manufacturers.py` — Add scope filtering
- `backend/app/crud/menu.py` — Add `roles` to `ALLOWED_PAGE_IDS`
- `backend/app/main.py` — Register `admin_roles` + `admin_users` routers
- `backend/tests/conftest.py` — Promote `client` + `admin_headers` fixtures; add role fixtures

**Frontend (create):**
- `frontend/lib/adminModules.ts` — Mirror of backend `ADMIN_MODULES`
- `frontend/app/admin/(dashboard)/roles/page.tsx` — Role list
- `frontend/app/admin/(dashboard)/roles/new/page.tsx` — Create role
- `frontend/app/admin/(dashboard)/roles/[id]/page.tsx` — Edit role
- `frontend/app/admin/(dashboard)/users/page.tsx` — User list
- `frontend/app/admin/(dashboard)/users/new/page.tsx` — Create user
- `frontend/app/admin/(dashboard)/users/[id]/page.tsx` — Edit user
- `frontend/app/api/admin/roles/route.ts` — POST proxy
- `frontend/app/api/admin/roles/[id]/route.ts` — PUT/DELETE proxy
- `frontend/app/api/admin/users/route.ts` — POST proxy
- `frontend/app/api/admin/users/[id]/route.ts` — PUT/DELETE proxy

**Frontend (modify):**
- `frontend/lib/types.ts` — Add `Role`, `RolePermission`, `AdminUserExtended` interfaces
- `frontend/lib/adminApi.ts` — Add `roles` + `users` namespaces; extend `AdminUser`
- `frontend/lib/adminMenuRegistry.ts` — Add `users` and `roles` page entries
- `frontend/components/admin/layout/AdminSidebar.tsx` — Filter menu by permissions

---

## Global Constraints

- All code, comments, error messages in English (project is global-facing).
- All middleware/routes use `async/await` (no callback style).
- `selectinload` for eager-loading relationships to avoid async `MissingGreenlet` errors.
- Pydantic schemas use `model_config = {"from_attributes": True}` for ORM serialization.
- Error response format: `{"code": <int>, "message": <str>}` (matches existing routes).
- Migration must be idempotent (`ON CONFLICT (id) DO NOTHING` on seed inserts).
- Migration chains from `down_revision = 'a1b2c3d4e5f7'` (the latest existing migration).
- `admin` role cannot be deleted (`is_system=true`); its `users` + `menu_config` + `roles` permissions cannot be removed.
- Backend `ADMIN_MODULES` and frontend `adminModules.ts` must be kept in sync manually.
- `expire_on_commit=False` on test session to allow post-delete attribute access.

---

## Task 1: Backend Models — `Role` and `RolePermission`

**Files:**
- Create: `backend/app/models/role.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Create `backend/app/models/role.py`**

```python
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    scope_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    permissions: Mapped[list["RolePermission"]] = relationship(
        "RolePermission",
        back_populates="role",
        cascade="all, delete-orphan",
    )


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    module: Mapped[str] = mapped_column(String(100), primary_key=True)

    role: Mapped["Role"] = relationship("Role", back_populates="permissions")
```

- [ ] **Step 2: Register in `backend/app/models/__init__.py`**

Add `Role` and `RolePermission` imports and `__all__` entries. The final file should be:

```python
from app.models.brand import Brand
from app.models.cable import Cable, CableVariant, SpecItem
from app.models.equipment import RecommendedEquipment
from app.models.folder import Folder
from app.models.manufacturer import Manufacturer
from app.models.menu import AdminMenuItem
from app.models.role import Role, RolePermission
from app.models.taxonomy import Category, Industry, ProductType
from app.models.upload import Upload
from app.models.user import AuditLog, User

__all__ = [
    "AdminMenuItem",
    "AuditLog",
    "Brand",
    "Cable",
    "CableVariant",
    "Category",
    "Folder",
    "Industry",
    "Manufacturer",
    "ProductType",
    "RecommendedEquipment",
    "Role",
    "RolePermission",
    "SpecItem",
    "Upload",
    "User",
]
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/role.py backend/app/models/__init__.py
git commit -m "feat(rbac): add Role and RolePermission models"
```

---

## Task 2: Backend Model — Update `User` with `role_id` and `scope_id`

**Files:**
- Modify: `backend/app/models/user.py`

- [ ] **Step 1: Replace `role` column with `role_id` + `scope_id` and add `role` relationship**

Update `backend/app/models/user.py` to:

```python
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(200))
    role_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("roles.id", ondelete="RESTRICT"),
        nullable=False,
    )
    scope_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    role: Mapped["Role"] = relationship("Role", lazy="selectin")


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        # Note: this CHECK constraint is preserved from the original schema.
        # Alembic will drop + recreate it in the migration; keep it here for new installs.
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(100))
    changes: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
```

**Notes:**
- The `CheckConstraint("role IN ('admin','editor')")` is **removed** — role validation is now via FK to `roles` table.
- The `CheckConstraint("action IN ('CREATE','UPDATE','DELETE')")` on `audit_log` was originally declared via `__table_args__`. The migration will preserve it; the model here omits it from `__table_args__` to avoid duplicate-constraint errors on fresh installs. **The migration in Task 5 re-adds it via raw SQL.** If the existing audit_log CHECK constraint exists in DB, it stays — no need to drop.
- `role: Mapped["Role"] = relationship("Role", lazy="selectin")` — eager-loads role by default. `selectinload(Role.permissions)` is added explicitly in `deps.py` where the permission set is needed.
- Add `from app.models.role import Role` at top of file if your linter requires it for the forward reference (SQLAlchemy resolves string refs at mapper-configure time, so it's optional, but adds clarity).

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/user.py
git commit -m "feat(rbac): replace User.role string with role_id FK + scope_id"
```

---

## Task 3: Backend Constants — `modules.py` and `scope_resolvers.py`

**Files:**
- Create: `backend/app/core/modules.py`
- Create: `backend/app/core/scope_resolvers.py`

- [ ] **Step 1: Create `backend/app/core/modules.py`**

```python
"""Admin module registry — single source of truth for available admin modules.

When adding a new module:
1. Add an entry here (backend)
2. Mirror it in frontend/lib/adminModules.ts
3. Add the module to the seed role_permissions for the 'admin' role
4. (If scoped) Add a scope_type + resolver in scope_resolvers.py
"""

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

VALID_MODULE_IDS = {m["id"] for m in ADMIN_MODULES}

# Modules that the 'admin' role must always retain (lockout protection).
ADMIN_PROTECTED_MODULES = {"users", "menu_config", "roles"}

# Valid scope_type values (null means global role, no scoping).
VALID_SCOPE_TYPES = {None, "manufacturer", "equipment_manufacturer"}
```

- [ ] **Step 2: Create `backend/app/core/scope_resolvers.py`**

```python
"""Scope validation: when assigning a user to a scoped role, validate scope_id exists.

To add a new scope type:
1. Add the scope_type value to VALID_SCOPE_TYPES in modules.py
2. Add a resolver function here that checks the target table for scope_id
3. Register it in SCOPE_RESOLVERS
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.equipment import EquipmentManufacturer
from app.models.manufacturer import Manufacturer


async def validate_manufacturer_exists(db: AsyncSession, scope_id: str) -> bool:
    result = await db.execute(
        select(Manufacturer.id).where(Manufacturer.id == scope_id)
    )
    return result.scalar_one_or_none() is not None


async def validate_equipment_manufacturer_exists(db: AsyncSession, scope_id: str) -> bool:
    result = await db.execute(
        select(EquipmentManufacturer.id).where(EquipmentManufacturer.id == scope_id)
    )
    return result.scalar_one_or_none() is not None


# scope_type → async validator function (returns True if scope_id is valid)
SCOPE_RESOLVERS = {
    "manufacturer": validate_manufacturer_exists,
    "equipment_manufacturer": validate_equipment_manufacturer_exists,
}


async def validate_scope_id(db: AsyncSession, scope_type: str | None, scope_id: str | None) -> bool:
    """Validate that scope_id is appropriate for the given scope_type.

    - scope_type=None: scope_id must be None (global role)
    - scope_type=<known>: scope_id must be a non-empty string that exists in the target table
    - scope_type=<unknown>: returns False (defensive)
    """
    if scope_type is None:
        return scope_id is None
    if scope_id is None or scope_id == "":
        return False
    resolver = SCOPE_RESOLVERS.get(scope_type)
    if resolver is None:
        return False
    return await resolver(db, scope_id)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/modules.py backend/app/core/scope_resolvers.py
git commit -m "feat(rbac): add admin module registry and scope resolvers"
```

---

## Task 4: Backend Schemas — Role, RolePermission, User admin schemas

**Files:**
- Create: `backend/app/schemas/role.py`
- Create: `backend/app/schemas/user.py`

- [ ] **Step 1: Create `backend/app/schemas/role.py`**

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, model_validator

from app.core.modules import VALID_SCOPE_TYPES


class RolePermissionRead(BaseModel):
    module: str

    model_config = {"from_attributes": True}


class RoleRead(BaseModel):
    id: str
    name: str
    description: str | None = None
    scope_type: str | None = None
    is_system: bool
    sort_order: int
    permissions: list[str] = []  # list of module IDs
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    id: str
    name: str
    description: str | None = None
    scope_type: str | None = None
    sort_order: int = 0
    permissions: list[str] = []  # module IDs

    @model_validator(mode="after")
    def validate_scope_type(self):
        if self.scope_type not in VALID_SCOPE_TYPES:
            raise ValueError(f"Invalid scope_type: {self.scope_type}")
        return self


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    scope_type: str | None = None
    sort_order: int | None = None
    permissions: list[str] | None = None  # if provided, replaces all permissions

    @model_validator(mode="after")
    def validate_scope_type(self):
        if self.scope_type is not None and self.scope_type not in VALID_SCOPE_TYPES:
            raise ValueError(f"Invalid scope_type: {self.scope_type}")
        return self
```

- [ ] **Step 2: Create `backend/app/schemas/user.py`**

```python
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserRead(BaseModel):
    id: int
    email: EmailStr
    role_id: str
    scope_id: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    # Joined fields (optional, populated by CRUD layer)
    role_name: str | None = None
    role_scope_type: str | None = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role_id: str
    scope_id: str | None = None
    is_active: bool = True


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role_id: str | None = None
    scope_id: str | None = None
    is_active: bool | None = None


class UserPermissions(BaseModel):
    """Returned by GET /api/admin/me/permissions — drives sidebar filtering."""
    user_id: int
    email: str
    role_id: str
    role_name: str
    scope_type: str | None
    scope_id: str | None
    allowed_modules: list[str]
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/role.py backend/app/schemas/user.py
git commit -m "feat(rbac): add Pydantic schemas for roles and user management"
```

---

## Task 5: Backend Migration — Create tables, seed roles, migrate users

**Files:**
- Create: `backend/alembic/versions/b3c4d5e6f7a8_add_rbac_tables.py`

- [ ] **Step 1: Create the migration file**

```python
"""add rbac tables (roles, role_permissions) and migrate users.role to role_id

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f7
Create Date: 2026-07-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision: str = 'b3c4d5e6f7a8'
down_revision: str | None = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create roles table
    op.execute("""
        CREATE TABLE IF NOT EXISTS roles (
            id          VARCHAR(100) PRIMARY KEY,
            name        VARCHAR(100) NOT NULL,
            description TEXT,
            scope_type  VARCHAR(50),
            is_system   BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """)

    # 2. Create role_permissions table
    op.execute("""
        CREATE TABLE IF NOT EXISTS role_permissions (
            role_id VARCHAR(100) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            module  VARCHAR(100) NOT NULL,
            PRIMARY KEY (role_id, module)
        )
    """)

    # 3. Seed 4 preset roles (idempotent)
    op.execute("""
        INSERT INTO roles (id, name, description, scope_type, is_system, sort_order) VALUES
            ('admin',             'Admin',             'Full access to all modules',                             NULL,                     TRUE, 0),
            ('content_editor',    'Content Editor',    'Manage cables, brands, manufacturers, equipment, media', NULL,                     TRUE, 1),
            ('equipment_manager', 'Equipment Manager', 'Manage own equipment manufacturer data',                 'equipment_manufacturer', TRUE, 2),
            ('cable_manager',     'Cable Manager',     'Manage own manufacturer cables/brands',                  'manufacturer',          TRUE, 3)
        ON CONFLICT (id) DO NOTHING
    """)

    # 4. Seed default permissions (idempotent)
    op.execute("""
        INSERT INTO role_permissions (role_id, module) VALUES
            ('admin', 'dashboard'), ('admin', 'cables'), ('admin', 'brands'), ('admin', 'manufacturers'),
            ('admin', 'industries'), ('admin', 'equipment_mfrs'), ('admin', 'equipment_cats'),
            ('admin', 'equipment_list'), ('admin', 'media'), ('admin', 'menu_config'),
            ('admin', 'users'), ('admin', 'roles')
        ON CONFLICT (role_id, module) DO NOTHING
    """)
    op.execute("""
        INSERT INTO role_permissions (role_id, module) VALUES
            ('content_editor', 'dashboard'), ('content_editor', 'cables'), ('content_editor', 'brands'),
            ('content_editor', 'manufacturers'), ('content_editor', 'equipment_mfrs'),
            ('content_editor', 'equipment_list'), ('content_editor', 'media')
        ON CONFLICT (role_id, module) DO NOTHING
    """)
    op.execute("""
        INSERT INTO role_permissions (role_id, module) VALUES
            ('equipment_manager', 'dashboard'), ('equipment_manager', 'equipment_mfrs'),
            ('equipment_manager', 'equipment_list'), ('equipment_manager', 'media')
        ON CONFLICT (role_id, module) DO NOTHING
    """)
    op.execute("""
        INSERT INTO role_permissions (role_id, module) VALUES
            ('cable_manager', 'dashboard'), ('cable_manager', 'cables'), ('cable_manager', 'brands'),
            ('cable_manager', 'manufacturers'), ('cable_manager', 'media')
        ON CONFLICT (role_id, module) DO NOTHING
    """)

    # 5. Add role_id and scope_id columns to users (nullable initially for migration)
    op.add_column('users', sa.Column('role_id', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('scope_id', sa.String(100), nullable=True))

    # 6. Migrate existing users: role='admin' -> role_id='admin', role='editor' -> role_id='content_editor'
    op.execute("UPDATE users SET role_id = 'admin' WHERE role = 'admin'")
    op.execute("UPDATE users SET role_id = 'content_editor' WHERE role = 'editor'")

    # 7. Set role_id NOT NULL and add FK
    op.alter_column('users', 'role_id', nullable=False)
    op.create_foreign_key(
        'fk_users_role_id', 'users', 'roles', ['role_id'], ['id'], ondelete='RESTRICT'
    )

    # 8. Drop old role column and its CHECK constraint
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role")
    op.drop_column('users', 'role')

    # 9. Add 'roles' menu item under 'settings' group (idempotent)
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible)
        VALUES ('menu-roles', 'settings', 'page', 'roles', NULL, 'Roles', 'Shield', 1, TRUE)
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    # Remove roles menu item
    op.execute("DELETE FROM admin_menu_items WHERE id = 'menu-roles'")

    # Restore role column
    op.add_column('users', sa.Column('role', sa.String(20), nullable=False, server_default='admin'))
    op.execute("UPDATE users SET role = 'admin' WHERE role_id = 'admin'")
    op.execute("UPDATE users SET role = 'editor' WHERE role_id != 'admin'")
    op.execute("ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IN ('admin','editor'))")

    # Drop FK and columns
    op.drop_constraint('fk_users_role_id', 'users', type_='foreignkey')
    op.drop_column('users', 'scope_id')
    op.drop_column('users', 'role_id')

    # Drop role_permissions and roles tables
    op.execute("DROP TABLE IF EXISTS role_permissions")
    op.execute("DROP TABLE IF EXISTS roles")
```

- [ ] **Step 2: Run the migration locally**

```bash
docker compose exec backend alembic upgrade head
```

Expected: `INFO  [alembic.runtime.migration] Running upgrade a1b2c3d4e5f7 -> b3c4d5e6f7a8, add rbac tables...`

- [ ] **Step 3: Verify the migration**

```bash
docker compose exec backend python -c "
import asyncio
from sqlalchemy import select
from app.core.database import async_session
from app.models.role import Role, RolePermission
async def main():
    async with async_session() as db:
        roles = (await db.execute(select(Role).order_by(Role.sort_order))).scalars().all()
        for r in roles:
            perms = (await db.execute(select(RolePermission.module).where(RolePermission.role_id == r.id))).scalars().all()
            print(f'{r.id}: scope={r.scope_type}, is_system={r.is_system}, perms={perms}')
asyncio.run(main())
"
```

Expected output: 4 roles with their permissions (admin has 12 modules including 'roles').

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/b3c4d5e6f7a8_add_rbac_tables.py
git commit -m "feat(rbac): add migration for roles/role_permissions tables and user schema change"
```

---

## Task 6: Backend Dependencies — Update `deps.py` with `require_module` factory

**Files:**
- Modify: `backend/app/api/deps.py`

- [ ] **Step 1: Replace `deps.py` with the new RBAC-aware version**

```python
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.role import Role, RolePermission
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if token is None:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Not authenticated"})
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Not authenticated"})
    # Eager-load role + role.permissions to avoid async MissingGreenlet errors.
    stmt = (
        select(User)
        .where(User.id == int(payload["sub"]))
        .options(selectinload(User.role).selectinload(Role.permissions))
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Not authenticated"})
    # Populate a convenience set of allowed module IDs for O(1) lookup.
    user.role_permissions = {rp.module for rp in user.role.permissions}
    return user


async def get_current_admin_user(user: User = Depends(get_current_user)) -> User:
    """Any authenticated admin user (any role). Use for endpoints that just need auth
    without a specific module check (e.g., /me/permissions, /auth/logout)."""
    return user


def require_module(module: str):
    """Factory: returns a FastAPI dependency that checks the user's role has access
    to the given module. Replaces the old `get_current_admin` dependency.

    Usage:
        @router.post("/cables")
        async def create_cable(user: User = Depends(require_module("cables")), ...):
            ...
    """

    async def checker(user: User = Depends(get_current_user)) -> User:
        allowed = getattr(user, "role_permissions", None) or set()
        if module not in allowed:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": f"No access to module: {module}"},
            )
        return user

    return checker
```

**Notes:**
- `get_current_admin` is removed. All 15 route files that imported it must be updated in Task 10.
- `user.role_permissions` is a dynamically-set attribute (set in `get_current_user`). It is NOT a SQLAlchemy column — it's a Python set populated from the eager-loaded `role.permissions` relationship.
- The returned value is now a `User` object (not a `dict` like the old `get_current_admin`). Call sites that used `_: dict = Depends(...)` need to change to `_: User = Depends(...)` or just `user: User = Depends(...)`.

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/deps.py
git commit -m "feat(rbac): replace get_current_admin with require_module factory"
```

---

## Task 7: Backend CRUD — `CRUDRole` with permission management

**Files:**
- Create: `backend/app/crud/role.py`

- [ ] **Step 1: Create `backend/app/crud/role.py`**

```python
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.modules import ADMIN_PROTECTED_MODULES, VALID_MODULE_IDS
from app.crud.base import CRUDBase
from app.models.role import Role, RolePermission
from app.schemas.role import RoleCreate, RoleUpdate


class CRUDRole(CRUDBase[Role, RoleCreate, RoleUpdate]):
    async def get_with_permissions(self, db: AsyncSession, id: str) -> Role | None:
        stmt = (
            select(Role)
            .where(Role.id == id)
            .options(selectinload(Role.permissions))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_with_permissions(self, db: AsyncSession) -> list[Role]:
        stmt = (
            select(Role)
            .order_by(Role.sort_order, Role.id)
            .options(selectinload(Role.permissions))
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def validate_permissions(self, modules: list[str]) -> None:
        """Validate all module IDs are in the allowed set. Raises HTTPException(422)."""
        for m in modules:
            if m not in VALID_MODULE_IDS:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": f"Unknown module: {m}"},
                )

    async def create_with_permissions(
        self, db: AsyncSession, *, obj_in: RoleCreate
    ) -> Role:
        await self.validate_permissions(obj_in.permissions)
        # Check ID uniqueness
        existing = await db.get(Role, obj_in.id)
        if existing:
            raise HTTPException(
                status_code=409,
                detail={"code": 409, "message": f"Role with id '{obj_in.id}' already exists"},
            )
        role = Role(
            id=obj_in.id,
            name=obj_in.name,
            description=obj_in.description,
            scope_type=obj_in.scope_type,
            is_system=False,  # Custom roles are never system roles
            sort_order=obj_in.sort_order,
        )
        db.add(role)
        await db.flush()
        for module in obj_in.permissions:
            db.add(RolePermission(role_id=role.id, module=module))
        await db.commit()
        await db.refresh(role)
        return role

    async def update_with_permissions(
        self, db: AsyncSession, *, db_obj: Role, obj_in: RoleUpdate
    ) -> Role:
        update_data = obj_in.model_dump(exclude_unset=True)
        new_permissions = update_data.pop("permissions", None)

        # Lockout protection: admin role must always keep ADMIN_PROTECTED_MODULES
        if db_obj.id == "admin" and new_permissions is not None:
            missing = ADMIN_PROTECTED_MODULES - set(new_permissions)
            if missing:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": 422,
                        "message": f"Cannot remove protected modules from admin role: {sorted(missing)}",
                    },
                )

        # Apply scalar field updates
        for field, value in update_data.items():
            setattr(db_obj, field, value)

        # Replace permissions if provided
        if new_permissions is not None:
            await self.validate_permissions(new_permissions)
            # Delete existing permissions
            existing_perms = await db.execute(
                select(RolePermission).where(RolePermission.role_id == db_obj.id)
            )
            for rp in existing_perms.scalars().all():
                await db.delete(rp)
            await db.flush()
            # Insert new permissions
            for module in new_permissions:
                db.add(RolePermission(role_id=db_obj.id, module=module))

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def remove(self, db: AsyncSession, *, id: str) -> Role | None:
        """Delete a role. System roles (is_system=true) cannot be deleted."""
        role = await db.get(Role, id)
        if role is None:
            return None
        if role.is_system:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete a system role"},
            )
        # Check no users are assigned to this role
        from app.models.user import User
        users_with_role = await db.execute(
            select(User.id).where(User.role_id == id).limit(1)
        )
        if users_with_role.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=409,
                detail={"code": 409, "message": "Cannot delete role: users are still assigned to it"},
            )
        await db.delete(role)
        await db.commit()
        return role


crud_role = CRUDRole(Role)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/crud/role.py
git commit -m "feat(rbac): add CRUDRole with permission management"
```

---

## Task 8: Backend CRUD — `CRUDUser` with scope validation

**Files:**
- Create: `backend/app/crud/user.py`

- [ ] **Step 1: Create `backend/app/crud/user.py`**

```python
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.scope_resolvers import validate_scope_id
from app.core.security import get_password_hash
from app.crud.base import CRUDBase
from app.models.role import Role
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


class CRUDUser(CRUDBase[User, UserCreate, UserUpdate]):
    async def get_with_role(self, db: AsyncSession, id: int) -> User | None:
        stmt = (
            select(User)
            .where(User.id == id)
            .options(selectinload(User.role))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_with_roles(self, db: AsyncSession) -> list[User]:
        stmt = (
            select(User)
            .order_by(User.id)
            .options(selectinload(User.role))
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_email(self, db: AsyncSession, email: str) -> User | None:
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def create(self, db: AsyncSession, *, obj_in: UserCreate) -> User:
        # Validate role exists
        role = await db.get(Role, obj_in.role_id)
        if role is None:
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": f"Role not found: {obj_in.role_id}"},
            )
        # Validate email uniqueness
        existing = await self.get_by_email(db, obj_in.email)
        if existing:
            raise HTTPException(
                status_code=409,
                detail={"code": 409, "message": "Email already registered"},
            )
        # Validate scope_id matches role.scope_type
        if not await validate_scope_id(db, role.scope_type, obj_in.scope_id):
            if role.scope_type is None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "This role does not allow a scope_id"},
                )
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": f"Invalid scope_id for scope_type '{role.scope_type}'"},
            )
        user = User(
            email=obj_in.email,
            password_hash=get_password_hash(obj_in.password),
            role_id=obj_in.role_id,
            scope_id=obj_in.scope_id,
            is_active=obj_in.is_active,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    async def update(self, db: AsyncSession, *, db_obj: User, obj_in: UserUpdate) -> User:
        update_data = obj_in.model_dump(exclude_unset=True)

        # If role_id is changing, validate the new role
        new_role_id = update_data.get("role_id")
        if new_role_id is not None and new_role_id != db_obj.role_id:
            new_role = await db.get(Role, new_role_id)
            if new_role is None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": f"Role not found: {new_role_id}"},
                )
            effective_scope_type = new_role.scope_type
        else:
            # Load the current role to get its scope_type
            if db_obj.role is None:
                await db.refresh(db_obj, attribute_names=["role"])
            effective_scope_type = db_obj.role.scope_type if db_obj.role else None

        # If scope_id is being updated (or role changed), validate scope
        new_scope_id = update_data.get("scope_id", db_obj.scope_id)
        if "scope_id" in update_data or "role_id" in update_data:
            if not await validate_scope_id(db, effective_scope_type, new_scope_id):
                if effective_scope_type is None:
                    raise HTTPException(
                        status_code=422,
                        detail={"code": 422, "message": "This role does not allow a scope_id"},
                    )
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": f"Invalid scope_id for scope_type '{effective_scope_type}'"},
                )

        # If email is changing, validate uniqueness
        new_email = update_data.get("email")
        if new_email is not None and new_email != db_obj.email:
            existing = await self.get_by_email(db, new_email)
            if existing and existing.id != db_obj.id:
                raise HTTPException(
                    status_code=409,
                    detail={"code": 409, "message": "Email already registered"},
                )

        # Hash password if provided
        if update_data.get("password"):
            update_data["password_hash"] = get_password_hash(update_data.pop("password"))
        else:
            update_data.pop("password", None)

        for field, value in update_data.items():
            setattr(db_obj, field, value)

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj


crud_user = CRUDUser(User)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/crud/user.py
git commit -m "feat(rbac): add CRUDUser with scope validation"
```

---

## Task 9: Backend Routes — Role management endpoints

**Files:**
- Create: `backend/app/api/routes/admin_roles.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create `backend/app/api/routes/admin_roles.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_module
from app.core.database import get_db
from app.core.modules import ADMIN_MODULES
from app.crud.role import crud_role
from app.models.user import User
from app.schemas.role import RoleCreate, RoleRead, RoleUpdate

router = APIRouter()


def _role_to_read(role) -> RoleRead:
    """Convert a Role ORM object to RoleRead, including permissions as a list of module IDs."""
    return RoleRead(
        id=role.id,
        name=role.name,
        description=role.description,
        scope_type=role.scope_type,
        is_system=role.is_system,
        sort_order=role.sort_order,
        permissions=[rp.module for rp in role.permissions],
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


@router.get("", response_model=list[RoleRead])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("roles")),
):
    roles = await crud_role.get_all_with_permissions(db)
    return [_role_to_read(r) for r in roles]


@router.get("/modules")
async def list_modules(
    user: User = Depends(require_module("roles")),
):
    """List all available admin modules (for the permission editor checkbox matrix)."""
    return ADMIN_MODULES


@router.get("/{role_id}", response_model=RoleRead)
async def get_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("roles")),
):
    role = await crud_role.get_with_permissions(db, role_id)
    if role is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Role not found"})
    return _role_to_read(role)


@router.post("", response_model=RoleRead, status_code=201)
async def create_role(
    obj_in: RoleCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("roles")),
):
    role = await crud_role.create_with_permissions(db, obj_in=obj_in)
    # Re-load with permissions
    role = await crud_role.get_with_permissions(db, role.id)
    return _role_to_read(role)


@router.put("/{role_id}", response_model=RoleRead)
async def update_role(
    role_id: str,
    obj_in: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("roles")),
):
    db_obj = await crud_role.get_with_permissions(db, role_id)
    if db_obj is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Role not found"})
    role = await crud_role.update_with_permissions(db, db_obj=db_obj, obj_in=obj_in)
    role = await crud_role.get_with_permissions(db, role.id)
    return _role_to_read(role)


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("roles")),
):
    if role_id == user.role_id:
        raise HTTPException(
            status_code=400,
            detail={"code": 400, "message": "Cannot delete your own role"},
        )
    result = await crud_role.remove(db, id=role_id)
    if result is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Role not found"})
```

- [ ] **Step 2: Register router in `backend/app/main.py`**

In the imports section (around line 12), add:

```python
from app.api.routes import admin_roles
```

After the existing `admin_menu` router include (around line 99), add:

```python
app.include_router(admin_roles.router, prefix=f"{settings.api_prefix}/admin/roles", tags=["admin-roles"])
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/admin_roles.py backend/app/main.py
git commit -m "feat(rbac): add role management endpoints"
```

---

## Task 10: Backend Routes — User management + me/permissions + scope endpoints

**Files:**
- Create: `backend/app/api/routes/admin_users.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/routes/auth.py`

- [ ] **Step 1: Create `backend/app/api/routes/admin_users.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_module
from app.core.database import get_db
from app.core.scope_resolvers import SCOPE_RESOLVERS
from app.crud.user import crud_user
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate

router = APIRouter()


def _user_to_read(user) -> UserRead:
    return UserRead(
        id=user.id,
        email=user.email,
        role_id=user.role_id,
        scope_id=user.scope_id,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        role_name=user.role.name if user.role else None,
        role_scope_type=user.role.scope_type if user.role else None,
    )


@router.get("", response_model=list[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("users")),
):
    users = await crud_user.get_all_with_roles(db)
    return [_user_to_read(u) for u in users]


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users")),
):
    user = await crud_user.get_with_role(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "User not found"})
    return _user_to_read(user)


@router.post("", response_model=UserRead, status_code=201)
async def create_user(
    obj_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users")),
):
    user = await crud_user.create(db, obj_in=obj_in)
    user = await crud_user.get_with_role(db, user.id)
    return _user_to_read(user)


@router.put("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    obj_in: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users")),
):
    db_obj = await crud_user.get_with_role(db, user_id)
    if db_obj is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "User not found"})
    user = await crud_user.update(db, db_obj=db_obj, obj_in=obj_in)
    user = await crud_user.get_with_role(db, user.id)
    return _user_to_read(user)


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users")),
):
    if user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail={"code": 400, "message": "Cannot delete your own account"},
        )
    user = await crud_user.get(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "User not found"})
    await crud_user.remove(db, id=user_id)


@router.get("/scopes/{scope_type}")
async def list_scopes(
    scope_type: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users")),
):
    """List entities for a scope_type (e.g., all manufacturers).
    Used by frontend user editor to populate the scope_id dropdown."""
    resolver = SCOPE_RESOLVERS.get(scope_type)
    if resolver is None:
        raise HTTPException(
            status_code=422,
            detail={"code": 422, "message": f"Unknown scope_type: {scope_type}"},
        )
    # Direct query for the dropdown — return id + name pairs
    if scope_type == "manufacturer":
        from app.models.manufacturer import Manufacturer
        from sqlalchemy import select
        result = await db.execute(select(Manufacturer.id, Manufacturer.name).order_by(Manufacturer.name))
        return [{"id": r[0], "name": r[1]} for r in result.all()]
    elif scope_type == "equipment_manufacturer":
        from app.models.equipment import EquipmentManufacturer
        from sqlalchemy import select
        result = await db.execute(select(EquipmentManufacturer.id, EquipmentManufacturer.name).order_by(EquipmentManufacturer.name))
        return [{"id": r[0], "name": r[1]} for r in result.all()]
    return []
```

- [ ] **Step 2: Register router in `backend/app/main.py`**

In the imports section, add:

```python
from app.api.routes import admin_users
```

After the `admin_roles` router include, add:

```python
app.include_router(admin_users.router, prefix=f"{settings.api_prefix}/admin/users", tags=["admin-users"])
```

- [ ] **Step 3: Update `backend/app/api/routes/auth.py` `/me` endpoint**

Find the existing `/me` endpoint (around line 75). It currently uses `get_current_admin` and returns a dict. Update it to use `get_current_user` (already imported in deps) and include permissions:

```python
# At top of auth.py, change the import:
# OLD: from app.api.deps import get_current_admin
# NEW:
from app.api.deps import get_current_user

# Replace the /me endpoint:
@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "role_id": user.role_id,
        "role_name": user.role.name if user.role else None,
        "scope_type": user.role.scope_type if user.role else None,
        "scope_id": user.scope_id,
    }
```

Also add a new `/me/permissions` endpoint in `auth.py`:

```python
@router.get("/me/permissions")
async def my_permissions(user: User = Depends(get_current_user)):
    """Return the current user's role + allowed modules. Used by frontend sidebar."""
    return {
        "user_id": user.id,
        "email": user.email,
        "role_id": user.role_id,
        "role_name": user.role.name if user.role else None,
        "scope_type": user.role.scope_type if user.role else None,
        "scope_id": user.scope_id,
        "allowed_modules": sorted(getattr(user, "role_permissions", set())),
    }
```

Make sure `User` is imported at the top of `auth.py` (it likely already is, since `get_current_admin` was used).

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/routes/admin_users.py backend/app/main.py backend/app/api/routes/auth.py
git commit -m "feat(rbac): add user management endpoints and /me/permissions"
```

---

## Task 11: Backend Routes — Update 15 route files to use `require_module`

**Files:**
- Modify: `backend/app/api/routes/admin_menu.py`
- Modify: `backend/app/api/routes/auth.py` (already updated in Task 10, just verify)
- Modify: `backend/app/api/routes/brands.py`
- Modify: `backend/app/api/routes/cables.py`
- Modify: `backend/app/api/routes/cable_import.py`
- Modify: `backend/app/api/routes/cable_import_templates.py`
- Modify: `backend/app/api/routes/categories.py`
- Modify: `backend/app/api/routes/equipment.py`
- Modify: `backend/app/api/routes/equipment_categories.py`
- Modify: `backend/app/api/routes/equipment_manufacturers.py`
- Modify: `backend/app/api/routes/folders.py`
- Modify: `backend/app/api/routes/industries.py`
- Modify: `backend/app/api/routes/manufacturers.py`
- Modify: `backend/app/api/routes/product_types.py`
- Modify: `backend/app/api/routes/uploads.py`

- [ ] **Step 1: For each route file, apply the following transformation**

In every file that imports `get_current_admin`:

1. Change the import:
   ```python
   # OLD:
   from app.api.deps import get_current_admin
   # NEW:
   from app.api.deps import require_module
   ```

2. Change each endpoint signature that uses `_: dict = Depends(get_current_admin)`:
   - Determine the module for that endpoint (see mapping below)
   - Replace with `user: User = Depends(require_module("<module>"))`
   - If the endpoint's body referenced `_` (rare, only in `auth.py`), change to `user`

3. Add `from app.models.user import User` import if not already present.

**Module mapping per route file:**

| Route file | Module ID |
|-----------|-----------|
| `admin_menu.py` | `menu_config` |
| `brands.py` (mutation endpoints only) | `brands` |
| `cables.py` (mutation endpoints only) | `cables` |
| `cable_import.py` | `cables` |
| `cable_import_templates.py` | `cables` |
| `categories.py` (mutation endpoints only) | `industries` |
| `equipment.py` (mutation endpoints only) | `equipment_list` |
| `equipment_categories.py` (mutation endpoints only) | `equipment_cats` |
| `equipment_manufacturers.py` (mutation endpoints only) | `equipment_mfrs` |
| `folders.py` | `media` |
| `industries.py` (mutation endpoints only) | `industries` |
| `manufacturers.py` (mutation endpoints only) | `manufacturers` |
| `product_types.py` (mutation endpoints only) | `industries` |
| `uploads.py` | `media` |

**Important:** GET (list/detail) endpoints that serve the public website remain **public** (no auth dependency). Only POST/PUT/DELETE endpoints get `require_module(...)`. Look at each endpoint: if it currently has `_: dict = Depends(get_current_admin)`, replace it. If it doesn't have auth, leave it alone.

**Example transformation for `brands.py`:**

```python
# OLD:
from app.api.deps import get_current_admin
# ...
@router.post("", response_model=BrandRead, status_code=201)
async def create_brand(obj_in: BrandCreate, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    ...

# NEW:
from app.api.deps import require_module
from app.models.user import User
# ...
@router.post("", response_model=BrandRead, status_code=201)
async def create_brand(obj_in: BrandCreate, db: AsyncSession = Depends(get_db), user: User = Depends(require_module("brands"))):
    ...
```

- [ ] **Step 2: Verify the backend still starts**

```bash
docker compose restart backend
docker compose logs backend --tail 20
```

Expected: no import errors, backend starts cleanly.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/
git commit -m "feat(rbac): migrate 15 route files from get_current_admin to require_module"
```

---

## Task 12: Backend CRUD — Add scope filtering to cable/manufacturer/equipment CRUDs

**Files:**
- Modify: `backend/app/crud/cable.py`
- Modify: `backend/app/crud/manufacturer.py`
- Modify: `backend/app/crud/equipment.py`
- Modify: `backend/app/crud/equipment_manufacturers.py`

- [ ] **Step 1: Add scope filtering helper to `backend/app/crud/cable.py`**

In `CRUDCable.get_filtered`, add a `user` parameter and filter by manufacturer when the user has `scope_type == 'manufacturer'`:

Find the `get_filtered` method signature and add `user` param:

```python
async def get_filtered(
    self,
    db: AsyncSession,
    filters: CableFilterParams,
    user: User | None = None,  # NEW
) -> tuple[list[Cable], int, FilterFacets]:
```

At the start of the method, after building the initial `stmt`, add:

```python
    # Scope filtering: cable_manager can only see their own manufacturer's cables
    if user is not None and getattr(user, "role", None) is not None:
        if user.role.scope_type == "manufacturer":
            from app.models.brand import Brand
            stmt = stmt.join(Brand, Cable.brand_id == Brand.id).where(
                Brand.manufacturer_id == user.scope_id
            )
```

Add `from app.models.user import User` at the top of the file (for type hint).

- [ ] **Step 2: Update `cables.py` route to pass `user` to `get_filtered`**

In the GET list endpoint (the one that calls `crud_cable.get_filtered`), add the `user` dependency and pass it:

```python
@router.get("", response_model=CableListResponse)
async def list_cables(
    # ... existing query params ...
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),  # authenticated, any role
):
    # ...
    items, total, facets = await crud_cable.get_filtered(db, filters, user=user)
    # ...
```

**Note:** GET list now requires authentication (any logged-in admin) so we can apply scope. This is a behavior change — public website reads should use a separate public endpoint OR the existing public cable detail endpoint. **Check:** if the public website uses this same endpoint, split it: keep `GET /api/cables` public (no scope, returns all), and add `GET /api/admin/cables` (auth required, scope-filtered). For MVP, if the website already works without auth on GET, leave GET public and only apply scope on mutations (see Step 4).

**If splitting is needed**, add a new admin-scoped list endpoint:

```python
@router.get("/admin/list", response_model=CableListResponse)
async def list_cables_admin(
    # ... params ...
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("cables")),
):
    items, total, facets = await crud_cable.get_filtered(db, filters, user=user)
    # ...
```

**Decision for MVP:** Keep GET list public (no auth, no scope). Apply scope only on mutations (create/update/delete) by checking `user.role.scope_type` in the route handler. This avoids breaking the public website. Update Step 4 accordingly.

- [ ] **Step 3: Add scope filtering to manufacturer and equipment CRUDs**

In `backend/app/crud/manufacturer.py`, add a `get_all_filtered` method (or modify existing list method) that accepts a `user` param:

```python
async def get_all_with_scope(
    self,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    user: User | None = None,
) -> tuple[list[Manufacturer], int]:
    stmt = select(Manufacturer)
    if user is not None and getattr(user, "role", None) is not None:
        if user.role.scope_type == "manufacturer":
            stmt = stmt.where(Manufacturer.id == user.scope_id)
    # ... existing count + pagination logic ...
```

Apply the same pattern to `backend/app/crud/equipment.py` `CRUDEquipment.get_all_with_relations`:

```python
async def get_all_with_relations(
    self,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    category_id: str | None = None,
    manufacturer_id: str | None = None,
    user: User | None = None,  # NEW
) -> tuple[list[RecommendedEquipment], int]:
    stmt = select(RecommendedEquipment)
    if user is not None and getattr(user, "role", None) is not None:
        if user.role.scope_type == "equipment_manufacturer":
            stmt = stmt.where(RecommendedEquipment.manufacturer_id == user.scope_id)
    # ... existing filters ...
```

And `backend/app/crud/equipment_manufacturers.py`:

```python
async def get_all_with_scope(
    self,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    user: User | None = None,
) -> tuple[list[EquipmentManufacturer], int]:
    stmt = select(EquipmentManufacturer)
    if user is not None and getattr(user, "role", None) is not None:
        if user.role.scope_type == "equipment_manufacturer":
            stmt = stmt.where(EquipmentManufacturer.id == user.scope_id)
    # ... existing count + pagination ...
```

- [ ] **Step 4: Add scope checks to mutation endpoints**

In the route files for cables, manufacturers, equipment, and equipment_manufacturers, add ownership checks on POST/PUT/DELETE:

```python
# Example: cables.py create endpoint
@router.post("", response_model=CableRead, status_code=201)
async def create_cable(
    obj_in: CableCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("cables")),
):
    # Scope check: cable_manager can only create cables for their own manufacturer
    if user.role.scope_type == "manufacturer":
        # Verify the cable's brand belongs to the user's manufacturer
        from app.crud.brand import crud_brand
        brand = await crud_brand.get(db, obj_in.brand_id)
        if brand is None or brand.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot create cable for a brand outside your scope"},
            )
    # ... existing create logic ...

# Example: cables.py update endpoint
@router.put("/{cable_id}", response_model=CableRead)
async def update_cable(
    cable_id: str,
    obj_in: CableUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("cables")),
):
    cable = await crud_cable.get(db, cable_id)
    if cable is None:
        raise HTTPException(status_code=404, ...)
    # Scope check
    if user.role.scope_type == "manufacturer":
        from app.crud.brand import crud_brand
        brand = await crud_brand.get(db, cable.brand_id)
        if brand is None or brand.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot modify cable outside your scope"},
            )
    # ... existing update logic ...
```

Apply the same pattern to:
- `manufacturers.py` — check `obj_in.id == user.scope_id` for cable_manager
- `equipment.py` — check `obj_in.manufacturer_id == user.scope_id` for equipment_manager
- `equipment_manufacturers.py` — check `obj_in.id == user.scope_id` for equipment_manager

- [ ] **Step 5: Commit**

```bash
git add backend/app/crud/cable.py backend/app/crud/manufacturer.py backend/app/crud/equipment.py backend/app/crud/equipment_manufacturers.py backend/app/api/routes/cables.py backend/app/api/routes/manufacturers.py backend/app/api/routes/equipment.py backend/app/api/routes/equipment_manufacturers.py
git commit -m "feat(rbac): add scope filtering to cable/manufacturer/equipment CRUDs"
```

---

## Task 13: Backend — Update `ALLOWED_PAGE_IDS` and tests conftest

**Files:**
- Modify: `backend/app/crud/menu.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Add `roles` to `ALLOWED_PAGE_IDS` in `backend/app/crud/menu.py`**

Find the `ALLOWED_PAGE_IDS` set and add `"roles"`:

```python
ALLOWED_PAGE_IDS = {
    "dashboard", "cables", "brands", "manufacturers", "industries",
    "equipment-mfrs", "equipment-cats", "equipment-list",
    "media", "menu-config", "users", "roles",
}
```

- [ ] **Step 2: Promote fixtures to `backend/tests/conftest.py`**

Add shared `client` and `admin_headers` fixtures so all test files can use them:

```python
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.core.database as _db_module
from app.core.config import settings

_test_engine = create_async_engine(settings.database_url, poolclass=NullPool)
_db_module.engine = _test_engine
_db_module.async_session = async_sessionmaker(
    _test_engine, class_=AsyncSession, expire_on_commit=False
)

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_headers(client):
    """Login as admin and return auth headers."""
    res = client.post(
        "/api/auth/login",
        json={"email": "admin@unowire.com", "password": "admin123456"},
    )
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 3: Remove duplicated fixtures from `backend/tests/api/test_admin_menu.py`**

Open `test_admin_menu.py` and remove the local `client` and `admin_headers` fixtures (they're now in conftest). Keep only the test functions.

- [ ] **Step 4: Commit**

```bash
git add backend/app/crud/menu.py backend/tests/conftest.py backend/tests/api/test_admin_menu.py
git commit -m "feat(rbac): add roles to ALLOWED_PAGE_IDS, promote test fixtures to conftest"
```

---

## Task 14: Backend Tests — RBAC permission and scope tests

**Files:**
- Create: `backend/tests/api/test_admin_roles.py`
- Create: `backend/tests/api/test_admin_users.py`
- Create: `backend/tests/api/test_rbac_permissions.py`

- [ ] **Step 1: Create `backend/tests/api/test_admin_roles.py`**

```python
from fastapi.testclient import TestClient


def test_list_roles_requires_auth(client):
    res = client.get("/api/admin/roles")
    assert res.status_code == 401


def test_list_roles_as_admin(client, admin_headers):
    res = client.get("/api/admin/roles", headers=admin_headers)
    assert res.status_code == 200
    roles = res.json()
    ids = {r["id"] for r in roles}
    assert "admin" in ids
    assert "content_editor" in ids
    assert "equipment_manager" in ids
    assert "cable_manager" in ids


def test_get_single_role(client, admin_headers):
    res = client.get("/api/admin/roles/admin", headers=admin_headers)
    assert res.status_code == 200
    role = res.json()
    assert role["id"] == "admin"
    assert role["is_system"] is True
    assert "users" in role["permissions"]
    assert "roles" in role["permissions"]


def test_create_custom_role(client, admin_headers):
    res = client.post(
        "/api/admin/roles",
        headers=admin_headers,
        json={
            "id": "viewer",
            "name": "Viewer",
            "description": "Read-only access",
            "scope_type": None,
            "sort_order": 10,
            "permissions": ["dashboard", "cables"],
        },
    )
    assert res.status_code == 201
    role = res.json()
    assert role["id"] == "viewer"
    assert role["is_system"] is False
    assert set(role["permissions"]) == {"dashboard", "cables"}


def test_create_role_duplicate_id_conflict(client, admin_headers):
    res = client.post(
        "/api/admin/roles",
        headers=admin_headers,
        json={
            "id": "admin",
            "name": "Another Admin",
            "permissions": ["dashboard"],
        },
    )
    assert res.status_code == 409


def test_create_role_invalid_module(client, admin_headers):
    res = client.post(
        "/api/admin/roles",
        headers=admin_headers,
        json={
            "id": "bad",
            "name": "Bad",
            "permissions": ["nonexistent_module"],
        },
    )
    assert res.status_code == 422


def test_update_role_permissions(client, admin_headers):
    # Create a custom role first
    client.post(
        "/api/admin/roles",
        headers=admin_headers,
        json={
            "id": "editor_v2",
            "name": "Editor V2",
            "permissions": ["dashboard"],
        },
    )
    # Update it
    res = client.put(
        "/api/admin/roles/editor_v2",
        headers=admin_headers,
        json={"permissions": ["dashboard", "cables", "brands"]},
    )
    assert res.status_code == 200
    role = res.json()
    assert set(role["permissions"]) == {"dashboard", "cables", "brands"}


def test_cannot_remove_protected_modules_from_admin(client, admin_headers):
    res = client.put(
        "/api/admin/roles/admin",
        headers=admin_headers,
        json={"permissions": ["dashboard", "cables"]},  # missing users, menu_config, roles
    )
    assert res.status_code == 422


def test_cannot_delete_system_role(client, admin_headers):
    res = client.delete("/api/admin/roles/admin", headers=admin_headers)
    assert res.status_code == 403


def test_delete_custom_role(client, admin_headers):
    # Create then delete
    client.post(
        "/api/admin/roles",
        headers=admin_headers,
        json={"id": "temp", "name": "Temp", "permissions": ["dashboard"]},
    )
    res = client.delete("/api/admin/roles/temp", headers=admin_headers)
    assert res.status_code == 204


def test_list_modules(client, admin_headers):
    res = client.get("/api/admin/roles/modules", headers=admin_headers)
    assert res.status_code == 200
    modules = res.json()
    ids = {m["id"] for m in modules}
    assert "cables" in ids
    assert "roles" in ids
```

- [ ] **Step 2: Create `backend/tests/api/test_admin_users.py`**

```python
from fastapi.testclient import TestClient


def test_list_users_requires_auth(client):
    res = client.get("/api/admin/users")
    assert res.status_code == 401


def test_list_users_as_admin(client, admin_headers):
    res = client.get("/api/admin/users", headers=admin_headers)
    assert res.status_code == 200
    users = res.json()
    assert len(users) >= 1
    admin_user = next(u for u in users if u["email"] == "admin@unowire.com")
    assert admin_user["role_id"] == "admin"
    assert admin_user["role_name"] == "Admin"


def test_create_user(client, admin_headers):
    res = client.post(
        "/api/admin/users",
        headers=admin_headers,
        json={
            "email": "neweditor@unowire.com",
            "password": "password123",
            "role_id": "content_editor",
            "scope_id": None,
        },
    )
    assert res.status_code == 201
    user = res.json()
    assert user["email"] == "neweditor@unowire.com"
    assert user["role_id"] == "content_editor"


def test_create_user_duplicate_email(client, admin_headers):
    res = client.post(
        "/api/admin/users",
        headers=admin_headers,
        json={
            "email": "admin@unowire.com",
            "password": "password123",
            "role_id": "admin",
        },
    )
    assert res.status_code == 409


def test_create_user_invalid_role(client, admin_headers):
    res = client.post(
        "/api/admin/users",
        headers=admin_headers,
        json={
            "email": "bad@unowire.com",
            "password": "password123",
            "role_id": "nonexistent_role",
        },
    )
    assert res.status_code == 422


def test_create_scoped_user_without_scope_id_fails(client, admin_headers):
    res = client.post(
        "/api/admin/users",
        headers=admin_headers,
        json={
            "email": "cablemgr@unowire.com",
            "password": "password123",
            "role_id": "cable_manager",
            "scope_id": None,  # missing scope_id
        },
    )
    assert res.status_code == 422


def test_cannot_delete_self(client, admin_headers):
    # Get current user id from /me
    me = client.get("/api/auth/me", headers=admin_headers)
    my_id = me.json()["id"]
    res = client.delete(f"/api/admin/users/{my_id}", headers=admin_headers)
    assert res.status_code == 400


def test_list_scopes(client, admin_headers):
    res = client.get("/api/admin/users/scopes/manufacturer", headers=admin_headers)
    assert res.status_code == 200
    scopes = res.json()
    assert isinstance(scopes, list)


def test_list_scopes_invalid_type(client, admin_headers):
    res = client.get("/api/admin/users/scopes/nonexistent", headers=admin_headers)
    assert res.status_code == 422
```

- [ ] **Step 3: Create `backend/tests/api/test_rbac_permissions.py`**

```python
from fastapi.testclient import TestClient


def test_me_permissions(client, admin_headers):
    res = client.get("/api/auth/me/permissions", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["role_id"] == "admin"
    assert "users" in data["allowed_modules"]
    assert "roles" in data["allowed_modules"]


def test_unauthorized_user_cannot_access_cables(client):
    """No token → 401 on mutation endpoints."""
    res = client.post("/api/cables", json={})
    assert res.status_code == 401


def test_admin_can_create_brand(client, admin_headers):
    """Admin with 'brands' permission can create a brand."""
    # First need a manufacturer — check if any exists
    mfrs = client.get("/api/manufacturers", headers=admin_headers)
    if mfrs.status_code == 200 and mfrs.json().get("items"):
        mfr_id = mfrs.json()["items"][0]["id"]
    else:
        # Create a manufacturer first
        mfr_res = client.post(
            "/api/manufacturers",
            headers=admin_headers,
            json={"id": "test-mfr", "name": "Test Mfr", "slug": "test-mfr", "country": "US", "website": ""},
        )
        mfr_id = "test-mfr"
    res = client.post(
        "/api/brands",
        headers=admin_headers,
        json={"id": "test-brand-rbac", "name": "Test Brand", "slug": "test-brand-rbac", "manufacturer_id": mfr_id, "country": "US", "website": ""},
    )
    assert res.status_code == 201
```

- [ ] **Step 4: Run all RBAC tests**

```bash
docker compose exec backend pytest tests/api/test_admin_roles.py tests/api/test_admin_users.py tests/api/test_rbac_permissions.py -v
```

Expected: all tests pass. If `admin_headers` fixture fails (login returns non-200), verify the seeded admin user still exists and the migration ran successfully.

- [ ] **Step 5: Run the full test suite to catch regressions**

```bash
docker compose exec backend pytest tests/ -v --tb=short
```

Expected: no new failures beyond pre-existing ones. If `test_admin_menu.py` fails due to missing `client`/`admin_headers` fixtures, ensure Task 13 Step 3 was completed (deduped fixtures).

- [ ] **Step 6: Commit**

```bash
git add backend/tests/api/test_admin_roles.py backend/tests/api/test_admin_users.py backend/tests/api/test_rbac_permissions.py
git commit -m "test(rbac): add role/user/permission tests"
```

---

## Task 15: Frontend — Types, module registry, and API namespaces

**Files:**
- Create: `frontend/lib/adminModules.ts`
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/adminApi.ts`
- Modify: `frontend/lib/adminMenuRegistry.ts`

- [ ] **Step 1: Create `frontend/lib/adminModules.ts`**

```typescript
// Mirrors backend/app/core/modules.py ADMIN_MODULES.
// Keep in sync when adding new modules.

export interface AdminModule {
  id: string;
  label: string;
  scopeAware: boolean;
  scopeType: string | null;
}

export const ADMIN_MODULES: AdminModule[] = [
  { id: "dashboard",       label: "Dashboard",       scopeAware: false, scopeType: null },
  { id: "cables",          label: "Cables",          scopeAware: true,  scopeType: "manufacturer" },
  { id: "brands",          label: "Brands",          scopeAware: true,  scopeType: "manufacturer" },
  { id: "manufacturers",   label: "Manufacturers",   scopeAware: true,  scopeType: "manufacturer" },
  { id: "industries",      label: "Industries",      scopeAware: false, scopeType: null },
  { id: "equipment_mfrs",  label: "Equipment Mfrs",  scopeAware: true,  scopeType: "equipment_manufacturer" },
  { id: "equipment_cats",  label: "Equipment Cats",  scopeAware: false, scopeType: null },
  { id: "equipment_list",  label: "Equipment List",  scopeAware: true,  scopeType: "equipment_manufacturer" },
  { id: "media",           label: "Media",           scopeAware: false, scopeType: null },
  { id: "menu_config",     label: "Menu Config",     scopeAware: false, scopeType: null },
  { id: "users",           label: "Users",           scopeAware: false, scopeType: null },
  { id: "roles",           label: "Roles",           scopeAware: false, scopeType: null },
];

export const MODULE_BY_ID: Record<string, AdminModule> = Object.fromEntries(
  ADMIN_MODULES.map((m) => [m.id, m])
);

export const SCOPE_TYPE_LABELS: Record<string, string> = {
  manufacturer: "Cable Manufacturer",
  equipment_manufacturer: "Equipment Manufacturer",
};
```

- [ ] **Step 2: Add types to `frontend/lib/types.ts`**

Append to the end of the file:

```typescript
// === RBAC ===
export interface Role {
  id: string;
  name: string;
  description: string | null;
  scope_type: string | null;
  is_system: boolean;
  sort_order: number;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface AdminUserExtended {
  id: number;
  email: string;
  role_id: string;
  scope_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role_name: string | null;
  role_scope_type: string | null;
}

export interface UserPermissions {
  user_id: number;
  email: string;
  role_id: string;
  role_name: string;
  scope_type: string | null;
  scope_id: string | null;
  allowed_modules: string[];
}

export interface ScopeOption {
  id: string;
  name: string;
}
```

- [ ] **Step 3: Add `roles` and `users` namespaces to `frontend/lib/adminApi.ts`**

Find the `adminMenu` namespace (near the end of the `adminApi` object) and add these two new namespaces after it:

```typescript
  roles: {
    async all(): Promise<Role[]> {
      return adminGet<Role[]>("/api/admin/roles");
    },
    async getById(id: string): Promise<Role | null> {
      try {
        return await adminGet<Role>(`/api/admin/roles/${id}`);
      } catch {
        return null;
      }
    },
    async modules(): Promise<AdminModule[]> {
      return adminGet<AdminModule[]>("/api/admin/roles/modules");
    },
    async create(payload: {
      id: string;
      name: string;
      description?: string;
      scope_type?: string | null;
      sort_order?: number;
      permissions: string[];
    }): Promise<Role> {
      const res = await adminFetch("/api/admin/roles", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async update(id: string, payload: {
      name?: string;
      description?: string;
      scope_type?: string | null;
      sort_order?: number;
      permissions?: string[];
    }): Promise<Role> {
      const res = await adminFetch(`/api/admin/roles/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/admin/roles/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
    },
  },

  users: {
    async all(): Promise<AdminUserExtended[]> {
      return adminGet<AdminUserExtended[]>("/api/admin/users");
    },
    async getById(id: number): Promise<AdminUserExtended | null> {
      try {
        return await adminGet<AdminUserExtended>(`/api/admin/users/${id}`);
      } catch {
        return null;
      }
    },
    async create(payload: {
      email: string;
      password: string;
      role_id: string;
      scope_id?: string | null;
      is_active?: boolean;
    }): Promise<AdminUserExtended> {
      const res = await adminFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async update(id: number, payload: {
      email?: string;
      password?: string;
      role_id?: string;
      scope_id?: string | null;
      is_active?: boolean;
    }): Promise<AdminUserExtended> {
      const res = await adminFetch(`/api/admin/users/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async remove(id: number): Promise<void> {
      const res = await adminFetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
    },
    async scopes(scopeType: string): Promise<ScopeOption[]> {
      return adminGet<ScopeOption[]>(`/api/admin/users/scopes/${scopeType}`);
    },
  },

  me: {
    async permissions(): Promise<UserPermissions> {
      return adminGet<UserPermissions>("/api/auth/me/permissions");
    },
  },
```

Add the necessary type imports at the top of `adminApi.ts` (alongside existing imports from `./types`):

```typescript
import type { Role, AdminUserExtended, UserPermissions, ScopeOption } from "./types";
import type { AdminModule } from "./adminModules";
```

- [ ] **Step 4: Add `users` and `roles` page entries to `frontend/lib/adminMenuRegistry.ts`**

Update the `ADMIN_PAGES` array to include the new pages:

```typescript
export const ADMIN_PAGES: PageRegistryEntry[] = [
  { pageId: "dashboard",      href: "/admin",                              defaultLabel: "Dashboard",       defaultIcon: "LayoutDashboard" },
  { pageId: "cables",         href: "/admin/cables",                       defaultLabel: "Cables",           defaultIcon: "Cable" },
  { pageId: "brands",         href: "/admin/brands",                       defaultLabel: "Brands",           defaultIcon: "Tag" },
  { pageId: "manufacturers",  href: "/admin/manufacturers",                defaultLabel: "Manufacturers",    defaultIcon: "Factory" },
  { pageId: "industries",     href: "/admin/industries",                   defaultLabel: "Industries",       defaultIcon: "FolderOpen" },
  { pageId: "equipment-mfrs", href: "/admin/equipment/manufacturers",      defaultLabel: "Equipment Mfrs",   defaultIcon: "Wrench" },
  { pageId: "equipment-cats", href: "/admin/equipment/categories",         defaultLabel: "Equipment Cats",   defaultIcon: "Wrench" },
  { pageId: "equipment-list", href: "/admin/equipment",                    defaultLabel: "Equipment",        defaultIcon: "Wrench" },
  { pageId: "media",          href: "/admin/media",                        defaultLabel: "Media",            defaultIcon: "Image" },
  { pageId: "menu-config",    href: "/admin/menu",                         defaultLabel: "Menu Config",      defaultIcon: "Settings" },
  { pageId: "users",          href: "/admin/users",                        defaultLabel: "Users",            defaultIcon: "Users" },
  { pageId: "roles",          href: "/admin/roles",                        defaultLabel: "Roles",            defaultIcon: "Shield" },
];
```

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/adminModules.ts frontend/lib/types.ts frontend/lib/adminApi.ts frontend/lib/adminMenuRegistry.ts
git commit -m "feat(rbac): add frontend types, module registry, and API namespaces"
```

---

## Task 16: Frontend — Proxy routes for roles and users

**Files:**
- Create: `frontend/app/api/admin/roles/route.ts`
- Create: `frontend/app/api/admin/roles/[id]/route.ts`
- Create: `frontend/app/api/admin/users/route.ts`
- Create: `frontend/app/api/admin/users/[id]/route.ts`

- [ ] **Step 1: Create `frontend/app/api/admin/roles/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/admin/roles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Create `frontend/app/api/admin/roles/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/admin/roles/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  const token = _request.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/admin/roles/${id}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return new NextResponse(null, { status: res.status });
}
```

- [ ] **Step 3: Create `frontend/app/api/admin/users/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 4: Create `frontend/app/api/admin/users/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/admin/users/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  const token = _request.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return new NextResponse(null, { status: res.status });
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/admin/roles/ frontend/app/api/admin/users/
git commit -m "feat(rbac): add frontend proxy routes for roles and users"
```

---

## Task 17: Frontend — Role management pages (list, new, edit)

**Files:**
- Create: `frontend/components/admin/form/RoleForm.tsx`
- Create: `frontend/app/admin/(dashboard)/roles/page.tsx`
- Create: `frontend/app/admin/(dashboard)/roles/new/page.tsx`
- Create: `frontend/app/admin/(dashboard)/roles/[id]/page.tsx`

- [ ] **Step 1: Create `frontend/components/admin/form/RoleForm.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ADMIN_MODULES, SCOPE_TYPE_LABELS } from '@/lib/adminModules';
import type { Role } from '@/lib/types';

interface RoleFormProps {
  mode: 'create' | 'edit';
  initialData?: Role;
}

export function RoleForm({ mode, initialData }: RoleFormProps) {
  const router = useRouter();
  const [id, setId] = useState(initialData?.id ?? '');
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [scopeType, setScopeType] = useState<string | null>(initialData?.scope_type ?? null);
  const [sortOrder, setSortOrder] = useState(initialData?.sort_order ?? 0);
  const [permissions, setPermissions] = useState<Set<string>>(
    new Set(initialData?.permissions ?? [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSystem = initialData?.is_system ?? false;

  function togglePermission(moduleId: string) {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        // Prevent removing protected modules from admin role
        if (isSystem && initialData?.id === 'admin' && ['users', 'menu_config', 'roles'].includes(moduleId)) {
          return prev;
        }
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      ...(mode === 'create' ? { id } : {}),
      name,
      description: description || null,
      scope_type: scopeType,
      sort_order: sortOrder,
      permissions: Array.from(permissions),
    };
    try {
      const res = await fetch(
        mode === 'create' ? '/api/admin/roles' : `/api/admin/roles/${initialData!.id}`,
        {
          method: mode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      router.push('/admin/roles');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialData || isSystem) return;
    if (!confirm(`Delete role "${initialData.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/roles/${initialData.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      router.push('/admin/roles');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Role ID</label>
          {mode === 'create' ? (
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              required
              placeholder="e.g., viewer, cable_manager"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <input
              type="text"
              value={id}
              disabled
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Display Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Scope Type</label>
          <select
            value={scopeType ?? ''}
            onChange={(e) => setScopeType(e.target.value || null)}
            disabled={isSystem}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">None (global role)</option>
            {Object.entries(SCOPE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {isSystem && (
            <p className="mt-1 text-xs text-gray-500">System role — scope type cannot be changed.</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Sort Order</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
            className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Module Permissions</label>
        <div className="rounded-md border border-gray-200">
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
            {ADMIN_MODULES.map((m) => {
              const checked = permissions.has(m.id);
              const isProtected = isSystem && initialData?.id === 'admin' && ['users', 'menu_config', 'roles'].includes(m.id);
              return (
                <label
                  key={m.id}
                  className={`flex items-center gap-2 rounded p-2 text-sm ${
                    checked ? 'bg-blue-50' : 'hover:bg-gray-50'
                  } ${isProtected ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePermission(m.id)}
                    disabled={isProtected}
                    className="rounded"
                  />
                  <span>{m.label}</span>
                  {m.scopeAware && (
                    <span className="text-xs text-gray-400">(scoped)</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : mode === 'create' ? 'Create Role' : 'Save Changes'}
        </button>
        <Link
          href="/admin/roles"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </Link>
        {mode === 'edit' && !isSystem && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create `frontend/app/admin/(dashboard)/roles/page.tsx`**

```tsx
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

export default async function RolesPage() {
  const roles = await adminApi.roles.all();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Roles</h1>
        <Link
          href="/admin/roles/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Role
        </Link>
      </div>
      <div className="overflow-hidden rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">ID</th>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Scope Type</th>
              <th className="px-4 py-2 text-left font-medium">Permissions</th>
              <th className="px-4 py-2 text-left font-medium">System</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-mono text-xs">{role.id}</td>
                <td className="px-4 py-2">{role.name}</td>
                <td className="px-4 py-2">{role.scope_type ?? '—'}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{role.permissions.length} modules</td>
                <td className="px-4 py-2">{role.is_system ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/admin/roles/${role.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/app/admin/(dashboard)/roles/new/page.tsx`**

```tsx
import { RoleForm } from '@/components/admin/form/RoleForm';

export default function NewRolePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New Role</h1>
      <RoleForm mode="create" />
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/app/admin/(dashboard)/roles/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/adminApi';
import { RoleForm } from '@/components/admin/form/RoleForm';

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const role = await adminApi.roles.getById(id);
  if (!role) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit Role: {role.name}</h1>
      <RoleForm mode="edit" initialData={role} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/admin/form/RoleForm.tsx 'frontend/app/admin/(dashboard)/roles/'
git commit -m "feat(rbac): add role management pages (list, new, edit)"
```

---

## Task 18: Frontend — User management pages (list, new, edit)

**Files:**
- Create: `frontend/components/admin/form/UserForm.tsx`
- Create: `frontend/app/admin/(dashboard)/users/page.tsx`
- Create: `frontend/app/admin/(dashboard)/users/new/page.tsx`
- Create: `frontend/app/admin/(dashboard)/users/[id]/page.tsx`

- [ ] **Step 1: Create `frontend/components/admin/form/UserForm.tsx`**

```tsx
'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import type { Role, ScopeOption, AdminUserExtended } from '@/lib/types';

interface UserFormProps {
  mode: 'create' | 'edit';
  initialData?: AdminUserExtended;
  roles: Role[];
}

export function UserForm({ mode, initialData, roles }: UserFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(initialData?.email ?? '');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(initialData?.role_id ?? roles[0]?.id ?? '');
  const [scopeId, setScopeId] = useState(initialData?.scope_id ?? '');
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true);
  const [scopes, setScopes] = useState<ScopeOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRole = roles.find((r) => r.id === roleId);
  const needsScope = selectedRole?.scope_type != null;

  useEffect(() => {
    if (needsScope && selectedRole?.scope_type) {
      adminApi.users.scopes(selectedRole.scope_type).then(setScopes).catch(() => setScopes([]));
    } else {
      setScopes([]);
      setScopeId('');
    }
  }, [needsScope, selectedRole]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      email,
      role_id: roleId,
      scope_id: needsScope ? (scopeId || null) : null,
      is_active: isActive,
    };
    if (password) {
      payload.password = password;
    }
    try {
      const res = await fetch(
        mode === 'create' ? '/api/admin/users' : `/api/admin/users/${initialData!.id}`,
        {
          method: mode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      router.push('/admin/users');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Password {mode === 'edit' && '(leave blank to keep current)'}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={mode === 'create'}
            minLength={8}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Role</label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} {r.scope_type ? `(${r.scope_type})` : ''}
              </option>
            ))}
          </select>
        </div>
        {needsScope && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              Scope ({selectedRole?.scope_type})
            </label>
            <select
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— Select —</option>
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            Active
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : mode === 'create' ? 'Create User' : 'Save Changes'}
        </button>
        <Link
          href="/admin/users"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create `frontend/app/admin/(dashboard)/users/page.tsx`**

```tsx
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

export default async function UsersPage() {
  const users = await adminApi.users.all();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <Link
          href="/admin/users/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New User
        </Link>
      </div>
      <div className="overflow-hidden rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">ID</th>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Scope</th>
              <th className="px-4 py-2 text-left font-medium">Active</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-xs text-gray-500">{user.id}</td>
                <td className="px-4 py-2">{user.email}</td>
                <td className="px-4 py-2">{user.role_name ?? user.role_id}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{user.scope_id ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {user.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/app/admin/(dashboard)/users/new/page.tsx`**

```tsx
import { adminApi } from '@/lib/adminApi';
import { UserForm } from '@/components/admin/form/UserForm';

export default async function NewUserPage() {
  const roles = await adminApi.roles.all();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New User</h1>
      <UserForm mode="create" roles={roles} />
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/app/admin/(dashboard)/users/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/adminApi';
import { UserForm } from '@/components/admin/form/UserForm';

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, roles] = await Promise.all([
    adminApi.users.getById(parseInt(id)),
    adminApi.roles.all(),
  ]);
  if (!user) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit User: {user.email}</h1>
      <UserForm mode="edit" initialData={user} roles={roles} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/admin/form/UserForm.tsx 'frontend/app/admin/(dashboard)/users/'
git commit -m "feat(rbac): add user management pages (list, new, edit)"
```

---

## Task 19: Frontend — Update AdminSidebar to filter menu by permissions

**Files:**
- Modify: `frontend/components/admin/layout/AdminSidebar.tsx`

- [ ] **Step 1: Add permission filtering to `AdminSidebar`**

The sidebar currently fetches `/api/admin/menu/tree` and renders all items. We need to additionally fetch `/api/admin/me/permissions` (via the `adminApi.me.permissions()` server-side helper or a client-side fetch) and filter the menu tree to only show items whose `page_id` is in `allowed_modules`.

Since `AdminSidebar` is a Client Component, add a parallel fetch:

Find the `fetchTree` function inside `useEffect` and add a permissions fetch:

```typescript
  useEffect(() => {
    let cancelled = false;
    async function fetchTree() {
      try {
        const [treeRes, permsRes] = await Promise.all([
          fetch('/api/admin/menu/tree'),
          fetch('/api/auth/me/permissions'),
        ]);
        if (!treeRes.ok) throw new Error('tree fetch failed');
        const data: MenuItemTree[] = await treeRes.json();
        let allowedModules: Set<string> | null = null;
        if (permsRes.ok) {
          const perms = await permsRes.json();
          allowedModules = new Set(perms.allowed_modules ?? []);
        }
        if (cancelled) return;
        // Filter tree by permissions: keep groups if any child is allowed,
        // keep page items if their page_id is in allowed_modules (or allowed_modules is null = fallback)
        const filtered = allowedModules
          ? filterTreeByPermissions(data, allowedModules)
          : data;
        setTree(filtered);
        // ... existing auto-expand logic (use `filtered` instead of `data`) ...
      } catch {
        // ... existing fallback ...
      } finally {
        // ...
      }
    }
    fetchTree();
    return () => { cancelled = true; };
  }, [pathname]);
```

Add the `filterTreeByPermissions` helper above the component:

```typescript
function filterTreeByPermissions(
  tree: MenuItemTree[],
  allowed: Set<string>
): MenuItemTree[] {
  // Map page_id to the permission module ID format.
  // page_id uses kebab-case (e.g., 'equipment-mfrs'), module IDs use snake_case (e.g., 'equipment_mfrs').
  // The allowed_modules from the API uses snake_case module IDs.
  // We need to convert page_id to module ID for comparison.
  const pageIdToModuleId = (pageId: string): string => {
    const map: Record<string, string> = {
      'dashboard': 'dashboard',
      'cables': 'cables',
      'brands': 'brands',
      'manufacturers': 'manufacturers',
      'industries': 'industries',
      'equipment-mfrs': 'equipment_mfrs',
      'equipment-cats': 'equipment_cats',
      'equipment-list': 'equipment_list',
      'media': 'media',
      'menu-config': 'menu_config',
      'users': 'users',
      'roles': 'roles',
    };
    return map[pageId] ?? pageId;
  };

  const result: MenuItemTree[] = [];
  for (const item of tree) {
    if (item.type === 'group') {
      // Keep group if any child is allowed
      const allowedChildren = (item.children ?? []).filter((child) => {
        if (child.type === 'page' && child.page_id) {
          return allowed.has(pageIdToModuleId(child.page_id));
        }
        return true; // links and groups without page_id are always shown
      });
      if (allowedChildren.length > 0) {
        result.push({ ...item, children: allowedChildren });
      }
    } else if (item.type === 'page' && item.page_id) {
      if (allowed.has(pageIdToModuleId(item.page_id))) {
        result.push(item);
      }
    } else {
      // links and other types: always show
      result.push(item);
    }
  }
  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/admin/layout/AdminSidebar.tsx
git commit -m "feat(rbac): filter sidebar menu by user permissions"
```

---

## Task 20: Build, Verify, and Final Commit

**Files:**
- Verify all changes

- [ ] **Step 1: Run backend tests**

```bash
docker compose exec backend pytest tests/ -v --tb=short
```

Expected: all RBAC tests pass, no regressions in existing tests.

- [ ] **Step 2: Build frontend**

```bash
docker compose exec frontend npm run build
```

Expected: build succeeds, no TypeScript errors. All new routes visible in build output:
- `/admin/roles`, `/admin/roles/[id]`, `/admin/roles/new`
- `/admin/users`, `/admin/users/[id]`, `/admin/users/new`
- `/api/admin/roles`, `/api/admin/roles/[id]`
- `/api/admin/users`, `/api/admin/users/[id]`

- [ ] **Step 3: Restart containers**

```bash
docker compose restart backend frontend
```

- [ ] **Step 4: Smoke test (manual)**

1. Login as admin at `/admin/login`
2. Sidebar should show all menu items
3. Navigate to `/admin/roles` — should list 4 preset roles
4. Click "New Role" — create a custom role with some permissions
5. Edit the custom role — modify permissions, verify the checkbox matrix works
6. Try to delete a system role — should fail with 403
7. Navigate to `/admin/users` — should list existing users
8. Click "New User" — create a user with the custom role
9. Edit a user — change role, verify scope selector appears/disappears based on role's scope_type
10. Login as the new user — sidebar should only show allowed modules

- [ ] **Step 5: Final commit (if any uncommitted changes remain)**

```bash
git status
# If there are uncommitted changes:
git add -A
git commit -m "chore(rbac): final fixes from smoke test"
```

---

## Self-Review Checklist

After writing this plan, I reviewed it against the spec:

**Spec coverage:**
- ✓ Section 4.1 (roles + role_permissions tables) → Task 1, 5
- ✓ Section 4.2 (users table modification) → Task 2, 5
- ✓ Section 4.3 (modules.py + scope_resolvers.py) → Task 3
- ✓ Section 4.4 (seed data) → Task 5
- ✓ Section 5.1 (permission check flow) → Task 6
- ✓ Section 5.2 (require_module factory) → Task 6
- ✓ Section 5.3 (scope filtering pattern) → Task 12
- ✓ Section 5.4 (admin role safeguard) → Task 7
- ✓ Section 6.1 (role management endpoints) → Task 9
- ✓ Section 6.2 (user management endpoints) → Task 10
- ✓ Section 6.3 (scope validation endpoint) → Task 10
- ✓ Section 6.4 (/me/permissions endpoint) → Task 10
- ✓ Section 7.1 (new pages) → Tasks 17, 18
- ✓ Section 7.2 (sidebar integration) → Task 19
- ✓ Section 7.3 (frontend constants) → Task 15
- ✓ Section 7.4 (menu registry update) → Task 15
- ✓ Section 8.1 (schema migration) → Task 5
- ✓ Section 8.2 (application code migration) → Tasks 6, 11, 12
- ✓ Section 8.3 (existing tests) → Task 13
- ✓ Section 11 (testing strategy) → Task 14

**Placeholder scan:** No TBD/TODO. All code blocks are complete.

**Type consistency:** `Role`, `RolePermission`, `UserRead`, `UserCreate`, `UserUpdate`, `UserPermissions`, `RoleRead`, `RoleCreate`, `RoleUpdate` — names consistent across schemas, CRUDs, routes, and frontend types. `crud_role`, `crud_user` instance names consistent. `require_module` factory name consistent across deps.py and route files.

**Gaps found and fixed:**
- Added Task 13 Step 1 to add `roles` to `ALLOWED_PAGE_IDS` (was implied but not explicitly tasked)
- Added audit_log CHECK constraint note in Task 2 (existing constraint must be preserved)
- Task 12 Step 2 includes a decision point about GET endpoint scoping (keep public for MVP)
