from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_module
from app.core.database import get_db
from app.core.scope_resolvers import SCOPE_RESOLVERS
from app.crud.user import crud_user
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate

router = APIRouter()


def _user_to_read(user) -> UserRead:
    return UserRead(
        id=user.id,
        email=user.email,
        role_id=user.role_id,
        scope_id=user.scope_id,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        role_name=user.role.name if user.role else None,
        role_scope_type=user.role.scope_type if user.role else None,
    )


@router.get("", response_model=list[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("users")),
):
    users = await crud_user.get_all_with_roles(db)
    return [_user_to_read(u) for u in users]


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users")),
):
    user = await crud_user.get_with_role(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "User not found"})
    return _user_to_read(user)


@router.post("", response_model=UserRead, status_code=201)
async def create_user(
    obj_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users")),
):
    user = await crud_user.create(db, obj_in=obj_in)
    user = await crud_user.get_with_role(db, user.id)
    return _user_to_read(user)


@router.put("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    obj_in: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users")),
):
    db_obj = await crud_user.get_with_role(db, user_id)
    if db_obj is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "User not found"})
    user = await crud_user.update(db, db_obj=db_obj, obj_in=obj_in)
    user = await crud_user.get_with_role(db, user.id)
    return _user_to_read(user)


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users")),
):
    if user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail={"code": 400, "message": "Cannot delete your own account"},
        )
    user = await crud_user.get(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "User not found"})
    await crud_user.remove(db, id=user_id)


@router.get("/scopes/{scope_type}")
async def list_scopes(
    scope_type: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users")),
):
    """List entities for a scope_type (e.g., all manufacturers).
    Used by frontend user editor to populate the scope_id dropdown."""
    resolver = SCOPE_RESOLVERS.get(scope_type)
    if resolver is None:
        raise HTTPException(
            status_code=422,
            detail={"code": 422, "message": f"Unknown scope_type: {scope_type}"},
        )
    # Direct query for the dropdown — return id + name pairs
    if scope_type == "manufacturer":
        from app.models.manufacturer import Manufacturer
        from sqlalchemy import select
        result = await db.execute(select(Manufacturer.id, Manufacturer.name).order_by(Manufacturer.name))
        return [{"id": r[0], "name": r[1]} for r in result.all()]
    elif scope_type == "equipment_manufacturer":
        from app.models.equipment import EquipmentManufacturer
        from sqlalchemy import select
        result = await db.execute(select(EquipmentManufacturer.id, EquipmentManufacturer.name).order_by(EquipmentManufacturer.name))
        return [{"id": r[0], "name": r[1]} for r in result.all()]
    return []
