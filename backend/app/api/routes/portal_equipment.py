"""Portal equipment routes: list, detail, edit. Scope-filtered to user's equipment manufacturer."""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.crud.equipment import crud_equipment, crud_equipment_manufacturer
from app.models.equipment import RecommendedEquipment as EquipmentModel
from app.models.user import User
from app.schemas.equipment import (
    PortalEquipmentCreate,
    RecommendedEquipmentRead,
    RecommendedEquipmentUpdate,
)

router = APIRouter(prefix="/api/portal/equipment", tags=["portal-equipment"])


def _check_equipment_ownership(user: User, equipment) -> None:
    if equipment is None or equipment.manufacturer_id != user.scope_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment not found"})


async def _generate_equipment_id(db: AsyncSession, manufacturer_slug: str, equipment_slug: str) -> str:
    """Generate a unique equipment ID: {manufacturer_slug}-{equipment_slug} with UUID fallback."""
    base = f"{manufacturer_slug}-{equipment_slug}".lower()[:92]
    existing = await db.execute(select(EquipmentModel.id).where(EquipmentModel.id == base))
    if not existing.scalar_one_or_none():
        return base
    suffix = uuid4().hex[:8]
    return f"{base}-{suffix}"


@router.get("", response_model=list[RecommendedEquipmentRead])
async def list_equipment(
    user: User = Depends(require_factory_module("equipment")),
    db: AsyncSession = Depends(get_db),
):
    equipment = await crud_equipment.list_by_manufacturer(db, scope_id=user.scope_id)
    return equipment


@router.get("/{equipment_id}", response_model=RecommendedEquipmentRead)
async def get_equipment(
    equipment_id: str,
    user: User = Depends(require_factory_module("equipment")),
    db: AsyncSession = Depends(get_db),
):
    # Eager-load relations to avoid MissingGreenlet during response serialization.
    equipment = await crud_equipment.get_with_relations(db, equipment_id)
    _check_equipment_ownership(user, equipment)
    return equipment


@router.put("/{equipment_id}", response_model=RecommendedEquipmentRead)
async def update_equipment(
    equipment_id: str,
    body: RecommendedEquipmentUpdate,
    user: User = Depends(require_factory_module("equipment")),
    db: AsyncSession = Depends(get_db),
):
    # Eager-load relations for ownership check + later re-read after commit.
    equipment = await crud_equipment.get_with_relations(db, equipment_id)
    _check_equipment_ownership(user, equipment)
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(equipment, field, value)
    await db.commit()
    # Re-read with relations so response serialization does not trigger
    # lazy loading in the async context (MissingGreenlet).
    return await crud_equipment.get_with_relations(db, equipment_id)


@router.post("", response_model=RecommendedEquipmentRead, status_code=201)
async def portal_create_equipment(
    obj_in: PortalEquipmentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("equipment")),
):
    manufacturer = await crud_equipment_manufacturer.get(db, id=user.scope_id)
    if not manufacturer:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment manufacturer not found"})

    equipment_id = await _generate_equipment_id(db, manufacturer.slug, obj_in.slug)
    equipment_data = obj_in.model_dump()
    equipment_data["id"] = equipment_id
    equipment_data["manufacturer_id"] = user.scope_id  # server-forced

    equipment = EquipmentModel(**equipment_data)
    db.add(equipment)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Equipment with this slug already exists"})
    # Reload with relations (manufacturer, category) so response serialization
    # does not trigger lazy loading in the async context (MissingGreenlet).
    return await crud_equipment.get_with_relations(db, equipment_id)


@router.delete("/{equipment_id}", response_model=RecommendedEquipmentRead)
async def portal_delete_equipment(
    equipment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("equipment")),
):
    equipment = await crud_equipment.get_with_relations(db, id=equipment_id)
    _check_equipment_ownership(user, equipment)  # raises 404 if None or out-of-scope
    await db.delete(equipment)
    await db.commit()
    return equipment
