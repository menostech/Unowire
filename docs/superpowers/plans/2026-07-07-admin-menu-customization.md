# Admin Menu Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded admin sidebar with a database-driven, admin-configurable menu supporting two-level nesting and three item types (page / link / group).

**Architecture:** Single `admin_menu_items` table with self-referencing `parent_id` (max 2 levels). FastAPI CRUD endpoints with type-discriminated validation. Frontend `adminMenuRegistry.ts` constant maps `pageId`→`href`. `AdminSidebar.tsx` fetches a tree from the API with fallback to the constant. A `/admin/menu` editor page handles CRUD with up/down sort buttons.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (async) + Pydantic v2 + Alembic; Next.js 16 App Router + TypeScript + lucide-react.

---

## File Structure

**Backend (create):**
- `backend/app/models/menu.py` — `AdminMenuItem` SQLAlchemy model
- `backend/app/schemas/menu.py` — Pydantic schemas (Read/Tree/Create/Update/Sort)
- `backend/app/crud/menu.py` — CRUD with tree/flat/validate/move methods
- `backend/app/api/routes/admin_menu.py` — FastAPI router with all endpoints
- `backend/alembic/versions/f5a6b7c8d9e0_add_admin_menu_items.py` — Migration + seed

**Backend (modify):**
- `backend/app/models/__init__.py` — Register `AdminMenuItem`
- `backend/app/main.py` — Register `admin_menu` router

**Frontend (create):**
- `frontend/lib/adminMenuRegistry.ts` — Page registry constant
- `frontend/components/admin/form/MenuItemForm.tsx` — Create/edit form with type switcher, page picker, icon picker, parent select
- `frontend/components/admin/form/IconPicker.tsx` — lucide icon picker dropdown
- `frontend/app/admin/(dashboard)/menu/page.tsx` — Tree list editor
- `frontend/app/admin/(dashboard)/menu/new/page.tsx` — Create page
- `frontend/app/admin/(dashboard)/menu/[id]/page.tsx` — Edit page
- `frontend/app/api/admin/menu/route.ts` — POST proxy
- `frontend/app/api/admin/menu/[id]/route.ts` — PUT/DELETE proxy
- `frontend/app/api/admin/menu/[id]/sort/route.ts` — PUT sort proxy

**Frontend (modify):**
- `frontend/lib/types.ts` — Add `MenuItem`, `MenuItemTree` interfaces
- `frontend/lib/adminApi.ts` — Add `adminMenu` namespace
- `frontend/components/admin/layout/AdminSidebar.tsx` — Refactor to fetch tree, support collapse/expand

---

## Global Constraints

- All code, comments, error messages, and documentation in English (project is global-facing).
- All middleware/routes use `async/await` (no callback style).
- Migration must be idempotent (`ON CONFLICT (id) DO NOTHING` on seed inserts).
- `selectinload` for eager-loading `children` to avoid async `MissingGreenlet` errors (lesson from EquipmentCategory).
- Pydantic schemas use `model_config = {"from_attributes": True}` for ORM serialization.
- Admin routes require `get_current_admin` dependency.
- Frontend proxy routes forward `admin_token` cookie as `Authorization: Bearer <token>`.
- Error response format: `{"code": <int>, "message": <str>}` (matches existing routes).
- `menu-config` item ID is protected — cannot be deleted (403).
- Backend `ALLOWED_PAGE_IDS` constant and frontend `ADMIN_PAGES` constant must be kept in sync manually.
- Migration file uses `down_revision = 'e3f4a5b6c7d8'` (the latest existing migration).

---

## Task 1: Backend Model — `AdminMenuItem`

**Files:**
- Create: `backend/app/models/menu.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Create `backend/app/models/menu.py`**

```python
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AdminMenuItem(Base):
    __tablename__ = "admin_menu_items"
    __table_args__ = (
        CheckConstraint(
            "type IN ('page', 'link', 'group')",
            name="ck_admin_menu_items_type",
        ),
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    parent_id: Mapped[str | None] = mapped_column(
        String(100),
        ForeignKey("admin_menu_items.id", ondelete="CASCADE"),
        nullable=True,
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    page_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    parent: Mapped["AdminMenuItem | None"] = relationship(
        "AdminMenuItem",
        back_populates="children",
        remote_side="AdminMenuItem.id",
    )
    children: Mapped[list["AdminMenuItem"]] = relationship(
        "AdminMenuItem",
        back_populates="parent",
        order_by="AdminMenuItem.sort_order",
        cascade="all, delete-orphan",
    )
```

- [ ] **Step 2: Register in `backend/app/models/__init__.py`**

Modify `backend/app/models/__init__.py`:

```python
from app.models.brand import Brand
from app.models.cable import Cable, CableVariant, SpecItem
from app.models.equipment import RecommendedEquipment
from app.models.folder import Folder
from app.models.manufacturer import Manufacturer
from app.models.menu import AdminMenuItem
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
    "SpecItem",
    "Upload",
    "User",
]
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/menu.py backend/app/models/__init__.py
git commit -m "feat(menu): add AdminMenuItem model"
```

---

## Task 2: Backend Schemas — Pydantic for Menu

**Files:**
- Create: `backend/app/schemas/menu.py`

- [ ] **Step 1: Create `backend/app/schemas/menu.py`**

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, model_validator


class MenuItemRead(BaseModel):
    """Flat item, no children. Used by editor list and single-item endpoints."""

    id: str
    parent_id: str | None = None
    type: Literal["page", "link", "group"]
    page_id: str | None = None
    url: str | None = None
    label: str
    icon: str | None = None
    sort_order: int = 0
    is_visible: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MenuItemTreeRead(BaseModel):
    """Tree item for sidebar rendering. children is flat (no recursion)."""

    id: str
    parent_id: str | None = None
    type: Literal["page", "link", "group"]
    page_id: str | None = None
    url: str | None = None
    label: str
    icon: str | None = None
    sort_order: int = 0
    is_visible: bool = True
    children: list[MenuItemRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MenuItemCreate(BaseModel):
    id: str
    parent_id: str | None = None
    type: Literal["page", "link", "group"]
    page_id: str | None = None
    url: str | None = None
    label: str
    icon: str | None = None
    sort_order: int = 0
    is_visible: bool = True

    @model_validator(mode="after")
    def validate_type_fields(self):
        if self.type == "page":
            if not self.page_id:
                raise ValueError("page_id is required when type is 'page'")
            if self.url is not None:
                raise ValueError("url must be null when type is 'page'")
        elif self.type == "link":
            if not self.url:
                raise ValueError("url is required when type is 'link'")
            if self.page_id is not None:
                raise ValueError("page_id must be null when type is 'link'")
        elif self.type == "group":
            if self.page_id is not None:
                raise ValueError("page_id must be null when type is 'group'")
            if self.url is not None:
                raise ValueError("url must be null when type is 'group'")
        return self


class MenuItemUpdate(BaseModel):
    parent_id: str | None = None
    type: Literal["page", "link", "group"] | None = None
    page_id: str | None = None
    url: str | None = None
    label: str | None = None
    icon: str | None = None
    sort_order: int | None = None
    is_visible: bool | None = None


class MenuItemSort(BaseModel):
    direction: Literal["up", "down"]
```

Note: `MenuItemUpdate` does not include conditional type-field validation at the schema level because partial updates make this complex. Validation for type-field consistency is enforced at the CRUD layer after merging the update onto the existing record.

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/menu.py
git commit -m "feat(menu): add Pydantic schemas for admin menu items"
```

---

## Task 3: Backend CRUD — `CRUDMenuItem`

**Files:**
- Create: `backend/app/crud/menu.py`

- [ ] **Step 1: Create `backend/app/crud/menu.py`**

```python
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.menu import AdminMenuItem
from app.schemas.menu import MenuItemCreate, MenuItemUpdate


# Whitelist of page_id values allowed in the database.
# Must stay in sync with frontend/lib/adminMenuRegistry.ts ADMIN_PAGES.
ALLOWED_PAGE_IDS = {
    "dashboard",
    "cables",
    "brands",
    "manufacturers",
    "industries",
    "equipment-mfrs",
    "equipment-cats",
    "equipment-list",
    "media",
    "menu-config",
}

# IDs that cannot be deleted (would lock admin out of menu editor).
PROTECTED_IDS = {"menu-config"}


class CRUDMenuItem(CRUDBase[AdminMenuItem, MenuItemCreate, MenuItemUpdate]):
    async def get_tree(self, db: AsyncSession, only_visible: bool = True) -> list[AdminMenuItem]:
        """Return top-level items with their children eagerly loaded."""
        stmt = (
            select(AdminMenuItem)
            .where(AdminMenuItem.parent_id.is_(None))
            .options(selectinload(AdminMenuItem.children))
            .order_by(AdminMenuItem.sort_order)
        )
        if only_visible:
            stmt = stmt.where(AdminMenuItem.is_visible.is_(True))
        result = await db.execute(stmt)
        top_level = list(result.scalars().all())
        if only_visible:
            # Filter hidden children in Python (selectinload already loaded them).
            for item in top_level:
                item.children = [c for c in item.children if c.is_visible]
        return top_level

    async def get_flat(self, db: AsyncSession) -> list[AdminMenuItem]:
        """Return all items flat, ordered for tree display."""
        stmt = (
            select(AdminMenuItem)
            .order_by(AdminMenuItem.parent_id.asc().nullsfirst(), AdminMenuItem.sort_order)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_with_children(self, db: AsyncSession, id: str) -> AdminMenuItem | None:
        stmt = (
            select(AdminMenuItem)
            .where(AdminMenuItem.id == id)
            .options(selectinload(AdminMenuItem.children))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def validate_parent(self, db: AsyncSession, parent_id: str | None) -> None:
        """Validate hierarchy rules. Raises HTTPException(422) on violation."""
        if parent_id is None:
            return
        parent = await self.get(db, parent_id)
        if parent is None:
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": "Parent menu item not found"},
            )
        if parent.type != "group":
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": "Parent must be a group type"},
            )
        if parent.parent_id is not None:
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": "Maximum depth is 2 levels"},
            )

    async def validate_page_id(self, page_id: str | None) -> None:
        """Validate page_id is in the whitelist. Raises HTTPException(422)."""
        if page_id is not None and page_id not in ALLOWED_PAGE_IDS:
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": "Unknown page_id"},
            )

    async def validate_type_fields(
        self, type_: str, page_id: str | None, url: str | None
    ) -> None:
        """Validate type-conditional fields. Raises HTTPException(422)."""
        if type_ == "page":
            if not page_id:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "page_id is required when type is 'page'"},
                )
            if url is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "url must be null when type is 'page'"},
                )
        elif type_ == "link":
            if not url:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "url is required when type is 'link'"},
                )
            if page_id is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "page_id must be null when type is 'link'"},
                )
        elif type_ == "group":
            if page_id is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "page_id must be null when type is 'group'"},
                )
            if url is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "url must be null when type is 'group'"},
                )

    async def assert_not_protected(self, id: str) -> None:
        """Raise 403 if the item is protected from deletion."""
        if id in PROTECTED_IDS:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete protected menu item"},
            )

    async def create(self, db: AsyncSession, *, obj_in: MenuItemCreate) -> AdminMenuItem:
        await self.validate_parent(db, obj_in.parent_id)
        await self.validate_page_id(obj_in.page_id)
        await self.validate_type_fields(obj_in.type, obj_in.page_id, obj_in.url)
        return await super().create(db, obj_in=obj_in)

    async def update(
        self, db: AsyncSession, *, db_obj: AdminMenuItem, obj_in: MenuItemUpdate
    ) -> AdminMenuItem:
        update_data = obj_in.model_dump(exclude_unset=True)
        # Merge onto existing for validation.
        new_type = update_data.get("type", db_obj.type)
        new_page_id = update_data.get("page_id", db_obj.page_id)
        new_url = update_data.get("url", db_obj.url)
        new_parent_id = update_data.get("parent_id", db_obj.parent_id)

        await self.validate_parent(db, new_parent_id)
        await self.validate_page_id(new_page_id)
        await self.validate_type_fields(new_type, new_page_id, new_url)

        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def move(
        self, db: AsyncSession, id: str, direction: Literal["up", "down"]
    ) -> AdminMenuItem:
        """Swap sort_order with adjacent sibling. Raises 400 at boundary."""
        item = await self.get(db, id)
        if item is None:
            raise HTTPException(
                status_code=404,
                detail={"code": 404, "message": "Menu item not found"},
            )
        # Find siblings (same parent_id), ordered by sort_order.
        stmt = (
            select(AdminMenuItem)
            .where(AdminMenuItem.parent_id.is_(item.parent_id))
            .order_by(AdminMenuItem.sort_order)
        )
        result = await db.execute(stmt)
        siblings = list(result.scalars().all())
        idx = next((i for i, s in enumerate(siblings) if s.id == id), -1)
        if idx == -1:
            raise HTTPException(
                status_code=404,
                detail={"code": 404, "message": "Menu item not found in siblings"},
            )
        if direction == "up":
            if idx == 0:
                raise HTTPException(
                    status_code=400,
                    detail={"code": 400, "message": "Already at top of siblings"},
                )
            swap = siblings[idx - 1]
        else:  # "down"
            if idx == len(siblings) - 1:
                raise HTTPException(
                    status_code=400,
                    detail={"code": 400, "message": "Already at bottom of siblings"},
                )
            swap = siblings[idx + 1]
        item.sort_order, swap.sort_order = swap.sort_order, item.sort_order
        db.add_all([item, swap])
        await db.commit()
        await db.refresh(item)
        return item


crud_menu_item = CRUDMenuItem(AdminMenuItem)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/crud/menu.py
git commit -m "feat(menu): add CRUDMenuItem with tree/validate/move methods"
```

---

## Task 4: Backend Routes — `admin_menu.py`

**Files:**
- Create: `backend/app/api/routes/admin_menu.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create `backend/app/api/routes/admin_menu.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.crud.menu import crud_menu_item
from app.schemas.menu import (
    MenuItemCreate,
    MenuItemRead,
    MenuItemSort,
    MenuItemTreeRead,
    MenuItemUpdate,
)

router = APIRouter()


@router.get("/tree", response_model=list[MenuItemTreeRead])
async def get_menu_tree(db: AsyncSession = Depends(get_db)):
    """Sidebar tree. Hidden items excluded. Public (no admin required) —
    sidebar must render even for unauthenticated admin users (e.g. login page
    layout may show the shell)."""
    return await crud_menu_item.get_tree(db, only_visible=True)


@router.get("", response_model=list[MenuItemRead])
async def list_menu_items(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    """Flat list of all items (including hidden), for editor."""
    return await crud_menu_item.get_flat(db)


@router.get("/{id}", response_model=MenuItemRead)
async def get_menu_item(
    id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    obj = await crud_menu_item.get(db, id)
    if not obj:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Menu item not found"},
        )
    return obj


@router.post("", response_model=MenuItemRead, status_code=201)
async def create_menu_item(
    obj_in: MenuItemCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    return await crud_menu_item.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=MenuItemRead)
async def update_menu_item(
    id: str,
    obj_in: MenuItemUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    obj = await crud_menu_item.get(db, id)
    if not obj:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Menu item not found"},
        )
    # Prevent self-parenting.
    if obj_in.parent_id is not None and obj_in.parent_id == id:
        raise HTTPException(
            status_code=422,
            detail={"code": 422, "message": "Cannot set self as parent"},
        )
    return await crud_menu_item.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=MenuItemRead)
async def delete_menu_item(
    id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    await crud_menu_item.assert_not_protected(id)
    obj = await crud_menu_item.get_with_children(db, id)
    if not obj:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Menu item not found"},
        )
    # Cascade delete handled by ORM relationship + DB ON DELETE CASCADE.
    await db.delete(obj)
    await db.commit()
    return obj


@router.put("/{id}/sort", response_model=MenuItemRead)
async def sort_menu_item(
    id: str,
    body: MenuItemSort,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    return await crud_menu_item.move(db, id, body.direction)
```

- [ ] **Step 2: Register router in `backend/app/main.py`**

Modify the imports line (around line 12) to add `admin_menu`:

```python
from app.api.routes import auth, brands, cable_import, cable_import_templates, cables, categories, equipment, equipment_categories, equipment_manufacturers, folders, health, industries, manufacturers, product_types, taxonomy, uploads, admin_menu
```

Add router registration after the `equipment_categories` router line (around line 95):

```python
app.include_router(admin_menu.router, prefix=f"{settings.api_prefix}/admin/menu", tags=["admin-menu"])
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/admin_menu.py backend/app/main.py
git commit -m "feat(menu): add admin menu CRUD routes"
```

---

## Task 5: Backend Migration — Create Table + Seed

**Files:**
- Create: `backend/alembic/versions/f5a6b7c8d9e0_add_admin_menu_items.py`

- [ ] **Step 1: Create the migration file**

```python
"""add admin_menu_items table

Revision ID: f5a6b7c8d9e0
Revises: e3f4a5b6c7d8
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        'admin_menu_items',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column(
            'parent_id',
            sa.String(length=100),
            sa.ForeignKey('admin_menu_items.id', ondelete='CASCADE'),
            nullable=True,
        ),
        sa.Column('type', sa.String(length=20), nullable=False),
        sa.Column('page_id', sa.String(length=100), nullable=True),
        sa.Column('url', sa.String(length=500), nullable=True),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('icon', sa.String(length=50), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_visible', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("type IN ('page', 'link', 'group')", name='ck_admin_menu_items_type'),
    )

    op.create_index(
        'ix_admin_menu_items_parent_id',
        'admin_menu_items',
        ['parent_id'],
    )
    op.create_index(
        'ix_admin_menu_items_parent_id_sort_order',
        'admin_menu_items',
        ['parent_id', 'sort_order'],
    )

    # Seed: 11 items matching current hardcoded sidebar + new menu-config.
    # Idempotent via ON CONFLICT (id) DO NOTHING.
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES
            ('dashboard',       NULL,        'page',  'dashboard',       NULL, 'Dashboard',      'LayoutDashboard', 0, true, NOW(), NOW()),
            ('cables',          NULL,        'page',  'cables',          NULL, 'Cables',         'Cable',           1, true, NOW(), NOW()),
            ('brands',          NULL,        'page',  'brands',          NULL, 'Brands',         'Tag',             2, true, NOW(), NOW()),
            ('manufacturers',   NULL,        'page',  'manufacturers',   NULL, 'Manufacturers',  'Factory',         3, true, NOW(), NOW()),
            ('industries',      NULL,        'page',  'industries',      NULL, 'Industries',     'FolderOpen',      4, true, NOW(), NOW()),
            ('equipment',       NULL,        'group', NULL,              NULL, 'Equipment',      'Wrench',          5, true, NOW(), NOW()),
            ('equipment-mfrs',  'equipment', 'page',  'equipment-mfrs',  NULL, 'Equipment Mfrs', 'Wrench',          0, true, NOW(), NOW()),
            ('equipment-cats',  'equipment', 'page',  'equipment-cats',  NULL, 'Equipment Cats', 'Wrench',          1, true, NOW(), NOW()),
            ('equipment-list',  'equipment', 'page',  'equipment-list',  NULL, 'Equipment',      'Wrench',          2, true, NOW(), NOW()),
            ('media',           NULL,        'page',  'media',           NULL, 'Media',          'Image',           6, true, NOW(), NOW()),
            ('menu-config',     NULL,        'page',  'menu-config',     NULL, 'Menu Config',    'Settings',        7, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade():
    op.drop_index('ix_admin_menu_items_parent_id_sort_order', table_name='admin_menu_items')
    op.drop_index('ix_admin_menu_items_parent_id', table_name='admin_menu_items')
    op.drop_table('admin_menu_items')
```

- [ ] **Step 2: Run migration**

Run from project root (use Docker to ensure correct DB connection):

```bash
docker compose --env-file .env.docker exec backend alembic upgrade head
```

Expected: `Running upgrade e3f4a5b6c7d8 -> f5a6b7c8d9e0, add admin_menu_items table`

- [ ] **Step 3: Verify table and seed data**

```bash
docker compose --env-file .env.docker exec db psql -U unowire -d unowire -c "SELECT id, parent_id, type, label, sort_order FROM admin_menu_items ORDER BY parent_id NULLS FIRST, sort_order;"
```

Expected: 11 rows, with `equipment-mfrs`, `equipment-cats`, `equipment-list` having `parent_id=equipment`.

- [ ] **Step 4: Verify API endpoint**

```bash
docker compose --env-file .env.docker exec backend python -c "import urllib.request, json; data = json.loads(urllib.request.urlopen('http://localhost:8000/api/admin/menu/tree').read()); print(json.dumps(data, indent=2))"
```

Expected: JSON array with 8 top-level items (7 pages + 1 group), the group having 3 children.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/f5a6b7c8d9e0_add_admin_menu_items.py
git commit -m "feat(menu): add migration with seed data for admin menu items"
```

---

## Task 6: Backend Tests — `test_admin_menu.py`

**Files:**
- Create: `backend/tests/api/test_admin_menu.py`
- Create: `backend/tests/conftest.py` (if not exists)

- [ ] **Step 1: Check for existing test infrastructure**

```bash
ls backend/tests/ 2>/dev/null || echo "no tests dir"
ls backend/tests/conftest.py 2>/dev/null || echo "no conftest"
cat backend/requirements.txt 2>/dev/null | grep -i pytest || echo "no pytest in requirements"
```

- [ ] **Step 2: Create test file `backend/tests/api/test_admin_menu.py`**

Note: This project follows the MVP convention of no automated frontend tests, but the spec requires backend tests. If no test infrastructure exists, create a minimal conftest with a test client fixture.

```python
"""Tests for admin menu API endpoints."""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_headers(client):
    """Login as admin and return auth headers."""
    # Admin credentials from .env.docker
    res = client.post(
        "/api/auth/login",
        json={"email": "admin@unowire.com", "password": "admin123456"},
    )
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


class TestMenuTree:
    def test_tree_returns_top_level_items(self, client):
        res = client.get("/api/admin/menu/tree")
        assert res.status_code == 200
        data = res.json()
        # 8 top-level items (dashboard, cables, brands, manufacturers,
        # industries, equipment, media, menu-config)
        assert len(data) == 8
        # Equipment group has 3 children
        equipment = next(i for i in data if i["id"] == "equipment")
        assert equipment["type"] == "group"
        assert len(equipment["children"]) == 3

    def test_tree_excludes_hidden_items(self, client, admin_headers):
        # Hide the 'media' item
        res = client.put(
            "/api/admin/menu/media",
            json={"is_visible": False},
            headers=admin_headers,
        )
        assert res.status_code == 200
        # Tree should now have 7 top-level items
        res = client.get("/api/admin/menu/tree")
        data = res.json()
        ids = [i["id"] for i in data]
        assert "media" not in ids
        # Restore
        client.put(
            "/api/admin/menu/media",
            json={"is_visible": True},
            headers=admin_headers,
        )


class TestMenuFlat:
    def test_flat_requires_admin(self, client):
        res = client.get("/api/admin/menu")
        assert res.status_code == 401

    def test_flat_returns_all_items(self, client, admin_headers):
        res = client.get("/api/admin/menu", headers=admin_headers)
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 11  # all seed items


class TestMenuCreate:
    def test_create_page_item(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "test-page",
                "type": "page",
                "page_id": "cables",
                "label": "Test Page",
                "sort_order": 99,
            },
            headers=admin_headers,
        )
        assert res.status_code == 201
        assert res.json()["id"] == "test-page"
        # Cleanup
        client.delete("/api/admin/menu/test-page", headers=admin_headers)

    def test_create_link_item(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "test-link",
                "type": "link",
                "url": "https://example.com",
                "label": "Test Link",
                "sort_order": 99,
            },
            headers=admin_headers,
        )
        assert res.status_code == 201
        client.delete("/api/admin/menu/test-link", headers=admin_headers)

    def test_create_group_item(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "test-group",
                "type": "group",
                "label": "Test Group",
                "sort_order": 99,
            },
            headers=admin_headers,
        )
        assert res.status_code == 201
        client.delete("/api/admin/menu/test-group", headers=admin_headers)

    def test_create_page_without_page_id_returns_422(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "bad-page",
                "type": "page",
                "label": "Bad Page",
            },
            headers=admin_headers,
        )
        assert res.status_code == 422

    def test_create_link_without_url_returns_422(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "bad-link",
                "type": "link",
                "label": "Bad Link",
            },
            headers=admin_headers,
        )
        assert res.status_code == 422

    def test_create_with_invalid_page_id_returns_422(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "bad-pageid",
                "type": "page",
                "page_id": "nonexistent",
                "label": "Bad PageId",
            },
            headers=admin_headers,
        )
        assert res.status_code == 422

    def test_create_with_nonexistent_parent_returns_422(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "orphan",
                "parent_id": "nonexistent-parent",
                "type": "page",
                "page_id": "cables",
                "label": "Orphan",
            },
            headers=admin_headers,
        )
        assert res.status_code == 422

    def test_create_with_non_group_parent_returns_422(self, client, admin_headers):
        # 'cables' is a page, not a group — cannot be a parent
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "nested-too-deep",
                "parent_id": "cables",
                "type": "page",
                "page_id": "brands",
                "label": "Nested",
            },
            headers=admin_headers,
        )
        assert res.status_code == 422


class TestMenuSort:
    def test_move_up(self, client, admin_headers):
        # 'cables' is at sort_order=1, 'brands' at 2.
        # Moving 'brands' up should swap with 'cables'.
        res = client.put(
            "/api/admin/menu/brands/sort",
            json={"direction": "up"},
            headers=admin_headers,
        )
        assert res.status_code == 200
        # 'brands' now has sort_order=1
        assert res.json()["sort_order"] == 1
        # Restore
        client.put(
            "/api/admin/menu/brands/sort",
            json={"direction": "down"},
            headers=admin_headers,
        )

    def test_move_down_at_boundary_returns_400(self, client, admin_headers):
        # 'menu-config' is the last top-level item (sort_order=7).
        res = client.put(
            "/api/admin/menu/menu-config/sort",
            json={"direction": "down"},
            headers=admin_headers,
        )
        assert res.status_code == 400

    def test_move_up_at_boundary_returns_400(self, client, admin_headers):
        # 'dashboard' is the first top-level item (sort_order=0).
        res = client.put(
            "/api/admin/menu/dashboard/sort",
            json={"direction": "up"},
            headers=admin_headers,
        )
        assert res.status_code == 400


class TestMenuDelete:
    def test_delete_protected_returns_403(self, client, admin_headers):
        res = client.delete("/api/admin/menu/menu-config", headers=admin_headers)
        assert res.status_code == 403

    def test_delete_parent_cascades_children(self, client, admin_headers):
        # Create a temporary group with a child, then delete the group.
        client.post(
            "/api/admin/menu",
            json={
                "id": "tmp-group",
                "type": "group",
                "label": "Tmp Group",
                "sort_order": 99,
            },
            headers=admin_headers,
        )
        client.post(
            "/api/admin/menu",
            json={
                "id": "tmp-child",
                "parent_id": "tmp-group",
                "type": "page",
                "page_id": "cables",
                "label": "Tmp Child",
            },
            headers=admin_headers,
        )
        res = client.delete("/api/admin/menu/tmp-group", headers=admin_headers)
        assert res.status_code == 200
        # Child should be gone.
        res = client.get("/api/admin/menu/tmp-child", headers=admin_headers)
        assert res.status_code == 404

    def test_delete_unauthenticated_returns_401(self, client):
        res = client.delete("/api/admin/menu/dashboard")
        assert res.status_code == 401
```

- [ ] **Step 3: Create `backend/tests/conftest.py`**

```python
import os
import sys
from pathlib import Path

# Add backend to path so tests can import app
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))
```

- [ ] **Step 4: Run tests**

```bash
docker compose --env-file .env.docker exec backend python -m pytest tests/api/test_admin_menu.py -v
```

Expected: All tests pass. If `pytest` is not installed, add to `backend/requirements.txt`:

```
pytest>=7.0.0
httpx>=0.24.0
```

Then rebuild backend:

```bash
docker compose --env-file .env.docker up -d --build backend
```

- [ ] **Step 5: Commit**

```bash
git add backend/tests/api/test_admin_menu.py backend/tests/conftest.py
git commit -m "test(menu): add backend API tests for admin menu endpoints"
```

---

## Task 7: Frontend Types and API Client

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/adminApi.ts`
- Create: `frontend/lib/adminMenuRegistry.ts`

- [ ] **Step 1: Add types to `frontend/lib/types.ts`**

Append at the end of `frontend/lib/types.ts`:

```typescript
// === Admin Menu ===
export type MenuItemType = "page" | "link" | "group";

export interface MenuItem {
  id: string;
  parent_id: string | null;
  type: MenuItemType;
  page_id: string | null;
  url: string | null;
  label: string;
  icon: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItemTree extends MenuItem {
  children: MenuItem[];
}
```

- [ ] **Step 2: Create `frontend/lib/adminMenuRegistry.ts`**

```typescript
export interface PageRegistryEntry {
  pageId: string;
  href: string;
  defaultLabel: string;
  defaultIcon: string;
}

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
];

export const PAGE_BY_ID: Record<string, PageRegistryEntry> = Object.fromEntries(
  ADMIN_PAGES.map((p) => [p.pageId, p])
);
```

- [ ] **Step 3: Add `adminMenu` namespace to `frontend/lib/adminApi.ts`**

First, add the import for `MenuItem`/`MenuItemTree` at the top of `frontend/lib/adminApi.ts` (modify line 2):

```typescript
import type { Manufacturer, Brand, Cable, MenuItem, MenuItemTree } from './types';
```

Then, append the `adminMenu` namespace inside the `adminApi` object (after the `equipment` namespace, before the closing `}` of `adminApi`):

```typescript
  adminMenu: {
    async tree(): Promise<MenuItemTree[]> {
      return await adminGet<MenuItemTree[]>('/api/admin/menu/tree');
    },
    async all(): Promise<MenuItem[]> {
      return await adminGet<MenuItem[]>('/api/admin/menu');
    },
    async getById(id: string): Promise<MenuItem | null> {
      try {
        return await adminGet<MenuItem>(`/api/admin/menu/${encodeURIComponent(id)}`);
      } catch {
        return null;
      }
    },
    async create(payload: Record<string, unknown>): Promise<MenuItem> {
      const res = await adminFetch('/api/admin/menu', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/admin/menu`);
      return await res.json() as MenuItem;
    },
    async update(id: string, payload: Record<string, unknown>): Promise<MenuItem> {
      const res = await adminFetch(`/api/admin/menu/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/admin/menu/${id}`);
      return await res.json() as MenuItem;
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/admin/menu/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API ${res.status}: /api/admin/menu/${id}`);
    },
    async sort(id: string, direction: 'up' | 'down'): Promise<MenuItem> {
      const res = await adminFetch(`/api/admin/menu/${encodeURIComponent(id)}/sort`, {
        method: 'PUT',
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) throw new Error(`API ${res.status}: /api/admin/menu/${id}/sort`);
      return await res.json() as MenuItem;
    },
  },
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/adminMenuRegistry.ts frontend/lib/adminApi.ts
git commit -m "feat(menu): add frontend types, page registry, and adminApi namespace"
```

---

## Task 8: Frontend Proxy Routes

**Files:**
- Create: `frontend/app/api/admin/menu/route.ts`
- Create: `frontend/app/api/admin/menu/[id]/route.ts`
- Create: `frontend/app/api/admin/menu/[id]/sort/route.ts`

- [ ] **Step 1: Create `frontend/app/api/admin/menu/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/admin/menu`, {
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

- [ ] **Step 2: Create `frontend/app/api/admin/menu/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/admin/menu/${encodeURIComponent(id)}`, {
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/admin/menu/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 3: Create `frontend/app/api/admin/menu/[id]/sort/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/admin/menu/${encodeURIComponent(id)}/sort`, {
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
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/api/admin/menu/
git commit -m "feat(menu): add frontend proxy routes for admin menu CRUD"
```

---

## Task 9: Frontend IconPicker Component

**Files:**
- Create: `frontend/components/admin/form/IconPicker.tsx`

- [ ] **Step 1: Create `frontend/components/admin/form/IconPicker.tsx`**

```typescript
'use client';

import { useState, type FormEvent } from 'react';
import {
  LayoutDashboard, Cable, Tag, Factory, FolderOpen, Wrench, Image,
  Settings, ExternalLink, LogOut, FileText, Database, Box, Layers,
  Cpu, HardDrive, Server, Cloud, Link as LinkIcon, List, Grid, Tree,
  User, Users, Shield, Bell, Mail, MessageSquare, Search, Filter,
  Plus, Edit, Trash2, Save, X, Check, ChevronUp, ChevronDown,
  ChevronRight, ChevronLeft, Circle, Star, Heart, Bookmark, Flag,
  type LucideIcon,
} from 'lucide-react';

const ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: 'LayoutDashboard', Icon: LayoutDashboard },
  { name: 'Cable', Icon: Cable },
  { name: 'Tag', Icon: Tag },
  { name: 'Factory', Icon: Factory },
  { name: 'FolderOpen', Icon: FolderOpen },
  { name: 'Wrench', Icon: Wrench },
  { name: 'Image', Icon: Image },
  { name: 'Settings', Icon: Settings },
  { name: 'ExternalLink', Icon: ExternalLink },
  { name: 'LogOut', Icon: LogOut },
  { name: 'FileText', Icon: FileText },
  { name: 'Database', Icon: Database },
  { name: 'Box', Icon: Box },
  { name: 'Layers', Icon: Layers },
  { name: 'Cpu', Icon: Cpu },
  { name: 'HardDrive', Icon: HardDrive },
  { name: 'Server', Icon: Server },
  { name: 'Cloud', Icon: Cloud },
  { name: 'Link', Icon: LinkIcon },
  { name: 'List', Icon: List },
  { name: 'Grid', Icon: Grid },
  { name: 'Tree', Icon: Tree },
  { name: 'User', Icon: User },
  { name: 'Users', Icon: Users },
  { name: 'Shield', Icon: Shield },
  { name: 'Bell', Icon: Bell },
  { name: 'Mail', Icon: Mail },
  { name: 'MessageSquare', Icon: MessageSquare },
  { name: 'Search', Icon: Search },
  { name: 'Filter', Icon: Filter },
  { name: 'Plus', Icon: Plus },
  { name: 'Edit', Icon: Edit },
  { name: 'Trash2', Icon: Trash2 },
  { name: 'Save', Icon: Save },
  { name: 'X', Icon: X },
  { name: 'Check', Icon: Check },
  { name: 'ChevronUp', Icon: ChevronUp },
  { name: 'ChevronDown', Icon: ChevronDown },
  { name: 'ChevronRight', Icon: ChevronRight },
  { name: 'ChevronLeft', Icon: ChevronLeft },
  { name: 'Circle', Icon: Circle },
  { name: 'Star', Icon: Star },
  { name: 'Heart', Icon: Heart },
  { name: 'Bookmark', Icon: Bookmark },
  { name: 'Flag', Icon: Flag },
];

const ICON_BY_NAME: Record<string, LucideIcon> = Object.fromEntries(
  ICONS.map((i) => [i.name, i.Icon])
);

interface IconPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const SelectedIcon = value ? ICON_BY_NAME[value] : null;
  const filtered = search
    ? ICONS.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : ICONS;

  function handleSelect(name: string | null) {
    onChange(name);
    setOpen(false);
    setSearch('');
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {SelectedIcon ? (
          <>
            <SelectedIcon className="size-4 shrink-0 text-gray-700" />
            <span className="text-gray-900">{value}</span>
          </>
        ) : (
          <span className="text-gray-400">No icon</span>
        )}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-80 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
          <input
            type="text"
            placeholder="Search icons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="grid max-h-60 grid-cols-6 gap-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className="flex flex-col items-center gap-1 rounded p-2 text-xs text-gray-500 hover:bg-gray-100"
            >
              <Circle className="size-4 opacity-30" />
              None
            </button>
            {filtered.map(({ name, Icon }) => (
              <button
                key={name}
                type="button"
                onClick={() => handleSelect(name)}
                className={`flex flex-col items-center gap-1 rounded p-2 text-xs hover:bg-gray-100 ${
                  value === name ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                }`}
                title={name}
              >
                <Icon className="size-4" />
                <span className="truncate">{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/admin/form/IconPicker.tsx
git commit -m "feat(menu): add IconPicker component for lucide icon selection"
```

---

## Task 10: Frontend MenuItemForm Component

**Files:**
- Create: `frontend/components/admin/form/MenuItemForm.tsx`

- [ ] **Step 1: Create `frontend/components/admin/form/MenuItemForm.tsx`**

```typescript
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IconPicker } from './IconPicker';
import { ADMIN_PAGES } from '@/lib/adminMenuRegistry';
import type { MenuItem, MenuItemType } from '@/lib/types';

interface MenuItemFormProps {
  initial?: MenuItem;
  parentOptions: { id: string; label: string }[];
}

export function MenuItemForm({ initial, parentOptions }: MenuItemFormProps) {
  const router = useRouter();
  const [id, setId] = useState(initial?.id ?? '');
  const [parentId, setParentId] = useState(initial?.parent_id ?? '');
  const [type, setType] = useState<MenuItemType>(initial?.type ?? 'page');
  const [pageId, setPageId] = useState(initial?.page_id ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [isVisible, setIsVisible] = useState(initial?.is_visible ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleTypeChange(newType: MenuItemType) {
    setType(newType);
    // Clear opposite-type fields.
    if (newType === 'page') setUrl('');
    if (newType === 'link') setPageId('');
    if (newType === 'group') {
      setPageId('');
      setUrl('');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const body: Record<string, unknown> = {
      id,
      parent_id: parentId || null,
      type,
      label,
      icon,
      sort_order: Number(sortOrder),
      is_visible: isVisible,
    };
    if (type === 'page') body.page_id = pageId;
    if (type === 'link') body.url = url;

    try {
      const reqUrl = initial
        ? `/api/admin/menu/${encodeURIComponent(initial.id)}`
        : '/api/admin/menu';
      const method = initial ? 'PUT' : 'POST';
      // For PUT, do not include `id` in body (it's immutable).
      if (initial) delete body.id;
      const res = await fetch(reqUrl, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/menu');
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Save failed (status ${res.status})`);
    } catch {
      setError('Network error, try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!window.confirm('Delete this menu item?')) return;
    try {
      const res = await fetch(`/api/admin/menu/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/menu');
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Delete failed (status ${res.status})`);
    } catch {
      setError('Network error, try again');
    }
  }

  const inputClass =
    'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      {/* Type */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Type</label>
        <div className="flex gap-4">
          {(['page', 'link', 'group'] as MenuItemType[]).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                onChange={() => handleTypeChange(t)}
              />
              <span className="capitalize">{t}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ID */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="id" className="text-sm font-medium text-gray-700">
          ID
        </label>
        <input
          id="id"
          type="text"
          required
          value={id}
          onChange={(e) => setId(e.target.value)}
          disabled={!!initial}
          className={inputClass}
        />
        {initial && (
          <p className="text-xs text-gray-500">ID cannot be changed after creation.</p>
        )}
      </div>

      {/* Label */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="label" className="text-sm font-medium text-gray-700">
          Label
        </label>
        <input
          id="label"
          type="text"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* Parent */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="parent_id" className="text-sm font-medium text-gray-700">
          Parent
        </label>
        <select
          id="parent_id"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className={inputClass}
        >
          <option value="">None (Top Level)</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Page selector (type=page) */}
      {type === 'page' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="page_id" className="text-sm font-medium text-gray-700">
            Page
          </label>
          <select
            id="page_id"
            required
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select a page...</option>
            {ADMIN_PAGES.map((p) => (
              <option key={p.pageId} value={p.pageId}>
                {p.defaultLabel} ({p.href})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* URL (type=link) */}
      {type === 'link' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="url" className="text-sm font-medium text-gray-700">
            URL
          </label>
          <input
            id="url"
            type="text"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/admin/custom or https://example.com"
            className={inputClass}
          />
        </div>
      )}

      {/* Icon */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Icon</label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      {/* Sort Order */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sort_order" className="text-sm font-medium text-gray-700">
          Sort Order
        </label>
        <input
          id="sort_order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
          className={inputClass}
        />
      </div>

      {/* Visible */}
      <div className="flex items-center gap-2">
        <input
          id="is_visible"
          type="checkbox"
          checked={isVisible}
          onChange={(e) => setIsVisible(e.target.checked)}
        />
        <label htmlFor="is_visible" className="text-sm font-medium text-gray-700">
          Visible in sidebar
        </label>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link
          href="/admin/menu"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Cancel
        </Link>
        {initial && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/admin/form/MenuItemForm.tsx
git commit -m "feat(menu): add MenuItemForm component with type switcher and icon picker"
```

---

## Task 11: Frontend Menu List Page

**Files:**
- Create: `frontend/app/admin/(dashboard)/menu/page.tsx`

- [ ] **Step 1: Create `frontend/components/admin/menu/MenuSortButtons.tsx`**

Sort buttons require client-side interaction, so they live in a separate client component imported by the server-rendered list page.

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface MenuSortButtonsProps {
  id: string;
}

export function MenuSortButtons({ id }: MenuSortButtonsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSort(direction: 'up' | 'down') {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/menu/${encodeURIComponent(id)}/sort`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // ignore — user can retry
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center">
      <button
        type="button"
        disabled={busy}
        onClick={() => handleSort('up')}
        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
        title="Move up"
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => handleSort('down')}
        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
        title="Move down"
      >
        <ChevronDown className="size-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/app/admin/(dashboard)/menu/page.tsx`**

The list page is a server component. It fetches the flat item list, builds a tree in memory, and renders parent rows followed by their indented children. Sort buttons and Edit links are rendered per row.

```typescript
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { MenuSortButtons } from '@/components/admin/menu/MenuSortButtons';
import type { MenuItem } from '@/lib/types';

export default async function MenuListPage() {
  const items = await adminApi.adminMenu.all();

  const topLevel = items.filter((i) => i.parent_id === null);
  const childrenOf = (parentId: string) =>
    items.filter((i) => i.parent_id === parentId);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Menu Items</h1>
        <Link
          href="/admin/menu/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          + New Item
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Sort</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {topLevel.flatMap((parent) => {
              const children = childrenOf(parent.id);
              return [
                <Row key={parent.id} item={parent} />,
                ...children.map((child) => (
                  <Row key={child.id} item={child} isChild />
                )),
              ];
            })}
            {topLevel.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No menu items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ item, isChild = false }: { item: MenuItem; isChild?: boolean }) {
  return (
    <tr className={`border-b border-gray-100 last:border-0 ${isChild ? 'bg-gray-50' : ''}`}>
      <td className={`px-4 py-3 ${isChild ? 'pl-8' : ''} ${item.is_visible ? 'text-gray-900' : 'text-gray-400'}`}>
        {isChild ? '↳ ' : ''}{item.label}
        {!item.is_visible && (
          <span className="ml-2 text-xs text-gray-400">(Hidden)</span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600">{item.type}</td>
      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
        {item.type === 'page' && item.page_id}
        {item.type === 'link' && item.url}
        {item.type === 'group' && '—'}
      </td>
      <td className="px-4 py-3 text-gray-600">{item.sort_order}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <MenuSortButtons id={item.id} />
          <Link
            href={`/admin/menu/${encodeURIComponent(item.id)}`}
            className="text-blue-600 hover:underline"
          >
            Edit
          </Link>
        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/admin/(dashboard)/menu/page.tsx frontend/components/admin/menu/MenuSortButtons.tsx
git commit -m "feat(menu): add menu list page with tree display and sort buttons"
```

---

## Task 12: Frontend New/Edit Pages

**Files:**
- Create: `frontend/app/admin/(dashboard)/menu/new/page.tsx`
- Create: `frontend/app/admin/(dashboard)/menu/[id]/page.tsx`

- [ ] **Step 1: Create `frontend/app/admin/(dashboard)/menu/new/page.tsx`**

```typescript
import { adminApi } from '@/lib/adminApi';
import { MenuItemForm } from '@/components/admin/form/MenuItemForm';

export default async function NewMenuItemPage() {
  // Fetch existing top-level groups to populate parent select.
  const items = await adminApi.adminMenu.all();
  const parentOptions = items
    .filter((i) => i.type === 'group' && i.parent_id === null)
    .map((i) => ({ id: i.id, label: i.label }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Menu Item</h1>
      <MenuItemForm parentOptions={parentOptions} />
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/app/admin/(dashboard)/menu/[id]/page.tsx`**

```typescript
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { MenuItemForm } from '@/components/admin/form/MenuItemForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditMenuItemPage({ params }: PageProps) {
  const { id } = await params;
  const [item, allItems] = await Promise.all([
    adminApi.adminMenu.getById(id),
    adminApi.adminMenu.all(),
  ]);
  if (!item) notFound();

  // Exclude self and non-group items from parent options.
  const parentOptions = allItems
    .filter((i) => i.type === 'group' && i.parent_id === null && i.id !== id)
    .map((i) => ({ id: i.id, label: i.label }));

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/menu" className="hover:underline">
          Menu Items
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{item.label}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Menu Item</h1>
      <MenuItemForm initial={item} parentOptions={parentOptions} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/admin/(dashboard)/menu/new/page.tsx "frontend/app/admin/(dashboard)/menu/[id]/page.tsx"
git commit -m "feat(menu): add new and edit pages for menu items"
```

---

## Task 13: Frontend AdminSidebar Refactor

**Files:**
- Modify: `frontend/components/admin/layout/AdminSidebar.tsx`

- [ ] **Step 1: Rewrite `frontend/components/admin/layout/AdminSidebar.tsx`**

```typescript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Cable, Tag, Factory, FolderOpen, Image,
  Wrench, Settings, ExternalLink, LogOut, Circle,
  ChevronDown, ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { ADMIN_PAGES, PAGE_BY_ID } from '@/lib/adminMenuRegistry';
import type { MenuItemTree } from '@/lib/types';

// Fallback icon mapping for sidebar rendering.
const FALLBACK_ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Cable, Tag, Factory, FolderOpen, Image, Wrench, Settings,
};

function getIcon(name: string | null): LucideIcon {
  if (!name) return Circle;
  // Try the fallback map first (covers all seed icons).
  if (FALLBACK_ICONS[name]) return FALLBACK_ICONS[name];
  // For other lucide icons, we'd need a dynamic import. For MVP, fall back.
  return Circle;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [tree, setTree] = useState<MenuItemTree[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function fetchTree() {
      try {
        const res = await fetch('/api/admin/menu/tree');
        if (!res.ok) throw new Error('fetch failed');
        const data: MenuItemTree[] = await res.json();
        if (cancelled) return;
        setTree(data);
        // Auto-expand groups whose children match the current path.
        const initialOpen = new Set<string>();
        for (const item of data) {
          if (item.type === 'group' && item.children) {
            for (const child of item.children) {
              if (child.type === 'page' && child.page_id) {
                const href = PAGE_BY_ID[child.page_id]?.href;
                if (href && isActive(pathname, href)) {
                  initialOpen.add(item.id);
                  break;
                }
              }
            }
          }
        }
        setOpenGroups(initialOpen);
      } catch {
        // Fallback: build a minimal tree from ADMIN_PAGES constant.
        if (cancelled) return;
        const fallback: MenuItemTree[] = ADMIN_PAGES.map((p, idx) => ({
          id: p.pageId,
          parent_id: null,
          type: 'page' as const,
          page_id: p.pageId,
          url: null,
          label: p.defaultLabel,
          icon: p.defaultIcon,
          sort_order: idx,
          is_visible: true,
          created_at: '',
          updated_at: '',
          children: [],
        }));
        setTree(fallback);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTree();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function handleLogout() {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch {
      // ignore — proceed to login regardless
    }
    router.push('/admin/login');
  }

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function renderItem(item: MenuItemTree) {
    const Icon = getIcon(item.icon);

    if (item.type === 'group') {
      const isOpen = openGroups.has(item.id);
      const childActive = (item.children ?? []).some((c) => {
        if (c.type === 'page' && c.page_id) {
          const href = PAGE_BY_ID[c.page_id]?.href;
          return href ? isActive(pathname, href) : false;
        }
        return false;
      });
      return (
        <div key={item.id}>
          <button
            type="button"
            onClick={() => toggleGroup(item.id)}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
              childActive
                ? 'bg-gray-800 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            {isOpen ? (
              <ChevronDown className="size-3 shrink-0" />
            ) : (
              <ChevronRight className="size-3 shrink-0" />
            )}
          </button>
          {isOpen && (item.children ?? []).length > 0 && (
            <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-gray-700 pl-2">
              {item.children.map((child) => renderItem(child))}
            </div>
          )}
        </div>
      );
    }

    // page or link
    let href: string | null = null;
    let external = false;
    if (item.type === 'page' && item.page_id) {
      href = PAGE_BY_ID[item.page_id]?.href ?? null;
    } else if (item.type === 'link' && item.url) {
      href = item.url;
      external = href.startsWith('http');
    }

    if (!href) return null;

    const active = !external && isActive(pathname, href);

    if (external) {
      return (
        <a
          key={item.id}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
        >
          <Icon className="size-4 shrink-0" />
          {item.label}
          <ExternalLink className="ml-auto size-3 shrink-0 text-gray-500" />
        </a>
      );
    }

    return (
      <Link
        key={item.id}
        href={href}
        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
          active
            ? 'bg-gray-800 text-white'
            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
        }`}
      >
        <Icon className="size-4 shrink-0" />
        {item.label}
      </Link>
    );
  }

  return (
    <aside className="sticky top-0 z-40 flex h-screen w-56 shrink-0 flex-col bg-gray-900 p-4 text-gray-100">
      <div className="mb-6 px-2 text-lg font-bold tracking-tight">
        Unowire <span className="text-gray-400">Admin</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {loading ? (
          <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>
        ) : (
          (tree ?? []).map((item) => renderItem(item))
        )}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
        >
          <ExternalLink className="size-4 shrink-0" />
          View Site
        </a>
      </nav>
      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
      >
        <LogOut className="size-4 shrink-0" />
        Logout
      </button>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/admin/layout/AdminSidebar.tsx
git commit -m "feat(menu): refactor AdminSidebar to fetch tree from API with collapse/expand"
```

---

## Task 14: Build, Verify, and Final Commit

**Files:** None (verification only)

- [ ] **Step 1: Rebuild backend container**

```bash
docker compose --env-file .env.docker up -d --build backend
```

Expected: backend starts successfully, no import errors.

- [ ] **Step 2: Rebuild frontend container**

```bash
docker compose --env-file .env.docker up -d --build frontend
```

Expected: frontend builds without TypeScript errors.

- [ ] **Step 3: Verify API endpoints**

```bash
# Tree endpoint (no auth required)
docker compose --env-file .env.docker exec backend python -c "import urllib.request, json; data = json.loads(urllib.request.urlopen('http://localhost:8000/api/admin/menu/tree').read()); print(json.dumps([{'id': i['id'], 'type': i['type'], 'label': i['label'], 'children_count': len(i.get('children', []))} for i in data], indent=2))"
```

Expected: 8 top-level items, `equipment` group with 3 children.

- [ ] **Step 4: Browser smoke test**

Open `http://localhost:3000/admin` in browser, login as `admin@unowire.com` / `admin123456`:

1. Sidebar should render 8 top-level items + Equipment group expandable to 3 children.
2. Click "Menu Config" — should navigate to `/admin/menu` and display tree of 11 items.
3. Click "+ New Item" — form should render with Type radio (Page/Link/Group).
4. Select Type=Page — Page selector should appear with 10 options.
5. Select Type=Link — URL input should appear.
6. Select Type=Group — both Page and URL should be hidden.
7. Click Edit on any item — form should be prefilled.
8. Click ↑/↓ sort buttons — list should reorder after refresh.
9. Sidebar should reflect any changes immediately (router.refresh triggers).

- [ ] **Step 5: Final commit (if any uncommitted changes remain)**

```bash
git status
# If there are uncommitted changes:
git add -A
git commit -m "chore(menu): final adjustments after smoke test"
```

---

## Spec Coverage Checklist

After implementing all tasks, verify each spec requirement is covered:

- [x] Single `admin_menu_items` table with `type` discrimination — Task 1
- [x] Self-referencing `parent_id`, max 2 levels — Task 1 (model) + Task 3 (validation)
- [x] `page_id` whitelist validation — Task 3 (`validate_page_id`)
- [x] `menu-config` protected from deletion — Task 3 (`assert_not_protected`)
- [x] Conditional type-field validation — Task 2 (schema) + Task 3 (CRUD)
- [x] Tree endpoint excludes hidden items — Task 3 (`get_tree`)
- [x] Flat endpoint returns all items — Task 3 (`get_flat`)
- [x] Sort up/down with boundary errors — Task 3 (`move`)
- [x] Cascade delete — Task 1 (model `ondelete='CASCADE'`)
- [x] Migration with seed (11 items) — Task 5
- [x] Backend tests — Task 6
- [x] Frontend page registry constant — Task 7
- [x] Frontend adminApi namespace — Task 7
- [x] Frontend proxy routes — Task 8
- [x] IconPicker component — Task 9
- [x] MenuItemForm with type switcher — Task 10
- [x] Menu list page with sort buttons — Task 11
- [x] New/Edit pages — Task 12
- [x] AdminSidebar refactor with collapse/expand + fallback — Task 13
- [x] Build and smoke test — Task 14
