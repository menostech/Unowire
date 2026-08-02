import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.core.database import get_db
from app.crud.resource import crud_resource
from app.models.resource import Resource as ResourceModel
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.resource import ResourceRead
from app.utils.resource_storage import (
    delete_resource_file,
    get_resource_file_path,
    save_resource_file,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=PaginatedResponse[ResourceRead])
async def list_resources(
    page: int = 1,
    page_size: int = 20,
    category_id: str | None = None,
    q: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    items, total = await crud_resource.get_all_with_relations(
        db,
        page=page,
        page_size=page_size,
        category_id=category_id,
        q=q,
        is_published=True,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{resource_id}/download")
async def download_resource(resource_id: str, db: AsyncSession = Depends(get_db)):
    resource = await crud_resource.get(db, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Resource not found"})
    if not resource.file_url_path:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Resource file not available"})
    file_path = get_resource_file_path(resource.file_url_path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Resource file not found"})
    await crud_resource.increment_download_count(db, resource_id)
    return FileResponse(
        file_path,
        filename=resource.file_filename,
        media_type=resource.file_content_type,
    )


# ---------------------------------------------------------------------------
# Admin endpoints (must be defined before /{slug} to avoid route shadowing)
# ---------------------------------------------------------------------------


@router.get("/admin", response_model=PaginatedResponse[ResourceRead])
async def admin_list_resources(
    page: int = 1,
    page_size: int = 20,
    category_id: str | None = None,
    q: str | None = None,
    scope_type: str | None = None,
    scope_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("resource_list")),
):
    # Scoped admins only see resources within their own scope.
    if user.role and user.role.scope_type is not None:
        scope_type = user.role.scope_type
        scope_id = user.scope_id
    items, total = await crud_resource.get_all_with_relations(
        db,
        page=page,
        page_size=page_size,
        category_id=category_id,
        q=q,
        scope_type=scope_type,
        scope_id=scope_id,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/admin/{resource_id}", response_model=ResourceRead)
async def admin_get_resource(
    resource_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("resource_list")),
):
    resource = await crud_resource.get_with_relations(db, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Resource not found"})
    if user.role and user.role.scope_type is not None:
        if resource.scope_type != user.role.scope_type or resource.scope_id != user.scope_id:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Resource not found"})
    return resource


@router.post("/admin", response_model=ResourceRead, status_code=201)
async def admin_create_resource(
    id: str = Form(...),
    title: str = Form(...),
    slug: str = Form(...),
    category_id: str = Form(...),
    description: str | None = Form(None),
    external_url: str | None = Form(None),
    thumbnail_url: str | None = Form(None),
    sort_order: int = Form(0),
    is_published: bool = Form(True),
    scope_type: str | None = Form(None),
    scope_id: str | None = Form(None),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("resource_list")),
):
    # Scoped admins cannot create resources outside their scope.
    if user.role and user.role.scope_type is not None:
        if (scope_type is not None and scope_type != user.role.scope_type) or (
            scope_id is not None and scope_id != user.scope_id
        ):
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot create resource outside your scope"},
            )
        scope_type = user.role.scope_type
        scope_id = user.scope_id

    file_filename = None
    file_content_type = None
    file_size_bytes = None
    file_url_path = None
    if file is not None:
        file_filename, file_content_type, file_size_bytes, file_url_path = await save_resource_file(file)

    resource = ResourceModel(
        id=id,
        title=title,
        slug=slug,
        category_id=category_id,
        description=description,
        external_url=external_url,
        thumbnail_url=thumbnail_url,
        sort_order=sort_order,
        is_published=is_published,
        scope_type=scope_type,
        scope_id=scope_id,
        file_filename=file_filename,
        file_content_type=file_content_type,
        file_size_bytes=file_size_bytes,
        file_url_path=file_url_path,
    )
    db.add(resource)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Slug already exists"})
    return await crud_resource.get_with_relations(db, id)


@router.put("/admin/{resource_id}", response_model=ResourceRead)
async def admin_update_resource(
    resource_id: str,
    title: str | None = Form(None),
    slug: str | None = Form(None),
    category_id: str | None = Form(None),
    description: str | None = Form(None),
    external_url: str | None = Form(None),
    thumbnail_url: str | None = Form(None),
    sort_order: int | None = Form(None),
    is_published: bool | None = Form(None),
    scope_type: str | None = Form(None),
    scope_id: str | None = Form(None),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("resource_list")),
):
    resource = await crud_resource.get_with_relations(db, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Resource not found"})

    # Scoped admins can only edit their own resources and cannot escape scope.
    if user.role and user.role.scope_type is not None:
        if resource.scope_type != user.role.scope_type or resource.scope_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot modify resource outside your scope"},
            )
        if (scope_type is not None and scope_type != user.role.scope_type) or (
            scope_id is not None and scope_id != user.scope_id
        ):
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot move resource outside your scope"},
            )
        # Preserve existing scope; scoped admins cannot change it.
        scope_type = None
        scope_id = None

    if file is not None:
        if resource.file_url_path:
            delete_resource_file(resource.file_url_path)
        file_filename, file_content_type, file_size_bytes, file_url_path = await save_resource_file(file)
        resource.file_filename = file_filename
        resource.file_content_type = file_content_type
        resource.file_size_bytes = file_size_bytes
        resource.file_url_path = file_url_path

    updates = {
        "title": title,
        "slug": slug,
        "category_id": category_id,
        "description": description,
        "external_url": external_url,
        "thumbnail_url": thumbnail_url,
        "sort_order": sort_order,
        "is_published": is_published,
        "scope_type": scope_type,
        "scope_id": scope_id,
    }
    for field, value in updates.items():
        if value is not None:
            setattr(resource, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Slug already exists"})
    return await crud_resource.get_with_relations(db, resource_id)


@router.delete("/admin/{resource_id}", status_code=204)
async def admin_delete_resource(
    resource_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("resource_list")),
):
    resource = await crud_resource.get_with_relations(db, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Resource not found"})
    if user.role and user.role.scope_type is not None:
        if resource.scope_type != user.role.scope_type or resource.scope_id != user.scope_id:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete resource outside your scope"},
            )
    if resource.file_url_path:
        delete_resource_file(resource.file_url_path)
    await db.delete(resource)
    await db.commit()
    return None


# ---------------------------------------------------------------------------
# Public detail endpoint (must be LAST — /{slug} catches any single segment)
# ---------------------------------------------------------------------------


@router.get("/{slug}", response_model=ResourceRead)
async def get_resource(slug: str, db: AsyncSession = Depends(get_db)):
    resource = await crud_resource.get_by_slug(db, slug)
    if not resource or not resource.is_published:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Resource not found"})
    return resource
