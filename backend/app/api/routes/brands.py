from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.models.user import User
from app.core.database import get_db
from app.crud.brand import crud_brand
from app.schemas.brand import BrandCreate, BrandRead, BrandUpdate
from app.schemas.common import PaginatedResponse

router = APIRouter()


@router.get("", response_model=PaginatedResponse[BrandRead])
async def list_brands(
    page: int = 1,
    page_size: int = 20,
    manufacturer_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    items, total = await crud_brand.get_multi(
        db, page=page, page_size=page_size, manufacturer_id=manufacturer_id
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{id}", response_model=BrandRead)
async def get_brand(id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_brand.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Brand not found"})
    return obj


@router.post("", response_model=BrandRead, status_code=201)
async def create_brand(obj_in: BrandCreate, db: AsyncSession = Depends(get_db), user: User = Depends(require_operator("brands"))):
    return await crud_brand.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=BrandRead)
async def update_brand(id: str, obj_in: BrandUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(require_operator("brands"))):
    obj = await crud_brand.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Brand not found"})
    return await crud_brand.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=BrandRead)
async def delete_brand(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_operator("brands"))):
    obj = await crud_brand.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Brand not found"})
    return obj
