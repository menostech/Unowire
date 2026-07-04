from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.crud.manufacturer import crud_manufacturer
from app.schemas.common import PaginatedResponse
from app.schemas.manufacturer import (
    ManufacturerCreate,
    ManufacturerRead,
    ManufacturerUpdate,
)

router = APIRouter()


@router.get("", response_model=PaginatedResponse[ManufacturerRead])
async def list_manufacturers(
    page: int = 1, page_size: int = 20, db: AsyncSession = Depends(get_db)
):
    items, total = await crud_manufacturer.get_multi(db, page=page, page_size=page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/slug/{slug}", response_model=ManufacturerRead)
async def get_manufacturer_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_manufacturer.get_by_slug(db, slug)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})
    return obj


@router.get("/{id}", response_model=ManufacturerRead)
async def get_manufacturer(id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_manufacturer.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})
    return obj


@router.post("", response_model=ManufacturerRead, status_code=201)
async def create_manufacturer(obj_in: ManufacturerCreate, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    return await crud_manufacturer.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=ManufacturerRead)
async def update_manufacturer(id: str, obj_in: ManufacturerUpdate, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    obj = await crud_manufacturer.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})
    return await crud_manufacturer.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=ManufacturerRead)
async def delete_manufacturer(id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    obj = await crud_manufacturer.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})
    return obj
