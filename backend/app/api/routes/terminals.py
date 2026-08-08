from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator, require_quota
from app.models.user import User
from app.core.database import get_db
from app.crud.terminal import crud_terminal
from app.schemas.common import PaginatedResponse
from app.schemas.terminal import (
    TerminalCreate,
    TerminalRead,
    TerminalUpdate,
)

router = APIRouter()


@router.get("", response_model=PaginatedResponse[TerminalRead])
async def list_terminals(
    page: int = 1,
    page_size: int = 20,
    cable_id: str | None = None,
    q: str | None = None,
    category_id: str | None = None,
    manufacturer_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    _member=Depends(require_quota("search")),
):
    if cable_id:
        items = await crud_terminal.get_matching_cable(db, cable_id)
        return {"items": items, "total": len(items), "page": 1, "page_size": len(items)}
    items, total = await crud_terminal.get_all_with_relations(
        db,
        page=page,
        page_size=page_size,
        q=q,
        category_id=category_id,
        manufacturer_id=manufacturer_id,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{id}", response_model=TerminalRead)
async def get_terminal(id: str, db: AsyncSession = Depends(get_db), _member=Depends(require_quota("detail_view"))):
    obj = await crud_terminal.get_with_relations(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Terminal not found"})
    return obj


@router.post("", response_model=TerminalRead, status_code=201)
async def create_terminal(
    obj_in: TerminalCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("terminal_list")),
):
    # Scope check: terminal_manager can only create terminals for their own manufacturer
    if user.role and user.role.scope_type == "terminal_manufacturer":
        if obj_in.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot create terminal outside your scope"},
            )
    return await crud_terminal.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=TerminalRead)
async def update_terminal(
    id: str,
    obj_in: TerminalUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("terminal_list")),
):
    obj = await crud_terminal.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Terminal not found"})
    # Scope check
    if user.role and user.role.scope_type == "terminal_manufacturer":
        if obj.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot modify terminal outside your scope"},
            )
    return await crud_terminal.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=TerminalRead)
async def delete_terminal(
    id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("terminal_list")),
):
    # Scope check
    if user.role and user.role.scope_type == "terminal_manufacturer":
        existing = await crud_terminal.get(db, id)
        if existing is None:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Terminal not found"})
        if existing.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete terminal outside your scope"},
            )
    obj = await crud_terminal.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Terminal not found"})
    return obj
