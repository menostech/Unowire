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
    id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    obj = await crud_equipment_manufacturer.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment manufacturer not found"})
    return obj
