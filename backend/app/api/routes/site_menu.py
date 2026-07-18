from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_module
from app.core.database import get_db
from app.crud.site_menu import crud_site_menu
from app.models.user import User
from app.schemas.site_menu import (
    SiteMenuItemCreate,
    SiteMenuItemRead,
    SiteMenuItemUpdate,
    SiteMenuSortRequest,
    SiteMenuTreeRead,
)

admin_router = APIRouter()
public_router = APIRouter()


# === Admin CRUD (requires menu_config module) ===

@admin_router.get("", response_model=list[SiteMenuItemRead])
async def list_site_menu_items(
    location: str | None = Query(None, regex="^(header|footer)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("menu_config")),
):
    """Flat list of all items (including hidden), for editor."""
    return await crud_site_menu.get_flat(db, location=location)


@admin_router.get("/tree", response_model=list[SiteMenuItemRead])
async def get_site_menu_tree_admin(
    location: str = Query(..., regex="^(header|footer)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("menu_config")),
):
    """Tree for admin editor (includes hidden)."""
    return await crud_site_menu.get_tree(db, location=location, include_hidden=True)


@admin_router.get("/{id}", response_model=SiteMenuItemRead)
async def get_site_menu_item(
    id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("menu_config")),
):
    obj = await crud_site_menu.get(db, id)
    if not obj:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Menu item not found"},
        )
    return obj


@admin_router.post("", response_model=SiteMenuItemRead, status_code=status.HTTP_201_CREATED)
async def create_site_menu_item(
    obj_in: SiteMenuItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("menu_config")),
):
    return await crud_site_menu.create(db, obj_in=obj_in)


@admin_router.put("/{id}", response_model=SiteMenuItemRead)
async def update_site_menu_item(
    id: str,
    obj_in: SiteMenuItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("menu_config")),
):
    obj = await crud_site_menu.get(db, id)
    if not obj:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Menu item not found"},
        )
    # Prevent self-parenting.
    if obj_in.parent_id is not None and obj_in.parent_id == id:
        raise HTTPException(
            status_code=422,
            detail={"code": 422, "message": "Cannot set self as parent"},
        )
    return await crud_site_menu.update(db, db_obj=obj, obj_in=obj_in)


@admin_router.delete("/{id}", response_model=SiteMenuItemRead)
async def delete_site_menu_item(
    id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("menu_config")),
):
    obj = await crud_site_menu.get(db, id)
    if not obj:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Menu item not found"},
        )
    # Cascade delete handled by ORM relationship + DB ON DELETE CASCADE.
    await db.delete(obj)
    await db.commit()
    return obj


@admin_router.put("/{id}/sort", response_model=SiteMenuItemRead)
async def sort_site_menu_item(
    id: str,
    body: SiteMenuSortRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("menu_config")),
):
    return await crud_site_menu.move(db, id, body.direction)


# === Public read (no auth) ===

@public_router.get("/{location}", response_model=list[SiteMenuTreeRead])
async def get_public_site_menu(
    location: str,
    db: AsyncSession = Depends(get_db),
):
    """Public menu tree. Hidden items excluded."""
    if location not in ("header", "footer"):
        raise HTTPException(
            status_code=422,
            detail={"code": 422, "message": "location must be 'header' or 'footer'"},
        )
    return await crud_site_menu.get_tree(db, location=location, include_hidden=False)
