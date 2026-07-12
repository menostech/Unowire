from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_module
from app.models.user import User
from app.core.database import get_db
from app.crud.equipment import crud_equipment_category
from app.schemas.equipment import (
    EquipmentCategoryCreate,
    EquipmentCategoryRead,
    EquipmentCategoryTreeRead,
    EquipmentCategoryUpdate,
)

router = APIRouter()


@router.get("", response_model=list[EquipmentCategoryTreeRead])
async def list_equipment_categories(db: AsyncSession = Depends(get_db)):
    return await crud_equipment_category.get_all_top_level_with_children(db)


@router.get("/{id}", response_model=EquipmentCategoryTreeRead)
async def get_equipment_category(id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_equipment_category.get_with_children(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment category not found"})
    return obj


@router.post("", response_model=EquipmentCategoryRead, status_code=201)
async def create_equipment_category(
    obj_in: EquipmentCategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("equipment_cats")),
):
    if obj_in.parent_id is not None:
        parent = await crud_equipment_category.get(db, obj_in.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Parent category not found"})
        if parent.parent_id is not None:
            raise HTTPException(status_code=422, detail={"code": 422, "message": "Maximum depth is 2 levels"})
    return await crud_equipment_category.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=EquipmentCategoryRead)
async def update_equipment_category(
    id: str,
    obj_in: EquipmentCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("equipment_cats")),
):
    obj = await crud_equipment_category.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment category not found"})

    if obj_in.parent_id is not None:
        if obj_in.parent_id == id:
            raise HTTPException(status_code=422, detail={"code": 422, "message": "Cannot set self as parent"})
        parent = await crud_equipment_category.get(db, obj_in.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Parent category not found"})
        if parent.parent_id is not None:
            raise HTTPException(status_code=422, detail={"code": 422, "message": "Maximum depth is 2 levels"})

    return await crud_equipment_category.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=EquipmentCategoryRead)
async def delete_equipment_category(
    id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("equipment_cats")),
):
    obj = await crud_equipment_category.get_with_children(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Equipment category not found"})
    if obj.children:
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Cannot delete category with sub-categories"})
    return await crud_equipment_category.remove(db, id=id)
