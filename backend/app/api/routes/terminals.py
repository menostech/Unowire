from fastapi import APIRouter, Depends, HTTPException, Request
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

# Backward-compat alias router: legacy /api/terminals paths return 410 Gone with a
# Location header pointing to the equivalent /api/connectivity path.
legacy_router = APIRouter(prefix="/api/terminals")


@legacy_router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def legacy_terminals_redirect(path: str, request: Request):
    new_url = f"/api/connectivity/{path}" if path else "/api/connectivity"
    if request.url.query:
        new_url += f"?{request.url.query}"
    raise HTTPException(status_code=410, headers={"Location": new_url})


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
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Connectivity product not found"})
    return obj


@router.post("", response_model=TerminalRead, status_code=201)
async def create_terminal(
    obj_in: TerminalCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("connectivity_list")),
):
    # Scope check: connectivity manufacturer can only create products for their own manufacturer
    if user.role and user.role.scope_type == "connectivity_manufacturer":
        if obj_in.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot create connectivity product outside your scope"},
            )
    return await crud_terminal.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=TerminalRead)
async def update_terminal(
    id: str,
    obj_in: TerminalUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("connectivity_list")),
):
    obj = await crud_terminal.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Connectivity product not found"})
    # Scope check
    if user.role and user.role.scope_type == "connectivity_manufacturer":
        if obj.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot modify connectivity product outside your scope"},
            )
    return await crud_terminal.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=TerminalRead)
async def delete_terminal(
    id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("connectivity_list")),
):
    # Scope check
    if user.role and user.role.scope_type == "connectivity_manufacturer":
        existing = await crud_terminal.get(db, id)
        if existing is None:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Connectivity product not found"})
        if existing.manufacturer_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete connectivity product outside your scope"},
            )
    obj = await crud_terminal.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Connectivity product not found"})
    return obj
