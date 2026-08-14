from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.models.user import User
from app.core.database import get_db
from app.crud.terminal import crud_terminal_category
from app.schemas.terminal import (
    TerminalCategoryCreate,
    TerminalCategoryRead,
    TerminalCategoryTreeNode,
    TerminalCategoryUpdate,
)

router = APIRouter()

# Backward-compat alias router: legacy /api/terminal-categories paths return
# 410 Gone with a Location header pointing to /api/connectivity-categories.
legacy_router = APIRouter(prefix="/api/terminal-categories")


@legacy_router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def legacy_terminal_categories_redirect(path: str, request: Request):
    new_url = f"/api/connectivity-categories/{path}" if path else "/api/connectivity-categories"
    if request.url.query:
        new_url += f"?{request.url.query}"
    raise HTTPException(status_code=410, headers={"Location": new_url})


@router.get("", response_model=list[TerminalCategoryTreeNode])
async def list_terminal_categories(db: AsyncSession = Depends(get_db)):
    return await crud_terminal_category.get_all_top_level_with_children(db)


@router.get("/{id}", response_model=TerminalCategoryTreeNode)
async def get_terminal_category(id: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_terminal_category.get_with_children(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Connectivity category not found"})
    return obj


@router.post("", response_model=TerminalCategoryRead, status_code=201)
async def create_terminal_category(
    obj_in: TerminalCategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("connectivity_cats")),
):
    if obj_in.parent_id is not None:
        parent = await crud_terminal_category.get(db, obj_in.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Parent category not found"})
        if parent.parent_id is not None:
            raise HTTPException(status_code=422, detail={"code": 422, "message": "Maximum depth is 2 levels"})
    return await crud_terminal_category.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=TerminalCategoryRead)
async def update_terminal_category(
    id: str,
    obj_in: TerminalCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("connectivity_cats")),
):
    obj = await crud_terminal_category.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Connectivity category not found"})

    if obj_in.parent_id is not None:
        if obj_in.parent_id == id:
            raise HTTPException(status_code=422, detail={"code": 422, "message": "Cannot set self as parent"})
        parent = await crud_terminal_category.get(db, obj_in.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Parent category not found"})
        if parent.parent_id is not None:
            raise HTTPException(status_code=422, detail={"code": 422, "message": "Maximum depth is 2 levels"})

    return await crud_terminal_category.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=TerminalCategoryRead)
async def delete_terminal_category(
    id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("connectivity_cats")),
):
    obj = await crud_terminal_category.get_with_children(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Connectivity category not found"})
    if obj.children:
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Cannot delete category with sub-categories"})
    return await crud_terminal_category.remove(db, id=id)
