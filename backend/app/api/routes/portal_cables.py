"""Portal cables routes: list, detail, edit. Scope-filtered to user's manufacturer."""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.crud.cable import crud_cable
from app.crud.manufacturer import crud_manufacturer
from app.models.cable import Cable as CableModel
from app.models.user import User
from app.schemas.cable import CableRead, CableUpdate, PortalCableCreate

router = APIRouter(prefix="/api/portal/cables", tags=["portal-cables"])


def _check_cable_ownership(user: User, cable) -> None:
    """Raise 404 if cable is None or not in user's scope."""
    if cable is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Cable not found"})
    if cable.manufacturer_id != user.scope_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Cable not found"})


async def _generate_cable_id(db: AsyncSession, manufacturer_slug: str, cable_slug: str) -> str:
    """Generate a unique cable ID: {manufacturer_slug}-{cable_slug} with UUID fallback."""
    base = f"{manufacturer_slug}-{cable_slug}".lower()[:92]  # leave 8 chars for suffix
    existing = await db.execute(select(CableModel.id).where(CableModel.id == base))
    if not existing.scalar_one_or_none():
        return base
    suffix = uuid4().hex[:8]
    return f"{base}-{suffix}"


@router.get("", response_model=list[CableRead])
async def list_cables(
    user: User = Depends(require_factory_module("cables")),
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    industry_id: str | None = None,
    category_id: str | None = None,
    product_type_id: str | None = None,
):
    cables = await crud_cable.list_by_manufacturer(
        db,
        scope_id=user.scope_id,
        skip=skip,
        limit=limit,
        search=search,
        industry_id=industry_id,
        category_id=category_id,
        product_type_id=product_type_id,
    )
    return cables


@router.get("/{cable_id}", response_model=CableRead)
async def get_cable(
    cable_id: str,
    user: User = Depends(require_factory_module("cables")),
    db: AsyncSession = Depends(get_db),
):
    cable = await crud_cable.get_detail(db, cable_id)
    _check_cable_ownership(user, cable)
    return cable


@router.put("/{cable_id}", response_model=CableRead)
async def update_cable(
    cable_id: str,
    body: CableUpdate,
    user: User = Depends(require_factory_module("cables")),
    db: AsyncSession = Depends(get_db),
):
    from app.models.cable import CableVariant, SpecItem

    cable = await crud_cable.get_detail(db, cable_id)
    _check_cable_ownership(user, cable)

    # Generic field update (specs still excluded — handled explicitly below)
    update_data = body.model_dump(exclude_unset=True, exclude={"common_specs", "variants"})
    for field, value in update_data.items():
        setattr(cable, field, value)

    # Replace common_specs if provided (same as admin PUT)
    if body.common_specs is not None:
        for existing in list(cable.common_specs):
            await db.delete(existing)
        for spec_data in body.common_specs:
            spec = SpecItem(cable_id=cable.id, variant_id=None, **spec_data.model_dump())
            db.add(spec)

    # Variants: slug-matched merge (preserve IDs, replace specs only)
    if body.variants is not None:
        existing_by_slug = {v.slug: v for v in cable.variants}
        for variant_data in body.variants:
            existing = existing_by_slug.get(variant_data.slug)
            if existing is None:
                # Slug not found — ignore (don't create new variants via PUT)
                continue
            # Preserve variant id, slug, sort_order; replace specs only
            for existing_spec in list(existing.specs):
                await db.delete(existing_spec)
            for spec_data in variant_data.specs:
                spec = SpecItem(cable_id=cable.id, variant_id=existing.id, **spec_data.model_dump())
                db.add(spec)
        # Existing variants not in payload: keep (don't delete)

    await db.commit()
    # Expire all cached state so the re-read below repopulates relationships
    # fresh. The session uses expire_on_commit=False, so without this the
    # identity-map-cached cable keeps its stale common_specs/variants collections
    # and get_detail would return the pre-edit state. Use the cable_id route
    # param (a plain string) for the re-read — accessing cable.id here would
    # trigger a sync lazy-load of an expired scalar attribute (MissingGreenlet).
    db.expire_all()
    # Re-read with eager-loaded relationships (variants.specs is a nested
    # selectin; db.refresh only reloads scalar columns + direct relationships,
    # not the nested variant.specs chain — MissingGreenlet during serialization).
    return await crud_cable.get_detail(db, cable_id)


@router.post("", response_model=CableRead, status_code=201)
async def portal_create_cable(
    obj_in: PortalCableCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("cables")),
):
    from app.models.cable import CableVariant, SpecItem

    manufacturer = await crud_manufacturer.get(db, id=user.scope_id)
    if not manufacturer:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})

    cable_id = await _generate_cable_id(db, manufacturer.slug, obj_in.slug)
    cable_data = obj_in.model_dump(exclude={"common_specs", "variants"})
    cable_data["id"] = cable_id
    cable_data["manufacturer_id"] = user.scope_id  # server-forced, ignore client input

    cable = CableModel(**cable_data)
    db.add(cable)
    await db.flush()

    # Common specs (mirrors admin create_cable logic)
    if obj_in.common_specs:
        for spec_data in obj_in.common_specs:
            spec = SpecItem(cable_id=cable.id, variant_id=None, **spec_data.model_dump())
            db.add(spec)

    # Variants + nested specs (mirrors admin create_cable logic)
    if obj_in.variants:
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

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "A cable with this slug already exists"})
    # Re-read with eager-loaded relationships (variants.specs is a nested
    # selectin; db.refresh only reloads scalar columns + direct relationships,
    # not the nested variant.specs chain — MissingGreenlet during serialization).
    return await crud_cable.get_detail(db, cable.id)


@router.delete("/{cable_id}", response_model=CableRead)
async def portal_delete_cable(
    cable_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("cables")),
):
    cable = await crud_cable.get_detail(db, id=cable_id)
    _check_cable_ownership(user, cable)  # raises 404 if None or out-of-scope
    deleted = await crud_cable.remove(db, id=cable_id)
    await db.commit()
    return deleted
