# Manufacturer Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public manufacturer showcase pages (`/manufacturers` index + `/manufacturers/:slug` detail) plus admin editing of showcase fields (description, contact, featured cables, recommendation slots) by extending the existing manufacturer admin page.

**Architecture:** Single-table extension (10 new columns on `manufacturers`) + 1 new backend read endpoint (`GET /api/manufacturers/slug/{slug}`) + 2 new frontend pages + extension of existing admin page with 4 independent editing blocks. Reuses `CableCard`, `Container`, `Breadcrumbs`, `JsonLd`, and the cable detail page's SSR+ISR pattern.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + Pydantic 2 (backend); Next.js 15 App Router + React 19 + TypeScript + Tailwind (frontend); Alembic (DB migration)

---

## File Structure

**Backend (modify):**
- `backend/app/models/manufacturer.py` — add 10 new mapped columns
- `backend/app/schemas/manufacturer.py` — extend `ManufacturerBase`, `ManufacturerCreate`, `ManufacturerUpdate`
- `backend/app/api/routes/manufacturers.py` — add `GET /slug/{slug}` endpoint
- `backend/app/crud/manufacturer.py` — add `get_by_slug` method

**Backend (create):**
- `backend/alembic/versions/<new_rev>_manufacturer_showcase_fields.py` — migration file

**Frontend (modify):**
- `frontend/lib/types.ts` — extend `Manufacturer` interface with new fields
- `frontend/lib/api.ts` — extend `BackendManufacturer` + `adaptManufacturer`; add `manufacturers.getBySlug`
- `frontend/lib/adminApi.ts` — extend `BackendManufacturer` + `adaptManufacturer`; keep round-trip raw data via new `getRawById` method
- `frontend/components/layout/Nav.tsx` — add `/manufacturers` link
- `frontend/components/layout/Footer.tsx` — add `/manufacturers` link
- `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx` — link manufacturer name to `/manufacturers/{slug}`
- `frontend/app/sitemap.ts` — add manufacturer index + detail URLs
- `frontend/components/admin/form/ManufacturerForm.tsx` — refactor to update only base fields (no breaking changes; new showcase fields handled by separate blocks)
- `frontend/app/admin/(dashboard)/manufacturers/[id]/page.tsx` — render 4 showcase editing blocks below existing `ManufacturerForm`

**Frontend (create):**
- `frontend/app/(site)/manufacturers/page.tsx` — index page (SSR, A-Z + recommendation slots)
- `frontend/app/(site)/manufacturers/[slug]/page.tsx` — detail page (SSR + ISR 1h, 6 sections)
- `frontend/components/admin/form/ManufacturerShowcaseBlocks.tsx` — client component with 4 independent editing blocks (description, featured cables, contact, recommendation slots)

**Global Constraints:**
- All code, comments, and commit messages in English
- No new npm/pip dependencies (use only stdlib + existing packages)
- No automated tests (MVP constraint); verification is `tsc --noEmit` + manual smoke testing
- `dangerouslySetInnerHTML` is acceptable for `description` field (admin is trusted user)
- All route handlers use async/await, no callback style
- Use `Link` from `next/link` for internal navigation
- Existing 14 pre-existing tsc errors (brands/manufacturers `image_url` schema drift) are tolerated; this plan must introduce **0 new tsc errors**

---

## Task 1: Extend `Manufacturer` Model with Showcase Fields

**Files:**
- Modify: `backend/app/models/manufacturer.py`

- [ ] **Step 1: Add 10 new mapped columns to `Manufacturer` model**

Replace the entire contents of `backend/app/models/manufacturer.py` with:

```python
from datetime import datetime

from sqlalchemy import JSON, Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base


class Manufacturer(Base):
    __tablename__ = "manufacturers"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    country: Mapped[str | None] = mapped_column(String(100))
    website: Mapped[str | None] = mapped_column(String(500))
    image_url: Mapped[str | None] = mapped_column(String(500))
    # Showcase fields (added 2026-07-04)
    description: Mapped[str | None] = mapped_column(Text)
    founded_year: Mapped[int | None] = mapped_column(Integer)
    address: Mapped[str | None] = mapped_column(String(500))
    phone: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(200))
    featured_cable_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    featured_image: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    featured_image_sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    featured_text: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    featured_text_sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 2: Verify model imports cleanly**

Run: `docker compose exec backend python -c "from app.models.manufacturer import Manufacturer; print([c.name for c in Manufacturer.__table__.columns])"`
Expected: prints all 17 column names including the 10 new ones (description, founded_year, address, phone, email, featured_cable_ids, featured_image, featured_image_sort, featured_text, featured_text_sort)

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/manufacturer.py
git commit -m "feat(backend): extend Manufacturer model with showcase fields"
```

---

## Task 2: Extend Pydantic Schemas

**Files:**
- Modify: `backend/app/schemas/manufacturer.py`

- [ ] **Step 1: Replace `manufacturer.py` schema file with extended version**

Replace the entire contents of `backend/app/schemas/manufacturer.py` with:

```python
from datetime import datetime

from pydantic import BaseModel


class ManufacturerBase(BaseModel):
    id: str
    name: str
    slug: str
    country: str | None = None
    website: str | None = None
    image_url: str | None = None
    description: str | None = None
    founded_year: int | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    featured_cable_ids: list[str] = []
    featured_image: bool = False
    featured_image_sort: int = 0
    featured_text: bool = False
    featured_text_sort: int = 0


class ManufacturerRead(ManufacturerBase):
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ManufacturerCreate(BaseModel):
    id: str
    name: str
    slug: str
    country: str | None = None
    website: str | None = None
    image_url: str | None = None
    description: str | None = None
    founded_year: int | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    featured_cable_ids: list[str] = []
    featured_image: bool = False
    featured_image_sort: int = 0
    featured_text: bool = False
    featured_text_sort: int = 0


class ManufacturerUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    country: str | None = None
    website: str | None = None
    image_url: str | None = None
    description: str | None = None
    founded_year: int | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    featured_cable_ids: list[str] | None = None
    featured_image: bool | None = None
    featured_image_sort: int | None = None
    featured_text: bool | None = None
    featured_text_sort: int | None = None
```

- [ ] **Step 2: Verify schema imports cleanly**

Run: `docker compose exec backend python -c "from app.schemas.manufacturer import ManufacturerRead; print(list(ManufacturerRead.model_fields.keys()))"`
Expected: prints all 17 field names including the 10 new ones

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/manufacturer.py
git commit -m "feat(backend): extend Manufacturer schemas with showcase fields"
```

---

## Task 3: Add Alembic Migration for Showcase Fields

**Files:**
- Create: `backend/alembic/versions/a1b2c3d4e5f6_manufacturer_showcase_fields.py`

- [ ] **Step 1: Determine the current Alembic head**

Run: `docker compose exec backend alembic heads`
Expected: prints current head revision (e.g. `d97c13524b3d (head)`)

Note: replace `down_revision` value in the migration file below with the actual current head from the command output.

- [ ] **Step 2: Create new migration file**

Create `backend/alembic/versions/a1b2c3d4e5f6_manufacturer_showcase_fields.py` with:

```python
"""manufacturer showcase fields

Revision ID: a1b2c3d4e5f6
Revises: d97c13524b3d
Create Date: 2026-07-04 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'd97c13524b3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('manufacturers', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('manufacturers', sa.Column('founded_year', sa.Integer(), nullable=True))
    op.add_column('manufacturers', sa.Column('address', sa.String(length=500), nullable=True))
    op.add_column('manufacturers', sa.Column('phone', sa.String(length=100), nullable=True))
    op.add_column('manufacturers', sa.Column('email', sa.String(length=200), nullable=True))
    op.add_column('manufacturers', sa.Column('featured_cable_ids', sa.JSON(), nullable=False, server_default='[]'))
    op.add_column('manufacturers', sa.Column('featured_image', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('manufacturers', sa.Column('featured_image_sort', sa.Integer(), nullable=False, server_default=sa.text('0')))
    op.add_column('manufacturers', sa.Column('featured_text', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('manufacturers', sa.Column('featured_text_sort', sa.Integer(), nullable=False, server_default=sa.text('0')))


def downgrade() -> None:
    op.drop_column('manufacturers', 'featured_text_sort')
    op.drop_column('manufacturers', 'featured_text')
    op.drop_column('manufacturers', 'featured_image_sort')
    op.drop_column('manufacturers', 'featured_image')
    op.drop_column('manufacturers', 'featured_cable_ids')
    op.drop_column('manufacturers', 'email')
    op.drop_column('manufacturers', 'phone')
    op.drop_column('manufacturers', 'address')
    op.drop_column('manufacturers', 'founded_year')
    op.drop_column('manufacturers', 'description')
```

- [ ] **Step 3: Apply the migration**

Run: `docker compose exec backend alembic upgrade head`
Expected: `INFO  [alembic.runtime.migration] Running upgrade d97c13524b3d -> a1b2c3d4e5f6, manufacturer showcase fields`

- [ ] **Step 4: Verify columns exist in DB**

Run: `docker compose exec backend python -c "import asyncio; from sqlalchemy import text; from app.core.database import async_session; async def main():\n    async with async_session() as s:\n        r = await s.execute(text(\"SELECT column_name FROM information_schema.columns WHERE table_name='manufacturers' ORDER BY ordinal_position\"))\n        print([row[0] for row in r])\nasyncio.run(main())"`
Expected: prints all 17 column names including the 10 new ones

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/a1b2c3d4e5f6_manufacturer_showcase_fields.py
git commit -m "feat(db): add migration for manufacturer showcase fields"
```

---

## Task 4: Add `get_by_slug` CRUD Method + `GET /slug/{slug}` Endpoint

**Files:**
- Modify: `backend/app/crud/manufacturer.py`
- Modify: `backend/app/api/routes/manufacturers.py`

- [ ] **Step 1: Add `get_by_slug` method to `CRUDManufacturer`**

Replace the entire contents of `backend/app/crud/manufacturer.py` with:

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.manufacturer import Manufacturer
from app.schemas.manufacturer import ManufacturerCreate, ManufacturerUpdate


class CRUDManufacturer(CRUDBase[Manufacturer, ManufacturerCreate, ManufacturerUpdate]):
    async def get_by_slug(self, db: AsyncSession, slug: str) -> Manufacturer | None:
        result = await db.execute(select(Manufacturer).where(Manufacturer.slug == slug))
        return result.scalar_one_or_none()


crud_manufacturer = CRUDManufacturer(Manufacturer)
```

- [ ] **Step 2: Add `GET /slug/{slug}` endpoint to routes**

Replace the entire contents of `backend/app/api/routes/manufacturers.py` with:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.crud.manufacturer import crud_manufacturer
from app.schemas.common import PaginatedResponse
from app.schemas.manufacturer import (
    ManufacturerCreate,
    ManufacturerRead,
    ManufacturerUpdate,
)

router = APIRouter()


@router.get("", response_model=PaginatedResponse[ManufacturerRead])
async def list_manufacturers(
    page: int = 1, page_size: int = 20, db: AsyncSession = Depends(get_db)
):
    items, total = await crud_manufacturer.get_multi(db, page=page, page_size=page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/slug/{slug}", response_model=ManufacturerRead)
async def get_manufacturer_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_manufacturer.get_by_slug(db, slug)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})
    return obj


@router.get("/{id}", response_model=ManufacturerRead)
async def get_manufacturer(id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_manufacturer.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})
    return obj


@router.post("", response_model=ManufacturerRead, status_code=201)
async def create_manufacturer(obj_in: ManufacturerCreate, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    return await crud_manufacturer.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=ManufacturerRead)
async def update_manufacturer(id: str, obj_in: ManufacturerUpdate, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    obj = await crud_manufacturer.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})
    return await crud_manufacturer.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=ManufacturerRead)
async def delete_manufacturer(id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    obj = await crud_manufacturer.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})
    return obj
```

**Important:** The `/slug/{slug}` route MUST be declared BEFORE the `/{id}` route so FastAPI matches `/slug/foo` correctly (otherwise `slug` would be treated as an `id`).

- [ ] **Step 3: Verify both endpoints work**

Run: `docker compose exec backend python -c "from app.main import app; paths = [r.path for r in app.routes if 'manufacturers' in r.path]; print(paths)"`
Expected: includes both `/api/manufacturers/slug/{slug}` and `/api/manufacturers/{id}`

- [ ] **Step 4: Restart backend and smoke-test endpoint**

Run: `docker compose restart backend`
Then: `docker compose exec backend python -c "import httpx; r = httpx.get('http://localhost:8000/api/manufacturers/slug/nonexistent'); print(r.status_code, r.json())"`
Expected: `404 {'code': 404, 'message': 'Manufacturer not found'}`

- [ ] **Step 5: Commit**

```bash
git add backend/app/crud/manufacturer.py backend/app/api/routes/manufacturers.py
git commit -m "feat(backend): add GET /manufacturers/slug/{slug} endpoint"
```

---

## Task 5: Extend Frontend `Manufacturer` Type and `lib/api.ts`

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Extend `Manufacturer` interface in `types.ts`**

In `frontend/lib/types.ts`, replace the existing `Manufacturer` interface (lines 2-8):

```typescript
export interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  country: string;
  website: string;
}
```

with:

```typescript
export interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  country: string;
  website: string;
  image_url?: string | null;
  description?: string | null;
  founded_year?: number | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  featured_cable_ids?: string[];
  featured_image?: boolean;
  featured_image_sort?: number;
  featured_text?: boolean;
  featured_text_sort?: number;
}
```

- [ ] **Step 2: Extend `BackendManufacturer` interface in `lib/api.ts`**

In `frontend/lib/api.ts`, replace the existing `BackendManufacturer` interface (lines 139-146):

```typescript
interface BackendManufacturer {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  website: string | null;
  image_url: string | null;
}
```

with:

```typescript
interface BackendManufacturer {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  website: string | null;
  image_url: string | null;
  description: string | null;
  founded_year: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  featured_cable_ids: string[];
  featured_image: boolean;
  featured_image_sort: number;
  featured_text: boolean;
  featured_text_sort: number;
}
```

- [ ] **Step 3: Extend `adaptManufacturer` in `lib/api.ts`**

In `frontend/lib/api.ts`, replace the existing `adaptManufacturer` function (lines 287-296):

```typescript
function adaptManufacturer(m: BackendManufacturer): Manufacturer {
  return {
    id: m.id,
    name: m.name,
    slug: m.slug,
    country: m.country ?? '',
    website: m.website ?? '',
    image_url: m.image_url ?? null,
  };
}
```

with:

```typescript
function adaptManufacturer(m: BackendManufacturer): Manufacturer {
  return {
    id: m.id,
    name: m.name,
    slug: m.slug,
    country: m.country ?? '',
    website: m.website ?? '',
    image_url: m.image_url ?? null,
    description: m.description ?? null,
    founded_year: m.founded_year ?? null,
    address: m.address ?? null,
    phone: m.phone ?? null,
    email: m.email ?? null,
    featured_cable_ids: m.featured_cable_ids ?? [],
    featured_image: m.featured_image ?? false,
    featured_image_sort: m.featured_image_sort ?? 0,
    featured_text: m.featured_text ?? false,
    featured_text_sort: m.featured_text_sort ?? 0,
  };
}
```

- [ ] **Step 4: Add `getBySlug` method to `api.manufacturers`**

In `frontend/lib/api.ts`, replace the `manufacturers` namespace (lines 321-334):

```typescript
  manufacturers: {
    async all(): Promise<Manufacturer[]> {
      const res = await fetchWithCache<{ items: BackendManufacturer[] }>('/api/manufacturers?page_size=999');
      return res.items.map(adaptManufacturer);
    },
    async getById(id: string): Promise<Manufacturer | null> {
      try {
        const data = await fetchWithCache<BackendManufacturer>(`/api/manufacturers/${id}`);
        return adaptManufacturer(data);
      } catch {
        return null;
      }
    },
  },
```

with:

```typescript
  manufacturers: {
    async all(): Promise<Manufacturer[]> {
      const res = await fetchWithCache<{ items: BackendManufacturer[] }>('/api/manufacturers?page_size=999');
      return res.items.map(adaptManufacturer);
    },
    async getById(id: string): Promise<Manufacturer | null> {
      try {
        const data = await fetchWithCache<BackendManufacturer>(`/api/manufacturers/${id}`);
        return adaptManufacturer(data);
      } catch {
        return null;
      }
    },
    async getBySlug(slug: string): Promise<Manufacturer | null> {
      try {
        const data = await fetchWithCache<BackendManufacturer>(`/api/manufacturers/slug/${slug}`);
        return adaptManufacturer(data);
      } catch {
        return null;
      }
    },
  },
```

- [ ] **Step 5: Verify tsc**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no NEW errors beyond the 14 pre-existing errors (CableCard, lib/api.ts, MediaUploader, BrandForm, ManufacturerForm, ProductTypeForm). Specifically, no errors pointing to lines changed in this task.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat(frontend): extend Manufacturer type and add getBySlug"
```

---

## Task 6: Extend `lib/adminApi.ts` for Showcase Fields Round-Trip

**Files:**
- Modify: `frontend/lib/adminApi.ts`

- [ ] **Step 1: Extend `BackendManufacturer` interface in `adminApi.ts`**

In `frontend/lib/adminApi.ts`, replace the `BackendManufacturer` interface (lines 9-16):

```typescript
interface BackendManufacturer {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  website: string | null;
  image_url: string | null;
}
```

with:

```typescript
interface BackendManufacturer {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  website: string | null;
  image_url: string | null;
  description: string | null;
  founded_year: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  featured_cable_ids: string[];
  featured_image: boolean;
  featured_image_sort: number;
  featured_text: boolean;
  featured_text_sort: number;
}
```

- [ ] **Step 2: Define `ManufacturerShowcase` type and `RawManufacturer` type**

In `frontend/lib/adminApi.ts`, immediately AFTER the `BackendManufacturer` interface (after line 16 in the updated file), add:

```typescript

// Showcase fields that admin edit blocks manage independently via partial PUT
export interface ManufacturerShowcase {
  description: string | null;
  founded_year: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  featured_cable_ids: string[];
  featured_image: boolean;
  featured_image_sort: number;
  featured_text: boolean;
  featured_text_sort: number;
}

// Raw backend shape (for round-trip through edit forms)
export type RawManufacturer = BackendManufacturer;
```

- [ ] **Step 3: Update `adaptManufacturer` to round-trip showcase fields**

In `frontend/lib/adminApi.ts`, replace the existing `adaptManufacturer` function (lines 117-119):

```typescript
function adaptManufacturer(m: BackendManufacturer): Manufacturer {
  return { id: m.id, name: m.name, slug: m.slug, country: m.country ?? '', website: m.website ?? '' };
}
```

with:

```typescript
function adaptManufacturer(m: BackendManufacturer): Manufacturer {
  return {
    id: m.id,
    name: m.name,
    slug: m.slug,
    country: m.country ?? '',
    website: m.website ?? '',
    image_url: m.image_url ?? null,
    description: m.description ?? null,
    founded_year: m.founded_year ?? null,
    address: m.address ?? null,
    phone: m.phone ?? null,
    email: m.email ?? null,
    featured_cable_ids: m.featured_cable_ids ?? [],
    featured_image: m.featured_image ?? false,
    featured_image_sort: m.featured_image_sort ?? 0,
    featured_text: m.featured_text ?? false,
    featured_text_sort: m.featured_text_sort ?? 0,
  };
}
```

- [ ] **Step 4: Add `getRawById` and `updateShowcase` methods**

In `frontend/lib/adminApi.ts`, replace the entire `manufacturers` namespace (lines 186-221):

```typescript
  manufacturers: {
    async all(page = 1, page_size = 20): Promise<{ items: Manufacturer[]; total: number }> {
      const data = await adminGet<ListResponse<BackendManufacturer>>(
        `/api/manufacturers?page=${page}&page_size=${page_size}`
      );
      return { items: data.items.map(adaptManufacturer), total: data.total };
    },
    async getById(id: string): Promise<Manufacturer | null> {
      try {
        const data = await adminGet<BackendManufacturer>(`/api/manufacturers/${id}`);
        return adaptManufacturer(data);
      } catch {
        return null;
      }
    },
    // Returns raw backend data (with showcase fields) for round-tripping through edit forms
    async getRawById(id: string): Promise<RawManufacturer | null> {
      try {
        return await adminGet<BackendManufacturer>(`/api/manufacturers/${id}`);
      } catch {
        return null;
      }
    },
    async create(payload: { id: string; name: string; slug: string; country?: string | null; website?: string | null }): Promise<Manufacturer> {
      const res = await adminFetch('/api/manufacturers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`API ${res.status}: /api/manufacturers`);
      return adaptManufacturer(await res.json() as BackendManufacturer);
    },
    async update(id: string, payload: { id: string; name: string; slug: string; country?: string | null; website?: string | null }): Promise<Manufacturer> {
      const res = await adminFetch(`/api/manufacturers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`API ${res.status}: /api/manufacturers/${id}`);
      return adaptManufacturer(await res.json() as BackendManufacturer);
    },
    // Partial PUT for showcase fields only (called by individual edit blocks)
    async updateShowcase(id: string, payload: Partial<ManufacturerShowcase>): Promise<RawManufacturer> {
      const res = await adminFetch(`/api/manufacturers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`API ${res.status}: /api/manufacturers/${id}`);
      return await res.json() as BackendManufacturer;
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/manufacturers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API ${res.status}: /api/manufacturers/${id}`);
    },
  },
```

- [ ] **Step 5: Verify tsc**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no NEW errors beyond the 14 pre-existing ones

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/adminApi.ts
git commit -m "feat(frontend): extend adminApi with showcase round-trip + updateShowcase"
```

---

## Task 7: Create `ManufacturerShowcaseBlocks` Client Component

**Files:**
- Create: `frontend/components/admin/form/ManufacturerShowcaseBlocks.tsx`

- [ ] **Step 1: Create the showcase blocks component**

Create `frontend/components/admin/form/ManufacturerShowcaseBlocks.tsx` with:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { ManufacturerShowcase, RawManufacturer } from '@/lib/adminApi';
import { adminApi } from '@/lib/adminApi';

interface ShowcaseBlocksProps {
  manufacturerId: string;
  initial: RawManufacturer;
  // Cables belonging to this manufacturer's brands (for featured cable selection).
  // Each item: { id, model, brand_name }
  manufacturerCables: Array<{ id: string; model: string; brand_name: string }>;
}

const inputClass =
  'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export function ManufacturerShowcaseBlocks({ manufacturerId, initial, manufacturerCables }: ShowcaseBlocksProps) {
  // === Block A: Description ===
  const [description, setDescription] = useState(initial.description ?? '');
  const [foundedYear, setFoundedYear] = useState<string>(
    initial.founded_year !== null && initial.founded_year !== undefined ? String(initial.founded_year) : ''
  );
  const [descSaving, setDescSaving] = useState(false);
  const [descMsg, setDescMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function saveDescription(e: FormEvent) {
    e.preventDefault();
    setDescSaving(true);
    setDescMsg(null);
    try {
      const yearNum = foundedYear === '' ? null : Number(foundedYear);
      await adminApi.manufacturers.updateShowcase(manufacturerId, {
        description: description || null,
        founded_year: yearNum,
      });
      setDescMsg({ kind: 'ok', text: 'Saved' });
    } catch {
      setDescMsg({ kind: 'err', text: 'Save failed' });
    } finally {
      setDescSaving(false);
    }
  }

  // === Block B: Featured Cables ===
  const [featuredIds, setFeaturedIds] = useState<string[]>(initial.featured_cable_ids ?? []);
  const [featSaving, setFeatSaving] = useState(false);
  const [featMsg, setFeatMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function toggleCable(id: string) {
    setFeaturedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function saveFeatured(e: FormEvent) {
    e.preventDefault();
    setFeatSaving(true);
    setFeatMsg(null);
    try {
      await adminApi.manufacturers.updateShowcase(manufacturerId, {
        featured_cable_ids: featuredIds,
      });
      setFeatMsg({ kind: 'ok', text: 'Saved' });
    } catch {
      setFeatMsg({ kind: 'err', text: 'Save failed' });
    } finally {
      setFeatSaving(false);
    }
  }

  // === Block C: Contact ===
  const [address, setAddress] = useState(initial.address ?? '');
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [email, setEmail] = useState(initial.email ?? '');
  const [contactSaving, setContactSaving] = useState(false);
  const [contactMsg, setContactMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function saveContact(e: FormEvent) {
    e.preventDefault();
    setContactSaving(true);
    setContactMsg(null);
    try {
      await adminApi.manufacturers.updateShowcase(manufacturerId, {
        address: address || null,
        phone: phone || null,
        email: email || null,
      });
      setContactMsg({ kind: 'ok', text: 'Saved' });
    } catch {
      setContactMsg({ kind: 'err', text: 'Save failed' });
    } finally {
      setContactSaving(false);
    }
  }

  // === Block D: Recommendation Slots ===
  const [featuredImage, setFeaturedImage] = useState(initial.featured_image ?? false);
  const [featuredImageSort, setFeaturedImageSort] = useState<string>(String(initial.featured_image_sort ?? 0));
  const [featuredText, setFeaturedText] = useState(initial.featured_text ?? false);
  const [featuredTextSort, setFeaturedTextSort] = useState<string>(String(initial.featured_text_sort ?? 0));
  const [slotSaving, setSlotSaving] = useState(false);
  const [slotMsg, setSlotMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function saveSlots(e: FormEvent) {
    e.preventDefault();
    setSlotSaving(true);
    setSlotMsg(null);
    try {
      await adminApi.manufacturers.updateShowcase(manufacturerId, {
        featured_image: featuredImage,
        featured_image_sort: Number(featuredImageSort) || 0,
        featured_text: featuredText,
        featured_text_sort: Number(featuredTextSort) || 0,
      });
      setSlotMsg({ kind: 'ok', text: 'Saved' });
    } catch {
      setSlotMsg({ kind: 'err', text: 'Save failed' });
    } finally {
      setSlotSaving(false);
    }
  }

  function msgBanner(m: { kind: 'ok' | 'err'; text: string } | null) {
    if (!m) return null;
    const cls = m.kind === 'ok'
      ? 'bg-green-50 text-green-700 border-green-200'
      : 'bg-red-50 text-red-700 border-red-200';
    return <span className={`ml-3 px-2 py-1 text-xs rounded border ${cls}`}>{m.text}</span>;
  }

  return (
    <div className="mt-10 space-y-8">
      <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Showcase Content</h2>

      {/* Block A: Description */}
      <form onSubmit={saveDescription} className="space-y-3 border rounded-md p-4 bg-white">
        <h3 className="text-sm font-semibold text-gray-900">A. Company Description</h3>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mfr-description" className="text-sm font-medium text-gray-700">Description (HTML allowed)</label>
          <textarea
            id="mfr-description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
            placeholder="<p>Founded in ..., we specialize in ...</p>"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mfr-founded-year" className="text-sm font-medium text-gray-700">Founded Year</label>
          <input
            id="mfr-founded-year"
            type="number"
            value={foundedYear}
            onChange={(e) => setFoundedYear(e.target.value)}
            className={inputClass}
            placeholder="1910"
          />
        </div>
        <div className="flex items-center">
          <button
            type="submit"
            disabled={descSaving}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {descSaving ? 'Saving…' : 'Save Description'}
          </button>
          {msgBanner(descMsg)}
        </div>
      </form>

      {/* Block B: Featured Cables */}
      <form onSubmit={saveFeatured} className="space-y-3 border rounded-md p-4 bg-white">
        <h3 className="text-sm font-semibold text-gray-900">B. Featured Cables</h3>
        {manufacturerCables.length === 0 ? (
          <p className="text-sm text-gray-500">
            No cables found for this manufacturer&apos;s brands.{' '}
            <Link href="/admin/cables" className="text-blue-600 hover:underline">Add cables first</Link>.
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto border rounded p-2 space-y-1">
            {manufacturerCables.map(c => (
              <label key={c.id} className="flex items-center gap-2 py-1 px-2 hover:bg-gray-50 rounded">
                <input
                  type="checkbox"
                  checked={featuredIds.includes(c.id)}
                  onChange={() => toggleCable(c.id)}
                  className="h-4 w-4"
                />
                <span className="text-sm text-gray-700">{c.model}</span>
                <span className="text-xs text-gray-400">— {c.brand_name}</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500">Selected: {featuredIds.length} cable(s)</p>
        <div className="flex items-center">
          <button
            type="submit"
            disabled={featSaving}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {featSaving ? 'Saving…' : 'Save Featured Cables'}
          </button>
          {msgBanner(featMsg)}
        </div>
      </form>

      {/* Block C: Contact Info */}
      <form onSubmit={saveContact} className="space-y-3 border rounded-md p-4 bg-white">
        <h3 className="text-sm font-semibold text-gray-900">C. Contact Info</h3>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mfr-address" className="text-sm font-medium text-gray-700">Address</label>
          <input
            id="mfr-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClass}
            placeholder="Leave empty to hide on page"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mfr-phone" className="text-sm font-medium text-gray-700">Phone</label>
          <input
            id="mfr-phone"
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="Leave empty to hide on page"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mfr-email" className="text-sm font-medium text-gray-700">Email</label>
          <input
            id="mfr-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="Leave empty to hide on page"
          />
        </div>
        <div className="flex items-center">
          <button
            type="submit"
            disabled={contactSaving}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {contactSaving ? 'Saving…' : 'Save Contact'}
          </button>
          {msgBanner(contactMsg)}
        </div>
      </form>

      {/* Block D: Recommendation Slots */}
      <form onSubmit={saveSlots} className="space-y-3 border rounded-md p-4 bg-white">
        <h3 className="text-sm font-semibold text-gray-900">D. Recommendation Slots</h3>
        <p className="text-xs text-gray-500">
          Control whether this manufacturer appears in the &quot;Manufacturers&quot; page right-sidebar recommendation slots.
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={featuredImage}
                onChange={(e) => setFeaturedImage(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-gray-700">Show in image slot</span>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Sort:</span>
              <input
                type="number"
                value={featuredImageSort}
                onChange={(e) => setFeaturedImageSort(e.target.value)}
                className={`${inputClass} w-20`}
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={featuredText}
                onChange={(e) => setFeaturedText(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-gray-700">Show in text slot</span>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Sort:</span>
              <input
                type="number"
                value={featuredTextSort}
                onChange={(e) => setFeaturedTextSort(e.target.value)}
                className={`${inputClass} w-20`}
              />
            </label>
          </div>
        </div>
        <div className="flex items-center">
          <button
            type="submit"
            disabled={slotSaving}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {slotSaving ? 'Saving…' : 'Save Slot Config'}
          </button>
          {msgBanner(slotMsg)}
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no NEW errors beyond the 14 pre-existing ones

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/form/ManufacturerShowcaseBlocks.tsx
git commit -m "feat(frontend): add ManufacturerShowcaseBlocks component"
```

---

## Task 8: Extend Admin Manufacturer Edit Page with Showcase Blocks

**Files:**
- Modify: `frontend/app/admin/(dashboard)/manufacturers/[id]/page.tsx`

- [ ] **Step 1: Replace the admin edit page to render showcase blocks below the form**

Replace the entire contents of `frontend/app/admin/(dashboard)/manufacturers/[id]/page.tsx` with:

```tsx
import { adminApi } from '@/lib/adminApi';
import { ManufacturerForm } from '@/components/admin/form/ManufacturerForm';
import { ManufacturerShowcaseBlocks } from '@/components/admin/form/ManufacturerShowcaseBlocks';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditManufacturerPage({ params }: PageProps) {
  const { id } = await params;
  const manufacturer = await adminApi.manufacturers.getById(id);

  if (!manufacturer) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Not found</h1>
        <p className="text-gray-500">
          The manufacturer you are looking for does not exist.
        </p>
      </div>
    );
  }

  // Fetch raw data (with showcase fields) for the editing blocks
  const rawManufacturer = await adminApi.manufacturers.getRawById(id);
  if (!rawManufacturer) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Not found</h1>
        <p className="text-gray-500">
          The manufacturer you are looking for does not exist.
        </p>
      </div>
    );
  }

  // Fetch all brands + cables to find cables belonging to this manufacturer's brands
  const [{ items: allBrands }, { items: allCables }] = await Promise.all([
    adminApi.brands.all(1, 999),
    adminApi.cables.all(1, 999),
  ]);
  const brandIds = new Set(
    allBrands.filter(b => b.manufacturer_id === id).map(b => b.id)
  );
  const manufacturerCables = allCables
    .filter(c => brandIds.has(c.brand_id))
    .map(c => {
      const brand = allBrands.find(b => b.id === c.brand_id);
      return {
        id: c.id,
        model: c.model,
        brand_name: brand?.name ?? 'Unknown',
      };
    });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Manufacturer</h1>
      <ManufacturerForm initial={manufacturer} />
      <ManufacturerShowcaseBlocks
        manufacturerId={id}
        initial={rawManufacturer}
        manufacturerCables={manufacturerCables}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no NEW errors beyond the 14 pre-existing ones

- [ ] **Step 3: Commit**

```bash
git add frontend/app/admin/(dashboard)/manufacturers/[id]/page.tsx
git commit -m "feat(frontend): render showcase blocks on admin manufacturer edit page"
```

---

## Task 9: Create Public Index Page `/manufacturers`

**Files:**
- Create: `frontend/app/(site)/manufacturers/page.tsx`

- [ ] **Step 1: Create the index page**

Create `frontend/app/(site)/manufacturers/page.tsx` with:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { api } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Manufacturers - Unowire',
  description: 'Browse cable manufacturers A-Z.',
  alternates: { canonical: '/manufacturers' },
  robots: { index: true, follow: true },
};

function getLetterKey(name: string): string {
  const first = name.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
}

export default async function ManufacturersIndexPage() {
  const all = await api.manufacturers.all();

  // Group by first letter A-Z (non-letters -> '#')
  const grouped = new Map<string, typeof all>();
  for (const m of all) {
    const key = getLetterKey(m.name);
    const arr = grouped.get(key) ?? [];
    arr.push(m);
    grouped.set(key, arr);
  }
  // Sort manufacturers within each group by name (case-insensitive)
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }
  // Sort letter groups A-Z, '#' last
  const sortedLetters = Array.from(grouped.keys()).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });

  // Right sidebar: image slot (top 5) + text slot (top 10)
  const imageSlot = all
    .filter(m => m.featured_image && m.image_url)
    .sort((a, b) => (a.featured_image_sort ?? 0) - (b.featured_image_sort ?? 0))
    .slice(0, 5);

  const textSlot = all
    .filter(m => m.featured_text)
    .sort((a, b) => (a.featured_text_sort ?? 0) - (b.featured_text_sort ?? 0))
    .slice(0, 10);

  return (
    <Container className="py-6">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Manufacturers' },
      ]} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Manufacturers</h1>
        <p className="text-sm text-gray-600">Browse cable manufacturers by name.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left: A-Z grouped list */}
        <div className="flex-1 min-w-0">
          {sortedLetters.length === 0 ? (
            <p className="text-gray-500">No manufacturers yet.</p>
          ) : (
            <div className="space-y-6">
              {sortedLetters.map(letter => (
                <div key={letter}>
                  <h2 className="text-2xl font-bold text-gray-900 border-b pb-2 mb-3">
                    # {letter}
                  </h2>
                  <ul className="space-y-1">
                    {grouped.get(letter)!.map(m => (
                      <li key={m.id}>
                        <Link
                          href={`/manufacturers/${m.slug}`}
                          className="py-1 text-gray-700 hover:text-blue-600 hover:underline inline-block"
                        >
                          {m.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Recommendation slots (sticky) */}
        <aside className="lg:w-80 shrink-0">
          <div className="sticky top-20 space-y-6">
            {imageSlot.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-900 uppercase mb-3">Featured Manufacturers</h3>
                <div className="space-y-3">
                  {imageSlot.map(m => (
                    <Link
                      key={m.id}
                      href={`/manufacturers/${m.slug}`}
                      className="flex items-center gap-3 border rounded-lg p-2 hover:shadow-md transition bg-white"
                    >
                      {m.image_url && (
                        <img
                          src={m.image_url}
                          alt={m.name}
                          className="h-12 w-12 rounded object-cover shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                        {m.country && (
                          <p className="text-xs text-gray-500 truncate">{m.country}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {imageSlot.length > 0 && textSlot.length > 0 && (
              <hr className="border-gray-200" />
            )}

            {textSlot.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-900 uppercase mb-3">Recommended Companies</h3>
                <ul className="space-y-0">
                  {textSlot.map(m => (
                    <li key={m.id} className="py-2 border-b border-gray-100 last:border-0">
                      <Link
                        href={`/manufacturers/${m.slug}`}
                        className="text-sm text-gray-700 hover:text-blue-600 hover:underline"
                      >
                        {m.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </Container>
  );
}
```

- [ ] **Step 2: Verify tsc**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no NEW errors beyond the 14 pre-existing ones

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(site)/manufacturers/page.tsx"
git commit -m "feat(frontend): add /manufacturers index page with A-Z list + recommendation slots"
```

---

## Task 10: Create Public Detail Page `/manufacturers/[slug]`

**Files:**
- Create: `frontend/app/(site)/manufacturers/[slug]/page.tsx`

- [ ] **Step 1: Create the detail page**

Create `frontend/app/(site)/manufacturers/[slug]/page.tsx` with:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableCard } from '@/components/cable/CableCard';
import { JsonLd } from '@/components/seo/JsonLd';
import { api } from '@/lib/api';

export const revalidate = 3600; // ISR 1h

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const manufacturer = await api.manufacturers.getBySlug(slug);
  if (!manufacturer) return { title: 'Not Found' };
  const description = manufacturer.description
    ? manufacturer.description.replace(/<[^>]+>/g, '').slice(0, 160)
    : `${manufacturer.name} is a cable manufacturer${manufacturer.country ? ` based in ${manufacturer.country}` : ''}.`;
  return {
    title: `${manufacturer.name} - Manufacturer - Unowire`,
    description,
    alternates: { canonical: `/manufacturers/${manufacturer.slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function ManufacturerDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const manufacturer = await api.manufacturers.getBySlug(slug);
  if (!manufacturer) notFound();

  // Fetch all brands + cables to find this manufacturer's brands/cables
  const [allBrands, allCables, taxonomy] = await Promise.all([
    api.brands.all(),
    api.cables.all(),
    api.taxonomy.all(),
  ]);

  const manufacturerBrands = allBrands.filter(b => b.manufacturer_id === manufacturer.id);
  const manufacturerBrandIds = new Set(manufacturerBrands.map(b => b.id));
  const manufacturerCables = allCables.filter(c => manufacturerBrandIds.has(c.brand_id));

  // Featured cables: fetch by id, filter to those belonging to this manufacturer (defensive)
  const featuredCables = (manufacturer.featured_cable_ids ?? [])
    .map(id => manufacturerCables.find(c => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

  // Group all cables by product_type for the bottom section
  const cablesByProductType = new Map<string, typeof manufacturerCables>();
  for (const c of manufacturerCables) {
    const ptKey = c.product_type;
    const arr = cablesByProductType.get(ptKey) ?? [];
    arr.push(c);
    cablesByProductType.set(ptKey, arr);
  }
  // Resolve product type labels from taxonomy
  function getProductTypeLabel(industryKey: string, categoryKey: string, ptKey: string): string {
    const ind = taxonomy[industryKey];
    const cat = ind?.categories[categoryKey];
    const pt = cat?.product_types[ptKey];
    return pt?.label ?? ptKey;
  }

  // Build JSON-LD Organization
  const jsonLd: object = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: manufacturer.name,
    url: manufacturer.website || undefined,
    logo: manufacturer.image_url || undefined,
    foundingDate: manufacturer.founded_year ? String(manufacturer.founded_year) : undefined,
    address: manufacturer.address ? {
      '@type': 'PostalAddress',
      streetAddress: manufacturer.address,
      addressCountry: manufacturer.country || undefined,
    } : undefined,
    contactPoint: (manufacturer.phone || manufacturer.email) ? {
      '@type': 'ContactPoint',
      telephone: manufacturer.phone || undefined,
      email: manufacturer.email || undefined,
    } : undefined,
  };

  // Breadcrumbs
  const breadcrumbItems = [
    { name: 'Home', url: '/' },
    { name: 'Manufacturers', url: '/manufacturers' },
    { name: manufacturer.name },
  ];

  // Header metadata parts
  const metaParts: string[] = [];
  if (manufacturer.country) metaParts.push(manufacturer.country);
  if (manufacturer.founded_year) metaParts.push(`Founded: ${manufacturer.founded_year}`);

  return (
    <Container className="py-6">
      <Breadcrumbs items={breadcrumbItems} />
      <JsonLd data={jsonLd} />

      {/* Section 1: Header */}
      <div className="flex items-center gap-4 mb-8">
        {manufacturer.image_url ? (
          <img
            src={manufacturer.image_url}
            alt={manufacturer.name}
            className="h-20 w-20 rounded object-cover shrink-0"
          />
        ) : (
          <div className="h-20 w-20 rounded bg-gray-200 flex items-center justify-center text-2xl font-bold text-gray-500 shrink-0">
            {manufacturer.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{manufacturer.name}</h1>
          {metaParts.length > 0 && (
            <p className="text-sm text-gray-600 mt-1">{metaParts.join(' · ')}</p>
          )}
          {manufacturer.website && (
            <a
              href={manufacturer.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Visit Website →
            </a>
          )}
        </div>
      </div>

      {/* Section 2: Description */}
      {manufacturer.description && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">About {manufacturer.name}</h2>
          <div
            className="prose max-w-none text-gray-700"
            dangerouslySetInnerHTML={{ __html: manufacturer.description }}
          />
        </section>
      )}

      {/* Section 3: Contact Info */}
      {(manufacturer.address || manufacturer.phone || manufacturer.email) && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Contact</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {manufacturer.address && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Address</h3>
                <p className="text-sm text-gray-700">{manufacturer.address}</p>
              </div>
            )}
            {manufacturer.phone && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Phone</h3>
                <a href={`tel:${manufacturer.phone}`} className="text-sm text-blue-600 hover:underline">
                  {manufacturer.phone}
                </a>
              </div>
            )}
            {manufacturer.email && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Email</h3>
                <a href={`mailto:${manufacturer.email}`} className="text-sm text-blue-600 hover:underline">
                  {manufacturer.email}
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Section 4: Featured Cables */}
      {featuredCables.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Featured Cables</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {featuredCables.map(cable => {
              const brand = manufacturerBrands.find(b => b.id === cable.brand_id) ?? null;
              return (
                <CableCard
                  key={cable.id}
                  cable={cable}
                  brand={brand}
                  manufacturer={manufacturer}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Section 5: All Brands */}
      {manufacturerBrands.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Brands</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {manufacturerBrands.map(brand => {
              const brandCableCount = manufacturerCables.filter(c => c.brand_id === brand.id).length;
              return (
                <Link
                  key={brand.id}
                  href={`/cables?brand=${brand.id}`}
                  className="flex items-center gap-3 border rounded-lg p-3 hover:shadow-md transition bg-white"
                >
                  {brand.image_url ? (
                    <img
                      src={brand.image_url}
                      alt={brand.name}
                      className="h-12 w-12 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                      {brand.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{brand.name}</p>
                    <p className="text-xs text-gray-500">
                      {brandCableCount} cable{brandCableCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 6: All Cables by Product Type */}
      {manufacturerCables.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">All Cables</h2>
          <div className="space-y-6">
            {Array.from(cablesByProductType.entries()).map(([ptKey, cables]) => {
              const firstCable = cables[0];
              const label = firstCable
                ? getProductTypeLabel(firstCable.industry, firstCable.category, ptKey)
                : ptKey;
              return (
                <div key={ptKey}>
                  <h3 className="text-base font-semibold text-gray-800 mb-2">
                    {label} ({cables.length})
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {cables.map(cable => {
                      const brand = manufacturerBrands.find(b => b.id === cable.brand_id) ?? null;
                      return (
                        <CableCard
                          key={cable.id}
                          cable={cable}
                          brand={brand}
                          manufacturer={manufacturer}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </Container>
  );
}
```

- [ ] **Step 2: Verify tsc**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no NEW errors beyond the 14 pre-existing ones

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(site)/manufacturers/[slug]/page.tsx"
git commit -m "feat(frontend): add /manufacturers/[slug] detail page with 6 sections"
```

---

## Task 11: Add Nav and Footer Links

**Files:**
- Modify: `frontend/components/layout/Nav.tsx`
- Modify: `frontend/components/layout/Footer.tsx`

- [ ] **Step 1: Add `/manufacturers` link to Nav**

In `frontend/components/layout/Nav.tsx`, replace the `links` array (lines 6-11):

```typescript
  const links = [
    { href: '/cables', label: 'Cables' },
    { href: '/categories/automotive', label: 'Automotive' },
    { href: '/categories/consumer-electronics', label: 'Consumer Electronics' },
    { href: '/categories/industrial', label: 'Industrial' },
  ];
```

with:

```typescript
  const links = [
    { href: '/cables', label: 'Cables' },
    { href: '/manufacturers', label: 'Manufacturers' },
    { href: '/categories/automotive', label: 'Automotive' },
    { href: '/categories/consumer-electronics', label: 'Consumer Electronics' },
    { href: '/categories/industrial', label: 'Industrial' },
  ];
```

- [ ] **Step 2: Add `/manufacturers` link to Footer**

In `frontend/components/layout/Footer.tsx`, replace the `<nav>` block (lines 11-14):

```tsx
          <nav className="flex gap-4">
            <Link href="/cables" className="hover:text-blue-600">Cables</Link>
            <Link href="/categories/automotive" className="hover:text-blue-600">Automotive</Link>
            <Link href="/categories/consumer-electronics" className="hover:text-blue-600">Consumer Electronics</Link>
          </nav>
```

with:

```tsx
          <nav className="flex gap-4">
            <Link href="/cables" className="hover:text-blue-600">Cables</Link>
            <Link href="/manufacturers" className="hover:text-blue-600">Manufacturers</Link>
            <Link href="/categories/automotive" className="hover:text-blue-600">Automotive</Link>
            <Link href="/categories/consumer-electronics" className="hover:text-blue-600">Consumer Electronics</Link>
          </nav>
```

- [ ] **Step 3: Verify tsc**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no NEW errors beyond the 14 pre-existing ones

- [ ] **Step 4: Commit**

```bash
git add frontend/components/layout/Nav.tsx frontend/components/layout/Footer.tsx
git commit -m "feat(frontend): add Manufacturers link to Nav and Footer"
```

---

## Task 12: Cross-Link from Cable Detail Page

**Files:**
- Modify: `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx`

- [ ] **Step 1: Replace manufacturer name with a Link to `/manufacturers/{slug}`**

In `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx`, replace lines 67-69:

```tsx
            <p className="text-gray-600">
              {brand?.name ?? 'Unknown'}{manufacturer ? ` · ${manufacturer.country}` : ''}
            </p>
```

with:

```tsx
            <p className="text-gray-600">
              {brand?.name ?? 'Unknown'}
              {manufacturer && (
                <>
                  {' · '}
                  <Link
                    href={`/manufacturers/${manufacturer.slug}`}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {manufacturer.name}
                  </Link>
                  {manufacturer.country ? ` · ${manufacturer.country}` : ''}
                </>
              )}
            </p>
```

Note: the existing file already imports `Link` from `next/link` — check this. If not, add the import. (The file currently does NOT import Link. Add `import Link from 'next/link';` near the top.)

To check the existing imports, look at lines 1-12 of the file. The current imports are:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableSpecTable } from '@/components/cable/CableSpecTable';
import { VariantComparisonTable } from '@/components/cable/VariantComparisonTable';
import { RecommendedEquipmentCard } from '@/components/equipment/RecommendedEquipmentCard';
import { SimilarCables } from '@/components/shared/SimilarCables';
import { JsonLd } from '@/components/seo/JsonLd';
import { api, getCableUrl } from '@/lib/api';
import { recommendEquipments } from '@/lib/equipment-recommend';
import { generateCableMetadata, buildCableJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';
```

Add `import Link from 'next/link';` as the FIRST import line (before `import type { Metadata } from 'next';`).

So the final state of the imports block is:

```tsx
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableSpecTable } from '@/components/cable/CableSpecTable';
import { VariantComparisonTable } from '@/components/cable/VariantComparisonTable';
import { RecommendedEquipmentCard } from '@/components/equipment/RecommendedEquipmentCard';
import { SimilarCables } from '@/components/shared/SimilarCables';
import { JsonLd } from '@/components/seo/JsonLd';
import { api, getCableUrl } from '@/lib/api';
import { recommendEquipments } from '@/lib/equipment-recommend';
import { generateCableMetadata, buildCableJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';
```

- [ ] **Step 2: Verify tsc**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no NEW errors beyond the 14 pre-existing ones

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx"
git commit -m "feat(frontend): cross-link manufacturer name on cable detail page"
```

---

## Task 13: Extend Sitemap with Manufacturer URLs

**Files:**
- Modify: `frontend/app/sitemap.ts`

- [ ] **Step 1: Add manufacturers to the sitemap**

In `frontend/app/sitemap.ts`, replace the entire file with:

```typescript
import type { MetadataRoute } from 'next';
import { api, getCableUrl } from '@/lib/api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cables, taxonomy, manufacturers] = await Promise.all([
    api.cables.all(),
    api.taxonomy.all(),
    api.manufacturers.all(),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/cables`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/manufacturers`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
  ];

  // Taxonomy routes: product types only (flat, no intermediate pages)
  const taxonomyPages: MetadataRoute.Sitemap = [];
  for (const ind of Object.values(taxonomy)) {
    for (const cat of Object.values(ind.categories)) {
      for (const pt of Object.values(cat.product_types)) {
        taxonomyPages.push({
          url: `${SITE_URL}/cables/${ind.slug}/${cat.slug}/${pt.slug}`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        });
      }
    }
  }

  const cablePages: MetadataRoute.Sitemap = cables.map(cable => ({
    url: `${SITE_URL}${getCableUrl(cable)}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const manufacturerPages: MetadataRoute.Sitemap = manufacturers.map(m => ({
    url: `${SITE_URL}/manufacturers/${m.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...taxonomyPages, ...cablePages, ...manufacturerPages];
}
```

- [ ] **Step 2: Verify tsc**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no NEW errors beyond the 14 pre-existing ones

- [ ] **Step 3: Commit**

```bash
git add frontend/app/sitemap.ts
git commit -m "feat(frontend): add manufacturer URLs to sitemap"
```

---

## Task 14: Restart Containers and Clear Next.js Cache

**Files:** (no file changes)

- [ ] **Step 1: Restart backend + frontend**

Run: `docker compose restart backend frontend`
Expected: both containers exit code 0 and report healthy

- [ ] **Step 2: Verify container health**

Run: `docker compose ps`
Expected: both backend and frontend show status `Up` (or `running`)

- [ ] **Step 3: Clear Next.js `.next` cache (to avoid stale Turbopack cache)**

Run: `docker compose exec frontend rm -rf .next`
Then: `docker compose restart frontend`
Expected: frontend restarts cleanly

- [ ] **Step 4: Verify backend routes registered**

Run: `docker compose exec backend python -c "from app.main import app; paths = [r.path for r in app.routes if 'manufacturers' in r.path]; print(sorted(paths))"`
Expected: includes `/api/manufacturers`, `/api/manufacturers/{id}`, `/api/manufacturers/slug/{slug}`

- [ ] **Step 5: Verify tsc one final time**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no NEW errors beyond the 14 pre-existing ones

---

## Task 15: Manual Smoke Test

**Files:** (no file changes)

- [ ] **Step 1: Backend API smoke tests**

Run each command and verify output:

1. `docker compose exec backend python -c "import httpx; r = httpx.get('http://localhost:8000/api/manufacturers/slug/nonexistent'); print(r.status_code, r.json())"`
   Expected: `404 {'code': 404, 'message': 'Manufacturer not found'}`

2. `docker compose exec backend python -c "import httpx; r = httpx.get('http://localhost:8000/api/manufacturers?page_size=1'); print(r.status_code, list(r.json()['items'][0].keys()) if r.json()['items'] else 'no items')"`
   Expected: status 200, item keys include all 17 fields (description, founded_year, address, phone, email, featured_cable_ids, featured_image, featured_image_sort, featured_text, featured_text_sort)

- [ ] **Step 2: Frontend route smoke tests (HTTP status)**

Run each command and verify status:

3. `docker compose exec frontend node -e "fetch('http://localhost:3000/manufacturers').then(r => console.log(r.status))"`
   Expected: `200`

4. `docker compose exec frontend node -e "fetch('http://localhost:3000/manufacturers/nonexistent').then(r => console.log(r.status))"`
   Expected: `404`

- [ ] **Step 3: Admin edit page smoke test**

5. `docker compose exec frontend node -e "fetch('http://localhost:3000/admin/manufacturers').then(r => console.log(r.status))"`
   Expected: `307` (redirect to login, since admin requires auth — this confirms route exists)

- [ ] **Step 4: Browser-level manual checks (perform in browser at http://localhost:3000)**

Log in to `/admin/login` first, then verify each:

6. Visit `/manufacturers` — verify A-Z grouping renders, right sidebar shows featured slots (or hides if empty)
7. Click a manufacturer name — verify detail page renders with header, description (if set), contact (if set), brands, cables grouped by product type
8. Visit `/manufacturers/nonexistent` — verify 404 page renders
9. Visit `/admin/manufacturers/{existing-id}` — verify 4 showcase blocks appear below the existing form
10. Edit Block A (description), click Save — verify "Saved" message appears
11. Edit Block D — check "Show in image slot" + sort 0, save — then visit `/manufacturers` and verify manufacturer appears in right sidebar image slot
12. Visit any cable detail page `/cable/{brand_slug}/{slug}` — verify manufacturer name in the `{brand.name} · {manufacturer.name} · {country}` line is a clickable link to `/manufacturers/{slug}`
13. Visit `/sitemap.xml` — verify URLs for `/manufacturers` and `/manufacturers/{slug}` are present

- [ ] **Step 4: Final verification — no new tsc errors**

Run: `docker compose exec frontend npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: count is `14` (the pre-existing baseline — not higher)

---

## Self-Review

### Spec coverage check

- ✅ Data model (10 columns) — Task 1 (model) + Task 2 (schema) + Task 3 (migration)
- ✅ `GET /api/manufacturers/slug/{slug}` endpoint — Task 4
- ✅ Frontend `Manufacturer` type extension + `getBySlug` — Task 5
- ✅ Admin API round-trip + `updateShowcase` partial PUT — Task 6
- ✅ 4 admin editing blocks (description, featured cables, contact, slots) — Task 7 (component) + Task 8 (page integration)
- ✅ Index page `/manufacturers` (A-Z + 2 recommendation slots) — Task 9
- ✅ Detail page `/manufacturers/[slug]` (6 sections, ISR 1h) — Task 10
- ✅ Nav + Footer links — Task 11
- ✅ Cable detail page cross-link — Task 12
- ✅ Sitemap extension — Task 13
- ✅ Verification (restart + smoke test) — Tasks 14 + 15

### Placeholder scan

- No "TBD", "TODO", or "implement later" in any task ✅
- All code blocks contain complete verbatim code ✅
- All commands have expected output ✅

### Type consistency

- `Manufacturer` interface in `types.ts` (Task 5) matches `adaptManufacturer` returns in `lib/api.ts` (Task 5) and `lib/adminApi.ts` (Task 6) ✅
- `ManufacturerShowcase` type (Task 6) matches `ManufacturerShowcaseBlocks` props (Task 7) ✅
- `RawManufacturer` type (Task 6) matches `getRawById` return type (Task 6) and `ManufacturerShowcaseBlocks` `initial` prop (Task 7) ✅
- `api.manufacturers.getBySlug` signature (Task 5) matches call site in detail page (Task 10) ✅
- `adminApi.manufacturers.updateShowcase` signature (Task 6) matches call sites in showcase blocks (Task 7) ✅
- `manufacturerCables` array shape in Task 8 (`{ id, model, brand_name }`) matches `ManufacturerShowcaseBlocks` prop type (Task 7) ✅

### Order dependency

- Tasks 1-3 must run before Task 4 (model + schema + migration before endpoint can work)
- Task 4 before Task 5 (frontend `getBySlug` calls the new endpoint)
- Tasks 5-6 before Task 7 (showcase component uses extended types and `updateShowcase`)
- Task 7 before Task 8 (page imports the showcase component)
- Tasks 5 + 6 before Tasks 9 + 10 (frontend pages use extended `Manufacturer` type and `getBySlug`)
- Tasks 11-13 are independent of each other (can run in any order after Task 5)
- Tasks 14-15 are last (verification)
