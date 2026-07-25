"""Portal cables routes: list, detail, edit. Scope-filtered to user's manufacturer."""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.crud.cable import crud_cable
from app.crud.manufacturer import crud_manufacturer
from app.models.cable import Cable as CableModel
from app.models.user import User
from app.schemas.cable import CableRead, CableUpdate, PortalCableCreate

router = APIRouter(prefix="/api/portal/cables", tags=["portal-cables"])


def _check_cable_ownership(user: User, cable) -> None:
    """Raise 404 if cable is None or not in user's scope."""
    if cable is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Cable not found"})
    if cable.manufacturer_id != user.scope_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Cable not found"})


async def _generate_cable_id(db: AsyncSession, manufacturer_slug: str, cable_slug: str) -> str:
    """Generate a unique cable ID: {manufacturer_slug}-{cable_slug} with UUID fallback."""
    base = f"{manufacturer_slug}-{cable_slug}".lower()[:92]  # leave 8 chars for suffix
    existing = await db.execute(select(CableModel.id).where(CableModel.id == base))
    if not existing.scalar_one_or_none():
        return base
    suffix = uuid4().hex[:8]
    return f"{base}-{suffix}"


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


@router.post("", response_model=CableRead, status_code=201)
async def portal_create_cable(
    obj_in: PortalCableCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("cables")),
):
    manufacturer = await crud_manufacturer.get(db, id=user.scope_id)
    if not manufacturer:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})

    cable_id = await _generate_cable_id(db, manufacturer.slug, obj_in.slug)
    cable_data = obj_in.model_dump()
    cable_data["id"] = cable_id
    cable_data["manufacturer_id"] = user.scope_id  # server-forced, ignore client input

    cable = CableModel(**cable_data)
    db.add(cable)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "A cable with this slug already exists"})
    await db.refresh(cable)
    return cable
