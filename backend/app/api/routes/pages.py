from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.core.database import get_db
from app.crud.page import (
    SlugConflictError,
    SlugReservedError,
    crud_page,
)
from app.models.user import User
from app.schemas.page import (
    PageCreate,
    PageListResponse,
    PagePublicRead,
    PageRead,
    PageSitemapItem,
    PageUpdate,
)

router = APIRouter()
public_router = APIRouter()


# === Admin CRUD (requires pages module) ===

@router.get("", response_model=PageListResponse)
async def list_pages(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("pages")),
):
    items, total = await crud_page.list_paginated(
        db, page=page, page_size=page_size, status_filter=status_filter
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{id}", response_model=PageRead)
async def get_page(
    id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("pages")),
):
    obj = await crud_page.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Page not found"})
    return obj


@router.post("", response_model=PageRead, status_code=status.HTTP_201_CREATED)
async def create_page(
    obj_in: PageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("pages")),
):
    try:
        obj = await crud_page.create(db, obj_in=obj_in)
    except SlugReservedError as e:
        raise HTTPException(status_code=400, detail={"code": 400, "message": str(e)})
    except SlugConflictError as e:
        raise HTTPException(status_code=409, detail={"code": 409, "message": str(e)})
    return obj


@router.put("/{id}", response_model=PageRead)
async def update_page(
    id: str,
    obj_in: PageUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("pages")),
):
    obj = await crud_page.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Page not found"})
    try:
        obj = await crud_page.update(db, db_obj=obj, obj_in=obj_in)
    except SlugReservedError as e:
        raise HTTPException(status_code=400, detail={"code": 400, "message": str(e)})
    except SlugConflictError as e:
        raise HTTPException(status_code=409, detail={"code": 409, "message": str(e)})
    return obj


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_page(
    id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("pages")),
):
    obj = await crud_page.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Page not found"})
    await crud_page.remove(db, id=id)
    return None


# === Public read (no auth) ===
# IMPORTANT: /sitemap must be declared BEFORE /{slug} so it is not captured as a slug.

@public_router.get("/sitemap", response_model=list[PageSitemapItem])
async def list_pages_for_sitemap(db: AsyncSession = Depends(get_db)):
    return await crud_page.list_for_sitemap(db)


@public_router.get("/{slug}", response_model=PagePublicRead)
async def get_public_page(slug: str, db: AsyncSession = Depends(get_db)):
    obj = await crud_page.get_public_by_slug(db, slug)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Page not found"})
    return obj
