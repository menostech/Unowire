from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.models.user import User
from app.core.database import get_db
from app.crud.terminal import crud_terminal_manufacturer
from app.crud.folder import crud_folder
from app.schemas.common import PaginatedResponse
from app.schemas.terminal import (
    TerminalManufacturerCreate,
    TerminalManufacturerRead,
    TerminalManufacturerUpdate,
)

router = APIRouter()


@router.get("", response_model=PaginatedResponse[TerminalManufacturerRead])
async def list_terminal_manufacturers(
    page: int = 1, page_size: int = 20, db: AsyncSession = Depends(get_db)
):
    items, total = await crud_terminal_manufacturer.get_multi(db, page=page, page_size=page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{id}", response_model=TerminalManufacturerRead)
async def get_terminal_manufacturer(id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_terminal_manufacturer.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Terminal manufacturer not found"})
    return obj


@router.post("", response_model=TerminalManufacturerRead, status_code=201)
async def create_terminal_manufacturer(
    obj_in: TerminalManufacturerCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("terminal_mfrs")),
):
    # Scope check: terminal_manager can only manage their own manufacturer
    if user.role and user.role.scope_type == "terminal_manufacturer":
        if obj_in.id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot create terminal manufacturer outside your scope"},
            )
    obj = await crud_terminal_manufacturer.create(db, obj_in=obj_in)
    # Auto-provision media folder tree
    await crud_folder.provision_for_manufacturer(
        db, scope_type="terminal_manufacturer", scope_id=obj.id, name=obj.name
    )
    return obj


@router.put("/{id}", response_model=TerminalManufacturerRead)
async def update_terminal_manufacturer(
    id: str,
    obj_in: TerminalManufacturerUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("terminal_mfrs")),
):
    obj = await crud_terminal_manufacturer.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Terminal manufacturer not found"})
    # Scope check
    if user.role and user.role.scope_type == "terminal_manufacturer":
        if id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot modify terminal manufacturer outside your scope"},
            )
    old_name = obj.name
    obj = await crud_terminal_manufacturer.update(db, db_obj=obj, obj_in=obj_in)
    # Rename manufacturer root folder if name changed
    if obj_in.name and obj_in.name != old_name:
        await crud_folder.rename_manufacturer_root(
            db, scope_type="terminal_manufacturer", scope_id=id, new_name=obj_in.name
        )
    return obj


@router.delete("/{id}", response_model=TerminalManufacturerRead)
async def delete_terminal_manufacturer(
    id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("terminal_mfrs")),
):
    # Scope check
    if user.role and user.role.scope_type == "terminal_manufacturer":
        if id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete terminal manufacturer outside your scope"},
            )
    # Cleanup media folders + uploads before deleting manufacturer
    await crud_folder.cleanup_for_manufacturer(
        db, scope_type="terminal_manufacturer", scope_id=id
    )
    obj = await crud_terminal_manufacturer.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Terminal manufacturer not found"})
    return obj
