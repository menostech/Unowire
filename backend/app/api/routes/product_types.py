from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.taxonomy import crud_product_type
from app.schemas.taxonomy import ProductTypeCreate, ProductTypeRead, ProductTypeUpdate

router = APIRouter()


@router.get("", response_model=list[ProductTypeRead])
async def list_product_types(category_id: str, db: AsyncSession = Depends(get_db)):
    return await crud_product_type.get_by_category(db, category_id)


@router.get("/{id}", response_model=ProductTypeRead)
async def get_product_type(category_id: str, id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_product_type.get(db, id)
    if not obj or obj.category_id != category_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Product type not found"})
    return obj


@router.post("", response_model=ProductTypeRead, status_code=201)
async def create_product_type(category_id: str, obj_in: ProductTypeCreate, db: AsyncSession = Depends(get_db)):
    obj_in_data = obj_in.model_dump()
    obj_in_data["category_id"] = category_id
    from app.models.taxonomy import ProductType
    db_obj = ProductType(**obj_in_data)
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj


@router.put("/{id}", response_model=ProductTypeRead)
async def update_product_type(
    category_id: str, id: str, obj_in: ProductTypeUpdate, db: AsyncSession = Depends(get_db)
):
    obj = await crud_product_type.get(db, id)
    if not obj or obj.category_id != category_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Product type not found"})
    return await crud_product_type.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=ProductTypeRead)
async def delete_product_type(category_id: str, id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_product_type.get(db, id)
    if not obj or obj.category_id != category_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Product type not found"})
    return await crud_product_type.remove(db, id=id)
