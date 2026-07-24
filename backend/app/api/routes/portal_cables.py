"""Portal cables routes: list, detail, edit. Scope-filtered to user's manufacturer."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.crud.cable import crud_cable
from app.crud.brand import crud_brand
from app.models.user import User
from app.schemas.cable import CableRead, CableUpdate

router = APIRouter(prefix="/api/portal/cables", tags=["portal-cables"])


def _check_cable_ownership(user: User, cable) -> None:
    """Raise 404 if cable is None or not in user's scope."""
    if cable is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Cable not found"})
    # cable.brand may need to be eager-loaded; crud_cable.get_detail loads it
    if cable.brand is None or cable.brand.manufacturer_id != user.scope_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Cable not found"})


@router.get("", response_model=list[CableRead])
async def list_cables(
    user: User = Depends(require_factory_module("cables")),
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 50,
):
    cables = await crud_cable.list_by_manufacturer(db, scope_id=user.scope_id, skip=skip, limit=limit)
    return cables


@router.get("/{cable_id}", response_model=CableRead)
async def get_cable(
    cable_id: str,
    user: User = Depends(require_factory_module("cables")),
    db: AsyncSession = Depends(get_db),
):
    cable = await crud_cable.get_detail(db, cable_id)
    _check_cable_ownership(user, cable)
    return cable


@router.put("/{cable_id}", response_model=CableRead)
async def update_cable(
    cable_id: str,
    body: CableUpdate,
    user: User = Depends(require_factory_module("cables")),
    db: AsyncSession = Depends(get_db),
):
    cable = await crud_cable.get_detail(db, cable_id)
    _check_cable_ownership(user, cable)

    # Reuse existing update logic from admin route (simplified for portal — no variant/spec replacement)
    update_data = body.model_dump(exclude_unset=True, exclude={"common_specs", "variants"})
    for field, value in update_data.items():
        setattr(cable, field, value)
    await db.commit()
    await db.refresh(cable)
    return cable
