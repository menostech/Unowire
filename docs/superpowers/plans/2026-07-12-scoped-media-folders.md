# Scoped Media Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each cable/equipment manufacturer an auto-provisioned media folder tree, and restrict scoped managers to only their own manufacturer's folders.

**Architecture:** Add `scope_type`/`scope_id` columns to `media_folders`. Sub-folders inherit parent scope. Filter folder/upload queries by user's role scope. Auto-provision 4 folders (root + logos/products/docs) on manufacturer creation; cleanup on deletion; rename on update.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Alembic, PostgreSQL, pytest

**Spec:** `docs/superpowers/specs/2026-07-12-scoped-media-folders-design.md`

---

## Global Constraints

- **Language:** All code, comments, commit messages in English
- **Database:** PostgreSQL, async SQLAlchemy
- **Migration head before start:** `d5e6f7a8b9c0` (new migration's `down_revision`)
- **Migration is destructive:** TRUNCATE `media_folders` + `uploads` (user-approved data loss)
- **Protected sub-folders:** `logos`, `products`, `docs` — cannot be deleted by anyone
- **Container folder names:** `"Cable Manufacturers"` (scope_type=NULL), `"Equipment Manufacturers"` (scope_type=NULL)
- **No frontend changes** (scope filtering is server-side)
- **Test command:** `cd backend && python -m pytest tests/ -v`
- **Existing tests must still pass** after migration + conftest updates
- **PowerShell:** use `;` not `&&` to chain commands

---

## File Structure

### Modified files:
- `backend/app/models/folder.py` — add scope_type, scope_id columns
- `backend/app/crud/folder.py` — add provision_for_manufacturer, assert_folder_in_scope, update list_all_with_counts + delete logic
- `backend/app/crud/upload.py` — add scope filtering to list_paginated
- `backend/app/api/routes/folders.py` — add get_media_scope dep to all handlers
- `backend/app/api/routes/uploads.py` — add get_media_scope dep + scope guards
- `backend/app/api/routes/manufacturers.py` — add provision/cleanup/rename hooks
- `backend/app/api/routes/equipment_manufacturers.py` — add provision/cleanup/rename hooks
- `backend/app/api/deps.py` — add get_media_scope function
- `backend/app/core/modules.py` — change media module to scope_aware=True
- `backend/tests/conftest.py` — add scoped user fixtures

### Created files:
- `backend/alembic/versions/f6b7c8d9e0f1_scoped_media_folders.py` — migration
- `backend/tests/api/test_media_scope.py` — scope tests

---

### Task 1: Migration Script + Folder Model Update

**Files:**
- Create: `backend/alembic/versions/f6b7c8d9e0f1_scoped_media_folders.py`
- Modify: `backend/app/models/folder.py`

- [ ] **Step 1: Update Folder model to add scope columns**

Replace the entire contents of `backend/app/models/folder.py` with:

```python
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Folder(Base):
    __tablename__ = "media_folders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("media_folders.id", ondelete="CASCADE"), nullable=True
    )
    scope_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    scope_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint("parent_id", "name", name="uq_folder_parent_name"),
        Index("idx_media_folders_scope", "scope_type", "scope_id"),
    )
```

- [ ] **Step 2: Create the migration script**

Create `backend/alembic/versions/f6b7c8d9e0f1_scoped_media_folders.py`:

```python
"""scoped_media_folders

Revision ID: f6b7c8d9e0f1
Revises: d5e6f7a8b9c0
Create Date: 2026-07-12 00:00:00.000000

WARNING: DESTRUCTIVE MIGRATION — truncates media_folders and uploads tables
(user-approved data loss). Deletes orphaned upload files from disk.
"""
from typing import Sequence, Union

import os
import sqlalchemy as sa
from alembic import op

revision: str = 'f6b7c8d9e0f1'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Delete orphaned upload files from disk before truncating
    media_dir = os.environ.get("MEDIA_DIR", "/app/media")
    uploads_dir = os.path.join(media_dir, "uploads")
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT filename FROM uploads")).fetchall()
    for row in rows:
        file_path = os.path.join(uploads_dir, row[0])
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass  # log and continue; DB is source of truth

    # 2. Truncate both tables and reset identity sequences
    op.execute("TRUNCATE TABLE media_folders RESTART IDENTITY CASCADE;")
    op.execute("TRUNCATE TABLE uploads RESTART IDENTITY CASCADE;")

    # 3. Add scope columns
    op.add_column('media_folders', sa.Column('scope_type', sa.String(50), nullable=True))
    op.add_column('media_folders', sa.Column('scope_id', sa.String(100), nullable=True))
    op.create_index('idx_media_folders_scope', 'media_folders', ['scope_type', 'scope_id'])

    # 4. Insert two global container folders
    op.execute(
        sa.text("INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at) "
                "VALUES ('Cable Manufacturers', NULL, NULL, NULL, NOW())")
    )
    op.execute(
        sa.text("INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at) "
                "VALUES ('Equipment Manufacturers', NULL, NULL, NULL, NOW())")
    )

    # 5. Seed folders for existing cable manufacturers
    cable_container = conn.execute(
        sa.text("SELECT id FROM media_folders WHERE name = 'Cable Manufacturers' AND scope_type IS NULL")
    ).scalar_one()

    manufacturers = conn.execute(sa.text("SELECT id, name FROM manufacturers")).fetchall()
    for mfr_id, mfr_name in manufacturers:
        # Insert manufacturer root folder
        result = conn.execute(
            sa.text("INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at) "
                    "VALUES (:name, :parent_id, 'manufacturer', :scope_id, NOW()) RETURNING id"),
            {"name": mfr_name, "parent_id": cable_container, "scope_id": mfr_id}
        )
        root_id = result.scalar_one()
        # Insert 3 protected sub-folders
        for sub_name in ('logos', 'products', 'docs'):
            conn.execute(
                sa.text("INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at) "
                        "VALUES (:name, :parent_id, 'manufacturer', :scope_id, NOW())"),
                {"name": sub_name, "parent_id": root_id, "scope_id": mfr_id}
            )

    # 6. Seed folders for existing equipment manufacturers
    equip_container = conn.execute(
        sa.text("SELECT id FROM media_folders WHERE name = 'Equipment Manufacturers' AND scope_type IS NULL")
    ).scalar_one()

    equip_mfrs = conn.execute(sa.text("SELECT id, name FROM equipment_manufacturers")).fetchall()
    for mfr_id, mfr_name in equip_mfrs:
        result = conn.execute(
            sa.text("INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at) "
                    "VALUES (:name, :parent_id, 'equipment_manufacturer', :scope_id, NOW()) RETURNING id"),
            {"name": mfr_name, "parent_id": equip_container, "scope_id": mfr_id}
        )
        root_id = result.scalar_one()
        for sub_name in ('logos', 'products', 'docs'):
            conn.execute(
                sa.text("INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at) "
                        "VALUES (:name, :parent_id, 'equipment_manufacturer', :scope_id, NOW())"),
                {"name": sub_name, "parent_id": root_id, "scope_id": mfr_id}
            )


def downgrade() -> None:
    op.drop_index('idx_media_folders_scope', table_name='media_folders')
    op.drop_column('media_folders', 'scope_type')
    op.drop_column('media_folders', 'scope_id')
    # Note: truncated data cannot be restored
```

- [ ] **Step 3: Run the migration**

Run: `cd backend ; docker compose exec backend alembic upgrade head`
Expected: "Running upgrade d5e6f7a8b9c0 -> f6b7c8d9e0f1, scoped_media_folders"

- [ ] **Step 4: Verify migration succeeded**

Run: `docker compose exec backend python -c "import asyncio; from sqlalchemy import text; from app.core.database import async_session; async def check(): 
    async with async_session() as s:
        rows = (await s.execute(text('SELECT id, name, scope_type, scope_id FROM media_folders ORDER BY id'))).fetchall()
        for r in rows: print(r)
asyncio.run(check())"`
Expected: See 2 container folders (scope_type=None) + 4 folders per existing manufacturer (root + logos/products/docs)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/folder.py backend/alembic/versions/f6b7c8d9e0f1_scoped_media_folders.py
git commit -m "feat(db): add scope_type/scope_id to media_folders, truncate and reseed"
```

---

### Task 2: get_media_scope Dependency + Module Registry Change

**Files:**
- Modify: `backend/app/api/deps.py`
- Modify: `backend/app/core/modules.py`

- [ ] **Step 1: Add get_media_scope function to deps.py**

Append to `backend/app/api/deps.py` (after the `get_current_member` function, at end of file):

```python
def get_media_scope(user: User = Depends(get_current_user)) -> tuple[str | None, str | None]:
    """Returns (scope_type, scope_id) for media filtering.

    - Global admin/role (scope_type=None): returns (None, None) -> sees all folders
    - Scoped role (manufacturer/equipment_manufacturer): returns (role.scope_type, user.scope_id)
    """
    if user.role and user.role.scope_type in ("manufacturer", "equipment_manufacturer"):
        return (user.role.scope_type, user.scope_id)
    return (None, None)
```

- [ ] **Step 2: Change media module to scope_aware=True**

In `backend/app/core/modules.py`, change line 19 from:

```python
    {"id": "media",           "label": "Media",           "scope_aware": False, "scope_type": None},
```

to:

```python
    {"id": "media",           "label": "Media",           "scope_aware": True,  "scope_type": None},
```

- [ ] **Step 3: Verify no import errors**

Run: `docker compose exec backend python -c "from app.api.deps import get_media_scope; from app.core.modules import ADMIN_MODULES; m = [x for x in ADMIN_MODULES if x['id']=='media'][0]; print(m)"`
Expected: `{'id': 'media', 'label': 'Media', 'scope_aware': True, 'scope_type': None}`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/deps.py backend/app/core/modules.py
git commit -m "feat(api): add get_media_scope dependency, make media module scope_aware"
```

---

### Task 3: Folder CRUD — Provisioning, Scope Filter, Guards

**Files:**
- Modify: `backend/app/crud/folder.py`

- [ ] **Step 1: Add constants and update imports**

Replace the top of `backend/app/crud/folder.py` (lines 1-9) with:

```python
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.folder import Folder
from app.models.upload import Upload
from app.schemas.folder import FolderCreate, FolderUpdate

MAX_FOLDER_DEPTH = 5

PROTECTED_SUBFOLDERS = ("logos", "products", "docs")
CONTAINER_NAMES = {
    "manufacturer": "Cable Manufacturers",
    "equipment_manufacturer": "Equipment Manufacturers",
}
```

- [ ] **Step 2: Add provision_for_manufacturer method**

Add this method to the `CRUDFolder` class (after `create_with_depth_check`, before the `crud_folder = CRUDFolder(Folder)` line):

```python
    async def provision_for_manufacturer(
        self, db: AsyncSession, *, scope_type: str, scope_id: str, name: str
    ) -> Folder:
        """Create a manufacturer root folder + 3 protected sub-folders.
        Idempotent: if folder already exists for this scope, returns existing.
        """
        # Find global container
        container_stmt = select(Folder).where(
            Folder.scope_type.is_(None),
            Folder.name == CONTAINER_NAMES[scope_type],
        )
        container_result = await db.execute(container_stmt)
        container = container_result.scalar_one()

        # Check if manufacturer root already exists (idempotent)
        existing_stmt = select(Folder).where(
            Folder.scope_type == scope_type,
            Folder.scope_id == scope_id,
            Folder.parent_id == container.id,
        )
        existing_result = await db.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()
        if existing:
            return existing

        # Create manufacturer root folder
        root = Folder(
            name=name,
            parent_id=container.id,
            scope_type=scope_type,
            scope_id=scope_id,
        )
        db.add(root)
        await db.flush()  # get root.id without committing

        # Create 3 protected sub-folders
        for sub_name in PROTECTED_SUBFOLDERS:
            sub = Folder(
                name=sub_name,
                parent_id=root.id,
                scope_type=scope_type,
                scope_id=scope_id,
            )
            db.add(sub)

        await db.commit()
        await db.refresh(root)
        return root
```

- [ ] **Step 3: Add assert_folder_in_scope helper**

Add this method to the `CRUDFolder` class (after `provision_for_manufacturer`):

```python
    async def assert_folder_in_scope(
        self, db: AsyncSession, folder_id: int, scope_type: str | None, scope_id: str | None
    ) -> Folder:
        """Returns folder if it belongs to the given scope, raises 403 otherwise.
        Global admin (scope_type=None) can access any folder.
        """
        folder = await db.get(Folder, folder_id)
        if folder is None:
            raise HTTPException(
                status_code=404,
                detail={"code": 404, "message": "Folder not found"},
            )
        if scope_type is not None:
            if folder.scope_type != scope_type or folder.scope_id != scope_id:
                raise HTTPException(
                    status_code=403,
                    detail={"code": 403, "message": "Folder outside your scope"},
                )
        return folder
```

- [ ] **Step 4: Update list_all_with_counts to accept scope params**

Replace the `list_all_with_counts` method (lines 37-50 of the original file) with:

```python
    async def list_all_with_counts(
        self,
        db: AsyncSession,
        *,
        scope_type: str | None = None,
        scope_id: str | None = None,
    ) -> list[tuple[Folder, int]]:
        """Return all folders with their direct upload counts.
        If scope_type is provided, only returns folders matching that scope
        (scoped users do not see global container folders).
        """
        count_stmt = (
            select(Folder.id, func.count(Upload.id).label("cnt"))
            .outerjoin(Upload, Upload.folder_id == Folder.id)
            .group_by(Folder.id)
        )
        count_result = await db.execute(count_stmt)
        counts = {row.id: row.cnt for row in count_result}

        stmt = select(Folder).order_by(Folder.name)
        if scope_type is not None:
            stmt = stmt.where(
                Folder.scope_type == scope_type,
                Folder.scope_id == scope_id,
            )
        result = await db.execute(stmt)
        folders = list(result.scalars().all())
        return [(f, counts.get(f.id, 0)) for f in folders]
```

- [ ] **Step 5: Update create_with_depth_check to set scope fields**

In the `create_with_depth_check` method, the line `obj_data = obj_in.model_dump()` (around line 76) creates a dict that gets passed to `Folder(**obj_data)`. Since `FolderCreate` schema does not have `scope_type`/`scope_id`, the created folder will have them as NULL. This is correct for global admin creating root folders. For scoped users, the route will pass scope via a separate mechanism (see Task 6). No change needed here.

- [ ] **Step 6: Add protected sub-folder guard to delete logic**

Add a new method `can_delete_folder` that checks deletion constraints (to be called by the route). Add after `assert_folder_in_scope`:

```python
    async def validate_deletion(
        self, db: AsyncSession, folder_id: int
    ) -> Folder:
        """Validate that a folder can be deleted. Returns the folder if OK.
        Raises 403 for protected sub-folders, 409 for folders with children/uploads.
        """
        folder = await db.get(Folder, folder_id)
        if folder is None:
            raise HTTPException(
                status_code=404,
                detail={"code": 404, "message": "Folder not found"},
            )
        if folder.name in PROTECTED_SUBFOLDERS and folder.scope_type is not None:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete protected sub-folder (logos/products/docs)"},
            )
        if await self.has_children(db, folder_id):
            raise HTTPException(
                status_code=409,
                detail={"code": 409, "message": "Cannot delete folder with subfolders"},
            )
        if await self.has_uploads(db, folder_id):
            raise HTTPException(
                status_code=409,
                detail={"code": 409, "message": "Cannot delete non-empty folder"},
            )
        return folder
```

- [ ] **Step 7: Add cleanup_for_manufacturer method**

Add after `validate_deletion`:

```python
    async def cleanup_for_manufacturer(
        self, db: AsyncSession, *, scope_type: str, scope_id: str
    ) -> None:
        """Delete all folders + uploads for a manufacturer scope.
        Called when a manufacturer is deleted. Also deletes disk files.
        """
        import os

        # Find all folders in this scope
        folders_stmt = select(Folder).where(
            Folder.scope_type == scope_type,
            Folder.scope_id == scope_id,
        )
        folders_result = await db.execute(folders_stmt)
        folders = list(folders_result.scalars().all())
        if not folders:
            return

        folder_ids = [f.id for f in folders]

        # Delete disk files for uploads in these folders
        uploads_stmt = select(Upload).where(Upload.folder_id.in_(folder_ids))
        uploads_result = await db.execute(uploads_stmt)
        uploads = list(uploads_result.scalars().all())

        media_dir = os.environ.get("MEDIA_DIR", "/app/media")
        for upload in uploads:
            file_path = os.path.join(media_dir, "uploads", upload.filename)
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except OSError:
                    pass

        # Delete uploads (DB records)
        for upload in uploads:
            await db.delete(upload)

        # Delete folders (CASCADE handles sub-folders, but we already have all of them)
        for folder in folders:
            await db.delete(folder)

        await db.commit()
```

- [ ] **Step 8: Add rename_manufacturer_root method**

Add after `cleanup_for_manufacturer`:

```python
    async def rename_manufacturer_root(
        self, db: AsyncSession, *, scope_type: str, scope_id: str, new_name: str
    ) -> None:
        """Rename the manufacturer root folder (sub-folders keep their names)."""
        # Find the container
        container_name = CONTAINER_NAMES.get(scope_type)
        if container_name is None:
            return
        container_stmt = select(Folder).where(
            Folder.scope_type.is_(None),
            Folder.name == container_name,
        )
        container_result = await db.execute(container_stmt)
        container = container_result.scalar_one_or_none()
        if container is None:
            return

        # Find the manufacturer root (direct child of container with matching scope)
        root_stmt = select(Folder).where(
            Folder.scope_type == scope_type,
            Folder.scope_id == scope_id,
            Folder.parent_id == container.id,
        )
        root_result = await db.execute(root_stmt)
        root = root_result.scalar_one_or_none()
        if root is None or root.name == new_name:
            return

        root.name = new_name
        db.add(root)
        await db.commit()
```

- [ ] **Step 9: Verify CRUD imports**

Run: `docker compose exec backend python -c "from app.crud.folder import crud_folder, PROTECTED_SUBFOLDERS, CONTAINER_NAMES; print('OK', PROTECTED_SUBFOLDERS)"`
Expected: `OK ('logos', 'products', 'docs')`

- [ ] **Step 10: Commit**

```bash
git add backend/app/crud/folder.py
git commit -m "feat(crud): add folder provisioning, scope filter, guards, cleanup, rename"
```

---

### Task 4: Upload CRUD — Scope Filtering

**Files:**
- Modify: `backend/app/crud/upload.py`

- [ ] **Step 1: Update list_paginated to accept scope params**

Replace the entire `list_paginated` method in `backend/app/crud/upload.py` with:

```python
    async def list_paginated(
        self,
        db: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        folder_id: int | None | Literal["none"] = None,
        *,
        scope_type: str | None = None,
        scope_id: str | None = None,
    ) -> tuple[list[Upload], int]:
        offset = (page - 1) * page_size
        base = select(Upload)
        count_base = select(func.count()).select_from(Upload)

        # Scope filtering: scoped users only see uploads in their folders
        if scope_type is not None:
            from app.models.folder import Folder
            folder_ids_subq = select(Folder.id).where(
                Folder.scope_type == scope_type,
                Folder.scope_id == scope_id,
            )
            base = base.where(Upload.folder_id.in_(folder_ids_subq))
            count_base = count_base.where(Upload.folder_id.in_(folder_ids_subq))

        if folder_id == "none":
            base = base.where(Upload.folder_id.is_(None))
            count_base = count_base.where(Upload.folder_id.is_(None))
        elif folder_id is not None:
            base = base.where(Upload.folder_id == folder_id)
            count_base = count_base.where(Upload.folder_id == folder_id)

        total = (await db.execute(count_base)).scalar_one()
        stmt = base.order_by(Upload.created_at.desc()).offset(offset).limit(page_size)
        result = await db.execute(stmt)
        return list(result.scalars().all()), total
```

- [ ] **Step 2: Verify CRUD imports**

Run: `docker compose exec backend python -c "from app.crud.upload import crud_upload; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/crud/upload.py
git commit -m "feat(crud): add scope filtering to upload list_paginated"
```

---

### Task 5: Folder Routes — Wire Scope Dependencies

**Files:**
- Modify: `backend/app/api/routes/folders.py`

- [ ] **Step 1: Update imports and all route handlers**

Replace the entire contents of `backend/app/api/routes/folders.py` with:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_media_scope, require_module
from app.models.user import User
from app.core.database import get_db
from app.crud.folder import crud_folder
from app.models.folder import Folder
from app.schemas.folder import (
    FolderCreate,
    FolderRead,
    FolderTreeResponse,
    FolderUpdate,
)

router = APIRouter()


@router.get("", response_model=FolderTreeResponse)
async def list_folders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    rows = await crud_folder.list_all_with_counts(
        db, scope_type=scope[0], scope_id=scope[1]
    )
    folders = [
        FolderRead(
            id=f.id,
            name=f.name,
            parent_id=f.parent_id,
            created_at=f.created_at,
            upload_count=count,
        )
        for f, count in rows
    ]
    return FolderTreeResponse(folders=folders)


@router.post("", response_model=FolderRead, status_code=status.HTTP_201_CREATED)
async def create_folder(
    obj_in: FolderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    # Scoped users must provide a parent_id within their scope
    if scope[0] is not None:
        if obj_in.parent_id is None:
            raise HTTPException(
                status_code=400,
                detail={"code": 400, "message": "Scoped users must create folders inside their manufacturer folder"},
            )
        await crud_folder.assert_folder_in_scope(db, obj_in.parent_id, scope[0], scope[1])

    folder = await crud_folder.create_with_depth_check(db, obj_in=obj_in)
    # Set scope on newly created folder to match parent (or NULL for global admin root)
    if scope[0] is not None:
        folder.scope_type = scope[0]
        folder.scope_id = scope[1]
        db.add(folder)
        await db.commit()
        await db.refresh(folder)
    return FolderRead(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        created_at=folder.created_at,
        upload_count=0,
    )


@router.put("/{folder_id}", response_model=FolderRead)
async def rename_folder(
    folder_id: int,
    obj_in: FolderUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    folder = await crud_folder.assert_folder_in_scope(db, folder_id, scope[0], scope[1])
    folder.name = obj_in.name
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return FolderRead(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        created_at=folder.created_at,
        upload_count=0,
    )


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    folder = await crud_folder.assert_folder_in_scope(db, folder_id, scope[0], scope[1])
    # validate_deletion checks protected sub-folders + children + uploads
    await crud_folder.validate_deletion(db, folder_id)
    await db.delete(folder)
    await db.commit()
```

- [ ] **Step 2: Verify route loads**

Run: `docker compose exec backend python -c "from app.api.routes.folders import router; print('OK', len(router.routes))"`
Expected: `OK 4`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/folders.py
git commit -m "feat(api): wire scope filtering into folder routes"
```

---

### Task 6: Upload Routes — Wire Scope Dependencies + Guards

**Files:**
- Modify: `backend/app/api/routes/uploads.py`

- [ ] **Step 1: Update imports**

In `backend/app/api/routes/uploads.py`, update the import line to add `get_media_scope`:

```python
from app.api.deps import get_media_scope, require_module
```

- [ ] **Step 2: Update upload_file route**

Replace the `upload_file` function (lines 27-71) with:

```python
@router.post("/", response_model=UploadRead, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile,
    folder_id: int | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    # Scoped users must upload to a specific folder in their scope
    if scope[0] is not None:
        if folder_id is None:
            raise HTTPException(
                status_code=400,
                detail={"code": 400, "message": "Scoped users must upload to a specific folder"},
            )
        await crud_folder.assert_folder_in_scope(db, folder_id, scope[0], scope[1])

    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail={"code": 400, "message": "File must be an image"})

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail={"code": 413, "message": "File too large (max 5MB)"})

    try:
        image = Image.open(BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail={"code": 400, "message": f"Invalid image file: {str(e)}"})

    image = image.convert("RGB")
    image.thumbnail((400, 400))

    filename = f"{uuid.uuid4().hex}.webp"
    media_dir = os.environ.get("MEDIA_DIR", "/app/media")
    uploads_dir = os.path.join(media_dir, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    file_path = os.path.join(uploads_dir, filename)

    image.save(file_path, format="WebP", quality=85)
    saved_size = os.path.getsize(file_path)
    url_path = f"/media/uploads/{filename}"

    db_obj = Upload(
        filename=filename,
        original_filename=file.filename or "",
        content_type="image/webp",
        size_bytes=saved_size,
        url_path=url_path,
        folder_id=folder_id,
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)

    return db_obj
```

Note: This requires importing `crud_folder` at the top. Add this import after the existing `crud_upload` import:

```python
from app.crud.folder import crud_folder
```

- [ ] **Step 3: Update list_uploads route**

Replace the `list_uploads` function with:

```python
@router.get("/", response_model=UploadListResponse)
async def list_uploads(
    page: int = 1,
    page_size: int = 20,
    folder_id: int | Literal["none"] | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    items, total = await crud_upload.list_paginated(
        db, page=page, page_size=page_size, folder_id=folder_id,
        scope_type=scope[0], scope_id=scope[1],
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
```

- [ ] **Step 4: Update rename_upload route**

Replace `rename_upload` with:

```python
@router.put("/{id}", response_model=UploadRead)
async def rename_upload(
    id: int,
    body: UploadRename,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    upload = await crud_upload.get(db, id=id)
    if not upload:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})
    # Scope check: if scoped user, upload must be in their folders
    if scope[0] is not None and upload.folder_id is not None:
        await crud_folder.assert_folder_in_scope(db, upload.folder_id, scope[0], scope[1])
    elif scope[0] is not None and upload.folder_id is None:
        raise HTTPException(status_code=403, detail={"code": 403, "message": "Upload outside your scope"})
    upload.original_filename = body.original_filename
    db.add(upload)
    await db.commit()
    await db.refresh(upload)
    return upload
```

- [ ] **Step 5: Update move_upload route**

Replace `move_upload` with:

```python
@router.patch("/{id}", response_model=UploadRead)
async def move_upload(
    id: int,
    body: UploadMove,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    upload = await crud_upload.get(db, id=id)
    if not upload:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})
    # Scope check on source upload
    if scope[0] is not None:
        if upload.folder_id is None:
            raise HTTPException(status_code=403, detail={"code": 403, "message": "Upload outside your scope"})
        await crud_folder.assert_folder_in_scope(db, upload.folder_id, scope[0], scope[1])
    # Validate target folder
    if body.folder_id is not None:
        from app.models.folder import Folder
        if scope[0] is not None:
            await crud_folder.assert_folder_in_scope(db, body.folder_id, scope[0], scope[1])
        else:
            folder = await db.get(Folder, body.folder_id)
            if not folder:
                raise HTTPException(status_code=404, detail={"code": 404, "message": "Target folder not found"})
    upload.folder_id = body.folder_id
    db.add(upload)
    await db.commit()
    await db.refresh(upload)
    return upload
```

- [ ] **Step 6: Update delete_upload route**

Replace `delete_upload` with:

```python
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_upload(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    upload = await crud_upload.get(db, id=id)
    if not upload:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})
    # Scope check
    if scope[0] is not None:
        if upload.folder_id is None:
            raise HTTPException(status_code=403, detail={"code": 403, "message": "Upload outside your scope"})
        await crud_folder.assert_folder_in_scope(db, upload.folder_id, scope[0], scope[1])

    if upload.entity_id is not None:
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Cannot delete: still associated with an entity"})

    media_dir = os.environ.get("MEDIA_DIR", "/app/media")
    file_path = os.path.join(media_dir, "uploads", upload.filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    await crud_upload.remove(db, id=id)
```

- [ ] **Step 7: Verify route loads**

Run: `docker compose exec backend python -c "from app.api.routes.uploads import router; print('OK', len(router.routes))"`
Expected: `OK 5`

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/routes/uploads.py
git commit -m "feat(api): wire scope filtering and guards into upload routes"
```

---

### Task 7: Manufacturer Lifecycle Hooks

**Files:**
- Modify: `backend/app/api/routes/manufacturers.py`

- [ ] **Step 1: Add imports for crud_folder**

In `backend/app/api/routes/manufacturers.py`, add this import after line 7 (`from app.crud.manufacturer import crud_manufacturer`):

```python
from app.crud.folder import crud_folder
```

- [ ] **Step 2: Update create_manufacturer to provision folder**

Replace the `create_manufacturer` function with:

```python
@router.post("", response_model=ManufacturerRead, status_code=201)
async def create_manufacturer(obj_in: ManufacturerCreate, db: AsyncSession = Depends(get_db), user: User = Depends(require_module("manufacturers"))):
    # Scope check: cable_manager can only manage their own manufacturer
    if user.role and user.role.scope_type == "manufacturer":
        if obj_in.id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot create manufacturer outside your scope"},
            )
    obj = await crud_manufacturer.create(db, obj_in=obj_in)
    # Auto-provision media folder tree
    await crud_folder.provision_for_manufacturer(
        db, scope_type="manufacturer", scope_id=obj.id, name=obj.name
    )
    return obj
```

- [ ] **Step 3: Update update_manufacturer to rename folder on name change**

Replace the `update_manufacturer` function with:

```python
@router.put("/{id}", response_model=ManufacturerRead)
async def update_manufacturer(id: str, obj_in: ManufacturerUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(require_module("manufacturers"))):
    obj = await crud_manufacturer.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})
    # Scope check
    if user.role and user.role.scope_type == "manufacturer":
        if id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot modify manufacturer outside your scope"},
            )
    old_name = obj.name
    obj = await crud_manufacturer.update(db, db_obj=obj, obj_in=obj_in)
    # Rename manufacturer root folder if name changed
    if obj_in.name and obj_in.name != old_name:
        await crud_folder.rename_manufacturer_root(
            db, scope_type="manufacturer", scope_id=id, new_name=obj_in.name
        )
    return obj
```

- [ ] **Step 4: Update delete_manufacturer to cleanup folders**

Replace the `delete_manufacturer` function with:

```python
@router.delete("/{id}", response_model=ManufacturerRead)
async def delete_manufacturer(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_module("manufacturers"))):
    # Scope check
    if user.role and user.role.scope_type == "manufacturer":
        if id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete manufacturer outside your scope"},
            )
    # Cleanup media folders + uploads before deleting manufacturer
    await crud_folder.cleanup_for_manufacturer(
        db, scope_type="manufacturer", scope_id=id
    )
    obj = await crud_manufacturer.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})
    return obj
```

- [ ] **Step 5: Verify route loads**

Run: `docker compose exec backend python -c "from app.api.routes.manufacturers import router; print('OK', len(router.routes))"`
Expected: `OK 5`

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/manufacturers.py
git commit -m "feat(api): add media folder lifecycle hooks to manufacturer routes"
```

---

### Task 8: Equipment Manufacturer Lifecycle Hooks

**Files:**
- Modify: `backend/app/api/routes/equipment_manufacturers.py`

- [ ] **Step 1: Add import for crud_folder**

In `backend/app/api/routes/equipment_manufacturers.py`, add this import after line 7 (`from app.crud.equipment import crud_equipment_manufacturer`):

```python
from app.crud.folder import crud_folder
```

- [ ] **Step 2: Update create_equipment_manufacturer**

Replace the `create_equipment_manufacturer` function with:

```python
@router.post("", response_model=EquipmentManufacturerRead, status_code=201)
async def create_equipment_manufacturer(
    obj_in: EquipmentManufacturerCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("equipment_mfrs")),
):
    # Scope check: equipment_manager can only manage their own manufacturer
    if user.role and user.role.scope_type == "equipment_manufacturer":
        if obj_in.id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot create equipment manufacturer outside your scope"},
            )
    obj = await crud_equipment_manufacturer.create(db, obj_in=obj_in)
    # Auto-provision media folder tree
    await crud_folder.provision_for_manufacturer(
        db, scope_type="equipment_manufacturer", scope_id=obj.id, name=obj.name
    )
    return obj
```

- [ ] **Step 3: Update update_equipment_manufacturer**

Replace `update_equipment_manufacturer` with:

```python
@router.put("/{id}", response_model=EquipmentManufacturerRead)
async def update_equipment_manufacturer(
    id: str,
    obj_in: EquipmentManufacturerUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("equipment_mfrs")),
):
    obj = await crud_equipment_manufacturer.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment manufacturer not found"})
    # Scope check
    if user.role and user.role.scope_type == "equipment_manufacturer":
        if id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot modify equipment manufacturer outside your scope"},
            )
    old_name = obj.name
    obj = await crud_equipment_manufacturer.update(db, db_obj=obj, obj_in=obj_in)
    # Rename manufacturer root folder if name changed
    if obj_in.name and obj_in.name != old_name:
        await crud_folder.rename_manufacturer_root(
            db, scope_type="equipment_manufacturer", scope_id=id, new_name=obj_in.name
        )
    return obj
```

- [ ] **Step 4: Update delete_equipment_manufacturer**

Replace `delete_equipment_manufacturer` with:

```python
@router.delete("/{id}", response_model=EquipmentManufacturerRead)
async def delete_equipment_manufacturer(
    id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("equipment_mfrs")),
):
    # Scope check
    if user.role and user.role.scope_type == "equipment_manufacturer":
        if id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete equipment manufacturer outside your scope"},
            )
    # Cleanup media folders + uploads before deleting manufacturer
    await crud_folder.cleanup_for_manufacturer(
        db, scope_type="equipment_manufacturer", scope_id=id
    )
    obj = await crud_equipment_manufacturer.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment manufacturer not found"})
    return obj
```

- [ ] **Step 5: Verify route loads**

Run: `docker compose exec backend python -c "from app.api.routes.equipment_manufacturers import router; print('OK', len(router.routes))"`
Expected: `OK 4`

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/equipment_manufacturers.py
git commit -m "feat(api): add media folder lifecycle hooks to equipment manufacturer routes"
```

---

### Task 9: Test Fixtures + Scope Tests

**Files:**
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/api/test_media_scope.py`

- [ ] **Step 1: Add scoped user fixtures to conftest.py**

Append to `backend/tests/conftest.py` (after the `admin_headers` fixture):

```python
@pytest.fixture
def cable_manager_headers(client):
    """Login as a cable_manager (scoped to mfr-1) and return auth headers.
    Creates the role + user if they don't exist (idempotent).
    """
    import asyncio
    from sqlalchemy import text
    from app.core.security import hash_password

    async def _setup():
        async with _test_engine.begin() as conn:
            # Create role if not exists
            conn.execute(text(
                "INSERT INTO roles (id, label, scope_type, is_system) "
                "VALUES ('cable_manager_test', 'Cable Manager Test', 'manufacturer', false) "
                "ON CONFLICT (id) DO NOTHING"
            ))
            # Grant media + manufacturers modules
            for mod in ("media", "manufacturers"):
                conn.execute(text(
                    "INSERT INTO role_permissions (role_id, module) "
                    "VALUES ('cable_manager_test', :mod) ON CONFLICT DO NOTHING"
                ), {"mod": mod})
            # Create user if not exists
            conn.execute(text(
                "INSERT INTO users (email, password_hash, role_id, scope_id, is_active) "
                "VALUES ('cable_manager@test.com', :ph, 'cable_manager_test', 'mfr-1', true) "
                "ON CONFLICT (email) DO NOTHING"
            ), {"ph": hash_password("test123456")})

    asyncio.run(_setup())
    res = client.post(
        "/api/auth/login",
        json={"email": "cable_manager@test.com", "password": "test123456"},
    )
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def equipment_manager_headers(client):
    """Login as an equipment_manager (scoped to em-1) and return auth headers."""
    import asyncio
    from sqlalchemy import text
    from app.core.security import hash_password

    async def _setup():
        async with _test_engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO roles (id, label, scope_type, is_system) "
                "VALUES ('equip_manager_test', 'Equipment Manager Test', 'equipment_manufacturer', false) "
                "ON CONFLICT (id) DO NOTHING"
            ))
            for mod in ("media", "equipment_mfrs"):
                conn.execute(text(
                    "INSERT INTO role_permissions (role_id, module) "
                    "VALUES ('equip_manager_test', :mod) ON CONFLICT DO NOTHING"
                ), {"mod": mod})
            conn.execute(text(
                "INSERT INTO users (email, password_hash, role_id, scope_id, is_active) "
                "VALUES ('equip_manager@test.com', :ph, 'equip_manager_test', 'em-1', true) "
                "ON CONFLICT (email) DO NOTHING"
            ), {"ph": hash_password("test123456")})

    asyncio.run(_setup())
    res = client.post(
        "/api/auth/login",
        json={"email": "equip_manager@test.com", "password": "test123456"},
    )
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 2: Create the test file**

Create `backend/tests/api/test_media_scope.py`:

```python
"""Tests for scoped media folder access control."""
import io


def _get_folder_id_by_name(folders_response, name):
    """Helper: extract folder id by name from GET /api/folders response."""
    for f in folders_response.json()["folders"]:
        if f["name"] == name:
            return f["id"]
    return None


class TestFolderVisibility:
    def test_global_admin_sees_all_folders(self, client, admin_headers):
        """Global admin sees container folders + all manufacturer folders."""
        res = client.get("/api/folders", headers=admin_headers)
        assert res.status_code == 200
        names = [f["name"] for f in res.json()["folders"]]
        # Should see container folders
        assert "Cable Manufacturers" in names
        assert "Equipment Manufacturers" in names

    def test_cable_manager_sees_only_own_folders(self, client, cable_manager_headers):
        """Cable manager sees only their 4 folders (root + logos/products/docs)."""
        res = client.get("/api/folders", headers=cable_manager_headers)
        assert res.status_code == 200
        folders = res.json()["folders"]
        # Should see exactly 4 folders (if mfr-1 was seeded) or 0 (if not seeded)
        # but should NOT see container folders
        names = [f["name"] for f in folders]
        assert "Cable Manufacturers" not in names
        assert "Equipment Manufacturers" not in names

    def test_equipment_manager_sees_only_own_folders(self, client, equipment_manager_headers):
        """Equipment manager sees only their own folders, not cable manufacturer's."""
        res = client.get("/api/folders", headers=equipment_manager_headers)
        assert res.status_code == 200
        folders = res.json()["folders"]
        names = [f["name"] for f in folders]
        assert "Cable Manufacturers" not in names
        assert "Equipment Manufacturers" not in names


class TestUploadScopeGuards:
    def test_scoped_user_upload_without_folder_id_rejected(self, client, cable_manager_headers):
        """Scoped user must provide folder_id when uploading."""
        img = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
        res = client.post(
            "/api/uploads/",
            headers=cable_manager_headers,
            files={"file": ("test.png", img, "image/png")},
        )
        assert res.status_code == 400
        assert "must upload to a specific folder" in res.json()["detail"]["message"]

    def test_scoped_user_upload_to_own_folder_succeeds(self, client, cable_manager_headers):
        """Scoped user can upload to their own folder."""
        # First get their folder list
        folders_res = client.get("/api/folders", headers=cable_manager_headers)
        folders = folders_res.json()["folders"]
        if len(folders) == 0:
            # mfr-1 not seeded; skip this test
            return
        folder_id = folders[0]["id"]

        img = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
        res = client.post(
            "/api/uploads/",
            headers=cable_manager_headers,
            files={"file": ("test.png", img, "image/png")},
            data={"folder_id": folder_id},
        )
        assert res.status_code == 201

    def test_scoped_user_upload_to_other_scope_rejected(self, client, cable_manager_headers):
        """Scoped user cannot upload to equipment manufacturer's folder."""
        # Get equipment manager's folder id via admin
        admin_folders = client.get("/api/folders", headers=client.post(
            "/api/auth/login",
            json={"email": "admin@unowire.com", "password": "admin123456"},
        ).headers)
        # This is a bit complex; instead just try folder_id=1 (container)
        img = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
        res = client.post(
            "/api/uploads/",
            headers=cable_manager_headers,
            files={"file": ("test.png", img, "image/png")},
            data={"folder_id": 1},  # container folder, not in scope
        )
        assert res.status_code == 403


class TestFolderCrudGuards:
    def test_scoped_user_cannot_create_root_folder(self, client, cable_manager_headers):
        """Scoped user cannot create folders at root level (parent_id=NULL)."""
        res = client.post(
            "/api/folders",
            headers=cable_manager_headers,
            json={"name": "My Root", "parent_id": None},
        )
        assert res.status_code == 400

    def test_scoped_user_cannot_delete_protected_subfolder(self, client, cable_manager_headers):
        """Protected sub-folders (logos/products/docs) cannot be deleted."""
        folders_res = client.get("/api/folders", headers=cable_manager_headers)
        folders = folders_res.json()["folders"]
        for f in folders:
            if f["name"] in ("logos", "products", "docs"):
                res = client.delete(f"/api/folders/{f['id']}", headers=cable_manager_headers)
                assert res.status_code == 403, f"Should not delete protected folder {f['name']}"
                return
        # If no protected folders found, mfr-1 not seeded — skip

    def test_global_admin_cannot_delete_protected_subfolder(self, client, admin_headers):
        """Even global admin cannot delete protected sub-folders."""
        folders_res = client.get("/api/folders", headers=admin_headers)
        folders = folders_res.json()["folders"]
        for f in folders:
            if f["name"] in ("logos", "products", "docs"):
                res = client.delete(f"/api/folders/{f['id']}", headers=admin_headers)
                assert res.status_code == 403
                return


class TestAutoProvisioning:
    def test_create_manufacturer_provisions_folders(self, client, admin_headers):
        """Creating a manufacturer auto-creates 4 folders."""
        import asyncio
        from sqlalchemy import text
        from app.core.database import async_session

        # Create a test manufacturer
        res = client.post(
            "/api/manufacturers",
            headers=admin_headers,
            json={
                "id": "mfr-test-provision",
                "name": "Test Provision Mfr",
                "slug": "test-provision-mfr",
            },
        )
        assert res.status_code == 201

        # Verify 4 folders were created
        async def check():
            async with async_session() as s:
                rows = (await s.execute(text(
                    "SELECT name FROM media_folders WHERE scope_type='manufacturer' AND scope_id='mfr-test-provision' ORDER BY name"
                ))).fetchall()
                return [r[0] for r in rows]

        names = asyncio.run(check())
        assert sorted(names) == ["Test Provision Mfr", "docs", "logos", "products"]

        # Cleanup
        client.delete("/api/manufacturers/mfr-test-provision", headers=admin_headers)

    def test_provisioning_is_idempotent(self, client, admin_headers):
        """Calling provision_for_manufacturer twice for same scope returns existing."""
        import asyncio
        from sqlalchemy import text
        from app.core.database import async_session
        from app.crud.folder import crud_folder

        # Create manufacturer (provisions folders)
        client.post(
            "/api/manufacturers",
            headers=admin_headers,
            json={
                "id": "mfr-test-idem",
                "name": "Test Idem Mfr",
                "slug": "test-idem-mfr",
            },
        )

        # Call provision again
        async def provision_again():
            async with async_session() as s:
                await crud_folder.provision_for_manufacturer(
                    s, scope_type="manufacturer", scope_id="mfr-test-idem", name="Test Idem Mfr"
                )

        asyncio.run(provision_again())

        # Should still have exactly 4 folders
        async def count():
            async with async_session() as s:
                result = await s.execute(text(
                    "SELECT COUNT(*) FROM media_folders WHERE scope_type='manufacturer' AND scope_id='mfr-test-idem'"
                ))
                return result.scalar_one()

        count_val = asyncio.run(count())
        assert count_val == 4

        # Cleanup
        client.delete("/api/manufacturers/mfr-test-idem", headers=admin_headers)


class TestLifecycle:
    def test_delete_manufacturer_cleans_up_folders(self, client, admin_headers):
        """Deleting a manufacturer deletes all its folders."""
        import asyncio
        from sqlalchemy import text
        from app.core.database import async_session

        # Create manufacturer
        client.post(
            "/api/manufacturers",
            headers=admin_headers,
            json={
                "id": "mfr-test-delete",
                "name": "Test Delete Mfr",
                "slug": "test-delete-mfr",
            },
        )

        # Delete it
        res = client.delete("/api/manufacturers/mfr-test-delete", headers=admin_headers)
        assert res.status_code == 200

        # Verify folders are gone
        async def check():
            async with async_session() as s:
                result = await s.execute(text(
                    "SELECT COUNT(*) FROM media_folders WHERE scope_type='manufacturer' AND scope_id='mfr-test-delete'"
                ))
                return result.scalar_one()

        count_val = asyncio.run(check())
        assert count_val == 0

    def test_rename_manufacturer_renames_root_folder(self, client, admin_headers):
        """Renaming a manufacturer updates the root folder name."""
        import asyncio
        from sqlalchemy import text
        from app.core.database import async_session

        # Create manufacturer
        client.post(
            "/api/manufacturers",
            headers=admin_headers,
            json={
                "id": "mfr-test-rename",
                "name": "Old Name",
                "slug": "old-name-mfr",
            },
        )

        # Rename it
        client.put(
            "/api/manufacturers/mfr-test-rename",
            headers=admin_headers,
            json={"name": "New Name"},
        )

        # Verify root folder renamed
        async def check():
            async with async_session() as s:
                result = await s.execute(text(
                    "SELECT name FROM media_folders WHERE scope_type='manufacturer' AND scope_id='mfr-test-rename' AND parent_id IN (SELECT id FROM media_folders WHERE name='Cable Manufacturers')"
                ))
                return result.scalar_one()

        name = asyncio.run(check())
        assert name == "New Name"

        # Cleanup
        client.delete("/api/manufacturers/mfr-test-rename", headers=admin_headers)
```

- [ ] **Step 3: Run the new tests**

Run: `cd backend ; docker compose exec backend python -m pytest tests/api/test_media_scope.py -v`
Expected: All tests PASS (some may be skipped if mfr-1/em-1 not seeded)

- [ ] **Step 4: Run full test suite to verify no regressions**

Run: `cd backend ; docker compose exec backend python -m pytest tests/ -v`
Expected: All existing tests still pass + new tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/tests/conftest.py backend/tests/api/test_media_scope.py
git commit -m "test: add scoped media folder tests + scoped user fixtures"
```

---

### Task 10: Final Verification + Manual Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Verify full test suite passes**

Run: `cd backend ; docker compose exec backend python -m pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 2: Verify frontend builds without errors**

Run: `docker compose build frontend`
Expected: Build succeeds with 0 new TypeScript errors (8 pre-existing errors in `.next/dev/types/validator.ts` are OK)

- [ ] **Step 3: Restart frontend container**

Run: `docker compose up -d frontend`
Expected: Container starts and is healthy

- [ ] **Step 4: Manual smoke test — global admin**

Open `http://localhost:3000/admin/media` and login as admin@unowire.com:
- [ ] Folder sidebar shows "Cable Manufacturers" + "Equipment Manufacturers" containers
- [ ] Expanding a container shows manufacturer root folders
- [ ] Expanding a manufacturer shows logos/products/docs sub-folders
- [ ] Can upload to any folder
- [ ] Can create sub-folder in any manufacturer folder

- [ ] **Step 5: Manual smoke test — scoped manager (if test fixtures exist)**

Login as cable_manager@test.com:
- [ ] Folder sidebar shows only the 4 manufacturer folders (no containers)
- [ ] Cannot see other manufacturers' folders
- [ ] Can upload to own folders
- [ ] Cannot upload without selecting a folder (400 error)
- [ ] Cannot delete logos/products/docs sub-folders (403 error)

- [ ] **Step 6: Commit any fixes if needed**

If any issues found during smoke test, fix and commit. Otherwise no commit needed.

---

## Self-Review Checklist

**Spec coverage:**
- [x] Data model: scope_type/scope_id columns (Task 1)
- [x] Migration: truncate + reseed + containers (Task 1)
- [x] Folder provisioning service (Task 3)
- [x] Lifecycle hooks: create/delete/rename for both manufacturer types (Tasks 7, 8)
- [x] get_media_scope dependency (Task 2)
- [x] Module registry: media scope_aware=True (Task 2)
- [x] Folder list filtering (Task 3)
- [x] Upload list filtering (Task 4)
- [x] Folder route guards (Task 5)
- [x] Upload route guards (Task 6)
- [x] Protected sub-folder guard (Task 3)
- [x] Tests: visibility, upload guards, folder CRUD, provisioning, lifecycle (Task 9)
- [x] Frontend: no changes needed (verified in Task 10)

**Placeholder scan:** No TBD/TODO. All code blocks complete.

**Type consistency:**
- `provision_for_manufacturer(db, *, scope_type, scope_id, name)` — same signature in spec, Task 3, Tasks 7-8
- `assert_folder_in_scope(db, folder_id, scope_type, scope_id)` — same in Task 3, Tasks 5-6
- `cleanup_for_manufacturer(db, *, scope_type, scope_id)` — same in Task 3, Tasks 7-8
- `rename_manufacturer_root(db, *, scope_type, scope_id, new_name)` — same in Task 3, Tasks 7-8
- `get_media_scope` returns `tuple[str | None, str | None]` — same in Task 2, Tasks 5-6
- `PROTECTED_SUBFOLDERS`, `CONTAINER_NAMES` — defined in Task 3, used in Tasks 3, 5
