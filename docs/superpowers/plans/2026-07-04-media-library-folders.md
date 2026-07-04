# Media Library Folder Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor admin `/admin/media` page into a two-pane Explorer-style image library with a folder tree on the left and a paginated thumbnail grid on the right.

**Architecture:** Add a new `Folder` model with self-referencing `parent_id` and extend `Upload` with a nullable `folder_id` FK. Add `/api/admin/folders` CRUD routes and extend `/api/admin/uploads` with folder filtering, move (PATCH), and rename (PUT). On the frontend, split the page into `MediaPage` (container), `FolderTree` (left pane), `MediaGrid` (right pane, refactored from current page), and `MediaUploader` (extended with `folderId`). Next.js API proxy routes forward to FastAPI with Bearer token from cookie.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + Alembic + PostgreSQL (backend); Next.js 15 App Router + React 19 + TypeScript + Tailwind (frontend); existing `/api/admin/*` cookie-to-Bearer proxy pattern.

**Spec:** `docs/superpowers/specs/2026-07-04-media-library-folders-design.md`

**Testing note:** Project has no pytest infrastructure yet (`requirements.txt` has no pytest, no `tests/` dir). Per project MVP constraint and YAGNI, this plan uses manual smoke testing (Task 24) instead of adding test infrastructure. Backend tests are deferred until a test harness is added as a separate concern.

---

## File Structure

### Backend (new files)
- `backend/app/models/folder.py` — `Folder` SQLAlchemy model (self-ref `parent_id`, unique name per parent, depth ≤ 5)
- `backend/app/schemas/folder.py` — `FolderBase`, `FolderCreate`, `FolderUpdate`, `FolderRead`, `FolderTreeResponse`
- `backend/app/crud/folder.py` — `CRUDFolder` with `list_all`, `count_uploads`, `get_depth`, `has_children`
- `backend/app/api/routes/folders.py` — `GET/POST/PUT/DELETE /api/admin/folders`

### Backend (modified files)
- `backend/app/models/__init__.py` — export `Folder`
- `backend/app/models/upload.py` — add `folder_id` column + FK + index
- `backend/app/schemas/upload.py` — extend `UploadUpdate` (already has `original_filename`), add `UploadMove`, add `folder_id` to `UploadBase`/`UploadRead`
- `backend/app/crud/upload.py` — extend `list_paginated` with `folder_id` filter (supports `int | None | 'none'`); add `count_by_folder`
- `backend/app/api/routes/uploads.py` — accept `folder_id` form field on POST; accept `folder_id` query on GET; add `PUT /{id}` (rename); add `PATCH /{id}` (move)
- `backend/app/main.py` — register `folders.router` under `/api/admin/folders`
- `backend/alembic/versions/<new>_add_media_folders.py` — create `media_folders` table, add `uploads.folder_id` column + FK + index

### Frontend (new files)
- `frontend/lib/clientFolders.ts` — `Folder` type + `listFolders/createFolder/renameFolder/deleteFolder`
- `frontend/components/admin/media/FolderTree.tsx` — recursive folder tree with context menu
- `frontend/components/admin/media/MediaGrid.tsx` — extracted grid component with `folderId` prop + context menu
- `frontend/app/api/admin/folders/route.ts` — GET, POST proxy
- `frontend/app/api/admin/folders/[id]/route.ts` — PUT, DELETE proxy

### Frontend (modified files)
- `frontend/lib/clientUploads.ts` — `uploadFile` accepts `folderId`; `listUploads` accepts `folderId: 'all' | 'unfiled' | number`; add `updateUpload` (rename), `moveUpload`; add `folder_id` to `BackendUpload`
- `frontend/app/api/admin/uploads/route.ts` — POST forward `folder_id` form field; GET forward `folder_id` query
- `frontend/app/api/admin/uploads/[id]/route.ts` — add PUT (rename) and PATCH (move) handlers
- `frontend/components/admin/form/MediaUploader.tsx` — accept `folderId` prop, pass to `uploadFile`, add `onUploaded` callback
- `frontend/app/admin/(dashboard)/media/page.tsx` — rewrite as two-pane layout; orchestrate `FolderTree` + `MediaGrid` + `MediaUploader`

---

## Phase 1: Backend — Folder Model, Migration, API

### Task 1: Create Folder model

**Files:**
- Create: `backend/app/models/folder.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Write the Folder model**

Create `backend/app/models/folder.py`:

```python
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Folder(Base):
    __tablename__ = "media_folders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("media_folders.id", ondelete="CASCADE"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint("parent_id", "name", name="uq_folder_parent_name"),
    )
```

- [ ] **Step 2: Export Folder from models `__init__.py`**

Modify `backend/app/models/__init__.py` — add import and `__all__` entry:

```python
from app.models.brand import Brand
from app.models.cable import Cable, CableVariant, SpecItem
from app.models.equipment import RecommendedEquipment
from app.models.folder import Folder
from app.models.manufacturer import Manufacturer
from app.models.taxonomy import Category, Industry, ProductType
from app.models.upload import Upload
from app.models.user import AuditLog, User

__all__ = [
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

- [ ] **Step 3: Verify syntax**

Run: `docker compose exec backend python -c "from app.models import Folder; print(Folder.__tablename__)"`
Expected: `media_folders`

---

### Task 2: Add `folder_id` to Upload model

**Files:**
- Modify: `backend/app/models/upload.py`

- [ ] **Step 1: Add folder_id column and index**

Modify `backend/app/models/upload.py` to add `folder_id` after `entity_id`:

```python
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False, default="image/webp")
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    url_path: Mapped[str] = mapped_column(String(500), nullable=False)
    entity_type: Mapped[Optional[str]] = mapped_column(String(50))
    entity_id: Mapped[Optional[str]] = mapped_column(String(100))
    folder_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("media_folders.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_uploads_entity", "entity_type", "entity_id"),
        Index("idx_uploads_orphan", "entity_id"),
        Index("idx_uploads_folder", "folder_id"),
    )
```

- [ ] **Step 2: Verify import**

Run: `docker compose exec backend python -c "from app.models import Upload; print(Upload.folder_id)"`
Expected: `Upload.folder_id` (no error)

---

### Task 3: Create Alembic migration

**Files:**
- Create: `backend/alembic/versions/<auto_id>_add_media_folders.py`

- [ ] **Step 1: Generate migration**

Run: `docker compose exec backend alembic revision --autogenerate -m "add media_folders table and uploads.folder_id"`
Expected: creates a new file in `backend/alembic/versions/`

- [ ] **Step 2: Inspect generated migration**

Read the generated file. It should contain:
- `op.create_table('media_folders', ...)` with `id`, `name`, `parent_id`, `created_at`, `UniqueConstraint`
- `op.create_foreign_key(...)` for `parent_id` self-reference
- `op.add_column('uploads', sa.Column('folder_id', ...))`
- `op.create_foreign_key(...)` for `uploads.folder_id -> media_folders.id`
- `op.create_index('idx_uploads_folder', ...)`

If autogenerate missed any, add them manually.

- [ ] **Step 3: Apply migration**

Run: `docker compose exec backend alembic upgrade head`
Expected: no errors

- [ ] **Step 4: Verify tables**

Run: `docker compose exec backend python -c "import asyncio; from app.core.database import engine; from sqlalchemy import text; 
async def f():
    async with engine.connect() as c:
        r = await c.execute(text('SELECT column_name FROM information_schema.columns WHERE table_name = \\'uploads\\' AND column_name = \\'folder_id\\''))
        print(r.fetchall())
asyncio.run(f())"`
Expected: `[('folder_id',)]`

---

### Task 4: Create Folder schemas

**Files:**
- Create: `backend/app/schemas/folder.py`

- [ ] **Step 1: Write schemas**

Create `backend/app/schemas/folder.py`:

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FolderBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    parent_id: int | None = None


class FolderCreate(FolderBase):
    pass


class FolderUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class FolderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    parent_id: int | None
    created_at: datetime
    upload_count: int = 0


class FolderTreeResponse(BaseModel):
    folders: list[FolderRead]
```

- [ ] **Step 2: Verify syntax**

Run: `docker compose exec backend python -c "from app.schemas.folder import FolderCreate, FolderRead; print('ok')"`
Expected: `ok`

---

### Task 5: Create Folder CRUD

**Files:**
- Create: `backend/app/crud/folder.py`

- [ ] **Step 1: Write CRUD with depth check and upload count**

Create `backend/app/crud/folder.py`:

```python
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.folder import Folder
from app.models.upload import Upload
from app.schemas.folder import FolderCreate, FolderUpdate

MAX_FOLDER_DEPTH = 5


class CRUDFolder(CRUDBase[Folder, FolderCreate, FolderUpdate]):
    async def get_depth(self, db: AsyncSession, folder_id: int) -> int:
        """Return depth of folder (1 = top-level). Walks parent chain."""
        depth = 1
        current = await db.get(Folder, folder_id)
        while current and current.parent_id is not None:
            parent = await db.get(Folder, current.parent_id)
            if parent is None:
                break
            depth += 1
            current = parent
            if depth > MAX_FOLDER_DEPTH + 1:
                break
        return depth

    async def has_children(self, db: AsyncSession, folder_id: int) -> bool:
        stmt = select(func.count()).select_from(Folder).where(Folder.parent_id == folder_id)
        result = await db.execute(stmt)
        return (result.scalar() or 0) > 0

    async def has_uploads(self, db: AsyncSession, folder_id: int) -> bool:
        stmt = select(func.count()).select_from(Upload).where(Upload.folder_id == folder_id)
        result = await db.execute(stmt)
        return (result.scalar() or 0) > 0

    async def list_all_with_counts(self, db: AsyncSession) -> list[tuple[Folder, int]]:
        """Return all folders with their direct upload counts."""
        count_stmt = (
            select(Folder.id, func.count(Upload.id).label("cnt"))
            .outerjoin(Upload, Upload.folder_id == Folder.id)
            .group_by(Folder.id)
        )
        count_result = await db.execute(count_stmt)
        counts = {row.id: row.cnt for row in count_result}

        stmt = select(Folder).order_by(Folder.name)
        result = await db.execute(stmt)
        folders = list(result.scalars().all())
        return [(f, counts.get(f.id, 0)) for f in folders]

    async def create_with_depth_check(
        self, db: AsyncSession, *, obj_in: FolderCreate
    ) -> Folder:
        if obj_in.parent_id is not None:
            parent_depth = await self.get_depth(db, obj_in.parent_id)
            if parent_depth >= MAX_FOLDER_DEPTH:
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=400,
                    detail={"code": 400, "message": f"Max folder depth is {MAX_FOLDER_DEPTH}"},
                )
        obj_data = obj_in.model_dump()
        db_obj = Folder(**obj_data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj


crud_folder = CRUDFolder(Folder)
```

- [ ] **Step 2: Verify import**

Run: `docker compose exec backend python -c "from app.crud.folder import crud_folder, MAX_FOLDER_DEPTH; print(MAX_FOLDER_DEPTH)"`
Expected: `5`

---

### Task 6: Create folders API route

**Files:**
- Create: `backend/app/api/routes/folders.py`

- [ ] **Step 1: Write route handlers**

Create `backend/app/api/routes/folders.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
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
    _: dict = Depends(get_current_admin),
):
    rows = await crud_folder.list_all_with_counts(db)
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
    _: dict = Depends(get_current_admin),
):
    return await crud_folder.create_with_depth_check(db, obj_in=obj_in)


@router.put("/{folder_id}", response_model=FolderRead)
async def rename_folder(
    folder_id: int,
    obj_in: FolderUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    folder = await db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Folder not found"})
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
    _: dict = Depends(get_current_admin),
):
    folder = await db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Folder not found"})
    if await crud_folder.has_children(db, folder_id):
        raise HTTPException(
            status_code=409,
            detail={"code": 409, "message": "Cannot delete folder with subfolders"},
        )
    if await crud_folder.has_uploads(db, folder_id):
        raise HTTPException(
            status_code=409,
            detail={"code": 409, "message": "Cannot delete non-empty folder"},
        )
    await db.delete(folder)
    await db.commit()
```

- [ ] **Step 2: Register router in main.py**

Modify `backend/app/main.py` — add `folders` to the import on line 11 and register the router after the `uploads` router (line 91):

```python
from app.api.routes import auth, brands, cables, categories, equipment, folders, health, industries, manufacturers, product_types, taxonomy, uploads
```

Add after line 91 (the uploads router line):

```python
app.include_router(folders.router, prefix=f"{settings.api_prefix}/admin/folders", tags=["folders"])
```

- [ ] **Step 3: Verify route registered**

Run: `docker compose restart backend && sleep 3 && docker compose exec backend python -c "from app.main import app; paths = [r.path for r in app.routes]; print([p for p in paths if 'folders' in p])"`
Expected: `['/api/admin/folders', '/api/admin/folders/{folder_id}']`

- [ ] **Step 4: Smoke-test GET**

Run: `docker compose exec backend python -c "import httpx; r = httpx.get('http://localhost:8000/api/admin/folders'); print(r.status_code)"`
Expected: `401` (unauthorized — proves route exists)

---

### Task 7: Extend Upload schemas

**Files:**
- Modify: `backend/app/schemas/upload.py`

- [ ] **Step 1: Add folder_id to UploadBase, add UploadMove schema**

Replace `backend/app/schemas/upload.py` with:

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UploadBase(BaseModel):
    filename: str
    original_filename: str
    content_type: str = "image/webp"
    size_bytes: int
    url_path: str
    entity_type: str | None = None
    entity_id: str | None = None
    folder_id: int | None = None


class UploadCreate(UploadBase):
    pass


class UploadUpdate(BaseModel):
    filename: str | None = None
    original_filename: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    url_path: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    folder_id: int | None = None


class UploadMove(BaseModel):
    folder_id: int | None  # None = move to root (unfiled)


class UploadRename(BaseModel):
    original_filename: str


class UploadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    filename: str
    original_filename: str
    content_type: str
    size_bytes: int
    url_path: str
    entity_type: str | None = None
    entity_id: str | None = None
    folder_id: int | None = None


class UploadListResponse(BaseModel):
    items: list[UploadRead]
    total: int
    page: int
    page_size: int
```

- [ ] **Step 2: Verify**

Run: `docker compose exec backend python -c "from app.schemas.upload import UploadMove, UploadRename, UploadRead; print('ok')"`
Expected: `ok`

---

### Task 8: Extend Upload CRUD with folder filtering

**Files:**
- Modify: `backend/app/crud/upload.py`

- [ ] **Step 1: Add folder_id filter to list_paginated**

Replace `backend/app/crud/upload.py` with:

```python
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.upload import Upload
from app.schemas.upload import UploadCreate, UploadUpdate


class CRUDUpload(CRUDBase[Upload, UploadCreate, UploadUpdate]):
    async def get_by_entity(self, db: AsyncSession, entity_type: str, entity_id: str) -> Upload | None:
        stmt = select(Upload).where(
            Upload.entity_type == entity_type,
            Upload.entity_id == entity_id
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_orphans(self, db: AsyncSession) -> list[Upload]:
        stmt = select(Upload).where(Upload.entity_id.is_(None)).order_by(Upload.created_at.desc())
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def list_paginated(
        self,
        db: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        folder_id: int | None | Literal["none"] = None,
    ) -> tuple[list[Upload], int]:
        offset = (page - 1) * page_size
        base = select(Upload)
        count_base = select(func.count()).select_from(Upload)

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


crud_upload = CRUDUpload(Upload)
```

- [ ] **Step 2: Verify**

Run: `docker compose exec backend python -c "from app.crud.upload import crud_upload; print('ok')"`
Expected: `ok`

---

### Task 9: Extend uploads API route

**Files:**
- Modify: `backend/app/api/routes/uploads.py`

- [ ] **Step 1: Add folder_id form field to POST, folder_id query to GET, PUT (rename), PATCH (move)**

Replace `backend/app/api/routes/uploads.py` with:

```python
import os
import uuid
from io import BytesIO
from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.crud.upload import crud_upload
from app.models.upload import Upload
from app.schemas.upload import (
    UploadListResponse,
    UploadMove,
    UploadRead,
    UploadRename,
)

router = APIRouter()

MAX_FILE_SIZE = 5 * 1024 * 1024


@router.post("/", response_model=UploadRead, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile,
    folder_id: int | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
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


@router.get("/", response_model=UploadListResponse)
async def list_uploads(
    page: int = 1,
    page_size: int = 20,
    folder_id: int | Literal["none"] | None = None,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    items, total = await crud_upload.list_paginated(
        db, page=page, page_size=page_size, folder_id=folder_id
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.put("/{id}", response_model=UploadRead)
async def rename_upload(
    id: int,
    body: UploadRename,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    upload = await crud_upload.get(db, id=id)
    if not upload:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})
    upload.original_filename = body.original_filename
    db.add(upload)
    await db.commit()
    await db.refresh(upload)
    return upload


@router.patch("/{id}", response_model=UploadRead)
async def move_upload(
    id: int,
    body: UploadMove,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    upload = await crud_upload.get(db, id=id)
    if not upload:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})
    if body.folder_id is not None:
        from app.models.folder import Folder
        folder = await db.get(Folder, body.folder_id)
        if not folder:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Target folder not found"})
    upload.folder_id = body.folder_id
    db.add(upload)
    await db.commit()
    await db.refresh(upload)
    return upload


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_upload(
    id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    upload = await crud_upload.get(db, id=id)
    if not upload:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})

    if upload.entity_id is not None:
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Cannot delete: still associated with an entity"})

    media_dir = os.environ.get("MEDIA_DIR", "/app/media")
    file_path = os.path.join(media_dir, "uploads", upload.filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    await crud_upload.remove(db, id=id)
```

- [ ] **Step 2: Restart backend and verify**

Run: `docker compose restart backend && sleep 3 && docker compose exec backend python -c "from app.main import app; paths = sorted([r.path + ' ' + ','.join(r.methods) for r in app.routes if 'uploads' in r.path]); print('\n'.join(paths))"`
Expected output includes:
```
/api/uploads/ DELETE
/api/uploads/ GET,POST
/api/uploads/{id} DELETE,PATCH,PUT
```

- [ ] **Step 3: Commit Phase 1**

```bash
git add backend/app/models/folder.py backend/app/models/__init__.py backend/app/models/upload.py backend/app/schemas/folder.py backend/app/schemas/upload.py backend/app/crud/folder.py backend/app/crud/upload.py backend/app/api/routes/folders.py backend/app/api/routes/uploads.py backend/app/main.py backend/alembic/versions/*add_media_folders*.py
git commit -m "feat(backend): add folder model, CRUD, API and extend uploads with folder_id/move/rename"
```

---

## Phase 2: Frontend — Client Modules, Proxy Routes, FolderTree

### Task 10: Create Next.js API proxy routes for folders

**Files:**
- Create: `frontend/app/api/admin/folders/route.ts`
- Create: `frontend/app/api/admin/folders/[id]/route.ts`

- [ ] **Step 1: Create folders collection route**

Create `frontend/app/api/admin/folders/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// GET /api/admin/folders — list folder tree
export async function GET(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/admin/folders`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

// POST /api/admin/folders — create folder
export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/admin/folders`, {
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

- [ ] **Step 2: Create folders `[id]` route**

Create `frontend/app/api/admin/folders/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// PUT /api/admin/folders/[id] — rename folder
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/admin/folders/${id}`, {
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

// DELETE /api/admin/folders/[id] — delete folder (empty only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/admin/folders/${id}`, {
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

- [ ] **Step 3: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no errors (or pre-existing errors only)

---

### Task 11: Extend uploads API proxy route

**Files:**
- Modify: `frontend/app/api/admin/uploads/route.ts`
- Modify: `frontend/app/api/admin/uploads/[id]/route.ts`

- [ ] **Step 1: Forward folder_id in POST and GET**

Replace `frontend/app/api/admin/uploads/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// POST /api/admin/uploads — multipart upload proxy (forwards folder_id form field)
export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const formData = await request.formData();
  const res = await fetch(`${API_BASE}/api/uploads`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

// GET /api/admin/uploads?page=&page_size=&folder_id= — list uploads proxy
export async function GET(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page') ?? '1';
  const page_size = searchParams.get('page_size') ?? '20';
  const folder_id = searchParams.get('folder_id');  // 'none' | number | null

  const backendUrl = new URL(`${API_BASE}/api/uploads`);
  backendUrl.searchParams.set('page', page);
  backendUrl.searchParams.set('page_size', page_size);
  if (folder_id !== null) {
    backendUrl.searchParams.set('folder_id', folder_id);
  }

  const res = await fetch(backendUrl.toString(), {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Add PUT (rename) and PATCH (move) to `[id]/route.ts`**

Replace `frontend/app/api/admin/uploads/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// DELETE /api/admin/uploads/[id] — delete upload proxy
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/uploads/${id}`, {
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

// PUT /api/admin/uploads/[id] — rename upload (original_filename)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/uploads/${id}`, {
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

// PATCH /api/admin/uploads/[id] — move upload to folder
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/uploads/${id}`, {
    method: 'PATCH',
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

- [ ] **Step 3: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no errors

---

### Task 12: Create `lib/clientFolders.ts`

**Files:**
- Create: `frontend/lib/clientFolders.ts`

- [ ] **Step 1: Write client module**

Create `frontend/lib/clientFolders.ts`:

```typescript
// Client-side folders module — safe to import from 'use client' components.

export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
  upload_count: number;
}

export interface FolderTreeResponse {
  folders: Folder[];
}

const BASE = '/api/admin/folders';

export async function listFolders(): Promise<Folder[]> {
  const res = await fetch(BASE, { cache: 'no-store' });
  if (!res.ok) throw new Error(`List folders failed: ${res.status}`);
  const data: FolderTreeResponse = await res.json();
  return data.folders;
}

export async function createFolder(name: string, parentId: number | null): Promise<Folder> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent_id: parentId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Create folder failed: ${res.status}`);
  }
  return res.json();
}

export async function renameFolder(id: number, name: string): Promise<Folder> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Rename folder failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteFolder(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Delete folder failed: ${res.status}`);
  }
}

/**
 * Build a nested tree structure from a flat list of folders.
 * Children arrays are sorted by name.
 */
export interface FolderNode extends Folder {
  children: FolderNode[];
}

export function buildFolderTree(folders: Folder[]): FolderNode[] {
  const map = new Map<number, FolderNode>();
  folders.forEach((f) => map.set(f.id, { ...f, children: [] }));
  const roots: FolderNode[] = [];
  map.forEach((node) => {
    if (node.parent_id === null) {
      roots.push(node);
    } else {
      const parent = map.get(node.parent_id);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphan (parent deleted) — treat as root
        roots.push(node);
      }
    }
  });
  const sortRecursive = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRecursive(n.children));
  };
  sortRecursive(roots);
  return roots;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no errors

---

### Task 13: Extend `lib/clientUploads.ts`

**Files:**
- Modify: `frontend/lib/clientUploads.ts`

- [ ] **Step 1: Add folder_id, updateUpload, moveUpload; extend listUploads**

Replace `frontend/lib/clientUploads.ts`:

```typescript
// Client-side uploads module — safe to import from 'use client' components.
// Uses relative URLs (/api/admin/uploads) which the browser automatically
// sends cookies with; the Next.js API Route proxy reads the admin_token
// cookie and forwards it as a Bearer header to the FastAPI backend.

export interface BackendUpload {
  id: number;
  filename: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  url_path: string;
  entity_type: string | null;
  entity_id: string | null;
  folder_id: number | null;
  created_at: string;
}

export interface UploadListResponse {
  items: BackendUpload[];
  total: number;
  page: number;
  page_size: number;
}

export type FolderFilter = 'all' | 'unfiled' | number;

const BASE = '/api/admin/uploads';

export async function uploadFile(file: File, folderId?: number): Promise<BackendUpload> {
  const formData = new FormData();
  formData.append('file', file);
  if (folderId !== undefined) {
    formData.append('folder_id', String(folderId));
  }
  const res = await fetch(BASE, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function listUploads(
  page = 1,
  pageSize = 20,
  folderId: FolderFilter = 'all'
): Promise<UploadListResponse> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  if (folderId === 'unfiled') {
    params.set('folder_id', 'none');
  } else if (folderId !== 'all') {
    params.set('folder_id', String(folderId));
  }
  const res = await fetch(`${BASE}?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  return res.json();
}

export async function deleteUpload(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export async function updateUpload(
  id: number,
  originalFilename: string
): Promise<BackendUpload> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ original_filename: originalFilename }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Rename failed: ${res.status}`);
  }
  return res.json();
}

export async function moveUpload(id: number, folderId: number | null): Promise<BackendUpload> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_id: folderId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Move failed: ${res.status}`);
  }
  return res.json();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no errors

---

### Task 14: Create FolderTree component

**Files:**
- Create: `frontend/components/admin/media/FolderTree.tsx`

- [ ] **Step 1: Write FolderTree component**

Create `frontend/components/admin/media/FolderTree.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  Plus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import {
  buildFolderTree,
  createFolder,
  renameFolder,
  deleteFolder,
  type Folder,
  type FolderNode,
} from '@/lib/clientFolders';

export type FolderSelection = 'all' | 'unfiled' | number;

interface FolderTreeProps {
  folders: Folder[];
  selectedId: FolderSelection;
  onSelect: (id: FolderSelection) => void;
  onRefresh: () => void;
  onToast: (message: string) => void;
}

export function FolderTree({ folders, selectedId, onSelect, onRefresh, onToast }: FolderTreeProps) {
  const tree = buildFolderTree(folders);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creatingIn, setCreatingIn] = useState<number | null>(null);
  const [newName, setNewName] = useState('');

  async function handleCreate(parentId: number | null, name: string) {
    try {
      await createFolder(name, parentId);
      setCreatingIn(null);
      setNewName('');
      onRefresh();
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  async function handleRename(id: number, name: string) {
    try {
      await renameFolder(id, name);
      setRenamingId(null);
      setRenameValue('');
      onRefresh();
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Delete this folder? Only empty folders can be deleted.')) return;
    try {
      await deleteFolder(id);
      if (selectedId === id) onSelect('all');
      onRefresh();
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  return (
    <div className="space-y-1 text-sm">
      {/* Virtual nodes */}
      <TreeRow
        label="All Files"
        icon={<FolderIcon className="w-4 h-4 text-blue-500" />}
        active={selectedId === 'all'}
        onClick={() => onSelect('all')}
      />
      <TreeRow
        label="Unfiled"
        icon={<FolderIcon className="w-4 h-4 text-gray-400" />}
        active={selectedId === 'unfiled'}
        onClick={() => onSelect('unfiled')}
      />

      <div className="flex items-center justify-between px-2 pt-3 pb-1 text-xs text-gray-500 uppercase">
        <span>Folders</span>
        <button
          onClick={() => setCreatingIn('root')}
          title="New top-level folder"
          className="p-0.5 hover:bg-gray-100 rounded"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {creatingIn === 'root' && (
        <NewFolderInput
          onCancel={() => setCreatingIn(null)}
          onCreate={(name) => handleCreate(null, name)}
          value={newName}
          setValue={setNewName}
        />
      )}

      {tree.map((node) => (
        <FolderNodeRow
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          renamingId={renamingId}
          renameValue={renameValue}
          setRenamingId={setRenamingId}
          setRenameValue={setRenameValue}
          onRename={handleRename}
          onDelete={handleDelete}
          onCreate={handleCreate}
          creatingIn={creatingIn}
          setCreatingIn={setCreatingIn}
          newName={newName}
          setNewName={setNewName}
        />
      ))}
    </div>
  );
}

interface FolderNodeRowProps {
  node: FolderNode;
  depth: number;
  selectedId: FolderSelection;
  onSelect: (id: FolderSelection) => void;
  renamingId: number | null;
  renameValue: string;
  setRenamingId: (id: number | null) => void;
  setRenameValue: (v: string) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  onCreate: (parentId: number, name: string) => void;
  creatingIn: number | null;
  setCreatingIn: (id: number | null) => void;
  newName: string;
  setNewName: (v: string) => void;
}

function FolderNodeRow(props: FolderNodeRowProps) {
  const {
    node,
    depth,
    selectedId,
    onSelect,
    renamingId,
    renameValue,
    setRenamingId,
    setRenameValue,
    onRename,
    onDelete,
    onCreate,
    creatingIn,
    setCreatingIn,
    newName,
    setNewName,
  } = props;
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className="group flex items-center gap-1 px-2 py-1 rounded cursor-pointer hover:bg-gray-100"
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={() => onSelect(node.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="p-0.5 hover:bg-gray-200 rounded"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        {isSelected ? (
          <FolderOpenIcon className="w-4 h-4 text-blue-500" />
        ) : (
          <FolderIcon className="w-4 h-4 text-gray-500" />
        )}
        {renamingId === node.id ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => onRename(node.id, renameValue)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRename(node.id, renameValue);
              if (e.key === 'Escape') setRenamingId(null);
            }}
            className="flex-1 px-1 py-0.5 text-sm border border-blue-400 rounded outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={`flex-1 truncate ${isSelected ? 'font-medium text-blue-600' : ''}`}>
            {node.name}
          </span>
        )}
        <span className="text-xs text-gray-400">{node.upload_count}</span>
      </div>

      {menuOpen && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute bg-white border border-gray-200 rounded shadow-lg py-1 text-sm"
            style={{
              left: '40%',
              top: '40%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setCreatingIn(node.id);
                setExpanded(true);
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-100"
            >
              <Plus className="w-3.5 h-3.5" /> New Subfolder
            </button>
            <button
              onClick={() => {
                setRenamingId(node.id);
                setRenameValue(node.name);
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-100"
            >
              <Pencil className="w-3.5 h-3.5" /> Rename
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                onDelete(node.id);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      )}

      {expanded && creatingIn === node.id && (
        <NewFolderInput
          depth={depth + 1}
          onCancel={() => setCreatingIn(null)}
          onCreate={(name) => onCreate(node.id, name)}
          value={newName}
          setValue={setNewName}
        />
      )}

      {expanded &&
        node.children.map((child) => (
          <FolderNodeRow key={child.id} {...props} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

interface NewFolderInputProps {
  depth?: number;
  value: string;
  setValue: (v: string) => void;
  onCancel: () => void;
  onCreate: (name: string) => void;
}

function NewFolderInput({ depth = 0, value, setValue, onCancel, onCreate }: NewFolderInputProps) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1"
      style={{ paddingLeft: depth * 12 + 8 }}
    >
      <FolderIcon className="w-4 h-4 text-gray-400" />
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onCreate(value.trim());
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Folder name"
        className="flex-1 px-1 py-0.5 text-sm border border-blue-400 rounded outline-none"
      />
      <button
        onClick={() => value.trim() && onCreate(value.trim())}
        className="p-0.5 text-blue-600 hover:bg-blue-50 rounded"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <button onClick={onCancel} className="p-0.5 text-gray-500 hover:bg-gray-100 rounded">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface TreeRowProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

function TreeRow({ label, icon, active, onClick }: TreeRowProps) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-100 ${
        active ? 'bg-blue-50 text-blue-700 font-medium' : ''
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no errors

---

### Task 15: Create MediaGrid component (extracted from current page)

**Files:**
- Create: `frontend/components/admin/media/MediaGrid.tsx`

- [ ] **Step 1: Write MediaGrid with folderId + context menu**

Create `frontend/components/admin/media/MediaGrid.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Trash2, Copy, Check, Download, Pencil, Move } from 'lucide-react';
import {
  listUploads,
  deleteUpload,
  updateUpload,
  moveUpload,
  type BackendUpload,
  type FolderFilter,
} from '@/lib/clientUploads';
import type { Folder } from '@/lib/clientFolders';

interface MediaGridProps {
  folderId: FolderFilter;
  folders: Folder[];
  onToast: (message: string) => void;
  onFoldersChanged: () => void;
}

export function MediaGrid({ folderId, folders, onToast, onFoldersChanged }: MediaGridProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [items, setItems] = useState<BackendUpload[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [movingId, setMovingId] = useState<number | null>(null);
  const [moveTarget, setMoveTarget] = useState<number | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [folderId]);

  useEffect(() => {
    loadMedia();
  }, [currentPage, folderId]);

  async function loadMedia() {
    setLoading(true);
    try {
      const result = await listUploads(currentPage, 20, folderId);
      setItems(result.items);
      setTotal(result.total);
      setPageSize(result.page_size);
    } catch (error) {
      console.error('Failed to load media:', error);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  }

  async function handleDelete(id: number) {
    try {
      await deleteUpload(id);
      setDeleteConfirmId(null);
      loadMedia();
      onFoldersChanged();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  }

  async function handleRename(id: number) {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await updateUpload(id, renameValue.trim());
      setRenamingId(null);
      loadMedia();
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  async function handleMove(id: number, target: number | null) {
    try {
      await moveUpload(id, target);
      setMovingId(null);
      setMoveTarget(null);
      loadMedia();
      onFoldersChanged();
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Showing {items.length} of {total} files
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center text-gray-500">No files in this folder.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
          {items.map((upload) => (
            <div
              key={upload.id}
              className="relative group rounded-lg overflow-hidden border border-gray-200 hover:border-blue-300 transition-colors"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuFor(upload.id);
              }}
            >
              <img
                src={upload.url_path}
                alt={upload.original_filename}
                className="w-full aspect-square object-cover"
              />

              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                <div className="flex items-center justify-between gap-1">
                  <button
                    onClick={() => copyUrl(upload.url_path)}
                    className="p-2 bg-white/90 rounded hover:bg-white transition-colors"
                    title="Copy URL"
                  >
                    {copiedUrl === upload.url_path ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  <a
                    href={upload.url_path}
                    download={upload.original_filename}
                    className="p-2 bg-white/90 rounded hover:bg-white transition-colors"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  {upload.entity_id === null &&
                    (deleteConfirmId === upload.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleDelete(upload.id)}
                          className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="p-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(upload.id)}
                        className="p-2 bg-white/90 rounded hover:bg-red-500 hover:text-white transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ))}
                </div>
              </div>

              <div className="px-2 py-1 bg-gray-50 border-t text-xs text-gray-600 truncate">
                {renamingId === upload.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRename(upload.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(upload.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded outline-none"
                  />
                ) : (
                  upload.original_filename
                )}
              </div>

              {upload.entity_id === null && (
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-gray-800 text-white text-xs rounded">
                  Unassociated
                </span>
              )}

              {menuFor === upload.id && (
                <div className="fixed inset-0 z-50" onClick={() => setMenuFor(null)}>
                  <div
                    className="absolute bg-white border border-gray-200 rounded shadow-lg py-1 text-sm"
                    style={{ left: '40%', top: '40%' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setMovingId(upload.id);
                        setMoveTarget(upload.folder_id);
                        setMenuFor(null);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-100"
                    >
                      <Move className="w-3.5 h-3.5" /> Move to...
                    </button>
                    <button
                      onClick={() => {
                        setRenamingId(upload.id);
                        setRenameValue(upload.original_filename);
                        setMenuFor(null);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-100"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Rename
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {movingId !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setMovingId(null)}>
          <div className="bg-white rounded-lg p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-3">Move to folder</h3>
            <select
              value={moveTarget === null ? 'root' : String(moveTarget)}
              onChange={(e) => setMoveTarget(e.target.value === 'root' ? null : Number(e.target.value))}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-3"
            >
              <option value="root">Root (Unfiled)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setMovingId(null)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMove(movingId, moveTarget)}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`px-3 py-1 text-sm border rounded ${
                currentPage === page ? 'bg-blue-500 text-white' : 'hover:bg-gray-50'
              }`}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no errors

---

### Task 16: Update MediaUploader to accept folderId + onUploaded

**Files:**
- Modify: `frontend/components/admin/form/MediaUploader.tsx`

- [ ] **Step 1: Add folderId prop and onUploaded callback**

Modify the `MediaUploader` function signature and `uploadFile` calls in `frontend/components/admin/form/MediaUploader.tsx`. Replace lines 15-48 with:

```tsx
interface MediaUploaderProps {
  folderId?: number;
  onUploaded?: () => void;
}

export function MediaUploader({ folderId, onUploaded }: MediaUploaderProps) {
  const [uploads, setUploads] = useState<UploadResult[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const handleFiles = (files: File[]) => {
    const newUploads: UploadResult[] = Array.from(files).map((file) => ({
      file,
      status: 'pending',
      progress: 0,
    }));
    setUploads((prev) => [...newUploads, ...prev]);
    newUploads.forEach((item) => uploadFile(item));
  };

  const uploadFile = async (item: UploadResult) => {
    setUploads((prev) =>
      prev.map((u) => (u.file.name === item.file.name ? { ...u, status: 'uploading' } : u))
    );

    try {
      const result = await uploadFile(item.file, folderId);
      setUploads((prev) =>
        prev.map((u) =>
          u.file.name === item.file.name ? { ...u, status: 'success', progress: 100, url: result.url_path } : u
        )
      );
      if (onUploaded) onUploaded();
    } catch (error) {
      setUploads((prev) =>
        prev.map((u) =>
          u.file.name === item.file.name ? { ...u, status: 'error', error: (error as Error).message } : u
        )
      );
    }
  };
```

Also update the import on line 5 to ensure `uploadFile` from `@/lib/clientUploads` is imported (no change needed if it's already imported — verify it's the same name).

The rest of the component (`removeUpload`, `copyUrl`, `handleDrop`, and the JSX) stays the same.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no errors

---

### Task 17: Rewrite media page as two-pane layout

**Files:**
- Modify: `frontend/app/admin/(dashboard)/media/page.tsx`

- [ ] **Step 1: Replace page with two-pane layout**

Replace `frontend/app/admin/(dashboard)/media/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { FolderTree, type FolderSelection } from '@/components/admin/media/FolderTree';
import { MediaGrid } from '@/components/admin/media/MediaGrid';
import { MediaUploader } from '@/components/admin/form/MediaUploader';
import { listFolders, type Folder } from '@/lib/clientFolders';

export default function MediaPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [uploaderOpen, setUploaderOpen] = useState(false);

  const refreshFolders = useCallback(async () => {
    try {
      const data = await listFolders();
      setFolders(data);
    } catch (e) {
      console.error('Failed to load folders:', e);
    }
  }, []);

  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  const currentFolderId: number | undefined =
    typeof selectedFolder === 'number' ? selectedFolder : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ImageIcon className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-semibold text-gray-900">Media Library</h1>
        </div>
        <button
          onClick={() => setUploaderOpen((v) => !v)}
          className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          {uploaderOpen ? 'Close Uploader' : 'Upload'}
        </button>
      </div>

      {toast && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
          {toast}
        </div>
      )}

      {uploaderOpen && (
        <MediaUploader folderId={currentFolderId} onUploaded={refreshFolders} />
      )}

      <div className="flex gap-4">
        <aside className="w-64 shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 p-3 max-h-[calc(100vh-200px)] overflow-y-auto">
          <FolderTree
            folders={folders}
            selectedId={selectedFolder}
            onSelect={setSelectedFolder}
            onRefresh={refreshFolders}
            onToast={showToast}
          />
        </aside>

        <div className="flex-1 min-w-0">
          <MediaGrid
            folderId={selectedFolder}
            folders={folders}
            onToast={showToast}
            onFoldersChanged={refreshFolders}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit Phase 2 + 3**

```bash
git add frontend/app/api/admin/folders/ frontend/app/api/admin/uploads/ frontend/lib/clientFolders.ts frontend/lib/clientUploads.ts frontend/components/admin/media/ frontend/components/admin/form/MediaUploader.tsx frontend/app/admin/\(dashboard\)/media/page.tsx
git commit -m "feat(frontend): add folder tree, two-pane media layout, and grid folder ops"
```

---

## Phase 4: Verification

### Task 18: Restart containers and clear Next.js cache

- [ ] **Step 1: Restart backend and frontend containers**

Run: `docker compose restart backend frontend`
Expected: both containers healthy

- [ ] **Step 2: Run Alembic to confirm migration is applied**

Run: `docker compose exec backend alembic current`
Expected: prints the new migration revision ID

- [ ] **Step 3: Clear Next.js .next cache to avoid Turbopack stale bundles**

Run: `docker compose exec frontend rm -rf .next && docker compose restart frontend`
Expected: frontend restarts cleanly

- [ ] **Step 4: Wait for dev server**

Run: `docker compose logs -f frontend` (Ctrl+C after seeing "Ready")
Expected: `✓ Ready in ...ms` with no compilation errors

---

### Task 19: Manual smoke test (11 items from spec)

Open `http://localhost:8080/admin/login` and log in, then navigate to `http://localhost:8080/admin/media`.

- [ ] **1. Three virtual nodes visible:** Left pane shows "All Files" (selected), "Unfiled", and a "Folders" header with a `+` button.

- [ ] **2. Create top-level folder:** Click the `+` next to "Folders", type "logos", press Enter. Folder appears in tree.

- [ ] **3. Create subfolder:** Right-click "logos" → "New Subfolder" → type "brands" → Enter. Appears nested under logos.

- [ ] **4. Rename folder:** Right-click "logos" → "Rename" → change to "brand-logos" → Enter. Tree updates.

- [ ] **5. Delete empty folder:** Right-click "brands" → "Delete" → confirm. Folder disappears.

- [ ] **6. Delete non-empty folder blocked:** Upload an image to a folder (next step first), then right-click that folder → "Delete". Toast shows "Cannot delete non-empty folder".

- [ ] **7. Upload to folder:** Click "brand-logos" folder in tree, click "Upload" button, drop an image. After upload, image appears in right pane. Click "All Files" — image is also visible there.

- [ ] **8. All Files view:** Click "All Files" — the uploaded image is visible along with all other uploads.

- [ ] **9. Move image:** Right-click an image → "Move to..." → pick "banners" folder (create it first if needed) → "Move". Image leaves current grid; switch to target folder to verify it's there.

- [ ] **10. Rename image:** Right-click an image → "Rename" → change filename → Enter. Caption under thumbnail updates.

- [ ] **11. Unfiled view:** Click "Unfiled" — only images with `folder_id = NULL` are visible. Newly uploaded images with no folder should appear here if uploaded from "Unfiled" or "All Files" view (since `folderId` is `undefined`).

- [ ] **12. Regression check:** Verify existing behavior still works — Copy URL, Download, Delete (for unassociated images), pagination.

---

### Task 20: Final commit (if any fixes were needed during smoke test)

If smoke test surfaced any bugs and they were fixed:

```bash
git add -A
git commit -m "fix(media): address smoke test findings"
```

Otherwise, skip this task.

---

## Self-Review Notes

**Spec coverage:**
- Section 1 (Architecture & Data Model): Tasks 1, 2, 3 (Folder model + Upload.folder_id + migration) ✅
- Section 1 (Image Rename): Task 9 (PUT /api/admin/uploads/{id}) ✅
- Section 1 (MP4 out of scope): No task needed ✅
- Section 2 (Backend API): Tasks 4-9 (folders CRUD + uploads extensions) ✅
- Section 2 (Depth limit = 5): Task 5 (MAX_FOLDER_DEPTH in CRUD) ✅
- Section 3 (Frontend components): Tasks 10-17 ✅
- Section 4 (Error handling): Backend HTTP exceptions in Tasks 6, 9; frontend `onToast` propagation in Tasks 14, 15, 17 ✅
- Section 4 (Manual smoke test): Task 19 (12 items — 11 from spec + 1 regression) ✅
- Section 4 (3 commits): Tasks 9, 17 produce 2 commits; if Task 20 is needed, that's 3 ✅

**Type consistency:**
- `FolderSelection` type defined in `FolderTree.tsx` and used in `MediaPage` and `MediaGrid` ✅
- `FolderFilter` type defined in `clientUploads.ts` and used in `MediaGrid` — these are separate types but compatible (`'all' | 'unfiled' | number`). Verified both align ✅
- `BackendUpload.folder_id` added in Task 13, returned by backend in Task 9 (via UploadRead schema in Task 7) ✅
- `Folder.upload_count` populated in `list_all_with_counts` (Task 5) and consumed by `buildFolderTree` (Task 12) ✅

**Known plan limitations:**
- Backend tests deferred (no pytest infrastructure in project; deferred to a separate test-harness initiative)
- Folder context menu uses a simple fixed-position modal (40%/40%) rather than tracking the cursor position — visually acceptable for MVP, can be improved later
- Folder tree does not support drag-and-drop (spec explicitly excludes this from scope)
