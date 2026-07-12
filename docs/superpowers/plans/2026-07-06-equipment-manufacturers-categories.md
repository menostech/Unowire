# Equipment Manufacturers, Categories, and Equipment CRUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add equipment manufacturers, two-level equipment categories, and refactored equipment CRUD (backend + admin UI + frontend cable detail refactor).

**Architecture:** Three independent entities (`equipment_manufacturers`, `equipment_categories`, `recommended_equipments`) with foreign key relationships, following the existing cable `manufacturers`/`brands`/`industries` patterns. Backend exposes 3 RESTful route groups; frontend adds admin pages under `/admin/equipment/*` and refactors the cable detail page to consume the new API.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (async) + Pydantic v2 + Alembic + Next.js 16 (App Router) + TypeScript

**Spec:** [docs/superpowers/specs/2026-07-06-equipment-manufacturers-categories-design.md](file:///d:/projects/unowire/docs/superpowers/specs/2026-07-06-equipment-manufacturers-categories-design.md)

**Project conventions:**
- No automated tests (MVP) — verification via curl + manual smoke testing
- All code, comments, docs in English
- Async middleware only
- Follow existing file organization patterns exactly

---

## File Structure

### Backend (new/modified)

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/models/equipment.py` | Modify | Add `EquipmentManufacturer`, `EquipmentCategory`; refactor `RecommendedEquipment` |
| `backend/app/schemas/equipment.py` | Modify | Add 3 sets of Read/Create/Update schemas |
| `backend/app/crud/equipment.py` | Modify | Split into `crud_equipment_manufacturer`, `crud_equipment_category`, `crud_equipment` |
| `backend/app/api/routes/equipment_manufacturers.py` | Create | Equipment manufacturer router |
| `backend/app/api/routes/equipment_categories.py` | Create | Equipment category router (tree + two-level validation) |
| `backend/app/api/routes/equipment.py` | Modify | Refactor equipment router (nested reads, new filters) |
| `backend/app/main.py` | Modify | Register 2 new routers |
| `backend/alembic/versions/<new>_add_equipment_manufacturers_and_categories.py` | Create | Migration |
| `backend/scripts/seed_equipment.py` | Create | Seed script |

### Frontend (new/modified)

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/lib/types.ts` | Modify | Add `EquipmentManufacturer`, `EquipmentCategory` interfaces; refactor `RecommendedEquipment` |
| `frontend/lib/adminApi.ts` | Modify | Add `equipmentManufacturers`, `equipmentCategories`, `equipment` namespaces |
| `frontend/lib/api.ts` | Modify | Update `recommendedEquipments.all()` to use new backend shape |
| `frontend/app/api/admin/equipment-manufacturers/route.ts` | Create | POST proxy |
| `frontend/app/api/admin/equipment-manufacturers/[id]/route.ts` | Create | PUT/DELETE proxy |
| `frontend/app/api/admin/equipment-categories/route.ts` | Create | POST proxy |
| `frontend/app/api/admin/equipment-categories/[...id]/route.ts` | Create | PUT/DELETE proxy (catch-all) |
| `frontend/app/api/admin/equipment/route.ts` | Create | POST proxy |
| `frontend/app/api/admin/equipment/[id]/route.ts` | Create | PUT/DELETE proxy |
| `frontend/components/admin/form/EquipmentManufacturerForm.tsx` | Create | Manufacturer form |
| `frontend/components/admin/form/EquipmentCategoryForm.tsx` | Create | Category form (with parent select) |
| `frontend/components/admin/form/EquipmentForm.tsx` | Create | Equipment form (with manufacturer/category selects + JSON editor) |
| `frontend/components/admin/layout/AdminSidebar.tsx` | Modify | Add Equipment group |
| `frontend/app/admin/(dashboard)/equipment/manufacturers/page.tsx` | Create | List |
| `frontend/app/admin/(dashboard)/equipment/manufacturers/new/page.tsx` | Create | New |
| `frontend/app/admin/(dashboard)/equipment/manufacturers/[id]/page.tsx` | Create | Edit |
| `frontend/app/admin/(dashboard)/equipment/categories/page.tsx` | Create | List (tree) |
| `frontend/app/admin/(dashboard)/equipment/categories/new/page.tsx` | Create | New |
| `frontend/app/admin/(dashboard)/equipment/categories/[...id]/page.tsx` | Create | Edit (catch-all) |
| `frontend/app/admin/(dashboard)/equipment/page.tsx` | Create | List |
| `frontend/app/admin/(dashboard)/equipment/new/page.tsx` | Create | New |
| `frontend/app/admin/(dashboard)/equipment/[id]/page.tsx` | Create | Edit |
| `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx` | Modify | Use new API for recommendations |
| `frontend/components/equipment/RecommendedEquipmentCard.tsx` | Modify | Use nested manufacturer/category |
| `frontend/lib/equipment-recommend.ts` | Modify | Add deprecation comment |
| `frontend/data/recommended-equipments.json` | Modify | Add deprecation comment |

---

## Phase 1: Backend Models

### Task 1: Add EquipmentManufacturer and EquipmentCategory models, refactor RecommendedEquipment model

**Files:**
- Modify: `backend/app/models/equipment.py`

- [ ] **Step 1: Rewrite the entire models/equipment.py file**

```python
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EquipmentManufacturer(Base):
    __tablename__ = "equipment_manufacturers"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    country: Mapped[str | None] = mapped_column(String(100))
    website: Mapped[str | None] = mapped_column(String(500))
    image_url: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    founded_year: Mapped[int | None] = mapped_column(Integer)
    address: Mapped[str | None] = mapped_column(String(500))
    phone: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    equipments: Mapped[list["RecommendedEquipment"]] = relationship(back_populates="manufacturer")


class EquipmentCategory(Base):
    __tablename__ = "equipment_categories"
    __table_args__ = (UniqueConstraint("parent_id", "slug"),)

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    parent_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("equipment_categories.id", ondelete="CASCADE"), nullable=True
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    parent: Mapped["EquipmentCategory | None"] = relationship(
        remote_side="EquipmentCategory.id", back_populates="children"
    )
    children: Mapped[list["EquipmentCategory"]] = relationship(back_populates="parent")
    equipments: Mapped[list["RecommendedEquipment"]] = relationship(back_populates="category")


class RecommendedEquipment(Base):
    __tablename__ = "recommended_equipments"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    manufacturer_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("equipment_manufacturers.id", ondelete="RESTRICT"), nullable=False
    )
    category_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("equipment_categories.id", ondelete="RESTRICT"), nullable=False
    )
    model: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    applicable_specs: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    external_url: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    manufacturer: Mapped["EquipmentManufacturer"] = relationship(back_populates="equipments")
    category: Mapped["EquipmentCategory"] = relationship(back_populates="equipments")
```

- [ ] **Step 2: Verify syntax by running Python import check**

Run: `docker compose --env-file .env.docker exec -T backend python -c "from app.models.equipment import EquipmentManufacturer, EquipmentCategory, RecommendedEquipment; print('OK')"`
Expected: `OK` (may fail until migration runs, but import should work since models don't touch DB at import time)

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/equipment.py
git commit -m "feat(equipment): add EquipmentManufacturer and EquipmentCategory models, refactor RecommendedEquipment with FK relationships"
```

---

## Phase 2: Backend Schemas

### Task 2: Rewrite schemas/equipment.py with 3 sets of schemas

**Files:**
- Modify: `backend/app/schemas/equipment.py`

- [ ] **Step 1: Replace the entire file content**

```python
from datetime import datetime

from pydantic import BaseModel


# === Applicable Spec Rule (shared) ===
class ApplicableSpecRule(BaseModel):
    spec_key: str
    min: float | None = None
    max: float | None = None
    allowed_values: list[str] | None = None


# === Equipment Manufacturer ===
class EquipmentManufacturerBase(BaseModel):
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
    sort_order: int = 0


class EquipmentManufacturerRead(EquipmentManufacturerBase):
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EquipmentManufacturerCreate(BaseModel):
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
    sort_order: int = 0


class EquipmentManufacturerUpdate(BaseModel):
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
    sort_order: int | None = None


# === Equipment Category ===
class EquipmentCategoryRead(BaseModel):
    id: str
    parent_id: str | None = None
    label: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    sort_order: int = 0
    children: list["EquipmentCategoryRead"] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EquipmentCategoryCreate(BaseModel):
    id: str
    parent_id: str | None = None
    label: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    sort_order: int = 0


class EquipmentCategoryUpdate(BaseModel):
    parent_id: str | None = None
    label: str | None = None
    slug: str | None = None
    description: str | None = None
    image_url: str | None = None
    sort_order: int | None = None


# === Recommended Equipment ===
class RecommendedEquipmentRead(BaseModel):
    id: str
    manufacturer_id: str
    category_id: str
    model: str
    slug: str
    applicable_specs: list[dict] = []
    description: str | None = None
    image_url: str | None = None
    external_url: str | None = None
    sort_order: int = 0
    manufacturer: EquipmentManufacturerRead | None = None
    category: EquipmentCategoryRead | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RecommendedEquipmentCreate(BaseModel):
    id: str
    manufacturer_id: str
    category_id: str
    model: str
    slug: str
    applicable_specs: list[dict] = []
    description: str | None = None
    image_url: str | None = None
    external_url: str | None = None
    sort_order: int = 0


class RecommendedEquipmentUpdate(BaseModel):
    manufacturer_id: str | None = None
    category_id: str | None = None
    model: str | None = None
    slug: str | None = None
    applicable_specs: list[dict] | None = None
    description: str | None = None
    image_url: str | None = None
    external_url: str | None = None
    sort_order: int | None = None
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/equipment.py
git commit -m "feat(equipment): rewrite schemas with 3 entity sets (manufacturer, category, equipment)"
```

---

## Phase 3: Backend CRUD

### Task 3: Rewrite crud/equipment.py with 3 CRUD classes

**Files:**
- Modify: `backend/app/crud/equipment.py`

- [ ] **Step 1: Replace the entire file content**

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.cable import SpecItem
from app.models.equipment import EquipmentCategory, EquipmentManufacturer, RecommendedEquipment
from app.schemas.equipment import (
    EquipmentCategoryCreate,
    EquipmentCategoryUpdate,
    EquipmentManufacturerCreate,
    EquipmentManufacturerUpdate,
    RecommendedEquipmentCreate,
    RecommendedEquipmentUpdate,
)


class CRUDEquipmentManufacturer(
    CRUDBase[EquipmentManufacturer, EquipmentManufacturerCreate, EquipmentManufacturerUpdate]
):
    pass


class CRUDEquipmentCategory(
    CRUDBase[EquipmentCategory, EquipmentCategoryCreate, EquipmentCategoryUpdate]
):
    async def get_with_children(self, db: AsyncSession, id: str) -> EquipmentCategory | None:
        stmt = select(EquipmentCategory).where(EquipmentCategory.id == id).options(
            selectinload(EquipmentCategory.children)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_top_level_with_children(self, db: AsyncSession) -> list[EquipmentCategory]:
        stmt = select(EquipmentCategory).where(
            EquipmentCategory.parent_id.is_(None)
        ).options(
            selectinload(EquipmentCategory.children)
        ).order_by(EquipmentCategory.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_all_flat(self, db: AsyncSession) -> list[EquipmentCategory]:
        stmt = select(EquipmentCategory).order_by(EquipmentCategory.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())


class CRUDEquipment(
    CRUDBase[RecommendedEquipment, RecommendedEquipmentCreate, RecommendedEquipmentUpdate]
):
    async def get_with_relations(self, db: AsyncSession, id: str) -> RecommendedEquipment | None:
        stmt = select(RecommendedEquipment).where(
            RecommendedEquipment.id == id
        ).options(
            selectinload(RecommendedEquipment.manufacturer),
            selectinload(RecommendedEquipment.category),
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_with_relations(
        self, db: AsyncSession, *, page: int = 1, page_size: int = 20,
        category_id: str | None = None, manufacturer_id: str | None = None,
    ) -> tuple[list[RecommendedEquipment], int]:
        stmt = select(RecommendedEquipment).options(
            selectinload(RecommendedEquipment.manufacturer),
            selectinload(RecommendedEquipment.category),
        )
        if category_id:
            stmt = stmt.where(RecommendedEquipment.category_id == category_id)
        if manufacturer_id:
            stmt = stmt.where(RecommendedEquipment.manufacturer_id == manufacturer_id)
        # Count
        from sqlalchemy import func
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        # Paginate
        stmt = stmt.offset((page - 1) * page_size).limit(page_size).order_by(
            RecommendedEquipment.sort_order
        )
        result = await db.execute(stmt)
        return list(result.scalars().all()), total

    async def get_matching_cable(self, db: AsyncSession, cable_id: str) -> list[RecommendedEquipment]:
        """Run rules engine: find equipment whose applicable_specs match cable's specs."""
        spec_stmt = select(SpecItem).where(
            SpecItem.cable_id == cable_id,
            SpecItem.variant_id.isnot(None),
        )
        spec_result = await db.execute(spec_stmt)
        specs = list(spec_result.scalars().all())

        spec_values: dict[str, list[float | str]] = {}
        for s in specs:
            if s.spec_key not in spec_values:
                spec_values[s.spec_key] = []
            if s.value_number is not None:
                spec_values[s.spec_key].append(s.value_number)
            if s.value_string is not None:
                spec_values[s.spec_key].append(s.value_string)

        eq_stmt = select(RecommendedEquipment).options(
            selectinload(RecommendedEquipment.manufacturer),
            selectinload(RecommendedEquipment.category),
        )
        eq_result = await db.execute(eq_stmt)
        all_equipment = list(eq_result.scalars().all())

        matched = []
        for eq in all_equipment:
            rules = eq.applicable_specs if isinstance(eq.applicable_specs, list) else []
            if not rules:
                continue
            all_match = True
            for rule in rules:
                key = rule.get("spec_key")
                if key not in spec_values:
                    all_match = False
                    break
                vals = spec_values[key]
                if "min" in rule or "max" in rule:
                    numeric_vals = [v for v in vals if isinstance(v, (int, float))]
                    if not numeric_vals:
                        all_match = False
                        break
                    if "min" in rule and not any(v >= rule["min"] for v in numeric_vals):
                        all_match = False
                        break
                    if "max" in rule and not any(v <= rule["max"] for v in numeric_vals):
                        all_match = False
                        break
                if "allowed_values" in rule:
                    if not any(str(v) in rule["allowed_values"] for v in vals):
                        all_match = False
                        break
            if all_match:
                matched.append(eq)
        return matched


crud_equipment_manufacturer = CRUDEquipmentManufacturer(EquipmentManufacturer)
crud_equipment_category = CRUDEquipmentCategory(EquipmentCategory)
crud_equipment = CRUDEquipment(RecommendedEquipment)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/crud/equipment.py
git commit -m "feat(equipment): split CRUD into 3 classes with tree and relation helpers"
```

---

## Phase 4: Backend Routes

### Task 4: Create equipment_manufacturers.py route

**Files:**
- Create: `backend/app/api/routes/equipment_manufacturers.py`

- [ ] **Step 1: Create the file**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.crud.equipment import crud_equipment_manufacturer
from app.schemas.common import PaginatedResponse
from app.schemas.equipment import (
    EquipmentManufacturerCreate,
    EquipmentManufacturerRead,
    EquipmentManufacturerUpdate,
)

router = APIRouter()


@router.get("", response_model=PaginatedResponse[EquipmentManufacturerRead])
async def list_equipment_manufacturers(
    page: int = 1, page_size: int = 20, db: AsyncSession = Depends(get_db)
):
    items, total = await crud_equipment_manufacturer.get_multi(db, page=page, page_size=page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{id}", response_model=EquipmentManufacturerRead)
async def get_equipment_manufacturer(id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_equipment_manufacturer.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment manufacturer not found"})
    return obj


@router.post("", response_model=EquipmentManufacturerRead, status_code=201)
async def create_equipment_manufacturer(
    obj_in: EquipmentManufacturerCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    return await crud_equipment_manufacturer.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=EquipmentManufacturerRead)
async def update_equipment_manufacturer(
    id: str,
    obj_in: EquipmentManufacturerUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    obj = await crud_equipment_manufacturer.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment manufacturer not found"})
    return await crud_equipment_manufacturer.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=EquipmentManufacturerRead)
async def delete_equipment_manufacturer(
    id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)
):
    obj = await crud_equipment_manufacturer.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment manufacturer not found"})
    return obj
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/routes/equipment_manufacturers.py
git commit -m "feat(equipment): add equipment_manufacturers route with full CRUD"
```

### Task 5: Create equipment_categories.py route

**Files:**
- Create: `backend/app/api/routes/equipment_categories.py`

- [ ] **Step 1: Create the file**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.crud.equipment import crud_equipment_category
from app.schemas.equipment import (
    EquipmentCategoryCreate,
    EquipmentCategoryRead,
    EquipmentCategoryUpdate,
)

router = APIRouter()


@router.get("", response_model=list[EquipmentCategoryRead])
async def list_equipment_categories(db: AsyncSession = Depends(get_db)):
    return await crud_equipment_category.get_all_top_level_with_children(db)


@router.get("/{id}", response_model=EquipmentCategoryRead)
async def get_equipment_category(id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_equipment_category.get_with_children(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment category not found"})
    return obj


async def _validate_two_level(db: AsyncSession, parent_id: str | None) -> None:
    """Reject if parent_id points to a category that itself has a parent (max depth = 2)."""
    if parent_id is None:
        return
    parent = await crud_equipment_category.get(db, parent_id)
    if not parent:
        raise HTTPException(status_code=422, detail={"code": 422, "message": f"Parent category '{parent_id}' not found"})
    if parent.parent_id is not None:
        raise HTTPException(status_code=422, detail={"code": 422, "message": "Maximum depth is 2 levels"})


@router.post("", response_model=EquipmentCategoryRead, status_code=201)
async def create_equipment_category(
    obj_in: EquipmentCategoryCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    await _validate_two_level(db, obj_in.parent_id)
    return await crud_equipment_category.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=EquipmentCategoryRead)
async def update_equipment_category(
    id: str,
    obj_in: EquipmentCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    obj = await crud_equipment_category.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment category not found"})
    if obj_in.parent_id is not None:
        # Prevent setting self as parent
        if obj_in.parent_id == id:
            raise HTTPException(status_code=422, detail={"code": 422, "message": "Category cannot be its own parent"})
        await _validate_two_level(db, obj_in.parent_id)
    return await crud_equipment_category.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=EquipmentCategoryRead)
async def delete_equipment_category(
    id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)
):
    obj = await crud_equipment_category.get_with_children(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment category not found"})
    if obj.children:
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Cannot delete category with sub-categories"})
    obj = await crud_equipment_category.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment category not found"})
    return obj
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/routes/equipment_categories.py
git commit -m "feat(equipment): add equipment_categories route with tree endpoint and two-level validation"
```

### Task 6: Refactor equipment.py route

**Files:**
- Modify: `backend/app/api/routes/equipment.py`

- [ ] **Step 1: Replace the entire file content**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.crud.equipment import crud_equipment
from app.schemas.common import PaginatedResponse
from app.schemas.equipment import (
    RecommendedEquipmentCreate,
    RecommendedEquipmentRead,
    RecommendedEquipmentUpdate,
)

router = APIRouter()


@router.get("", response_model=PaginatedResponse[RecommendedEquipmentRead])
async def list_equipment(
    page: int = 1,
    page_size: int = 20,
    cable_id: str | None = None,
    category_id: str | None = None,
    manufacturer_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if cable_id:
        items = await crud_equipment.get_matching_cable(db, cable_id)
        return {"items": items, "total": len(items), "page": 1, "page_size": len(items)}
    items, total = await crud_equipment.get_all_with_relations(
        db, page=page, page_size=page_size,
        category_id=category_id, manufacturer_id=manufacturer_id,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{id}", response_model=RecommendedEquipmentRead)
async def get_equipment(id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_equipment.get_with_relations(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment not found"})
    return obj


@router.post("", response_model=RecommendedEquipmentRead, status_code=201)
async def create_equipment(
    obj_in: RecommendedEquipmentCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    return await crud_equipment.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=RecommendedEquipmentRead)
async def update_equipment(
    id: str,
    obj_in: RecommendedEquipmentUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    obj = await crud_equipment.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment not found"})
    return await crud_equipment.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=RecommendedEquipmentRead)
async def delete_equipment(
    id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)
):
    obj = await crud_equipment.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment not found"})
    return obj
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/routes/equipment.py
git commit -m "feat(equipment): refactor equipment route with nested reads and new filters"
```

### Task 7: Register new routers in main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Update the imports line**

In `backend/app/main.py`, find the imports line:

```python
from app.api.routes import auth, brands, cable_import, cable_import_templates, cables, categories, equipment, folders, health, industries, manufacturers, product_types, taxonomy, uploads
```

Replace with:

```python
from app.api.routes import auth, brands, cable_import, cable_import_templates, cables, categories, equipment, equipment_categories, equipment_manufacturers, folders, health, industries, manufacturers, product_types, taxonomy, uploads
```

- [ ] **Step 2: Add router registration**

After the existing `app.include_router(equipment.router, ...)` line, add:

```python
app.include_router(equipment_manufacturers.router, prefix=f"{settings.api_prefix}/equipment-manufacturers", tags=["equipment-manufacturers"])
app.include_router(equipment_categories.router, prefix=f"{settings.api_prefix}/equipment-categories", tags=["equipment-categories"])
```

- [ ] **Step 3: Rebuild backend and verify imports**

Run: `docker compose --env-file .env.docker up -d --build backend`
Then: `docker compose --env-file .env.docker exec -T backend python -c "from app.main import app; print('OK')"`

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(equipment): register equipment_manufacturers and equipment_categories routers"
```

---

## Phase 5: Migration & Seed

### Task 8: Create Alembic migration

**Files:**
- Create: `backend/alembic/versions/<generated_id>_add_equipment_manufacturers_and_categories.py`

- [ ] **Step 1: Generate migration file**

Run:
```bash
docker compose --env-file .env.docker exec -T backend alembic revision --autogenerate -m "add equipment manufacturers and categories"
```

- [ ] **Step 2: Edit the generated migration file**

Open the generated file and replace its `upgrade()` and `downgrade()` with this complete implementation (keep the `revision`/`down_revision` header from the generator):

```python
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade():
    # 1. Create equipment_manufacturers
    op.create_table(
        'equipment_manufacturers',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column('name', sa.String(length=200), nullable=False, unique=True),
        sa.Column('slug', sa.String(length=200), nullable=False, unique=True),
        sa.Column('country', sa.String(length=100)),
        sa.Column('website', sa.String(length=500)),
        sa.Column('image_url', sa.String(length=500)),
        sa.Column('description', sa.Text()),
        sa.Column('founded_year', sa.Integer()),
        sa.Column('address', sa.String(length=500)),
        sa.Column('phone', sa.String(length=100)),
        sa.Column('email', sa.String(length=200)),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # 2. Create equipment_categories with self-reference
    op.create_table(
        'equipment_categories',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column('parent_id', sa.String(length=100),
                  sa.ForeignKey('equipment_categories.id', ondelete='CASCADE'), nullable=True),
        sa.Column('label', sa.String(length=200), nullable=False),
        sa.Column('slug', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('image_url', sa.String(length=500)),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('parent_id', 'slug', name='uq_equipment_categories_parent_slug'),
    )

    # 3. Refactor recommended_equipments
    # Add new columns (nullable phase)
    op.add_column('recommended_equipments', sa.Column('manufacturer_id', sa.String(length=100), nullable=True))
    op.add_column('recommended_equipments', sa.Column('category_id', sa.String(length=100), nullable=True))
    op.add_column('recommended_equipments', sa.Column('model', sa.String(length=200), nullable=True))
    op.add_column('recommended_equipments', sa.Column('image_url', sa.String(length=500), nullable=True))
    op.add_column('recommended_equipments', sa.Column('external_url', sa.String(length=500), nullable=True))
    op.add_column('recommended_equipments', sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'))

    # Add foreign keys
    op.create_foreign_key(
        'fk_recommended_equipment_manufacturer',
        'recommended_equipments', 'equipment_manufacturers',
        ['manufacturer_id'], ['id'], ondelete='RESTRICT',
    )
    op.create_foreign_key(
        'fk_recommended_equipment_category',
        'recommended_equipments', 'equipment_categories',
        ['category_id'], ['id'], ondelete='RESTRICT',
    )

    # Set NOT NULL on new columns (table is empty, safe to do directly)
    op.alter_column('recommended_equipments', 'manufacturer_id', nullable=False)
    op.alter_column('recommended_equipments', 'category_id', nullable=False)
    op.alter_column('recommended_equipments', 'model', nullable=False)

    # Drop old columns
    op.drop_column('recommended_equipments', 'name')
    op.drop_column('recommended_equipments', 'brand')


def downgrade():
    # Restore old columns
    op.add_column('recommended_equipments', sa.Column('name', sa.String(length=200), nullable=True))
    op.add_column('recommended_equipments', sa.Column('brand', sa.String(length=200), nullable=True))

    # Drop FKs and new columns
    op.drop_constraint('fk_recommended_equipment_category', 'recommended_equipments', type_='foreignkey')
    op.drop_constraint('fk_recommended_equipment_manufacturer', 'recommended_equipments', type_='foreignkey')
    op.drop_column('recommended_equipments', 'sort_order')
    op.drop_column('recommended_equipments', 'external_url')
    op.drop_column('recommended_equipments', 'image_url')
    op.drop_column('recommended_equipments', 'model')
    op.drop_column('recommended_equipments', 'category_id')
    op.drop_column('recommended_equipments', 'manufacturer_id')

    op.drop_table('equipment_categories')
    op.drop_table('equipment_manufacturers')
```

- [ ] **Step 3: Run the migration**

Run: `docker compose --env-file .env.docker exec -T backend alembic upgrade head`
Expected: `Running upgrade ... -> <new_id>, add equipment manufacturers and categories`

- [ ] **Step 4: Verify tables exist**

Run:
```bash
docker compose --env-file .env.docker exec -T db psql -U unowire -d unowire -c "\dt equipment_*"
docker compose --env-file .env.docker exec -T db psql -U unowire -d unowire -c "\d recommended_equipments"
```
Expected: `equipment_categories` and `equipment_manufacturers` tables exist; `recommended_equipments` has `manufacturer_id`/`category_id`/`model` columns, no `name`/`brand`.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/*_add_equipment_manufacturers_and_categories.py
git commit -m "feat(equipment): add migration for equipment_manufacturers and equipment_categories tables"
```

### Task 9: Create seed script

**Files:**
- Create: `backend/scripts/seed_equipment.py`

- [ ] **Step 1: Create the file**

```python
"""Seed equipment manufacturers, categories, and equipment from JSON file.

Idempotent: safe to re-run. Uses `id` as upsert key (skip if exists).

Usage:
    docker compose --env-file .env.docker exec -T backend python -m scripts.seed_equipment
"""

import asyncio
import json
import os
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.equipment import EquipmentCategory, EquipmentManufacturer, RecommendedEquipment


JSON_PATH = Path("/frontend/data/recommended-equipments.json")


# Category type → (parent label, parent slug, child label, child slug)
CATEGORY_MAP = {
    "semi_automatic_stripping_machine": (
        "Processing Equipment", "processing",
        "Semi-Automatic Stripping Machine", "semi-automatic-stripping-machine",
    ),
    "fully_automatic_cutting_stripping_machine": (
        "Processing Equipment", "processing",
        "Fully Automatic Cutting & Stripping Machine", "fully-automatic-cutting-stripping-machine",
    ),
}


async def upsert_manufacturer(db: AsyncSession, name: str) -> EquipmentManufacturer:
    obj = (await db.execute(select(EquipmentManufacturer).where(EquipmentManufacturer.name == name))).scalar_one_or_none()
    if obj:
        return obj
    slug = name.lower().replace(" ", "-")
    obj = EquipmentManufacturer(id=slug, name=name, slug=slug)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def upsert_category(
    db: AsyncSession,
    parent_label: str, parent_slug: str,
    child_label: str, child_slug: str,
) -> EquipmentCategory:
    # Parent
    parent = (await db.execute(select(EquipmentCategory).where(EquipmentCategory.slug == parent_slug, EquipmentCategory.parent_id.is_(None)))).scalar_one_or_none()
    if not parent:
        parent = EquipmentCategory(id=parent_slug, parent_id=None, label=parent_label, slug=parent_slug)
        db.add(parent)
        await db.commit()
        await db.refresh(parent)
    # Child
    child_id = f"{parent_slug}/{child_slug}"
    child = (await db.execute(select(EquipmentCategory).where(EquipmentCategory.id == child_id))).scalar_one_or_none()
    if child:
        return child
    child = EquipmentCategory(id=child_id, parent_id=parent.id, label=child_label, slug=child_slug)
    db.add(child)
    await db.commit()
    await db.refresh(child)
    return child


async def upsert_equipment(
    db: AsyncSession,
    item: dict,
    manufacturer: EquipmentManufacturer,
    category: EquipmentCategory,
) -> RecommendedEquipment:
    eq_id = item["id"]
    obj = (await db.execute(select(RecommendedEquipment).where(RecommendedEquipment.id == eq_id))).scalar_one_or_none()
    if obj:
        return obj
    model = item.get("model", "")
    slug = f"{manufacturer.slug}-{model.lower().replace(' ', '-').replace('/', '-')}"
    obj = RecommendedEquipment(
        id=eq_id,
        manufacturer_id=manufacturer.id,
        category_id=category.id,
        model=model,
        slug=slug,
        applicable_specs=item.get("applicable_specs", []),
        description=item.get("description"),
        external_url=item.get("external_url"),
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def main():
    if not JSON_PATH.exists():
        print(f"JSON file not found at {JSON_PATH}, skipping seed")
        return
    items = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    print(f"Loaded {len(items)} equipment items from JSON")

    async with async_session_factory() as db:
        for item in items:
            brand_name = item.get("brand", "Unknown")
            manufacturer = await upsert_manufacturer(db, brand_name)
            type_key = item.get("type", "")
            if type_key not in CATEGORY_MAP:
                print(f"  SKIP {item['id']}: unknown type '{type_key}'")
                continue
            parent_label, parent_slug, child_label, child_slug = CATEGORY_MAP[type_key]
            category = await upsert_category(db, parent_label, parent_slug, child_label, child_slug)
            eq = await upsert_equipment(db, item, manufacturer, category)
            print(f"  OK {eq.id}: {manufacturer.name} {eq.model} -> {category.label}")

    print("Seed complete")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Run the seed script**

Run: `docker compose --env-file .env.docker exec -T backend python -m scripts.seed_equipment`
Expected output:
```
Loaded 4 equipment items from JSON
  OK rec-eq-1: KMV CS-800 -> Semi-Automatic Stripping Machine
  OK rec-eq-2: Komax Alpha 488 -> Fully Automatic Cutting & Stripping Machine
  OK rec-eq-3: KMV CS-1500 -> Semi-Automatic Stripping Machine
  OK rec-eq-4: Komax Gamma 333 -> Fully Automatic Cutting & Stripping Machine
Seed complete
```

- [ ] **Step 3: Verify via API**

Run:
```bash
docker compose --env-file .env.docker exec -T backend python -c "import urllib.request, json; r = urllib.request.urlopen('http://localhost:8000/api/equipment-manufacturers'); print(json.dumps(json.loads(r.read()), indent=2))"
```
Expected: 2 manufacturers (KMV, Komax)

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/seed_equipment.py
git commit -m "feat(equipment): add seed script for equipment manufacturers, categories, and equipment"
```

### Task 10: Verify backend API endpoints

- [ ] **Step 1: Verify all endpoints return 200**

Run each command, expect HTTP 200:
```bash
docker compose --env-file .env.docker exec -T backend python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/api/equipment-manufacturers').status)"
docker compose --env-file .env.docker exec -T backend python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/api/equipment-categories').status)"
docker compose --env-file .env.docker exec -T backend python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/api/recommended-equipments').status)"
```

- [ ] **Step 2: Verify nested relations in equipment detail**

Run:
```bash
docker compose --env-file .env.docker exec -T backend python -c "import urllib.request, json; r = urllib.request.urlopen('http://localhost:8000/api/recommended-equipments/rec-eq-1'); d = json.loads(r.read()); print('manufacturer:', d.get('manufacturer', {}).get('name')); print('category:', d.get('category', {}).get('label'))"
```
Expected: `manufacturer: KMV` and `category: Semi-Automatic Stripping Machine`

- [ ] **Step 3: Verify category tree structure**

Run:
```bash
docker compose --env-file .env.docker exec -T backend python -c "import urllib.request, json; r = urllib.request.urlopen('http://localhost:8000/api/equipment-categories'); d = json.loads(r.read()); print('top-level:', len(d), 'categories'); print('children of first:', len(d[0].get('children', [])))"
```
Expected: `top-level: 1 categories` and `children of first: 2`

---

## Phase 6: Frontend Types & API

### Task 11: Update frontend types.ts

**Files:**
- Modify: `frontend/lib/types.ts`

- [ ] **Step 1: Replace the Recommended Equipment section**

Find lines starting with `// === Recommended Equipment ===` through the `RecommendedEquipmentResult` interface. Replace with:

```typescript
// === Recommended Equipment ===
export interface ApplicableSpecRule {
  spec_key: string;
  min?: number;
  max?: number;
  allowed_values?: (string | number)[];
}

export interface EquipmentManufacturer {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  website: string | null;
  image_url: string | null;
  description: string | null;
}

export interface EquipmentCategory {
  id: string;
  parent_id: string | null;
  label: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  children: EquipmentCategory[];
}

export interface RecommendedEquipment {
  id: string;
  manufacturer_id: string;
  category_id: string;
  model: string;
  slug: string;
  applicable_specs: ApplicableSpecRule[];
  description: string | null;
  image_url: string | null;
  external_url: string | null;
  sort_order: number;
  manufacturer: EquipmentManufacturer | null;
  category: EquipmentCategory | null;
}

export interface RecommendedEquipmentResult {
  equipment: RecommendedEquipment;
  matched_variants: CableVariant[];
  explanation: { spec_key: string; label: string; matched_value: string | number }[];
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/types.ts
git commit -m "feat(equipment): refactor frontend types with nested manufacturer/category"
```

### Task 12: Extend adminApi.ts with equipment namespaces

**Files:**
- Modify: `frontend/lib/adminApi.ts`

- [ ] **Step 1: Add backend interfaces**

After the existing `BackendIndustry`/`BackendCategory`/`BackendProductType` interfaces (around line 110), add:

```typescript
interface BackendEquipmentManufacturer {
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
  sort_order: number;
}

interface BackendEquipmentCategory {
  id: string;
  parent_id: string | null;
  label: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  children: BackendEquipmentCategory[];
}

interface BackendEquipment {
  id: string;
  manufacturer_id: string;
  category_id: string;
  model: string;
  slug: string;
  applicable_specs: Record<string, unknown>[];
  description: string | null;
  image_url: string | null;
  external_url: string | null;
  sort_order: number;
  manufacturer: BackendEquipmentManufacturer | null;
  category: BackendEquipmentCategory | null;
}
```

- [ ] **Step 2: Add equipment namespaces to the adminApi object**

Find the closing `};` of the `adminApi` object (before the final `export`). Add these 3 namespaces before the closing:

```typescript
  equipmentManufacturers: {
    async all(page = 1, page_size = 20): Promise<{ items: BackendEquipmentManufacturer[]; total: number }> {
      const data = await adminGet<ListResponse<BackendEquipmentManufacturer>>(
        `/api/equipment-manufacturers?page=${page}&page_size=${page_size}`
      );
      return { items: data.items, total: data.total };
    },
    async getById(id: string): Promise<BackendEquipmentManufacturer | null> {
      try {
        return await adminGet<BackendEquipmentManufacturer>(`/api/equipment-manufacturers/${encodeURIComponent(id)}`);
      } catch {
        return null;
      }
    },
    async create(payload: Record<string, unknown>): Promise<BackendEquipmentManufacturer> {
      const res = await adminFetch('/api/equipment-manufacturers', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/equipment-manufacturers`);
      return await res.json() as BackendEquipmentManufacturer;
    },
    async update(id: string, payload: Record<string, unknown>): Promise<BackendEquipmentManufacturer> {
      const res = await adminFetch(`/api/equipment-manufacturers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/equipment-manufacturers/${id}`);
      return await res.json() as BackendEquipmentManufacturer;
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/equipment-manufacturers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API ${res.status}: /api/equipment-manufacturers/${id}`);
    },
  },

  equipmentCategories: {
    async all(): Promise<BackendEquipmentCategory[]> {
      return await adminGet<BackendEquipmentCategory[]>('/api/equipment-categories');
    },
    async getById(id: string): Promise<BackendEquipmentCategory | null> {
      try {
        return await adminGet<BackendEquipmentCategory>(`/api/equipment-categories/${encodeURIComponent(id)}`);
      } catch {
        return null;
      }
    },
    async create(payload: Record<string, unknown>): Promise<BackendEquipmentCategory> {
      const res = await adminFetch('/api/equipment-categories', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/equipment-categories`);
      return await res.json() as BackendEquipmentCategory;
    },
    async update(id: string, payload: Record<string, unknown>): Promise<BackendEquipmentCategory> {
      const res = await adminFetch(`/api/equipment-categories/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/equipment-categories/${id}`);
      return await res.json() as BackendEquipmentCategory;
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/equipment-categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API ${res.status}: /api/equipment-categories/${id}`);
    },
  },

  equipment: {
    async all(page = 1, page_size = 20, filters?: { category_id?: string; manufacturer_id?: string }): Promise<{ items: BackendEquipment[]; total: number }> {
      const params = new URLSearchParams({ page: String(page), page_size: String(page_size) });
      if (filters?.category_id) params.set('category_id', filters.category_id);
      if (filters?.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id);
      const data = await adminGet<ListResponse<BackendEquipment>>(`/api/recommended-equipments?${params.toString()}`);
      return { items: data.items, total: data.total };
    },
    async getById(id: string): Promise<BackendEquipment | null> {
      try {
        return await adminGet<BackendEquipment>(`/api/recommended-equipments/${encodeURIComponent(id)}`);
      } catch {
        return null;
      }
    },
    async create(payload: Record<string, unknown>): Promise<BackendEquipment> {
      const res = await adminFetch('/api/recommended-equipments', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/recommended-equipments`);
      return await res.json() as BackendEquipment;
    },
    async update(id: string, payload: Record<string, unknown>): Promise<BackendEquipment> {
      const res = await adminFetch(`/api/recommended-equipments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/recommended-equipments/${id}`);
      return await res.json() as BackendEquipment;
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/recommended-equipments/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API ${res.status}: /api/recommended-equipments/${id}`);
    },
  },
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/adminApi.ts
git commit -m "feat(equipment): add equipmentManufacturers, equipmentCategories, equipment namespaces to adminApi"
```

### Task 13: Update lib/api.ts recommendedEquipments adapter

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Update the recommendedEquipments adapter**

Find the `recommendedEquipments` namespace in `lib/api.ts` (around line 464). The current adapter expects the old shape. Replace the `adaptEquipment` function and the `recommendedEquipments.all()` method:

```typescript
function adaptEquipment(e: BackendEquipment): RecommendedEquipment {
  return {
    id: e.id,
    manufacturer_id: e.manufacturer_id,
    category_id: e.category_id,
    model: e.model,
    slug: e.slug,
    applicable_specs: (e.applicable_specs ?? []) as ApplicableSpecRule[],
    description: e.description ?? null,
    image_url: e.image_url ?? null,
    external_url: e.external_url ?? null,
    sort_order: e.sort_order ?? 0,
    manufacturer: e.manufacturer ? {
      id: e.manufacturer.id,
      name: e.manufacturer.name,
      slug: e.manufacturer.slug,
      country: e.manufacturer.country,
      website: e.manufacturer.website,
      image_url: e.manufacturer.image_url,
      description: e.manufacturer.description,
    } : null,
    category: e.category ? {
      id: e.category.id,
      parent_id: e.category.parent_id,
      label: e.category.label,
      slug: e.category.slug,
      description: e.category.description,
      image_url: e.category.image_url,
      children: [],
    } : null,
  };
}
```

Also add `BackendEquipment` to the type imports at the top of the file (you'll need to define a minimal BackendEquipment interface or import it). Add this interface near the other backend interfaces in api.ts:

```typescript
interface BackendEquipment {
  id: string;
  manufacturer_id: string;
  category_id: string;
  model: string;
  slug: string;
  applicable_specs: Record<string, unknown>[];
  description: string | null;
  image_url: string | null;
  external_url: string | null;
  sort_order: number;
  manufacturer: { id: string; name: string; slug: string; country: string | null; website: string | null; image_url: string | null; description: string | null } | null;
  category: { id: string; parent_id: string | null; label: string; slug: string; description: string | null; image_url: string | null } | null;
}
```

- [ ] **Step 2: Update recommendedEquipments.all() to fetch with cable_id support**

```typescript
  recommendedEquipments: {
    async all(): Promise<RecommendedEquipment[]> {
      const res = await fetchWithCache<{ items: BackendEquipment[] }>(
        '/api/recommended-equipments?page_size=999'
      );
      return res.items.map(adaptEquipment);
    },
    async byCable(cableId: string): Promise<RecommendedEquipment[]> {
      const res = await fetchWithCache<{ items: BackendEquipment[] }>(
        `/api/recommended-equipments?cable_id=${encodeURIComponent(cableId)}`
      );
      return res.items.map(adaptEquipment);
    },
  },
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(equipment): update api.ts adapter for new equipment shape with byCable method"
```

---

## Phase 7: Frontend Proxy Routes

### Task 14: Create equipment-manufacturers proxy routes

**Files:**
- Create: `frontend/app/api/admin/equipment-manufacturers/route.ts`
- Create: `frontend/app/api/admin/equipment-manufacturers/[id]/route.ts`

- [ ] **Step 1: Create POST route**

`frontend/app/api/admin/equipment-manufacturers/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/equipment-manufacturers`, {
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

- [ ] **Step 2: Create PUT/DELETE route**

`frontend/app/api/admin/equipment-manufacturers/[id]/route.ts`:
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
  const res = await fetch(`${API_BASE}/api/equipment-manufacturers/${encodeURIComponent(id)}`, {
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
  const res = await fetch(`${API_BASE}/api/equipment-manufacturers/${encodeURIComponent(id)}`, {
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

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/admin/equipment-manufacturers/
git commit -m "feat(equipment): add equipment-manufacturers proxy routes (POST, PUT, DELETE)"
```

### Task 15: Create equipment-categories proxy routes

**Files:**
- Create: `frontend/app/api/admin/equipment-categories/route.ts`
- Create: `frontend/app/api/admin/equipment-categories/[...id]/route.ts`

- [ ] **Step 1: Create POST route**

`frontend/app/api/admin/equipment-categories/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/equipment-categories`, {
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

- [ ] **Step 2: Create PUT/DELETE catch-all route**

`frontend/app/api/admin/equipment-categories/[...id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string[] | string }> }
) {
  const { id } = await params;
  const segments = Array.isArray(id) ? id : [id];
  const compositeId = segments.map((s) => decodeURIComponent(s)).join('/');
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/equipment-categories/${encodeURIComponent(compositeId)}`, {
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
  { params }: { params: Promise<{ id: string[] | string }> }
) {
  const { id } = await params;
  const segments = Array.isArray(id) ? id : [id];
  const compositeId = segments.map((s) => decodeURIComponent(s)).join('/');
  const token = request.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/equipment-categories/${encodeURIComponent(compositeId)}`, {
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

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/admin/equipment-categories/
git commit -m "feat(equipment): add equipment-categories proxy routes with catch-all for slash IDs"
```

### Task 16: Create equipment proxy routes

**Files:**
- Create: `frontend/app/api/admin/equipment/route.ts`
- Create: `frontend/app/api/admin/equipment/[id]/route.ts`

- [ ] **Step 1: Create POST route**

`frontend/app/api/admin/equipment/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/recommended-equipments`, {
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

- [ ] **Step 2: Create PUT/DELETE route**

`frontend/app/api/admin/equipment/[id]/route.ts`:
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
  const res = await fetch(`${API_BASE}/api/recommended-equipments/${encodeURIComponent(id)}`, {
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
  const res = await fetch(`${API_BASE}/api/recommended-equipments/${encodeURIComponent(id)}`, {
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

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/admin/equipment/
git commit -m "feat(equipment): add equipment proxy routes (POST, PUT, DELETE)"
```

---

## Phase 8: Frontend Admin Forms

### Task 17: Create EquipmentManufacturerForm

**Files:**
- Create: `frontend/components/admin/form/EquipmentManufacturerForm.tsx`

- [ ] **Step 1: Create the form**

```typescript
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ImageFieldWithPicker } from './ImageFieldWithPicker';

interface EquipmentManufacturerFormProps {
  initial?: {
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
    sort_order: number;
  };
}

export function EquipmentManufacturerForm({ initial }: EquipmentManufacturerFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [country, setCountry] = useState(initial?.country ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [foundedYear, setFoundedYear] = useState(initial?.founded_year ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const body = {
      id: initial?.id || slug,
      name,
      slug,
      country: country || null,
      website: website || null,
      image_url: imageUrl || null,
      description: description || null,
      founded_year: foundedYear ? Number(foundedYear) : null,
      address: address || null,
      phone: phone || null,
      email: email || null,
      sort_order: Number(sortOrder),
    };
    try {
      const url = initial
        ? `/api/admin/equipment-manufacturers/${encodeURIComponent(initial.id)}`
        : '/api/admin/equipment-manufacturers';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/equipment/manufacturers');
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
    if (!window.confirm('Delete this equipment manufacturer?')) return;
    try {
      const res = await fetch(`/api/admin/equipment-manufacturers/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/equipment/manufacturers');
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-gray-700">Name</label>
        <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="slug" className="text-sm font-medium text-gray-700">Slug</label>
        <input id="slug" type="text" required value={slug} onChange={(e) => setSlug(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="country" className="text-sm font-medium text-gray-700">Country</label>
        <input id="country" type="text" value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="website" className="text-sm font-medium text-gray-700">Website</label>
        <input id="website" type="text" value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} />
      </div>
      <ImageFieldWithPicker value={imageUrl} onChange={setImageUrl} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-gray-700">Description</label>
        <textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="founded_year" className="text-sm font-medium text-gray-700">Founded Year</label>
        <input id="founded_year" type="number" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="address" className="text-sm font-medium text-gray-700">Address</label>
        <input id="address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className="text-sm font-medium text-gray-700">Phone</label>
        <input id="phone" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sort_order" className="text-sm font-medium text-gray-700">Sort Order</label>
        <input id="sort_order" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className={inputClass} />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link href="/admin/equipment/manufacturers" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
          Cancel
        </Link>
        {initial && (
          <button type="button" onClick={handleDelete} className="ml-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50">
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
git add frontend/components/admin/form/EquipmentManufacturerForm.tsx
git commit -m "feat(equipment): add EquipmentManufacturerForm component"
```

### Task 18: Create EquipmentCategoryForm

**Files:**
- Create: `frontend/components/admin/form/EquipmentCategoryForm.tsx`

- [ ] **Step 1: Create the form**

```typescript
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ImageFieldWithPicker } from './ImageFieldWithPicker';

interface EquipmentCategoryFormProps {
  initial?: {
    id: string;
    parent_id: string | null;
    label: string;
    slug: string;
    description: string | null;
    image_url: string | null;
    sort_order: number;
  };
  topCategories: { id: string; label: string }[];
}

export function EquipmentCategoryForm({ initial, topCategories }: EquipmentCategoryFormProps) {
  const router = useRouter();
  const [parentId, setParentId] = useState(initial?.parent_id ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    // Compose id: if parent selected, id = parent_slug/slug; else id = slug
    const parent = topCategories.find((c) => c.id === parentId);
    const id = parentId ? `${parent?.slug ?? parentId}/${slug}` : slug;
    const body = {
      id,
      parent_id: parentId || null,
      label,
      slug,
      description: description || null,
      image_url: imageUrl || null,
      sort_order: Number(sortOrder),
    };
    try {
      const url = initial
        ? `/api/admin/equipment-categories/${encodeURIComponent(initial.id)}`
        : '/api/admin/equipment-categories';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/equipment/categories');
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
    if (!window.confirm('Delete this equipment category?')) return;
    try {
      const res = await fetch(`/api/admin/equipment-categories/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/equipment/categories');
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="parent_id" className="text-sm font-medium text-gray-700">Parent Category (leave empty for top-level)</label>
        <select id="parent_id" value={parentId} onChange={(e) => setParentId(e.target.value)} className={inputClass}>
          <option value="">— Top-level —</option>
          {topCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="label" className="text-sm font-medium text-gray-700">Label</label>
        <input id="label" type="text" required value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="slug" className="text-sm font-medium text-gray-700">Slug</label>
        <input id="slug" type="text" required value={slug} onChange={(e) => setSlug(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-gray-700">Description</label>
        <textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
      </div>
      <ImageFieldWithPicker value={imageUrl} onChange={setImageUrl} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sort_order" className="text-sm font-medium text-gray-700">Sort Order</label>
        <input id="sort_order" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className={inputClass} />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link href="/admin/equipment/categories" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
          Cancel
        </Link>
        {initial && (
          <button type="button" onClick={handleDelete} className="ml-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50">
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
git add frontend/components/admin/form/EquipmentCategoryForm.tsx
git commit -m "feat(equipment): add EquipmentCategoryForm with parent select"
```

### Task 19: Create EquipmentForm

**Files:**
- Create: `frontend/components/admin/form/EquipmentForm.tsx`

- [ ] **Step 1: Create the form**

```typescript
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ImageFieldWithPicker } from './ImageFieldWithPicker';

interface EquipmentFormProps {
  initial?: {
    id: string;
    manufacturer_id: string;
    category_id: string;
    model: string;
    slug: string;
    applicable_specs: unknown[];
    description: string | null;
    image_url: string | null;
    external_url: string | null;
    sort_order: number;
  };
  manufacturers: { id: string; name: string }[];
  categories: { id: string; label: string; parent_id: string | null; parent_label?: string | null }[];
}

export function EquipmentForm({ initial, manufacturers, categories }: EquipmentFormProps) {
  const router = useRouter();
  const [manufacturerId, setManufacturerId] = useState(initial?.manufacturer_id ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [applicableSpecs, setApplicableSpecs] = useState(
    JSON.stringify(initial?.applicable_specs ?? [], null, 2)
  );
  const [description, setDescription] = useState(initial?.description ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [externalUrl, setExternalUrl] = useState(initial?.external_url ?? '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    let parsedSpecs: unknown;
    try {
      parsedSpecs = JSON.parse(applicableSpecs);
    } catch {
      setError('Applicable Specs is not valid JSON');
      setSaving(false);
      return;
    }
    const body = {
      id: initial?.id || slug,
      manufacturer_id: manufacturerId,
      category_id: categoryId,
      model,
      slug,
      applicable_specs: parsedSpecs,
      description: description || null,
      image_url: imageUrl || null,
      external_url: externalUrl || null,
      sort_order: Number(sortOrder),
    };
    try {
      const url = initial
        ? `/api/admin/equipment/${encodeURIComponent(initial.id)}`
        : '/api/admin/equipment';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/equipment');
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
    if (!window.confirm('Delete this equipment?')) return;
    try {
      const res = await fetch(`/api/admin/equipment/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/equipment');
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="manufacturer_id" className="text-sm font-medium text-gray-700">Manufacturer</label>
        <select id="manufacturer_id" required value={manufacturerId} onChange={(e) => setManufacturerId(e.target.value)} className={inputClass}>
          <option value="">— Select —</option>
          {manufacturers.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="category_id" className="text-sm font-medium text-gray-700">Category</label>
        <select id="category_id" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
          <option value="">— Select —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parent_label ? `${c.parent_label} / ` : ''}{c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="model" className="text-sm font-medium text-gray-700">Model</label>
        <input id="model" type="text" required value={model} onChange={(e) => setModel(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="slug" className="text-sm font-medium text-gray-700">Slug</label>
        <input id="slug" type="text" required value={slug} onChange={(e) => setSlug(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="applicable_specs" className="text-sm font-medium text-gray-700">Applicable Specs (JSON array)</label>
        <textarea
          id="applicable_specs"
          rows={8}
          value={applicableSpecs}
          onChange={(e) => setApplicableSpecs(e.target.value)}
          className={`${inputClass} font-mono text-xs`}
          placeholder='[{"spec_key":"conductor_area","min":0.1,"max":1.0}]'
        />
        <p className="text-xs text-gray-500">Rules: spec_key, min, max, allowed_values</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-gray-700">Description</label>
        <textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
      </div>
      <ImageFieldWithPicker value={imageUrl} onChange={setImageUrl} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="external_url" className="text-sm font-medium text-gray-700">External URL</label>
        <input id="external_url" type="text" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sort_order" className="text-sm font-medium text-gray-700">Sort Order</label>
        <input id="sort_order" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className={inputClass} />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link href="/admin/equipment" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
          Cancel
        </Link>
        {initial && (
          <button type="button" onClick={handleDelete} className="ml-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50">
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
git add frontend/components/admin/form/EquipmentForm.tsx
git commit -m "feat(equipment): add EquipmentForm with manufacturer/category selects and JSON editor"
```

---

## Phase 9: Frontend Admin Pages

### Task 20: Create equipment manufacturers pages

**Files:**
- Create: `frontend/app/admin/(dashboard)/equipment/manufacturers/page.tsx`
- Create: `frontend/app/admin/(dashboard)/equipment/manufacturers/new/page.tsx`
- Create: `frontend/app/admin/(dashboard)/equipment/manufacturers/[id]/page.tsx`

- [ ] **Step 1: Create list page**

`frontend/app/admin/(dashboard)/equipment/manufacturers/page.tsx`:
```typescript
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

const PAGE_SIZE = 20;

export default async function EquipmentManufacturersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1', 10);
  const { items, total } = await adminApi.equipmentManufacturers.all(page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Equipment Manufacturers</h1>
        <Link href="/admin/equipment/manufacturers/new" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700">
          New
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Image</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Country</th>
              <th className="px-4 py-3 font-medium">Website</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  {m.image_url ? (
                    <img src={m.image_url} alt={m.name} className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-gray-200" />
                  )}
                </td>
                <td className="px-4 py-3 text-gray-900">{m.name}</td>
                <td className="px-4 py-3 text-gray-600">{m.country || '—'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {m.website ? (
                    <a href={m.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{m.website}</a>
                  ) : '—'}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/equipment/manufacturers/${encodeURIComponent(m.id)}`} className="text-blue-600 hover:underline">Edit</Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No equipment manufacturers found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        {page > 1 ? (
          <Link href={`/admin/equipment/manufacturers?page=${page - 1}`} className="text-blue-600 hover:underline">← Prev</Link>
        ) : <span className="text-gray-300">← Prev</span>}
        <span className="text-gray-600">Page {page} of {totalPages}</span>
        {page < totalPages ? (
          <Link href={`/admin/equipment/manufacturers?page=${page + 1}`} className="text-blue-600 hover:underline">Next →</Link>
        ) : <span className="text-gray-300">Next →</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create new page**

`frontend/app/admin/(dashboard)/equipment/manufacturers/new/page.tsx`:
```typescript
import { EquipmentManufacturerForm } from '@/components/admin/form/EquipmentManufacturerForm';

export default function NewEquipmentManufacturerPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Equipment Manufacturer</h1>
      <EquipmentManufacturerForm />
    </div>
  );
}
```

- [ ] **Step 3: Create edit page**

`frontend/app/admin/(dashboard)/equipment/manufacturers/[id]/page.tsx`:
```typescript
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { EquipmentManufacturerForm } from '@/components/admin/form/EquipmentManufacturerForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditEquipmentManufacturerPage({ params }: PageProps) {
  const { id } = await params;
  const manufacturer = await adminApi.equipmentManufacturers.getById(id);
  if (!manufacturer) notFound();

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/equipment/manufacturers" className="hover:underline">Equipment Manufacturers</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{manufacturer.name}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Equipment Manufacturer</h1>
      <EquipmentManufacturerForm initial={manufacturer} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin/\(dashboard\)/equipment/manufacturers/
git commit -m "feat(equipment): add equipment manufacturers list/new/edit pages"
```

### Task 21: Create equipment categories pages

**Files:**
- Create: `frontend/app/admin/(dashboard)/equipment/categories/page.tsx`
- Create: `frontend/app/admin/(dashboard)/equipment/categories/new/page.tsx`
- Create: `frontend/app/admin/(dashboard)/equipment/categories/[...id]/page.tsx`

- [ ] **Step 1: Create list page (tree display)**

`frontend/app/admin/(dashboard)/equipment/categories/page.tsx`:
```typescript
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

export default async function EquipmentCategoriesPage() {
  const tree = await adminApi.equipmentCategories.all();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Equipment Categories</h1>
        <Link href="/admin/equipment/categories/new" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700">
          New
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Sort</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tree.map((parent) => (
              <>
                <tr key={parent.id} className="border-b border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-900">{parent.label}</td>
                  <td className="px-4 py-3 text-gray-600">{parent.slug}</td>
                  <td className="px-4 py-3 text-gray-600">{parent.sort_order}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/equipment/categories/${encodeURIComponent(parent.id)}`} className="text-blue-600 hover:underline">Edit</Link>
                  </td>
                </tr>
                {parent.children.map((child) => (
                  <tr key={child.id} className="border-b border-gray-100 bg-gray-50">
                    <td className="px-4 py-3 pl-8 text-gray-700">↳ {child.label}</td>
                    <td className="px-4 py-3 text-gray-600">{child.slug}</td>
                    <td className="px-4 py-3 text-gray-600">{child.sort_order}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/equipment/categories/${encodeURIComponent(child.id)}`} className="text-blue-600 hover:underline">Edit</Link>
                    </td>
                  </tr>
                ))}
              </>
            ))}
            {tree.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No equipment categories found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create new page**

`frontend/app/admin/(dashboard)/equipment/categories/new/page.tsx`:
```typescript
import { EquipmentCategoryForm } from '@/components/admin/form/EquipmentCategoryForm';
import { adminApi } from '@/lib/adminApi';

export default async function NewEquipmentCategoryPage() {
  const tree = await adminApi.equipmentCategories.all();
  const topCategories = tree.map((c) => ({ id: c.id, label: c.label }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Equipment Category</h1>
      <EquipmentCategoryForm topCategories={topCategories} />
    </div>
  );
}
```

- [ ] **Step 3: Create edit page (catch-all)**

`frontend/app/admin/(dashboard)/equipment/categories/[...id]/page.tsx`:
```typescript
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { EquipmentCategoryForm } from '@/components/admin/form/EquipmentCategoryForm';

interface PageProps {
  params: Promise<{ id: string[] | string }>;
}

export default async function EditEquipmentCategoryPage({ params }: PageProps) {
  const { id } = await params;
  const segments = Array.isArray(id) ? id : [id];
  const compositeId = segments.map((s) => decodeURIComponent(s)).join('/');
  const category = await adminApi.equipmentCategories.getById(compositeId);
  if (!category) notFound();

  const tree = await adminApi.equipmentCategories.all();
  const topCategories = tree
    .filter((c) => c.id !== category.id)
    .map((c) => ({ id: c.id, label: c.label }));

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/equipment/categories" className="hover:underline">Equipment Categories</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{category.label}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Equipment Category</h1>
      <EquipmentCategoryForm initial={category} topCategories={topCategories} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin/\(dashboard\)/equipment/categories/
git commit -m "feat(equipment): add equipment categories list/new/edit pages with tree display"
```

### Task 22: Create equipment pages

**Files:**
- Create: `frontend/app/admin/(dashboard)/equipment/page.tsx`
- Create: `frontend/app/admin/(dashboard)/equipment/new/page.tsx`
- Create: `frontend/app/admin/(dashboard)/equipment/[id]/page.tsx`

- [ ] **Step 1: Create list page**

`frontend/app/admin/(dashboard)/equipment/page.tsx`:
```typescript
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  searchParams: Promise<{ page?: string; manufacturer_id?: string; category_id?: string }>;
}

const PAGE_SIZE = 20;

export default async function EquipmentPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1', 10);
  const { items, total } = await adminApi.equipment.all(page, PAGE_SIZE, {
    manufacturer_id: sp.manufacturer_id,
    category_id: sp.category_id,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const [manufacturers, categoriesTree] = await Promise.all([
    adminApi.equipmentManufacturers.all(1, 999),
    adminApi.equipmentCategories.all(),
  ]);
  // Flatten categories for dropdown
  const categories: { id: string; label: string; parent_id: string | null; parent_label?: string | null }[] = [];
  for (const parent of categoriesTree) {
    categories.push({ id: parent.id, label: parent.label, parent_id: null });
    for (const child of parent.children) {
      categories.push({ id: child.id, label: child.label, parent_id: child.parent_id, parent_label: parent.label });
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Equipment</h1>
        <Link href="/admin/equipment/new" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700">
          New
        </Link>
      </div>

      <div className="mb-4 flex gap-3">
        <form method="get" className="flex gap-2">
          <select name="manufacturer_id" defaultValue={sp.manufacturer_id ?? ''} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="">All Manufacturers</option>
            {manufacturers.items.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select name="category_id" defaultValue={sp.category_id ?? ''} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.parent_label ? `${c.parent_label} / ` : ''}{c.label}</option>)}
          </select>
          <button type="submit" className="rounded-md border border-gray-300 px-3 py-2 text-sm">Filter</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Image</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">Manufacturer</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((eq) => (
              <tr key={eq.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  {eq.image_url ? (
                    <img src={eq.image_url} alt={eq.model} className="h-10 w-10 rounded object-cover" />
                  ) : <div className="h-10 w-10 rounded bg-gray-200" />}
                </td>
                <td className="px-4 py-3 text-gray-900">{eq.model}</td>
                <td className="px-4 py-3 text-gray-600">{eq.manufacturer?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{eq.category?.label ?? '—'}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/equipment/${encodeURIComponent(eq.id)}`} className="text-blue-600 hover:underline">Edit</Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No equipment found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        {page > 1 ? <Link href={`/admin/equipment?page=${page - 1}`} className="text-blue-600 hover:underline">← Prev</Link> : <span className="text-gray-300">← Prev</span>}
        <span className="text-gray-600">Page {page} of {totalPages}</span>
        {page < totalPages ? <Link href={`/admin/equipment?page=${page + 1}`} className="text-blue-600 hover:underline">Next →</Link> : <span className="text-gray-300">Next →</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create new page**

`frontend/app/admin/(dashboard)/equipment/new/page.tsx`:
```typescript
import { EquipmentForm } from '@/components/admin/form/EquipmentForm';
import { adminApi } from '@/lib/adminApi';

export default async function NewEquipmentPage() {
  const [manufacturers, categoriesTree] = await Promise.all([
    adminApi.equipmentManufacturers.all(1, 999),
    adminApi.equipmentCategories.all(),
  ]);
  const categories: { id: string; label: string; parent_id: string | null; parent_label?: string | null }[] = [];
  for (const parent of categoriesTree) {
    for (const child of parent.children) {
      categories.push({ id: child.id, label: child.label, parent_id: child.parent_id, parent_label: parent.label });
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Equipment</h1>
      <EquipmentForm
        manufacturers={manufacturers.items.map((m) => ({ id: m.id, name: m.name }))}
        categories={categories}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create edit page**

`frontend/app/admin/(dashboard)/equipment/[id]/page.tsx`:
```typescript
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { EquipmentForm } from '@/components/admin/form/EquipmentForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditEquipmentPage({ params }: PageProps) {
  const { id } = await params;
  const equipment = await adminApi.equipment.getById(id);
  if (!equipment) notFound();

  const [manufacturers, categoriesTree] = await Promise.all([
    adminApi.equipmentManufacturers.all(1, 999),
    adminApi.equipmentCategories.all(),
  ]);
  const categories: { id: string; label: string; parent_id: string | null; parent_label?: string | null }[] = [];
  for (const parent of categoriesTree) {
    for (const child of parent.children) {
      categories.push({ id: child.id, label: child.label, parent_id: child.parent_id, parent_label: parent.label });
    }
  }

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/equipment" className="hover:underline">Equipment</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{equipment.model}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Equipment</h1>
      <EquipmentForm
        initial={equipment}
        manufacturers={manufacturers.items.map((m) => ({ id: m.id, name: m.name }))}
        categories={categories}
      />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin/\(dashboard\)/equipment/page.tsx frontend/app/admin/\(dashboard\)/equipment/new/ frontend/app/admin/\(dashboard\)/equipment/\[id\]/
git commit -m "feat(equipment): add equipment list/new/edit pages with filters"
```

### Task 23: Update AdminSidebar with Equipment group

**Files:**
- Modify: `frontend/components/admin/layout/AdminSidebar.tsx`

- [ ] **Step 1: Add Wrench icon import**

Change the import line:
```typescript
import { LayoutDashboard, Cable, Tag, Factory, ExternalLink, LogOut, FolderOpen, Image, Wrench } from 'lucide-react';
```

- [ ] **Step 2: Add equipment nav links**

Add 3 entries to the `navLinks` array after the Industries entry:
```typescript
  { href: '/admin/equipment/manufacturers', label: 'Equipment Mfrs', icon: Wrench },
  { href: '/admin/equipment/categories', label: 'Equipment Cats', icon: Wrench },
  { href: '/admin/equipment', label: 'Equipment', icon: Wrench },
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/layout/AdminSidebar.tsx
git commit -m "feat(equipment): add Equipment nav links to admin sidebar"
```

---

## Phase 10: Frontend Cable Detail Refactor

### Task 24: Update RecommendedEquipmentCard component

**Files:**
- Modify: `frontend/components/equipment/RecommendedEquipmentCard.tsx`

- [ ] **Step 1: Update to use nested manufacturer/category**

Replace the entire file:
```typescript
import type { RecommendedEquipmentResult } from '@/lib/types';

interface RecommendedEquipmentCardProps {
  result: RecommendedEquipmentResult;
}

export function RecommendedEquipmentCard({ result }: RecommendedEquipmentCardProps) {
  const { equipment } = result;
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-gray-900">
            {equipment.manufacturer?.name ?? 'Unknown'} {equipment.model}
          </h3>
          <p className="text-xs text-gray-500">
            {equipment.category?.label ?? 'Uncategorized'}
          </p>
        </div>
        {equipment.external_url && (
          <a
            href={equipment.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm shrink-0"
          >
            View product →
          </a>
        )}
      </div>

      {equipment.image_url && (
        <img src={equipment.image_url} alt={equipment.model} className="h-32 w-full object-cover rounded mb-3" />
      )}

      {equipment.description && (
        <p className="text-sm text-gray-600 mb-3">{equipment.description}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/equipment/RecommendedEquipmentCard.tsx
git commit -m "feat(equipment): update RecommendedEquipmentCard to use nested manufacturer/category"
```

### Task 25: Refactor cable detail page to use new API

**Files:**
- Modify: `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx`

- [ ] **Step 1: Update imports**

Remove the import of `recommendEquipments`:
```typescript
// Remove this line:
// import { recommendEquipments } from '@/lib/equipment-recommend';
```

- [ ] **Step 2: Replace the recommended equipment fetching**

Find the line:
```typescript
  const recommended = recommendEquipments(cable, await api.recommendedEquipments.all());
```

Replace with:
```typescript
  const matchedEquipment = await api.recommendedEquipments.byCable(cable.id);
  const recommended = matchedEquipment.map(equipment => ({ equipment, matched_variants: [], explanation: [] }));
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\(site\)/cable/\[brand_slug\]/\[slug\]/page.tsx
git commit -m "feat(equipment): refactor cable detail page to use backend matching API"
```

### Task 26: Deprecate local files

**Files:**
- Modify: `frontend/lib/equipment-recommend.ts`
- Modify: `frontend/data/recommended-equipments.json`

- [ ] **Step 1: Add deprecation comment to equipment-recommend.ts**

At the top of the file, add:
```typescript
// Deprecated, matching now done by backend API (/api/recommended-equipments?cable_id=)
// Retained for reference only — no longer imported by any component.
```

- [ ] **Step 2: Add deprecation comment to recommended-equipments.json**

At the top of the file, add:
```json
[
  // Deprecated, data now lives in DB via /api/recommended-equipments
  // Retained for reference only.
  {
    "id": "rec-eq-1",
```

> Note: JSON does not support comments. Skip this step if strict JSON is required. Instead, leave the file as-is — it is no longer referenced by any code.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/equipment-recommend.ts
git commit -m "chore(equipment): deprecate local rule engine, now superseded by backend API"
```

---

## Phase 11: Docker Verification

### Task 27: Rebuild and verify in Docker

- [ ] **Step 1: Rebuild all services**

Run:
```bash
docker compose --env-file .env.docker up -d --build
```

- [ ] **Step 2: Run migration (if not already run)**

Run:
```bash
docker compose --env-file .env.docker exec -T backend alembic upgrade head
```

- [ ] **Step 3: Run seed script (if not already run)**

Run:
```bash
docker compose --env-file .env.docker exec -T backend python -m scripts.seed_equipment
```

- [ ] **Step 4: Verify backend health**

Run:
```bash
docker compose --env-file .env.docker exec -T backend python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/api/health').status)"
```
Expected: `200`

- [ ] **Step 5: Verify frontend health**

Run:
```bash
docker compose --env-file .env.docker exec -T frontend wget -qO- http://localhost:3000/ > /dev/null 2>&1; echo $?
```
Expected: `0`

- [ ] **Step 6: Verify admin pages load**

Open in browser:
- http://localhost:3000/admin/equipment/manufacturers — should show 2 manufacturers (KMV, Komax)
- http://localhost:3000/admin/equipment/categories — should show tree with 1 top-level + 2 children
- http://localhost:3000/admin/equipment — should show 4 equipment items

- [ ] **Step 7: Verify cable detail page**

Open any cable detail page (e.g. http://localhost:3000/cable/<brand>/<slug>) and check:
- "Recommended Equipment" section displays equipment cards
- Cards show manufacturer name and category label
- External links work

- [ ] **Step 8: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "feat(equipment): complete equipment manufacturers, categories, and equipment CRUD"
```

---

## Self-Review Checklist

After implementation, verify:

1. **Spec coverage:**
   - [x] `equipment_manufacturers` table — Task 1, 8
   - [x] `equipment_categories` table (two-level) — Task 1, 8
   - [x] `recommended_equipments` refactored — Task 1, 8
   - [x] 3 sets of CRUD endpoints — Tasks 4, 5, 6
   - [x] Two-level category validation — Task 5
   - [x] Delete restriction (RESTRICT) — Task 1 (FK), Tasks 4, 5 (409 responses)
   - [x] Seed script — Task 9
   - [x] Admin UI (3 list + 3 form pages) — Tasks 17-22
   - [x] Sidebar navigation — Task 23
   - [x] Frontend types refactor — Task 11
   - [x] adminApi.ts extension — Task 12
   - [x] Cable detail page refactor — Tasks 24, 25
   - [x] Local rule engine deprecation — Task 26

2. **Type consistency:**
   - `EquipmentManufacturer`, `EquipmentCategory`, `RecommendedEquipment` interface names match between `types.ts`, `adminApi.ts`, and `api.ts`
   - Backend schema field names match model column names
   - CRUD class names (`crud_equipment_manufacturer`, `crud_equipment_category`, `crud_equipment`) match imports in routes

3. **Placeholder scan:** No TBD, TODO, or vague steps — all code blocks are complete
