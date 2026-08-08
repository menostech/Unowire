from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.core.database import get_db
from app.crud.post import crud_post_category
from app.models.post import Post
from app.models.user import User
from app.schemas.post import (
    PostCategoryCreate,
    PostCategoryRead,
    PostCategoryUpdate,
)

router = APIRouter()


@router.get("", response_model=list[PostCategoryRead])
async def list_post_categories(db: AsyncSession = Depends(get_db)):
    return await crud_post_category.get_all(db)


@router.get("/{category_id}", response_model=PostCategoryRead)
async def get_post_category(category_id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_post_category.get(db, category_id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Post category not found"})
    return obj


@router.post("", response_model=PostCategoryRead, status_code=201)
async def create_post_category(
    obj_in: PostCategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("post_cats")),
):
    try:
        return await crud_post_category.create(db, obj_in=obj_in)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Slug already exists"})


@router.put("/{category_id}", response_model=PostCategoryRead)
async def update_post_category(
    category_id: str,
    obj_in: PostCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("post_cats")),
):
    obj = await crud_post_category.get(db, category_id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Post category not found"})
    try:
        return await crud_post_category.update(db, db_obj=obj, obj_in=obj_in)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Slug already exists"})


@router.delete("/{category_id}", response_model=PostCategoryRead)
async def delete_post_category(
    category_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("post_cats")),
):
    obj = await crud_post_category.get(db, category_id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Post category not found"})
    post_count = (
        await db.execute(
            select(func.count()).select_from(Post).where(Post.category_id == category_id)
        )
    ).scalar() or 0
    if post_count > 0:
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Category is in use"})
    return await crud_post_category.remove(db, id=category_id)
