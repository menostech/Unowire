"""Portal equipment routes: list, detail, edit. Scope-filtered to user's equipment manufacturer."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.crud.equipment import crud_equipment
from app.models.user import User
from app.schemas.equipment import RecommendedEquipmentRead, RecommendedEquipmentUpdate

router = APIRouter(prefix="/api/portal/equipment", tags=["portal-equipment"])


def _check_equipment_ownership(user: User, equipment) -> None:
    if equipment is None or equipment.manufacturer_id != user.scope_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment not found"})


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
    equipment = await crud_equipment.get(db, equipment_id)
    _check_equipment_ownership(user, equipment)
    return equipment


@router.put("/{equipment_id}", response_model=RecommendedEquipmentRead)
async def update_equipment(
    equipment_id: str,
    body: RecommendedEquipmentUpdate,
    user: User = Depends(require_factory_module("equipment")),
    db: AsyncSession = Depends(get_db),
):
    equipment = await crud_equipment.get(db, equipment_id)
    _check_equipment_ownership(user, equipment)
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(equipment, field, value)
    await db.commit()
    await db.refresh(equipment)
    return equipment
