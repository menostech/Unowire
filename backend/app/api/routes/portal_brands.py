"""Portal brands routes: list, detail, edit. Scope-filtered to user's manufacturer."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.crud.brand import crud_brand
from app.models.user import User
from app.schemas.brand import BrandRead, BrandUpdate

router = APIRouter(prefix="/api/portal/brands", tags=["portal-brands"])


def _check_brand_ownership(user: User, brand) -> None:
    if brand is None or brand.manufacturer_id != user.scope_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Brand not found"})


@router.get("", response_model=list[BrandRead])
async def list_brands(
    user: User = Depends(require_factory_module("brands")),
    db: AsyncSession = Depends(get_db),
):
    return await crud_brand.list_by_manufacturer(db, scope_id=user.scope_id)


@router.get("/{brand_id}", response_model=BrandRead)
async def get_brand(
    brand_id: str,
    user: User = Depends(require_factory_module("brands")),
    db: AsyncSession = Depends(get_db),
):
    brand = await crud_brand.get(db, brand_id)
    _check_brand_ownership(user, brand)
    return brand


@router.put("/{brand_id}", response_model=BrandRead)
async def update_brand(
    brand_id: str,
    body: BrandUpdate,
    user: User = Depends(require_factory_module("brands")),
    db: AsyncSession = Depends(get_db),
):
    brand = await crud_brand.get(db, brand_id)
    _check_brand_ownership(user, brand)
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(brand, field, value)
    await db.commit()
    await db.refresh(brand)
    return brand
