from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_module
from app.models.user import User
from app.core.database import get_db
from app.crud.equipment import crud_equipment_manufacturer
from app.crud.folder import crud_folder
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
