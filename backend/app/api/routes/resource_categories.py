from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.core.database import get_db
from app.crud.resource import crud_resource_category
from app.models.resource import Resource
from app.models.user import User
from app.schemas.resource import (
    ResourceCategoryCreate,
    ResourceCategoryRead,
    ResourceCategoryTreeRead,
    ResourceCategoryUpdate,
)

router = APIRouter()


@router.get("", response_model=list[ResourceCategoryTreeRead])
async def list_resource_categories(db: AsyncSession = Depends(get_db)):
    return await crud_resource_category.get_all_top_level_with_children(db)


@router.get("/flat", response_model=list[ResourceCategoryRead])
async def list_resource_categories_flat(db: AsyncSession = Depends(get_db)):
    return await crud_resource_category.get_all_flat(db)


@router.get("/{category_id}", response_model=ResourceCategoryRead)
async def get_resource_category(category_id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_resource_category.get(db, category_id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Resource category not found"})
    return obj


@router.post("", response_model=ResourceCategoryRead, status_code=201)
async def create_resource_category(
    obj_in: ResourceCategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("resource_cats")),
):
    if obj_in.parent_id is not None:
        parent = await crud_resource_category.get(db, obj_in.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Parent category not found"})
        if parent.parent_id is not None:
            raise HTTPException(status_code=422, detail={"code": 422, "message": "Maximum depth is 2 levels"})
    try:
        return await crud_resource_category.create(db, obj_in=obj_in)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Slug already exists"})


@router.put("/{category_id}", response_model=ResourceCategoryRead)
async def update_resource_category(
    category_id: str,
    obj_in: ResourceCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("resource_cats")),
):
    obj = await crud_resource_category.get(db, category_id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Resource category not found"})

    if obj_in.parent_id is not None:
        if obj_in.parent_id == category_id:
            raise HTTPException(status_code=422, detail={"code": 422, "message": "Cannot set self as parent"})
        parent = await crud_resource_category.get(db, obj_in.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Parent category not found"})
        if parent.parent_id is not None:
            raise HTTPException(status_code=422, detail={"code": 422, "message": "Maximum depth is 2 levels"})

    try:
        return await crud_resource_category.update(db, db_obj=obj, obj_in=obj_in)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Slug already exists"})


@router.delete("/{category_id}", response_model=ResourceCategoryRead)
async def delete_resource_category(
    category_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("resource_cats")),
):
    obj = await crud_resource_category.get_with_children(db, category_id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Resource category not found"})
    if obj.children:
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Cannot delete category with children"})
    resource_count = (
        await db.execute(
            select(func.count()).select_from(Resource).where(Resource.category_id == category_id)
        )
    ).scalar() or 0
    if resource_count > 0:
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Category is in use"})
    return await crud_resource_category.remove(db, id=category_id)
