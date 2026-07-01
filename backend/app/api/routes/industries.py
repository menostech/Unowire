from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.taxonomy import crud_industry
from app.schemas.taxonomy import IndustryCreate, IndustryRead, IndustryUpdate

router = APIRouter()


@router.get("", response_model=list[IndustryRead])
async def list_industries(db: AsyncSession = Depends(get_db)):
    return await crud_industry.get_all_with_children(db)


@router.get("/{id}", response_model=IndustryRead)
async def get_industry(id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_industry.get_with_children(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Industry not found"})
    return obj


@router.post("", response_model=IndustryRead, status_code=201)
async def create_industry(obj_in: IndustryCreate, db: AsyncSession = Depends(get_db)):
    return await crud_industry.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=IndustryRead)
async def update_industry(id: str, obj_in: IndustryUpdate, db: AsyncSession = Depends(get_db)):
    obj = await crud_industry.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Industry not found"})
    return await crud_industry.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=IndustryRead)
async def delete_industry(id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_industry.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Industry not found"})
    return obj
