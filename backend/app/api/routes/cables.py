import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.cable import crud_cable
from app.crud.equipment import crud_equipment
from app.schemas.cable import (
    CableCreate,
    CableDetailRead,
    CableFilterParams,
    CableListResponse,
    CableRead,
    CableUpdate,
)

router = APIRouter()


@router.get("", response_model=CableListResponse)
async def list_cables(
    industry: str | None = None,
    category: str | None = None,
    product_type: str | None = None,
    q: str | None = None,
    manufacturer: list[str] | None = Query(None),
    brand: list[str] | None = Query(None),
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
    parsed_spec_filters = None
    if spec_filters:
        try:
            parsed_spec_filters = json.loads(spec_filters)
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail={"code": 422, "message": "Invalid spec_filters JSON"})

    params = CableFilterParams(
        industry=industry,
        category=category,
        product_type=product_type,
        q=q,
        manufacturer=manufacturer,
        brand=brand,
        size=size,
        min_size=min_size,
        max_size=max_size,
        spec_filters=parsed_spec_filters,
        min_od=min_od,
        max_od=max_od,
        page=page,
        page_size=page_size,
    )
    cables, total, facets = await crud_cable.get_filtered(db, params)
    return CableListResponse(
        items=cables, total=total, page=page, page_size=page_size, facets=facets
    )


@router.get("/by-url/{brand_slug}/{cable_slug}", response_model=CableDetailRead)
async def get_cable_by_url(brand_slug: str, cable_slug: str, db: AsyncSession = Depends(get_db)):
    cable = await crud_cable.get_by_url(db, brand_slug, cable_slug)
    if not cable:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Cable not found"})
    # Get recommended equipment
    equipment = await crud_equipment.get_matching_cable(db, cable.id)
    return CableDetailRead(
        **{k: v for k, v in cable.__dict__.items() if k != "_sa_instance_state"},
        recommended_equipments=equipment,
    )


@router.get("/{id}", response_model=CableRead)
async def get_cable(id: str, db: AsyncSession = Depends(get_db)):
    cable = await crud_cable.get_detail(db, id)
    if not cable:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Cable not found"})
    return cable


@router.post("", response_model=CableRead, status_code=201)
async def create_cable(obj_in: CableCreate, db: AsyncSession = Depends(get_db)):
    from app.models.cable import Cable as CableModel, CableVariant, SpecItem

    cable_data = obj_in.model_dump(exclude={"common_specs", "variants"})
    cable = CableModel(**cable_data)
    db.add(cable)
    await db.flush()

    # Common specs
    for spec_data in obj_in.common_specs:
        spec = SpecItem(cable_id=cable.id, variant_id=None, **spec_data.model_dump())
        db.add(spec)

    # Variants + specs
    for variant_data in obj_in.variants:
        variant = CableVariant(
            cable_id=cable.id,
            slug=variant_data.slug,
            sort_order=variant_data.sort_order,
        )
        db.add(variant)
        await db.flush()
        for spec_data in variant_data.specs:
            spec = SpecItem(cable_id=cable.id, variant_id=variant.id, **spec_data.model_dump())
            db.add(spec)

    await db.commit()
    await db.refresh(cable)
    return cable


@router.put("/{id}", response_model=CableRead)
async def update_cable(id: str, obj_in: CableUpdate, db: AsyncSession = Depends(get_db)):
    from app.models.cable import CableVariant, SpecItem

    cable = await crud_cable.get_detail(db, id)
    if not cable:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Cable not found"})

    update_data = obj_in.model_dump(exclude_unset=True, exclude={"common_specs", "variants"})
    for field, value in update_data.items():
        setattr(cable, field, value)

    # Replace common specs if provided
    if obj_in.common_specs is not None:
        for existing in list(cable.common_specs):
            await db.delete(existing)
        for spec_data in obj_in.common_specs:
            spec = SpecItem(cable_id=cable.id, variant_id=None, **spec_data.model_dump())
            db.add(spec)

    # Replace variants + specs if provided
    if obj_in.variants is not None:
        for existing in list(cable.variants):
            for existing_spec in list(existing.specs):
                await db.delete(existing_spec)
            await db.delete(existing)
        for variant_data in obj_in.variants:
            variant = CableVariant(
                cable_id=cable.id,
                slug=variant_data.slug,
                sort_order=variant_data.sort_order,
            )
            db.add(variant)
            await db.flush()
            for spec_data in variant_data.specs:
                spec = SpecItem(cable_id=cable.id, variant_id=variant.id, **spec_data.model_dump())
                db.add(spec)

    await db.commit()
    await db.refresh(cable)
    return cable


@router.delete("/{id}", response_model=CableRead)
async def delete_cable(id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_cable.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Cable not found"})
    return obj
