from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_module
from app.core.database import get_db
from app.core.modules import ADMIN_MODULES
from app.crud.role import crud_role
from app.models.user import User
from app.schemas.role import RoleCreate, RoleRead, RoleUpdate

router = APIRouter()


def _role_to_read(role) -> RoleRead:
    """Convert a Role ORM object to RoleRead, including permissions as a list of module IDs."""
    return RoleRead(
        id=role.id,
        name=role.name,
        description=role.description,
        scope_type=role.scope_type,
        is_system=role.is_system,
        sort_order=role.sort_order,
        permissions=[rp.module for rp in role.permissions],
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


@router.get("", response_model=list[RoleRead])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("roles")),
):
    roles = await crud_role.get_all_with_permissions(db)
    return [_role_to_read(r) for r in roles]


@router.get("/modules")
async def list_modules(
    user: User = Depends(require_module("roles")),
):
    """List all available admin modules (for the permission editor checkbox matrix)."""
    return ADMIN_MODULES


@router.get("/{role_id}", response_model=RoleRead)
async def get_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("roles")),
):
    role = await crud_role.get_with_permissions(db, role_id)
    if role is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Role not found"})
    return _role_to_read(role)


@router.post("", response_model=RoleRead, status_code=201)
async def create_role(
    obj_in: RoleCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("roles")),
):
    role = await crud_role.create_with_permissions(db, obj_in=obj_in)
    # Re-load with permissions
    role = await crud_role.get_with_permissions(db, role.id)
    return _role_to_read(role)


@router.put("/{role_id}", response_model=RoleRead)
async def update_role(
    role_id: str,
    obj_in: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("roles")),
):
    db_obj = await crud_role.get_with_permissions(db, role_id)
    if db_obj is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Role not found"})
    role = await crud_role.update_with_permissions(db, db_obj=db_obj, obj_in=obj_in)
    role = await crud_role.get_with_permissions(db, role.id)
    return _role_to_read(role)


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("roles")),
):
    if role_id == user.role_id:
        raise HTTPException(
            status_code=400,
            detail={"code": 400, "message": "Cannot delete your own role"},
        )
    result = await crud_role.remove(db, id=role_id)
    if result is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Role not found"})
