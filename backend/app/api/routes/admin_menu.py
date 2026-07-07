from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_module
from app.models.user import User
from app.core.database import get_db
from app.crud.menu import crud_menu_item
from app.schemas.menu import (
    MenuItemCreate,
    MenuItemRead,
    MenuItemSort,
    MenuItemTreeRead,
    MenuItemUpdate,
)

router = APIRouter()


@router.get("/tree", response_model=list[MenuItemTreeRead])
async def get_menu_tree(db: AsyncSession = Depends(get_db)):
    """Sidebar tree. Hidden items excluded. Public (no admin required) —
    sidebar must render even for unauthenticated admin users (e.g. login page
    layout may show the shell)."""
    return await crud_menu_item.get_tree(db, only_visible=True)


@router.get("", response_model=list[MenuItemRead])
async def list_menu_items(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("menu_config")),
):
    """Flat list of all items (including hidden), for editor."""
    return await crud_menu_item.get_flat(db)


@router.get("/{id}", response_model=MenuItemRead)
async def get_menu_item(
    id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("menu_config")),
):
    obj = await crud_menu_item.get(db, id)
    if not obj:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Menu item not found"},
        )
    return obj


@router.post("", response_model=MenuItemRead, status_code=201)
async def create_menu_item(
    obj_in: MenuItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("menu_config")),
):
    return await crud_menu_item.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=MenuItemRead)
async def update_menu_item(
    id: str,
    obj_in: MenuItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("menu_config")),
):
    obj = await crud_menu_item.get(db, id)
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
    return await crud_menu_item.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=MenuItemRead)
async def delete_menu_item(
    id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("menu_config")),
):
    await crud_menu_item.assert_not_protected(id)
    obj = await crud_menu_item.get_with_children(db, id)
    if not obj:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Menu item not found"},
        )
    # Cascade delete handled by ORM relationship + DB ON DELETE CASCADE.
    await db.delete(obj)
    await db.commit()
    return obj


@router.put("/{id}/sort", response_model=MenuItemRead)
async def sort_menu_item(
    id: str,
    body: MenuItemSort,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("menu_config")),
):
    return await crud_menu_item.move(db, id, body.direction)
