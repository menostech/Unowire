# Remove Brand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `Brand` entity entirely so `Cable` associates directly with `Manufacturer` via `manufacturer_id`, simplifying the data model, URL scheme, scope checks, and UI.

**Architecture:** Drop the `brands` table and replace `Cable.brand_id` (FK→brands) with `Cable.manufacturer_id` (FK→manufacturers). URL scheme changes from `/cable/{brand_slug}/{cable_slug}` to `/cable/{manufacturer_slug}/{cable_slug}`. Brand facet removed from search; Manufacturer facet retained. Data migration uses truncate+rebuild (MVP, no production data).

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (async) + Alembic + PostgreSQL (backend); Next.js 15 + TypeScript (frontend).

**Spec:** `docs/superpowers/specs/2026-07-22-remove-brand-design.md`

---

## File Structure

### Backend files to DELETE (7 files)
- `backend/app/models/brand.py` — Brand model
- `backend/app/crud/brand.py` — CRUDBrand + crud_brand
- `backend/app/schemas/brand.py` — BrandBase/Read/Create/Update
- `backend/app/api/routes/brands.py` — Admin brand CRUD endpoints
- `backend/app/api/routes/portal_brands.py` — Portal brand endpoints
- `backend/tests/api/test_portal_brands.py` — Portal brand tests

### Backend files to MODIFY (12 files)
- `backend/app/models/cable.py` — brand_id→manufacturer_id, relationship, UniqueConstraint
- `backend/app/models/__init__.py` — remove Brand import/export
- `backend/app/schemas/cable.py` — remove BrandFacet/BrandRead import, change CableRead/Create/Update, FilterFacets, CableFilterParams
- `backend/app/crud/cable.py` — remove Brand joins, direct Manufacturer, remove brand facet
- `backend/app/api/routes/cables.py` — scope check direct, remove brand param, by-url param rename
- `backend/app/api/routes/portal_cables.py` — ownership check uses cable.manufacturer_id
- `backend/app/api/routes/cable_import_templates.py` — brand_id→manufacturer_id in CSV/JSON templates
- `backend/app/services/cable_import.py` — brand_id→manufacturer_id in required columns + FK validation
- `backend/app/api/deps.py` — remove "brands" from _FACTORY_ALLOWED_BY_SCOPE
- `backend/app/core/modules.py` — remove brands module entry
- `backend/app/main.py` — remove brands/portal_brands router registration
- `backend/scripts/seed.py` — remove seed_brands, remove Brand import, seed_cables uses manufacturer_id, truncate_all drops brands

### Backend files to CREATE (1 file)
- `backend/alembic/versions/n3o4p5q6r7s8_remove_brand_table.py` — Alembic migration

### Backend test files to MODIFY (6 files) + DELETE (1 file)
- DELETE `backend/tests/api/test_portal_brands.py`
- MODIFY `backend/tests/api/test_portal_crud.py` — remove crud_brand import, update cable assertions
- MODIFY `backend/tests/api/test_rbac_permissions.py` — remove test_admin_can_create_brand
- MODIFY `backend/tests/api/test_admin_roles.py` — remove "brands" from permission assertions
- MODIFY `backend/tests/api/test_portal_auth.py` — remove "brands" from allowed_modules assertion
- MODIFY `backend/tests/api/test_admin_menu.py` — update count assertions, fix brands page_id reference
- MODIFY `backend/tests/api/test_page_views.py` — remove Brand join in real_entity_ids fixture
- MODIFY `backend/tests/conftest.py` — remove DELETE FROM brands cleanup

### Frontend files to DELETE (6 directories/files)
- `frontend/app/admin/(dashboard)/brands/` — entire directory
- `frontend/app/portal/brands/` — entire directory
- `frontend/components/admin/form/BrandForm.tsx`
- `frontend/components/portal/form/BrandEditForm.tsx`
- `frontend/app/api/admin/brands/` — directory
- `frontend/app/api/portal/brands/` — directory
- `frontend/data/brands.json` — seed data

### Frontend files to MODIFY (24 files)
- `frontend/lib/types.ts` — remove Brand interface, change Cable/CableListItem/CableDetailResponse/FilterFacets/CableQueryParams
- `frontend/lib/api.ts` — remove api.brands, adaptBrand, BackendBrand; getCableUrl uses manufacturer.slug; adaptCable attaches manufacturer
- `frontend/lib/adminApi.ts` — remove BackendBrand, adaptBrand, adminApi.brands
- `frontend/lib/portalApi.ts` — remove portalApi.brands
- `frontend/lib/seo.ts` — generateCableMetadata uses manufacturer; buildCableJsonLd brand field uses manufacturer
- `frontend/lib/validate.ts` — remove brand validation, uniqueness uses (manufacturer.slug, cable.slug)
- `frontend/lib/adminModules.ts` — remove brands module
- `frontend/lib/adminMenuRegistry.ts` — remove brands page entry
- `frontend/lib/filter.ts` — remove all brand logic, use manufacturer_id directly
- `frontend/components/cable/CableCard.tsx` — brand prop→manufacturer prop
- `frontend/components/cable/CableFilters.tsx` — remove Brand facet checkbox group
- `frontend/components/admin/form/CableForm.tsx` — brands prop→manufacturers prop, brand_id→manufacturer_id
- `frontend/components/admin/form/ManufacturerShowcaseBlocks.tsx` — cable.brand?.name→cable.manufacturer?.name
- `frontend/components/admin/layout/AdminSidebar.tsx` — remove brands from PAGE_ID_TO_MODULE_ID
- `frontend/components/portal/layout/PortalSidebar.tsx` — remove Brands nav item
- `frontend/components/home/StatsRow.tsx` — remove Brands stat
- `frontend/app/(site)/page.tsx` — remove api.brands.all() fetch, remove brands prop
- `frontend/app/(site)/cables/page.tsx` — remove brandToManufacturer map, use manufacturer_id directly
- `frontend/app/(site)/cables/[industry]/[category]/[product-type]/page.tsx` — remove brand param/filter
- `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx` — use cable.manufacturer directly, stop fetching brand
- `frontend/app/(site)/manufacturers/[slug]/page.tsx` — filter cables by manufacturer_id directly, remove brands list section
- `frontend/app/api/cables/[brand_slug]/[slug]/route.ts` — use cable.manufacturer directly
- `frontend/app/admin/(dashboard)/page.tsx` — remove brands stat/link
- `frontend/app/admin/(dashboard)/cables/page.tsx` — c.brand?.name→c.manufacturer?.name
- `frontend/app/admin/(dashboard)/cables/new/page.tsx` — fetch manufacturers instead of brands
- `frontend/app/admin/(dashboard)/cables/[id]/page.tsx` — fetch manufacturers instead of brands
- `frontend/app/admin/(dashboard)/manufacturers/[id]/page.tsx` — cable.brand?.name→cable.manufacturer?.name
- `frontend/app/portal/cables/page.tsx` — c.brand?.name→c.manufacturer?.name
- `frontend/app/layout.tsx` — update description text
- `frontend/data/cables.json` — brand_id→manufacturer_id in each cable object

> **Note:** The spec listed 14 frontend modifications, but codebase inspection revealed 10 additional files with Brand references that require changes. These are integrated into the tasks below.

---

## Task 1: Update Cable Model

**Files:**
- Modify: `backend/app/models/cable.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Update Cable model — replace brand_id with manufacturer_id**

In `backend/app/models/cable.py`, replace the `brand_id` column, `UniqueConstraint`, and `brand` relationship:

```python
# In __table_args__, change:
#   UniqueConstraint("brand_id", "slug"),
# to:
        UniqueConstraint("manufacturer_id", "slug"),

# Replace the brand_id column:
#   brand_id: Mapped[str] = mapped_column(
#       String(100), ForeignKey("brands.id", ondelete="RESTRICT"), nullable=False
#   )
# with:
    manufacturer_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("manufacturers.id", ondelete="RESTRICT"), nullable=False
    )

# Replace the brand relationship:
#   brand: Mapped["Brand"] = relationship(lazy="selectin")
# with:
    manufacturer: Mapped["Manufacturer"] = relationship(lazy="selectin")
```

- [ ] **Step 2: Remove Brand from models/__init__.py**

In `backend/app/models/__init__.py`, remove the Brand import line and remove `"Brand"` from `__all__`:

```python
# Remove this line:
from app.models.brand import Brand

# Remove "Brand" from the __all__ list
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/cable.py backend/app/models/__init__.py
git commit -m "refactor(backend): replace Cable.brand_id with manufacturer_id in model"
```

---

## Task 2: Update Cable Schemas

**Files:**
- Modify: `backend/app/schemas/cable.py`

- [ ] **Step 1: Remove BrandRead import and BrandFacet, update CableRead**

In `backend/app/schemas/cable.py`:

Remove the import:
```python
from app.schemas.brand import BrandRead
```

In `CableRead`, replace `brand_id` with `manufacturer_id` and `brand` with `manufacturer`:
```python
class CableRead(BaseModel):
    id: str
    model: str
    slug: str
    manufacturer_id: str
    product_type_id: str
    industry_id: str
    category_id: str
    size_system: str
    base_description: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    image_url: str | None = None
    manufacturer: ManufacturerRead | None = None
    common_specs: list[SpecItemRead] = []
    variants: list[CableVariantRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Remove BrandFacet class, remove brands from FilterFacets**

Delete the entire `BrandFacet` class:
```python
# DELETE this class:
class BrandFacet(BaseModel):
    id: str
    name: str
    count: int
```

In `FilterFacets`, remove the `brands` field:
```python
class FilterFacets(BaseModel):
    manufacturers: list[ManufacturerFacet] = []
    size: list[SizeFacet] = []
    size_range: SizeRangeFacet | None = None
    spec_facets: dict[str, list[SpecFacetValue]] = {}
    outer_diameter: OuterDiameterFacet | None = None
```

- [ ] **Step 3: Update CableCreate and CableUpdate — brand_id → manufacturer_id**

In `CableCreate`:
```python
class CableCreate(BaseModel):
    id: str
    manufacturer_id: str
    product_type_id: str
    industry_id: str
    category_id: str
    model: str
    slug: str
    size_system: str
    base_description: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    image_url: str | None = None
    category_ids: list[str] = []
    common_specs: list[SpecItemCreate] = []
    variants: list[CableVariantCreate] = []
```

In `CableUpdate`, change `brand_id` to `manufacturer_id`:
```python
class CableUpdate(BaseModel):
    manufacturer_id: str | None = None
    product_type_id: str | None = None
    # ... rest unchanged
```

- [ ] **Step 4: Remove brand from CableFilterParams**

```python
class CableFilterParams(BaseModel):
    industry: str | None = None
    category: str | None = None
    product_type: str | None = None
    q: str | None = None
    manufacturer: list[str] | None = None
    size: list[str] | None = None
    min_size: float | None = None
    max_size: float | None = None
    spec_filters: dict[str, list[str]] | None = None
    min_od: float | None = None
    max_od: float | None = None
    page: int = 1
    page_size: int = 20
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/cable.py
git commit -m "refactor(backend): remove BrandFacet, change Cable schemas to use manufacturer_id"
```

---

## Task 3: Update Cable CRUD

**Files:**
- Modify: `backend/app/crud/cable.py`

- [ ] **Step 1: Remove Brand import, update get_detail**

Remove the Brand import:
```python
# Remove this line:
from app.models.brand import Brand
```

Update `get_detail` to eager-load `Cable.manufacturer` instead of `Cable.brand→Brand.manufacturer`:
```python
    async def get_detail(self, db: AsyncSession, id: str) -> Cable | None:
        stmt = select(Cable).where(Cable.id == id).options(
            selectinload(Cable.manufacturer),
            selectinload(Cable.variants).selectinload(CableVariant.specs),
            selectinload(Cable.common_specs),
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
```

- [ ] **Step 2: Update get_by_url — use Manufacturer.slug directly**

```python
    async def get_by_url(self, db: AsyncSession, manufacturer_slug: str, cable_slug: str) -> Cable | None:
        stmt = (
            select(Cable)
            .join(Manufacturer, Cable.manufacturer_id == Manufacturer.id)
            .where(Manufacturer.slug == manufacturer_slug, Cable.slug == cable_slug)
            .options(
                selectinload(Cable.manufacturer),
                selectinload(Cable.variants).selectinload(CableVariant.specs),
                selectinload(Cable.common_specs),
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
```

- [ ] **Step 3: Update get_filtered — remove brand filter, direct manufacturer filter**

In `get_filtered`, replace the manufacturer/brand filter block:
```python
        # Manufacturer filter (direct join, no Brand intermediate)
        if params.manufacturer:
            stmt = stmt.join(Manufacturer, Cable.manufacturer_id == Manufacturer.id).where(
                Manufacturer.id.in_(params.manufacturer)
            )
            count_stmt = count_stmt.join(Manufacturer, Cable.manufacturer_id == Manufacturer.id).where(
                Manufacturer.id.in_(params.manufacturer)
            )
```

Remove the `if params.brand:` block entirely.

Update the eager-loading options at the end of `get_filtered`:
```python
        stmt = stmt.options(
            selectinload(Cable.manufacturer),
            selectinload(Cable.variants).selectinload(CableVariant.specs),
            selectinload(Cable.common_specs),
        ).offset((params.page - 1) * params.page_size).limit(params.page_size)
```

- [ ] **Step 4: Update _build_facets — remove BrandFacet, direct Manufacturer facet**

In `_build_facets`, replace the manufacturer facet query (remove Brand join):
```python
        # Manufacturer facets (direct join)
        mfr_stmt = (
            select(Manufacturer.id, Manufacturer.name, func.count(Cable.id.distinct()))
            .join(Cable, Cable.manufacturer_id == Manufacturer.id)
            .where(Cable.id.in_(cable_ids))
            .group_by(Manufacturer.id, Manufacturer.name)
        )
        mfr_result = await db.execute(mfr_stmt)
        manufacturers = [
            ManufacturerFacet(id=row[0], name=row[1], count=row[2])
            for row in mfr_result.all()
        ]
```

Delete the entire Brand facet block:
```python
        # DELETE this block:
        # brand_stmt = (
        #     select(Brand.id, Brand.name, func.count(Cable.id.distinct()))
        #     ...
        # brands = [...]
```

Remove `BrandFacet` from the import list at the top of the file.

Update the `FilterFacets` return to remove `brands=brands`:
```python
        return FilterFacets(
            manufacturers=manufacturers,
            size=size_facets,
            size_range=size_range,
            spec_facets=spec_facets,
            outer_diameter=outer_diameter,
        )
```

- [ ] **Step 5: Update list_by_manufacturer and count_by_manufacturer — direct FK, no join**

```python
    async def list_by_manufacturer(
        self, db: AsyncSession, *, scope_id: str, skip: int = 0, limit: int = 50
    ) -> list[Cable]:
        """List cables where manufacturer_id == scope_id. For portal routes."""
        stmt = (
            select(Cable)
            .where(Cable.manufacturer_id == scope_id)
            .options(
                selectinload(Cable.manufacturer),
                selectinload(Cable.variants).selectinload(CableVariant.specs),
                selectinload(Cable.common_specs),
            )
            .order_by(Cable.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def count_by_manufacturer(self, db: AsyncSession, *, scope_id: str) -> int:
        """Count cables where manufacturer_id == scope_id."""
        stmt = (
            select(func.count())
            .select_from(Cable)
            .where(Cable.manufacturer_id == scope_id)
        )
        result = await db.execute(stmt)
        return result.scalar() or 0
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/crud/cable.py
git commit -m "refactor(backend): remove Brand joins from cable CRUD, use direct manufacturer_id"
```

---

## Task 4: Update Cable Routes, Deps, Main, Modules, Import Service

**Files:**
- Modify: `backend/app/api/routes/cables.py`
- Modify: `backend/app/api/routes/portal_cables.py`
- Modify: `backend/app/api/routes/cable_import_templates.py`
- Modify: `backend/app/services/cable_import.py`
- Modify: `backend/app/api/deps.py`
- Modify: `backend/app/core/modules.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Update cables.py — remove brand param, rename by-url param, fix scope check**

In `backend/app/api/routes/cables.py`:

In `list_cables`, remove the `brand` parameter and its usage:
```python
@router.get("", response_model=CableListResponse)
async def list_cables(
    industry: str | None = None,
    category: str | None = None,
    product_type: str | None = None,
    q: str | None = None,
    manufacturer: list[str] | None = Query(None),
    size: list[str] | None = Query(None),
    min_size: float | None = None,
    max_size: float | None = None,
    spec_filters: str | None = None,
    min_od: float | None = None,
    max_od: float | None = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
):
```
Remove `brand=brand,` from the `CableFilterParams(...)` call.

Rename the by-url route param from `brand_slug` to `manufacturer_slug`:
```python
@router.get("/by-url/{manufacturer_slug}/{cable_slug}", response_model=CableDetailRead)
async def get_cable_by_url(manufacturer_slug: str, cable_slug: str, db: AsyncSession = Depends(get_db)):
    cable = await crud_cable.get_by_url(db, manufacturer_slug, cable_slug)
```

In `create_cable`, replace the scope check:
```python
    # Scope check: cable_manager can only create cables for their own manufacturer
    if user.role and user.role.scope_type == "manufacturer":
        if obj_in.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot create cable for a manufacturer outside your scope"},
            )
```

In `update_cable`, replace the scope check:
```python
    # Scope check: cable_manager can only modify their own manufacturer's cables
    if user.role and user.role.scope_type == "manufacturer":
        if cable.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot modify cable outside your scope"},
            )
```

In `delete_cable`, replace the scope check:
```python
    # Scope check: cable_manager can only delete their own manufacturer's cables
    if user.role and user.role.scope_type == "manufacturer":
        cable = await crud_cable.get_detail(db, id)
        if cable is None:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Cable not found"})
        if cable.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete cable outside your scope"},
            )
```

- [ ] **Step 2: Update portal_cables.py — ownership check uses cable.manufacturer_id**

In `backend/app/api/routes/portal_cables.py`:

Remove the `crud_brand` import:
```python
# Remove this line:
from app.crud.brand import crud_brand
```

Update `_check_cable_ownership`:
```python
def _check_cable_ownership(user: User, cable) -> None:
    """Raise 404 if cable is None or not in user's scope."""
    if cable is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Cable not found"})
    if cable.manufacturer_id != user.scope_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Cable not found"})
```

- [ ] **Step 3: Update cable_import_templates.py — brand_id→manufacturer_id**

In `backend/app/api/routes/cable_import_templates.py`:

```python
CSV_TEMPLATE_HEADERS = [
    "id", "model", "slug", "manufacturer_id", "industry_id",
    "category_id", "product_type_id", "size_system",
    "base_description", "meta_title", "meta_description", "category_ids",
]

CSV_TEMPLATE_EXAMPLE = {
    "id": "consumer_electronics_premium_hdmi_cable",
    "model": "Premium HDMI Cable 4K",
    "slug": "premium-hdmi-cable-4k",
    "manufacturer_id": "mfr-1",
    "industry_id": "consumer_electronics",
    "category_id": "consumer_electronics/internal_wiring",
    "product_type_id": "consumer_electronics/internal_wiring/electronic_wire",
    "size_system": "none",
    "base_description": "High-speed HDMI cable with Ethernet",
    "meta_title": "Premium HDMI Cable 4K - Hitachi Cable",
    "meta_description": "High-speed HDMI cable supporting 4K resolution",
    "category_ids": '["consumer_electronics/internal_wiring"]',
}
```

In the JSON example, change `"brand_id": "sony"` to `"manufacturer_id": "mfr-1"` and update the meta_title accordingly.

- [ ] **Step 4: Update cable_import.py — brand_id→manufacturer_id, FK validation**

In `backend/app/services/cable_import.py`:

Replace the Brand import:
```python
# Remove:
from app.models.brand import Brand
# Add:
from app.models.manufacturer import Manufacturer
```

Update `REQUIRED_CSV_COLUMNS`:
```python
REQUIRED_CSV_COLUMNS = {
    "id", "model", "slug", "manufacturer_id", "industry_id",
    "category_id", "product_type_id", "size_system",
}
```

In `_validate_cable_fields`, replace all `brand_id` references with `manufacturer_id`:
```python
    manufacturer_id = data.get("manufacturer_id")
    # ...
    if not manufacturer_id:
        errors.append(f"Row {row_number}: missing required field 'manufacturer_id'")
    # ...
    cable_create = CableCreate(
        id=cable_id,
        model=model,
        slug=slug,
        manufacturer_id=manufacturer_id,
        # ... rest unchanged
    )
```

In `_load_fk_sets`, replace brand_ids with manufacturer_ids:
```python
async def _load_fk_sets(db: AsyncSession, rows: list[ParsedRow]) -> dict[str, set[str]]:
    """Layer 3: batch-load all FK target ids to avoid N+1 queries."""
    manufacturer_ids = {r.data.get("manufacturer_id") for r in rows if r.data.get("manufacturer_id")}
    industry_ids = {r.data.get("industry_id") for r in rows if r.data.get("industry_id")}
    category_ids = {r.data.get("category_id") for r in rows if r.data.get("category_id")}
    product_type_ids = {r.data.get("product_type_id") for r in rows if r.data.get("product_type_id")}

    fk_sets: dict[str, set[str]] = {
        "manufacturers": set(),
        "industries": set(),
        "categories": set(),
        "product_types": set(),
    }

    if manufacturer_ids:
        result = await db.execute(select(Manufacturer.id).where(Manufacturer.id.in_(manufacturer_ids)))
        fk_sets["manufacturers"] = set(result.scalars().all())
    if industry_ids:
        result = await db.execute(select(Industry.id).where(Industry.id.in_(industry_ids)))
        fk_sets["industries"] = set(result.scalars().all())
    if category_ids:
        result = await db.execute(select(Category.id).where(Category.id.in_(category_ids)))
        fk_sets["categories"] = set(result.scalars().all())
    if product_type_ids:
        result = await db.execute(select(ProductType.id).where(ProductType.id.in_(product_type_ids)))
        fk_sets["product_types"] = set(result.scalars().all())

    return fk_sets
```

In `validate_rows`, update the FK existence check:
```python
        if cable_create.manufacturer_id not in fk_sets["manufacturers"]:
            fk_errors.append(f"Row {row_number}: manufacturer_id '{cable_create.manufacturer_id}' does not exist")
```

- [ ] **Step 5: Update deps.py — remove "brands" from permission matrix**

In `backend/app/api/deps.py`:
```python
_FACTORY_ALLOWED_BY_SCOPE: dict[str, set[str]] = {
    "manufacturer": {"dashboard", "cables", "inquiries", "media", "me"},
    "equipment_manufacturer": {"dashboard", "equipment", "inquiries", "media", "me"},
}
```

- [ ] **Step 6: Update modules.py — remove brands module**

In `backend/app/core/modules.py`, remove the brands entry from `ADMIN_MODULES`:
```python
# Remove this line:
    {"id": "brands",          "label": "Brands",          "scope_aware": True,  "scope_type": "manufacturer"},
```

- [ ] **Step 7: Update main.py — remove brand router registrations**

In `backend/app/main.py`, remove `brands` and `portal_brands` from the import line:
```python
from app.api.routes import auth, cable_import, cable_import_templates, cables, categories, equipment, equipment_categories, equipment_manufacturers, folders, health, industries, manufacturers, pages, product_types, taxonomy, uploads, site_menu, admin_menu, admin_roles, admin_users, member, admin_inquiries, admin_email, admin_members, admin_messages, portal_auth, page_views, portal_dashboard, portal_cables, portal_equipment, portal_inquiries, portal_media, portal_me
```

Remove the two router registration lines:
```python
# Remove:
app.include_router(brands.router, prefix=f"{settings.api_prefix}/brands", tags=["brands"])
# Remove:
app.include_router(portal_brands.router)
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/routes/cables.py backend/app/api/routes/portal_cables.py backend/app/api/routes/cable_import_templates.py backend/app/services/cable_import.py backend/app/api/deps.py backend/app/core/modules.py backend/app/main.py
git commit -m "refactor(backend): update cable routes/deps/modules to remove brand references"
```

---

## Task 5: Delete Backend Brand Files

**Files:**
- Delete: `backend/app/models/brand.py`
- Delete: `backend/app/crud/brand.py`
- Delete: `backend/app/schemas/brand.py`
- Delete: `backend/app/api/routes/brands.py`
- Delete: `backend/app/api/routes/portal_brands.py`
- Delete: `backend/tests/api/test_portal_brands.py`

- [ ] **Step 1: Delete the 6 files**

```bash
git rm backend/app/models/brand.py
git rm backend/app/crud/brand.py
git rm backend/app/schemas/brand.py
git rm backend/app/api/routes/brands.py
git rm backend/app/api/routes/portal_brands.py
git rm backend/tests/api/test_portal_brands.py
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor(backend): delete Brand model, CRUD, schema, routes, and tests"
```

---

## Task 6: Create Alembic Migration

**Files:**
- Create: `backend/alembic/versions/n3o4p5q6r7s8_remove_brand_table.py`

- [ ] **Step 1: Create the migration file**

Create `backend/alembic/versions/n3o4p5q6r7s8_remove_brand_table.py`:

```python
"""remove brand table and replace cable.brand_id with manufacturer_id

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
Create Date: 2026-07-23 00:00:00.000000

Drops the brands table entirely. Cables now reference manufacturers directly
via manufacturer_id. Also cleans up stale admin_menu_items and role_permissions
entries for the removed 'brands' module.
"""
from alembic import op
import sqlalchemy as sa


revision: str = 'n3o4p5q6r7s8'
down_revision: str | None = 'm2n3o4p5q6r7'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Drop the old unique constraint on cables (brand_id, slug)
    op.drop_constraint('cables_brand_id_slug_key', 'cables', type_='unique')

    # 2. Drop brand_id column
    op.drop_column('cables', 'brand_id')

    # 3. Add manufacturer_id column
    op.add_column(
        'cables',
        sa.Column('manufacturer_id', sa.String(length=100), nullable=False)
    )
    op.create_foreign_key(
        'fk_cables_manufacturer_id_manufacturers',
        'cables',
        'manufacturers',
        ['manufacturer_id'],
        ['id'],
        ondelete='RESTRICT',
    )

    # 4. Add new unique constraint (manufacturer_id, slug)
    op.create_unique_constraint('uq_cables_manufacturer_slug', 'cables', ['manufacturer_id', 'slug'])

    # 5. Drop brands table
    op.drop_table('brands')

    # 6. Clean up stale admin_menu_items for brands
    op.execute("DELETE FROM admin_menu_items WHERE id = 'brands' OR page_id = 'brands'")

    # 7. Clean up stale role_permissions for brands module
    op.execute("DELETE FROM role_permissions WHERE module = 'brands'")


def downgrade():
    # Re-add brands table
    op.create_table(
        'brands',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('slug', sa.String(length=200), nullable=False, unique=True),
        sa.Column('manufacturer_id', sa.String(length=100),
                  sa.ForeignKey('manufacturers.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('image_url', sa.String(length=500)),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # Remove new constraint and column
    op.drop_constraint('uq_cables_manufacturer_slug', 'cables', type_='unique')
    op.drop_constraint('fk_cables_manufacturer_id_manufacturers', 'cables', type_='foreignkey')
    op.drop_column('cables', 'manufacturer_id')

    # Re-add brand_id
    op.add_column(
        'cables',
        sa.Column('brand_id', sa.String(length=100),
                  sa.ForeignKey('brands.id', ondelete='RESTRICT'), nullable=False)
    )
    op.create_unique_constraint('cables_brand_id_slug_key', 'cables', ['brand_id', 'slug'])
```

- [ ] **Step 2: Commit**

```bash
git add backend/alembic/versions/n3o4p5q6r7s8_remove_brand_table.py
git commit -m "feat(backend): add alembic migration to drop brands table and add manufacturer_id"
```

---

## Task 7: Update Seed Data and Seed Script

**Files:**
- Modify: `frontend/data/cables.json`
- Delete: `frontend/data/brands.json`
- Modify: `backend/scripts/seed.py`

- [ ] **Step 1: Update cables.json — replace brand_id with manufacturer_id**

In `frontend/data/cables.json`, for every cable object, replace `"brand_id": "brand-N"` with the corresponding `"manufacturer_id": "mfr-N"`.

Mapping (from `frontend/data/brands.json`):
- `brand-1` → `mfr-1` (Hitachi)
- `brand-2` → `mfr-2` (Sumitomo)
- `brand-3` → `mfr-3` (Draka, under Prysmian Group)
- `brand-4` → `mfr-3` (Prysmian, under Prysmian Group)

Use find-and-replace:
- `"brand_id": "brand-1"` → `"manufacturer_id": "mfr-1"`
- `"brand_id": "brand-2"` → `"manufacturer_id": "mfr-2"`
- `"brand_id": "brand-3"` → `"manufacturer_id": "mfr-3"`
- `"brand_id": "brand-4"` → `"manufacturer_id": "mfr-3"`

- [ ] **Step 2: Delete brands.json**

```bash
git rm frontend/data/brands.json
```

- [ ] **Step 3: Update seed.py — remove Brand import, remove seed_brands, update truncate_all and seed_cables**

In `backend/scripts/seed.py`:

Remove the Brand import:
```python
# Remove this line:
from app.models.brand import Brand
```

Update `truncate_all` to remove `"brands"` from the table list:
```python
    tables = [
        "spec_items", "cable_variants", "cables",
        "recommended_equipments",
        "manufacturers", "audit_log",
    ]
```

Delete the entire `seed_brands` function.

In `seed_cables`, change `brand_id=cable_data["brand_id"]` to `manufacturer_id=cable_data["manufacturer_id"]`:
```python
        cable = Cable(
            id=cable_data["id"],
            manufacturer_id=cable_data["manufacturer_id"],
            product_type_id=f"{industry}/{category}/{product_type}",
            # ... rest unchanged
        )
```

In `main`, remove the `seed_brands` call:
```python
        print("Seeding manufacturers...")
        await seed_manufacturers(db, dry_run)

        print("Seeding taxonomy...")
        await seed_taxonomy(db, dry_run)
```

- [ ] **Step 4: Commit**

```bash
git add frontend/data/cables.json backend/scripts/seed.py
git commit -m "refactor(seed): remove brand seed data, cables.json uses manufacturer_id"
```

---

## Task 8: Update Backend Tests

**Files:**
- Modify: `backend/tests/api/test_portal_crud.py`
- Modify: `backend/tests/api/test_rbac_permissions.py`
- Modify: `backend/tests/api/test_admin_roles.py`
- Modify: `backend/tests/api/test_portal_auth.py`
- Modify: `backend/tests/api/test_admin_menu.py`
- Modify: `backend/tests/api/test_page_views.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Update test_portal_crud.py**

Remove `crud_brand` import:
```python
# Remove:
from app.crud.brand import crud_brand
```

Update `test_cable_list_by_manufacturer_returns_only_scope_cables`:
```python
def test_cable_list_by_manufacturer_returns_only_scope_cables():
    """list_by_manufacturer returns cables where manufacturer_id == scope_id."""
    async def _run():
        async with async_session() as db:
            cables = await crud_cable.list_by_manufacturer(db, scope_id="mfr-1", skip=0, limit=20)
            for c in cables:
                assert c.manufacturer_id == "mfr-1"
    asyncio.run(_run())
```

Delete `test_brand_list_by_manufacturer` entirely.

- [ ] **Step 2: Update test_rbac_permissions.py — remove test_admin_can_create_brand**

Delete the entire `test_admin_can_create_brand` function.

- [ ] **Step 3: Update test_admin_roles.py — remove "brands" from permission assertions**

In `test_update_role_permissions`:
```python
    res = client.put(
        "/api/admin/roles/editor_v2",
        headers=admin_headers,
        json={"permissions": ["dashboard", "cables", "manufacturers"]},
    )
    assert res.status_code == 200
    role = res.json()
    assert set(role["permissions"]) == {"dashboard", "cables", "manufacturers"}
```

- [ ] **Step 4: Update test_portal_auth.py — remove "brands" from allowed_modules**

```python
def test_portal_me_permissions_returns_allowed_modules(client, cable_manager_headers):
    res = client.get("/api/portal/auth/me/permissions", headers=cable_manager_headers)
    assert res.status_code == 200
    data = res.json()
    assert set(data["allowed_modules"]) == {"dashboard", "cables", "inquiries", "media", "me"}
```

- [ ] **Step 5: Update test_admin_menu.py — fix count assertions and brands page_id reference**

In `test_tree_returns_top_level_items`, update the expected count (brands removed from top-level):
```python
    def test_tree_returns_top_level_items(self, client):
        res = client.get("/api/admin/menu/tree")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 5  # dashboard, cables, equipment, media, settings (brands removed)
```

In `test_flat_returns_all_items`, update the expected count:
```python
    def test_flat_returns_all_items(self, client, admin_headers):
        res = client.get("/api/admin/menu", headers=admin_headers)
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 20  # 21 original - 1 brands removed
```

In `test_create_with_non_group_parent_returns_422`, change `"page_id": "brands"` to `"page_id": "industries"`:
```python
    def test_create_with_non_group_parent_returns_422(self, client, admin_headers):
        # 'cables' is a page, not a group — cannot be a parent
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "nested-too-deep",
                "parent_id": "cables",
                "type": "page",
                "page_id": "industries",
                "label": "Nested",
            },
            headers=admin_headers,
        )
        assert res.status_code == 422
```

- [ ] **Step 6: Update test_page_views.py — remove Brand join in real_entity_ids fixture**

```python
    async def _fetch():
        async with async_session() as db:
            cable_stmt = (
                select(Cable.id)
                .select_from(Cable)
                .join(Manufacturer, Cable.manufacturer_id == Manufacturer.id)
                .order_by(Cable.id)
                .limit(3)
            )
            cable_ids = list((await db.execute(cable_stmt)).scalars().all())
```

Remove the Brand import:
```python
# Remove:
from app.models.brand import Brand
```

- [ ] **Step 7: Update conftest.py — remove brands cleanup**

Remove this line from `_cleanup_test_data`:
```python
# Remove:
            await conn.execute(text(
                "DELETE FROM brands WHERE slug = 'test-brand-rbac'"
            ))
```

- [ ] **Step 8: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All tests pass (some tests may need count adjustments if other seed data changed).

- [ ] **Step 9: Commit**

```bash
git add backend/tests/
git commit -m "test(backend): update tests for brand removal — remove brand tests, fix assertions"
```

---

## Task 9: Run Migration and Seed

- [ ] **Step 1: Run the Alembic migration**

```bash
cd backend
docker compose --env-file .env.docker exec backend alembic upgrade head
```
Expected: Migration `n3o4p5q6r7s8` applies successfully (drops brands table, adds manufacturer_id to cables).

- [ ] **Step 2: Run the seed script**

```bash
docker compose --env-file .env.docker exec backend python -m scripts.seed
```
Expected: Seed completes without errors. Cables are inserted with `manufacturer_id`.

- [ ] **Step 3: Verify backend health**

```bash
curl http://localhost:8000/api/health
curl http://localhost:8000/api/cables?page_size=3
```
Expected: Cables returned with `manufacturer_id` field (not `brand_id`), and `manufacturer` object instead of `brand`.

---

## Task 10: Update Frontend Lib Files

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/lib/adminApi.ts`
- Modify: `frontend/lib/portalApi.ts`
- Modify: `frontend/lib/seo.ts`
- Modify: `frontend/lib/validate.ts`
- Modify: `frontend/lib/adminModules.ts`
- Modify: `frontend/lib/adminMenuRegistry.ts`
- Modify: `frontend/lib/filter.ts`

- [ ] **Step 1: Update types.ts**

Remove the `Brand` interface entirely. In `Cable`, replace `brand_id` with `manufacturer_id`:
```typescript
export interface Cable {
  id: string;
  manufacturer_id: string;
  model: string;
  // ... rest unchanged
}
```

In `CableQueryParams`, remove `brand?: string[];`.

In `FilterFacets`, remove `brands: ...`.

In `CableListItem`, remove `brand: Brand | null;` (keep `manufacturer`).

In `CableDetailResponse`, remove `brand: Brand | null;` (keep `manufacturer`).

- [ ] **Step 2: Update api.ts**

Remove `Brand` from the import. Remove `BackendBrand` interface. Remove `adaptBrand` function. Remove `api.brands` namespace.

Update `BackendCable` interface — replace `brand_id` with `manufacturer_id`, replace `brand?` with `manufacturer?`:
```typescript
interface BackendCable {
  id: string;
  manufacturer_id: string;
  product_type_id: string;
  industry_id: string;
  category_id: string;
  model: string;
  slug: string;
  size_system: string;
  base_description: string | null;
  meta_title: string | null;
  meta_description: string | null;
  image_url: string | null;
  category_ids?: string[];
  manufacturer?: BackendManufacturer | null;
  common_specs?: BackendSpecItem[];
  variants?: { slug: string; specs: BackendSpecItem[]; sort_order?: number; id?: number }[];
}
```

Update `adaptCable` — replace `brand_id` with `manufacturer_id`, attach `manufacturer_slug` for URL:
```typescript
function adaptCable(c: BackendCable): Cable {
  const cable: Cable = {
    id: c.id,
    manufacturer_id: c.manufacturer_id,
    model: c.model,
    slug: c.slug,
    type: c.product_type_id,
    industry: c.industry_id as Industry,
    category: c.category_id?.split('/').pop() ?? '',
    product_type: c.product_type_id?.split('/').pop() ?? '',
    size_system: c.size_system as SizeSystem,
    category_ids: c.category_ids ?? [],
    base_description: c.base_description ?? '',
    meta_title: c.meta_title,
    meta_description: c.meta_description,
    image_url: c.image_url,
    common_specs: (c.common_specs ?? []).map(adaptSpecItem),
    variants: (c.variants ?? []).map(v => ({
      slug: v.slug,
      specs: (v.specs ?? []).map(adaptSpecItem),
    })),
  };
  // Attach manufacturer slug for getCableUrl (not part of Cable type)
  if (c.manufacturer) {
    (cable as Cable & { manufacturer?: { slug: string } }).manufacturer = { slug: c.manufacturer.slug };
  }
  return cable;
}
```

Update `getCableUrl` to use `manufacturer.slug`:
```typescript
export function getCableUrl(cable: Cable): string {
  const manufacturerSlug = (cable as unknown as Record<string, unknown>).manufacturer_slug as string | undefined;
  if (manufacturerSlug) return `/cable/${manufacturerSlug}/${cable.slug}`;
  const manufacturer = (cable as unknown as Record<string, unknown>).manufacturer as { slug: string } | undefined;
  return `/cable/${manufacturer?.slug ?? 'unknown'}/${cable.slug}`;
}
```

Update `api.cables.all()` — attach `manufacturer_slug`:
```typescript
    async all(): Promise<Cable[]> {
      const res = await fetchWithCache<BackendCableListResponse>('/api/cables?page_size=999');
      return res.items.map(c => {
        const adapted = adaptCable(c);
        (adapted as unknown as Record<string, unknown>).manufacturer_slug = c.manufacturer?.slug ?? 'unknown';
        return adapted;
      });
    },
```

Update `api.cables.getByUrl` — rename param to `manufacturerSlug`, use `manufacturer`:
```typescript
    async getByUrl(manufacturerSlug: string, cableSlug: string): Promise<Cable | null> {
      try {
        const data = await fetchWithCache<BackendCable>(
          `/api/cables/by-url/${manufacturerSlug}/${cableSlug}`
        );
        const adapted = adaptCable(data);
        (adapted as unknown as Record<string, unknown>).manufacturer_slug = data.manufacturer?.slug ?? manufacturerSlug;
        return adapted;
      } catch {
        return null;
      }
    },
```

Update `getCableDetail` — use `data.manufacturer` directly, remove brand fetch:
```typescript
  async getCableDetail(manufacturerSlug: string, cableSlug: string): Promise<CableDetailResponse | null> {
    try {
      const data = await fetchWithCache<BackendCable & {
        manufacturer: BackendManufacturer | null;
        recommended_equipments: BackendEquipment[];
      }>(`/api/cables/by-url/${manufacturerSlug}/${cableSlug}`);
      const cable = adaptCable(data);
      const manufacturer = data.manufacturer ? adaptManufacturer(data.manufacturer) : null;
      const cableCategories = cable.category_ids ? api.categories.getByIds(cable.category_ids) : [];
      const recommendedEquipments = (data.recommended_equipments ?? []).map(e => {
        const equipment = adaptEquipment(e);
        return { equipment, matched_variants: [], explanation: [] };
      });
      return { cable, manufacturer, categories: cableCategories, recommended_equipments: recommendedEquipments };
    } catch {
      return null;
    }
  },
```

Update `BackendCableListResponse` facets — remove `brands`:
```typescript
interface BackendCableListResponse {
  items: BackendCable[];
  total: number;
  page: number;
  page_size: number;
  facets: {
    manufacturers: { id: string; name: string; count: number }[];
    size: { value: string; count: number }[];
    size_range: { min: number; max: number } | null;
    spec_facets: Record<string, { value: string; count: number }[]>;
    outer_diameter: { min: number; max: number } | null;
  };
}
```

- [ ] **Step 3: Update adminApi.ts**

Remove `Brand` from imports. Remove `BackendBrand` interface. Remove `adaptBrand` function. Remove the entire `brands` namespace from `adminApi`.

Update `BackendCable` interface — `brand_id`→`manufacturer_id`, `brand?`→`manufacturer?`. Update `adaptCable` accordingly.

- [ ] **Step 4: Update portalApi.ts**

Remove the entire `brands` namespace from `portalApi`.

- [ ] **Step 5: Update seo.ts**

Remove `Brand` from imports. Change `generateCableMetadata` signature and body:
```typescript
export function generateCableMetadata(cable: Cable, manufacturer: Manufacturer | null): Metadata {
  const title = cable.meta_title || `${cable.model} - ${manufacturer?.name ?? "Unknown"}`;
  const description = cable.meta_description || cable.base_description.slice(0, 160);
  const manufacturerSlug = manufacturer?.slug ?? "unknown";
  return {
    title,
    description,
    alternates: { canonical: `/cable/${manufacturerSlug}/${cable.slug}` },
    robots: { index: true, follow: true },
  };
}
```

Update `buildCableJsonLd` — brand field uses manufacturer:
```typescript
export function buildCableJsonLd(cable: Cable, manufacturer: Manufacturer | null): object {
  const primaryVariant = getPrimaryVariant(cable);
  const additionalProperty: object[] = cable.common_specs.map(s => ({
    "@type": "PropertyValue",
    name: s.label,
    value: s.unit ? `${s.value} ${s.unit}` : String(s.value),
  }));
  if (primaryVariant) {
    for (const s of primaryVariant.specs) {
      additionalProperty.push({
        "@type": "PropertyValue",
        name: s.label,
        value: s.unit ? `${s.value} ${s.unit}` : String(s.value),
      });
    }
  }

  const categoryPath = cable.category_ids.length > 0
    ? api.categories.getByIds(cable.category_ids).map(c => c.name).join(" > ")
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: cable.model,
    description: cable.base_description,
    brand: manufacturer ? { "@type": "Organization", name: manufacturer.name } : undefined,
    manufacturer: manufacturer ? {
      "@type": "Organization",
      name: manufacturer.name,
      address: { "@type": "PostalAddress", addressCountry: manufacturer.country },
    } : undefined,
    category: categoryPath,
    additionalProperty,
  };
}
```

- [ ] **Step 6: Update validate.ts**

Remove all brand-related validation:
- Remove `const brands = await api.brands.all();`
- Remove `const brandIds = new Set(brands.map(b => b.id));`
- Remove section 1 (brand.manufacturer_id integrity check)
- Remove section 2 (cable.brand_id integrity check) — replace with manufacturer_id check:

```typescript
  // 2. cable.manufacturer_id 引用完整性
  for (const cable of cables) {
    if (!manufacturerIds.has(cable.manufacturer_id)) {
      errors.push({
        file: "cables.json",
        cable_id: cable.id,
        message: `Cable ${cable.id} references missing manufacturer_id: ${cable.manufacturer_id}`,
        severity: "error",
      });
    }
```

- Update section 6 (URL uniqueness) to use `(manufacturer.slug, cable.slug)`:
```typescript
  // 6. (manufacturer_slug, cable_slug) 组合唯一
  const urlSet = new Set<string>();
  for (const cable of cables) {
    const manufacturer = await api.manufacturers.getById(cable.manufacturer_id);
    if (manufacturer) {
      const urlKey = `${manufacturer.slug}/${cable.slug}`;
      if (urlSet.has(urlKey)) {
        errors.push({
          file: "cables.json",
          cable_id: cable.id,
          message: `Duplicate cable URL: ${urlKey}`,
          severity: "error",
        });
      }
      urlSet.add(urlKey);
    }
  }
```

- [ ] **Step 7: Update adminModules.ts**

Remove the brands entry:
```typescript
// Remove:
  { id: "brands",          label: "Brands",          scopeAware: true,  scopeType: "manufacturer" },
```

- [ ] **Step 8: Update adminMenuRegistry.ts**

Remove the brands entry:
```typescript
// Remove:
  { pageId: "brands",         href: "/admin/brands",                       defaultLabel: "Brands",           defaultIcon: "Tag" },
```

- [ ] **Step 9: Update filter.ts**

This file has the most extensive changes. Key changes:
- Remove `api.brands.all()` fetches
- Remove `brandMap` construction
- Text search: match against `cable.manufacturer_id` by looking up manufacturer name
- Filtering: remove `filterParams.brand` handling
- Facets: remove `brandCounts` and `brandsList`
- Result items: remove `brand` field, derive `manufacturer` from `manufacturerMap.get(cable.manufacturer_id)`

For `filterCablesByText`:
```typescript
export async function filterCablesByText(params: TextSearchParams) {
  const { q, page, page_size } = params;
  const allCables = await api.cables.all();
  const allManufacturers = await api.manufacturers.all();
  const manufacturerMap = new Map(allManufacturers.map(m => [m.id, m]));
  const ql = q.toLowerCase();

  let filtered = allCables.filter(cable => {
    if (cable.model.toLowerCase().includes(ql)) return true;
    if (cable.base_description.toLowerCase().includes(ql)) return true;
    const mfr = manufacturerMap.get(cable.manufacturer_id);
    if (mfr && mfr.name.toLowerCase().includes(ql)) return true;
    return false;
  });

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * page_size, page * page_size);
  return {
    items: paged.map(cable => ({
      cable,
      manufacturer: manufacturerMap.get(cable.manufacturer_id) ?? null,
    })),
    total, page, page_size,
  };
}
```

For `filterCables` (the product-type-specific filter), remove all brand logic and use `manufacturer_id` directly for manufacturer filtering and facet building. Remove `brandMap` parameter from `buildFacets`. Remove `brands` from the facets return.

- [ ] **Step 10: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts frontend/lib/adminApi.ts frontend/lib/portalApi.ts frontend/lib/seo.ts frontend/lib/validate.ts frontend/lib/adminModules.ts frontend/lib/adminMenuRegistry.ts frontend/lib/filter.ts
git commit -m "refactor(frontend-lib): remove brand types, API namespaces, and brand filtering logic"
```

---

## Task 11: Update Frontend Components

**Files:**
- Modify: `frontend/components/cable/CableCard.tsx`
- Modify: `frontend/components/cable/CableFilters.tsx`
- Modify: `frontend/components/admin/form/CableForm.tsx`
- Modify: `frontend/components/admin/form/ManufacturerShowcaseBlocks.tsx`
- Modify: `frontend/components/admin/layout/AdminSidebar.tsx`
- Modify: `frontend/components/portal/layout/PortalSidebar.tsx`
- Modify: `frontend/components/home/StatsRow.tsx`

- [ ] **Step 1: Update CableCard.tsx**

Remove `Brand` from imports. Change props to remove `brand`, keep `manufacturer`:
```typescript
import type { Cable, Manufacturer } from '@/lib/types';

interface CableCardProps {
  cable: Cable;
  manufacturer?: Manufacturer | null;
}

export function CableCard({ cable, manufacturer }: CableCardProps) {
```

Replace all `brand?.` references with `manufacturer?.`:
```typescript
          {manufacturer?.image_url && (
            <img src={manufacturer.image_url} alt={manufacturer.name} className="h-6 w-6 rounded object-cover" />
          )}
          <p className="text-xs text-gray-500">
            {manufacturer?.name ?? "Unknown"}{manufacturer ? ` · ${manufacturer.country}` : ""}
          </p>
```

- [ ] **Step 2: Update CableFilters.tsx**

Remove the Brand facet checkbox group:
```typescript
      // Remove this entire block:
      {/* Brand */}
      {facets.brands.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Brand</h3>
          {renderCheckboxGroup('brand', facets.brands.map(b => ({ value: b.id, label: b.name, count: b.count })))}
        </div>
      )}
```

- [ ] **Step 3: Update CableForm.tsx**

Change `brands` prop to `manufacturers`:
```typescript
interface CableFormProps {
  initial?: Cable;
  manufacturers: { id: string; name: string }[];
  taxonomy: Taxonomy;
}

export function CableForm({ initial, manufacturers, taxonomy }: CableFormProps) {
```

Replace `brandId` state with `manufacturerId`:
```typescript
  const [manufacturerId, setManufacturerId] = useState(initial?.manufacturer_id ?? '');
```

Update the payload:
```typescript
      manufacturer_id: manufacturerId,
```

Update the select field:
```tsx
            <label htmlFor="manufacturer" className="text-sm font-medium text-gray-700">
              Manufacturer
            </label>
            <select
              id="manufacturer"
              value={manufacturerId}
              onChange={(e) => setManufacturerId(e.target.value)}
              className={inputClass}
            >
              <option value="">Select a manufacturer</option>
              {manufacturers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
```

- [ ] **Step 4: Update ManufacturerShowcaseBlocks.tsx**

Change `CableOption.brand` to `CableOption.manufacturer`:
```typescript
interface CableOption {
  id: string;
  model: string;
  manufacturer?: { name: string } | null;
}
```

Update the rendering:
```tsx
                  {cable.manufacturer?.name && (
                    <div className="text-gray-500 text-xs">{cable.manufacturer.name}</div>
                  )}
```

- [ ] **Step 5: Update AdminSidebar.tsx**

Remove `brands: 'brands'` from `PAGE_ID_TO_MODULE_ID`:
```typescript
const PAGE_ID_TO_MODULE_ID: Record<string, string> = {
  dashboard: 'dashboard',
  cables: 'cables',
  manufacturers: 'manufacturers',
  industries: 'industries',
  'equipment-mfrs': 'equipment_mfrs',
  'equipment-cats': 'equipment_cats',
  'equipment-list': 'equipment_list',
  media: 'media',
  'menu-config': 'menu_config',
  users: 'users',
  roles: 'roles',
  pages: 'pages',
  'site-menu': 'menu_config',
};
```

- [ ] **Step 6: Update PortalSidebar.tsx**

Remove the Brands nav item from `MANUFACTURER_NAV`:
```typescript
const MANUFACTURER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/portal', icon: LayoutDashboard, module: 'dashboard' },
  { label: 'Cables', href: '/portal/cables', icon: Cable, module: 'cables' },
  { label: 'Inquiries', href: '/portal/inquiries', icon: Mail, module: 'inquiries' },
  { label: 'Media', href: '/portal/media', icon: ImageIcon, module: 'media' },
  { label: 'Settings', href: '/portal/settings', icon: Settings, module: 'me' },
];
```

Remove `Tag` from the lucide-react import.

- [ ] **Step 7: Update StatsRow.tsx**

Remove the `brands` prop and stat:
```typescript
interface StatsRowProps {
  cables: number;
  industries: number;
  equipment: number;
  manufacturers: number;
}

export function StatsRow({ cables, industries, equipment, manufacturers }: StatsRowProps) {
  const stats: Stat[] = [
    { label: 'Cables', value: cables },
    { label: 'Industries', value: industries },
    { label: 'Equipment', value: equipment },
    { label: 'Manufacturers', value: manufacturers },
  ];

  return (
    <section className="border-b bg-gray-50 py-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {stats.map(stat => (
          <div
            key={stat.label}
            className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm"
          >
            <p className="text-3xl font-bold text-blue-600">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/components/cable/CableCard.tsx frontend/components/cable/CableFilters.tsx frontend/components/admin/form/CableForm.tsx frontend/components/admin/form/ManufacturerShowcaseBlocks.tsx frontend/components/admin/layout/AdminSidebar.tsx frontend/components/portal/layout/PortalSidebar.tsx frontend/components/home/StatsRow.tsx
git commit -m "refactor(frontend-components): remove brand props/filters/nav, update CableForm to use manufacturers"
```

---

## Task 12: Update Frontend Site Pages

**Files:**
- Modify: `frontend/app/(site)/page.tsx`
- Modify: `frontend/app/(site)/cables/page.tsx`
- Modify: `frontend/app/(site)/cables/[industry]/[category]/[product-type]/page.tsx`
- Modify: `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx`
- Modify: `frontend/app/(site)/manufacturers/[slug]/page.tsx`
- Modify: `frontend/app/api/cables/[brand_slug]/[slug]/route.ts`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Update homepage — remove brands fetch and stat**

In `frontend/app/(site)/page.tsx`:
```typescript
export default async function HomePage() {
  const [
    cables,
    taxonomy,
    equipmentTree,
    equipmentManufacturers,
    equipmentList,
  ] = await Promise.all([
    api.cables.all(),
    api.taxonomy.all(),
    api.equipmentCategories.tree(),
    api.equipmentManufacturers.all(),
    api.recommendedEquipments.all(),
  ]);

  const industryCount = Object.keys(taxonomy).length;

  return (
    <>
      <HeroSearch />
      <Container>
        <StatsRow
          cables={cables.length}
          industries={industryCount}
          equipment={equipmentList.length}
          manufacturers={equipmentManufacturers.length}
        />
        <CableCategoryGrid taxonomy={taxonomy} />
        <EquipmentCategoryGrid tree={equipmentTree} />
      </Container>
    </>
  );
}
```

- [ ] **Step 2: Update cables overview page — remove brandToManufacturer map**

In `frontend/app/(site)/cables/page.tsx`:

Remove `allBrands` fetch and `brandToManufacturer` map. Use `c.manufacturer_id` directly:
```typescript
  const allCables = await api.cables.all();
  const taxonomyAll = await api.taxonomy.all();

  // Build flat list of all product types with cable/manufacturer counts, grouped by industry
  const industryGroups = industries.map(ind => {
    const industryKey = Object.entries(taxonomyAll).find(([, v]) => v.slug === ind.slug)?.[0] ?? "";
    const productTypes: Array<{...}> = [];
    for (const [catKey, cat] of Object.entries(ind.categories)) {
      for (const [ptKey, pt] of Object.entries(cat.product_types)) {
        const ptCables = allCables.filter(c =>
          c.industry === industryKey && c.category === catKey && c.product_type === ptKey
        );
        const cableCount = ptCables.length;
        const manufacturerIds = new Set(ptCables.map(c => c.manufacturer_id));
        productTypes.push({
          productType: pt, category: cat, industry: ind,
          cableCount, manufacturerCount: manufacturerIds.size,
        });
      }
    }
    return { industry: ind, industryKey, productTypes };
  });
```

In the search results section, remove `brand={item.brand}` from CableCard:
```tsx
                <CableCard
                  key={item.cable.id}
                  cable={item.cable}
                  manufacturer={item.manufacturer}
                />
```

- [ ] **Step 3: Update product type page — remove brand param**

In `frontend/app/(site)/cables/[industry]/[category]/[product-type]/page.tsx`:

Remove `brand` from `SearchParams` interface, from the param parsing, and from `CableCard` usage:
```typescript
interface SearchParams {
  q?: string;
  manufacturer?: string;
  size?: string;
  // ... remove brand?: string
}
```

Remove `'brand'` from the `parseArrayParam` calls. Remove `brand={item.brand}` from `<CableCard>`.

- [ ] **Step 4: Update cable detail page — use manufacturer directly**

In `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx`:

The route folder `[brand_slug]` keeps its name (semantically now manufacturer_slug). Update the page to use `cable.manufacturer` directly instead of fetching brand separately.

In `generateMetadata`:
```typescript
export async function generateMetadata({ params }: { params: Promise<{ brand_slug: string; slug: string }> }): Promise<Metadata> {
  const { brand_slug, slug } = await params;
  const detail = await api.getCableDetail(brand_slug, slug);
  if (!detail) return { title: 'Cable Not Found' };
  return generateCableMetadata(detail.cable, detail.manufacturer);
}
```

In the page component:
```typescript
  const { brand_slug, slug } = await params;
  const detail = await api.getCableDetail(brand_slug, slug);
  if (!detail) return notFound();
  const { cable, manufacturer, categories, recommended_equipments } = detail;
```

Remove `const brand = await api.brands.getById(cable.brand_id);` and `const manufacturer = brand ? ...` lines.

Update all `brand?.name` references to `manufacturer?.name`. Update breadcrumb URLs that reference `brand`:
```tsx
    { name: manufacturer?.name ?? 'Unknown', url: `/cables?manufacturer=${cable.manufacturer_id}` },
```

Update JSON-LD call:
```tsx
      <JsonLd data={buildCableJsonLd(cable, manufacturer)} />
```

- [ ] **Step 5: Update manufacturer detail page — filter by manufacturer_id directly**

In `frontend/app/(site)/manufacturers/[slug]/page.tsx`:

Remove `allBrands` fetch, `brands` filter, `brandIds` set, and `brandById` map. Filter cables directly:
```typescript
  const allCables = await api.cables.all();
  const cables = allCables.filter(c => c.manufacturer_id === manufacturer.id);
```

Remove the brands list section from the template. Remove `brand` prop from `<CableCard>`, use `manufacturer` prop instead.

- [ ] **Step 6: Update API cable detail route**

In `frontend/app/api/cables/[brand_slug]/[slug]/route.ts`:

```typescript
  const { brand_slug, slug } = await params;
  const detail = await api.getCableDetail(brand_slug, slug);
  if (!detail) {
    return Response.json({ error: 'Cable not found' }, { status: 404 });
  }
  return Response.json(detail);
```

- [ ] **Step 7: Update layout.tsx description**

In `frontend/app/layout.tsx`:
```typescript
  description: 'Query cable specifications online. Browse cables by manufacturer, category, and specs.',
```

- [ ] **Step 8: Commit**

```bash
git add "frontend/app/(site)/page.tsx" "frontend/app/(site)/cables/page.tsx" "frontend/app/(site)/cables/[industry]/[category]/[product-type]/page.tsx" "frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx" "frontend/app/(site)/manufacturers/[slug]/page.tsx" "frontend/app/api/cables/[brand_slug]/[slug]/route.ts" frontend/app/layout.tsx
git commit -m "refactor(frontend-site): update site pages to use manufacturer instead of brand"
```

---

## Task 13: Update Frontend Admin and Portal Pages, Delete Brand Directories

**Files:**
- Modify: `frontend/app/admin/(dashboard)/page.tsx`
- Modify: `frontend/app/admin/(dashboard)/cables/page.tsx`
- Modify: `frontend/app/admin/(dashboard)/cables/new/page.tsx`
- Modify: `frontend/app/admin/(dashboard)/cables/[id]/page.tsx`
- Modify: `frontend/app/admin/(dashboard)/manufacturers/[id]/page.tsx`
- Modify: `frontend/app/portal/cables/page.tsx`
- Delete: `frontend/app/admin/(dashboard)/brands/` (entire directory)
- Delete: `frontend/app/portal/brands/` (entire directory)
- Delete: `frontend/components/admin/form/BrandForm.tsx`
- Delete: `frontend/components/portal/form/BrandEditForm.tsx`
- Delete: `frontend/app/api/admin/brands/` (entire directory)
- Delete: `frontend/app/api/portal/brands/` (entire directory)

- [ ] **Step 1: Update admin dashboard — remove brands stat**

In `frontend/app/admin/(dashboard)/page.tsx`:
```typescript
  const [cables, manufacturers] = await Promise.all([
    adminApi.cables.all(1, 1),
    adminApi.manufacturers.all(1, 1),
  ]);
```
Remove the brands stat card from the stats array.

- [ ] **Step 2: Update admin cables list — c.brand → c.manufacturer**

In `frontend/app/admin/(dashboard)/cables/page.tsx`:
```tsx
                  {c.manufacturer?.name || c.manufacturer_id || '—'}
```

- [ ] **Step 3: Update admin cable new page — fetch manufacturers**

In `frontend/app/admin/(dashboard)/cables/new/page.tsx`:
```typescript
  const mfrRes = await adminApi.manufacturers.all(1, 999);
  const manufacturers = mfrRes.items.map((m) => ({ id: m.id, name: m.name }));
  // ...
      <CableForm manufacturers={manufacturers} taxonomy={taxonomy} />
```

- [ ] **Step 4: Update admin cable edit page — fetch manufacturers**

In `frontend/app/admin/(dashboard)/cables/[id]/page.tsx`:
```typescript
  const mfrRes = await adminApi.manufacturers.all(1, 999);
  const manufacturers = mfrRes.items.map((m) => ({ id: m.id, name: m.name }));
  // ...
      <CableForm initial={cable} manufacturers={manufacturers} taxonomy={taxonomy} />
```

- [ ] **Step 5: Update admin manufacturer edit page — cable.brand → cable.manufacturer**

In `frontend/app/admin/(dashboard)/manufacturers/[id]/page.tsx`:
```typescript
    manufacturer: c.manufacturer ? { name: c.manufacturer.name } : null,
```

- [ ] **Step 6: Update portal cables page — c.brand → c.manufacturer**

In `frontend/app/portal/cables/page.tsx`:
```tsx
                  <td className="px-4 py-3 text-gray-600">{c.manufacturer?.name ?? '—'}</td>
```

- [ ] **Step 7: Delete brand directories and files**

```bash
git rm -r "frontend/app/admin/(dashboard)/brands/"
git rm -r "frontend/app/portal/brands/"
git rm frontend/components/admin/form/BrandForm.tsx
git rm frontend/components/portal/form/BrandEditForm.tsx
git rm -r "frontend/app/api/admin/brands/"
git rm -r "frontend/app/api/portal/brands/"
```

- [ ] **Step 8: Commit**

```bash
git add frontend/app/admin/ frontend/app/portal/ frontend/components/
git commit -m "refactor(frontend-admin-portal): remove brand pages, update cable forms to use manufacturers"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Grep for remaining brand references**

Search the entire codebase for any remaining `brand` references (case-insensitive) that are not in spec/plan/docs files:

```bash
# Backend
grep -ri "brand" backend/app/ backend/tests/ backend/scripts/ --include="*.py" | grep -v "__pycache__" | grep -v ".pyc"

# Frontend
grep -ri "brand" frontend/lib/ frontend/components/ frontend/app/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".next"
```

Expected: No functional references to `brand` (only acceptable in spec/plan markdown files, or the `[brand_slug]` folder name which is kept by design).

- [ ] **Step 2: Run backend tests**

```bash
cd backend && python -m pytest tests/ -v
```
Expected: All tests pass.

- [ ] **Step 3: Run frontend build**

```bash
cd frontend && npx next build
```
Expected: Build succeeds without TypeScript errors.

- [ ] **Step 4: Manual smoke test**

- Visit `http://localhost:3000` — homepage loads, no Brands stat
- Visit `http://localhost:3000/cables` — cables overview loads
- Visit a product type page — filters work, no Brand facet
- Visit a cable detail page — URL is `/cable/{manufacturer_slug}/{cable_slug}`, manufacturer name displayed
- Visit `http://localhost:3000/admin` — no Brands menu item
- Visit `http://localhost:3000/admin/cables/new` — Manufacturer dropdown (not Brand)
- Visit `http://localhost:3000/portal` — no Brands nav item

- [ ] **Step 5: Commit any fixups**

```bash
git add -A
git commit -m "fix: cleanup remaining brand references after verification"
```
