from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.models.user import User
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
    q: str | None = None,
    category_id: str | None = None,
    manufacturer_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if cable_id:
        items = await crud_equipment.get_matching_cable(db, cable_id)
        return {"items": items, "total": len(items), "page": 1, "page_size": len(items)}
    items, total = await crud_equipment.get_all_with_relations(
        db,
        page=page,
        page_size=page_size,
        q=q,
        category_id=category_id,
        manufacturer_id=manufacturer_id,
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
    user: User = Depends(require_operator("equipment_list")),
):
    # Scope check: equipment_manager can only create equipment for their own manufacturer
    if user.role and user.role.scope_type == "equipment_manufacturer":
        if obj_in.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot create equipment outside your scope"},
            )
    return await crud_equipment.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=RecommendedEquipmentRead)
async def update_equipment(
    id: str,
    obj_in: RecommendedEquipmentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("equipment_list")),
):
    obj = await crud_equipment.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment not found"})
    # Scope check
    if user.role and user.role.scope_type == "equipment_manufacturer":
        if obj.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot modify equipment outside your scope"},
            )
    return await crud_equipment.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=RecommendedEquipmentRead)
async def delete_equipment(
    id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("equipment_list")),
):
    # Scope check
    if user.role and user.role.scope_type == "equipment_manufacturer":
        existing = await crud_equipment.get(db, id)
        if existing is None:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment not found"})
        if existing.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete equipment outside your scope"},
            )
    obj = await crud_equipment.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment not found"})
    return obj
