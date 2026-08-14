"""Portal connectivity routes: list, detail, edit. Scope-filtered to user's connectivity manufacturer."""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.crud.terminal import crud_terminal, crud_terminal_manufacturer
from app.models.terminal import Terminal as TerminalModel
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.terminal import (
    PortalTerminalCreate,
    TerminalRead,
    TerminalUpdate,
)

router = APIRouter(prefix="/api/portal/connectivity", tags=["portal-connectivity"])

# Backward-compat alias router: legacy /api/portal/terminals paths return 410 Gone
# with a Location header pointing to /api/portal/connectivity.
legacy_router = APIRouter(prefix="/api/portal/terminals")


@legacy_router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def legacy_portal_terminals_redirect(path: str, request: Request):
    new_url = f"/api/portal/connectivity/{path}" if path else "/api/portal/connectivity"
    if request.url.query:
        new_url += f"?{request.url.query}"
    raise HTTPException(status_code=410, headers={"Location": new_url})


def _check_terminal_ownership(user: User, terminal) -> None:
    if terminal is None or terminal.manufacturer_id != user.scope_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Connectivity product not found"})


async def _generate_terminal_id(db: AsyncSession, manufacturer_slug: str, terminal_slug: str) -> str:
    """Generate a unique terminal ID: {manufacturer_slug}-{terminal_slug} with UUID fallback."""
    base = f"{manufacturer_slug}-{terminal_slug}".lower()[:92]
    existing = await db.execute(select(TerminalModel.id).where(TerminalModel.id == base))
    if not existing.scalar_one_or_none():
        return base
    suffix = uuid4().hex[:8]
    return f"{base}-{suffix}"


@router.get("", response_model=PaginatedResponse[TerminalRead])
async def list_terminals(
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    category_id: str | None = None,
    user: User = Depends(require_factory_module("terminals")),
    db: AsyncSession = Depends(get_db),
):
    items, total = await crud_terminal.list_by_manufacturer(
        db,
        scope_id=user.scope_id,
        skip=(page - 1) * page_size,
        limit=page_size,
        search=search,
        category_id=category_id,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{terminal_id}", response_model=TerminalRead)
async def get_terminal(
    terminal_id: str,
    user: User = Depends(require_factory_module("terminals")),
    db: AsyncSession = Depends(get_db),
):
    # Eager-load relations to avoid MissingGreenlet during response serialization.
    terminal = await crud_terminal.get_with_relations(db, terminal_id)
    _check_terminal_ownership(user, terminal)
    return terminal


@router.put("/{terminal_id}", response_model=TerminalRead)
async def update_terminal(
    terminal_id: str,
    body: TerminalUpdate,
    user: User = Depends(require_factory_module("terminals")),
    db: AsyncSession = Depends(get_db),
):
    # Eager-load relations for ownership check + later re-read after commit.
    terminal = await crud_terminal.get_with_relations(db, terminal_id)
    _check_terminal_ownership(user, terminal)
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(terminal, field, value)
    await db.commit()
    # Re-read with relations so response serialization does not trigger
    # lazy loading in the async context (MissingGreenlet).
    return await crud_terminal.get_with_relations(db, terminal_id)


@router.post("", response_model=TerminalRead, status_code=201)
async def portal_create_terminal(
    obj_in: PortalTerminalCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("terminals")),
):
    manufacturer = await crud_terminal_manufacturer.get(db, id=user.scope_id)
    if not manufacturer:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Connectivity manufacturer not found"})

    terminal_id = await _generate_terminal_id(db, manufacturer.slug, obj_in.slug)
    terminal_data = obj_in.model_dump(exclude={"applicable_specs"})
    terminal_data["id"] = terminal_id
    terminal_data["manufacturer_id"] = user.scope_id  # server-forced
    if obj_in.applicable_specs is not None:
        terminal_data["applicable_specs"] = obj_in.applicable_specs

    terminal = TerminalModel(**terminal_data)
    db.add(terminal)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Connectivity product with this slug already exists"})
    # Reload with relations (manufacturer, category) so response serialization
    # does not trigger lazy loading in the async context (MissingGreenlet).
    return await crud_terminal.get_with_relations(db, terminal_id)


@router.delete("/{terminal_id}", response_model=TerminalRead)
async def portal_delete_terminal(
    terminal_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("terminals")),
):
    terminal = await crud_terminal.get_with_relations(db, id=terminal_id)
    _check_terminal_ownership(user, terminal)  # raises 404 if None or out-of-scope
    await db.delete(terminal)
    await db.commit()
    return terminal
