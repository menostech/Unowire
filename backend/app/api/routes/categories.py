from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.models.user import User
from app.core.database import get_db
from app.crud.taxonomy import crud_category
from app.schemas.taxonomy import CategoryCreate, CategoryRead, CategoryUpdate

router = APIRouter()


@router.get("", response_model=list[CategoryRead])
async def list_categories(industry_id: str, db: AsyncSession = Depends(get_db)):
    return await crud_category.get_by_industry(db, industry_id)


@router.get("/{id}", response_model=CategoryRead)
async def get_category(industry_id: str, id: str, db: AsyncSession = Depends(get_db)):
    # DB stores composite ID "industry_id/category_slug"; path splits it into segments
    composite_id = f"{industry_id}/{id}"
    category = await crud_category.get_with_product_types(db, composite_id)
    if not category or category.industry_id != industry_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Category not found in this industry"})
    return category


@router.post("", response_model=CategoryRead, status_code=201)
async def create_category(industry_id: str, obj_in: CategoryCreate, db: AsyncSession = Depends(get_db), user: User = Depends(require_operator("industries"))):
    obj_in_data = obj_in.model_dump()
    obj_in_data["industry_id"] = industry_id
    from app.models.taxonomy import Category
    db_obj = Category(**obj_in_data)
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj


@router.put("/{id}", response_model=CategoryRead)
async def update_category(industry_id: str, id: str, obj_in: CategoryUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(require_operator("industries"))):
    # DB stores composite ID "industry_id/category_slug"; path splits it into segments
    composite_id = f"{industry_id}/{id}"
    obj = await crud_category.get(db, composite_id)
    if not obj or obj.industry_id != industry_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Category not found in this industry"})
    return await crud_category.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=CategoryRead)
async def delete_category(industry_id: str, id: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_operator("industries"))):
    # DB stores composite ID "industry_id/category_slug"; path splits it into segments
    composite_id = f"{industry_id}/{id}"
    obj = await crud_category.get(db, composite_id)
    if not obj or obj.industry_id != industry_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Category not found in this industry"})
    return await crud_category.remove(db, id=composite_id)
