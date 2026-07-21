from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.models.user import User
from app.core.database import get_db
from app.crud.taxonomy import crud_product_type
from app.schemas.taxonomy import ProductTypeCreate, ProductTypeRead, ProductTypeUpdate

router = APIRouter()


@router.get("", response_model=list[ProductTypeRead])
async def list_product_types(industry_id: str, category_id: str, db: AsyncSession = Depends(get_db)):
    # DB stores composite category_id "industry_id/category_slug"; path splits it into segments
    composite_cat_id = f"{industry_id}/{category_id}"
    return await crud_product_type.get_by_category(db, composite_cat_id)


@router.get("/{id}", response_model=ProductTypeRead)
async def get_product_type(industry_id: str, category_id: str, id: str, db: AsyncSession = Depends(get_db)):
    # DB stores composite IDs: category_id="ind/cat", product_type_id="ind/cat/pt"
    composite_cat_id = f"{industry_id}/{category_id}"
    composite_pt_id = f"{industry_id}/{category_id}/{id}"
    obj = await crud_product_type.get(db, composite_pt_id)
    if not obj or obj.category_id != composite_cat_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Product type not found"})
    return obj


@router.post("", response_model=ProductTypeRead, status_code=201)
async def create_product_type(industry_id: str, category_id: str, obj_in: ProductTypeCreate, db: AsyncSession = Depends(get_db), user: User = Depends(require_operator("industries"))):
    # Reconstruct composite category_id for DB storage
    composite_cat_id = f"{industry_id}/{category_id}"
    obj_in_data = obj_in.model_dump()
    obj_in_data["category_id"] = composite_cat_id
    from app.models.taxonomy import ProductType
    db_obj = ProductType(**obj_in_data)
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj


@router.put("/{id}", response_model=ProductTypeRead)
async def update_product_type(
    industry_id: str, category_id: str, id: str, obj_in: ProductTypeUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(require_operator("industries"))
):
    # DB stores composite IDs: category_id="ind/cat", product_type_id="ind/cat/pt"
    composite_cat_id = f"{industry_id}/{category_id}"
    composite_pt_id = f"{industry_id}/{category_id}/{id}"
    obj = await crud_product_type.get(db, composite_pt_id)
    if not obj or obj.category_id != composite_cat_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Product type not found"})
    return await crud_product_type.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=ProductTypeRead)
async def delete_product_type(industry_id: str, category_id: str, id: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_operator("industries"))):
    # DB stores composite IDs: category_id="ind/cat", product_type_id="ind/cat/pt"
    composite_cat_id = f"{industry_id}/{category_id}"
    composite_pt_id = f"{industry_id}/{category_id}/{id}"
    obj = await crud_product_type.get(db, composite_pt_id)
    if not obj or obj.category_id != composite_cat_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Product type not found"})
    return await crud_product_type.remove(db, id=composite_pt_id)
