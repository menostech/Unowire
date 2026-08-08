"""Portal resource routes: list, detail, create, update, delete.

Scope-filtered to the authenticated factory user's own scope. The router
prefix is baked in here (``/api/portal/resources``) so it is registered bare
in ``main.py``.
"""
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.crud.resource import crud_resource
from app.models.resource import Resource
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.resource import ResourceRead
from app.utils.resource_storage import delete_resource_file, save_resource_file

router = APIRouter(prefix="/api/portal/resources", tags=["portal-resources"])


async def _check_resource_ownership(db: AsyncSession, user: User, resource_id: str) -> Resource:
    """Return the resource owned by ``user``, else raise 404.

    Uses 404 (not 403) so foreign resources' existence is not leaked.
    """
    resource = await crud_resource.get_with_relations(db, id=resource_id)
    if not resource or resource.scope_id != user.scope_id or resource.scope_type != user.role.scope_type:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Resource not found"})
    return resource


@router.get("", response_model=PaginatedResponse[ResourceRead])
async def list_resources(
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    category_id: str | None = None,
    user: User = Depends(require_factory_module("resources")),
    db: AsyncSession = Depends(get_db),
):
    items, total = await crud_resource.list_by_scope(
        db,
        scope_type=user.role.scope_type,
        scope_id=user.scope_id,
        skip=(page - 1) * page_size,
        limit=page_size,
        search=search,
        category_id=category_id,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{resource_id}", response_model=ResourceRead)
async def get_resource(
    resource_id: str,
    user: User = Depends(require_factory_module("resources")),
    db: AsyncSession = Depends(get_db),
):
    return await _check_resource_ownership(db, user, resource_id)


@router.post("", response_model=ResourceRead, status_code=201)
async def create_resource(
    category_id: str = Form(...),
    title: str = Form(...),
    slug: str = Form(...),
    description: str | None = Form(None),
    external_url: str | None = Form(None),
    thumbnail_url: str | None = Form(None),
    sort_order: int = Form(0),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("resources")),
):
    file_filename = None
    file_content_type = None
    file_size_bytes = None
    file_url_path = None
    if file is not None:
        file_filename, file_content_type, file_size_bytes, file_url_path = await save_resource_file(file)

    # Server forces scope from the authenticated user; portal users cannot
    # unpublish resources (is_published is always True).
    resource_data = {
        "category_id": category_id,
        "title": title,
        "slug": slug,
        "description": description,
        "external_url": external_url,
        "thumbnail_url": thumbnail_url,
        "sort_order": sort_order,
        "file_filename": file_filename,
        "file_content_type": file_content_type,
        "file_size_bytes": file_size_bytes,
        "file_url_path": file_url_path,
        "scope_type": user.role.scope_type,
        "scope_id": user.scope_id,
        "is_published": True,
    }

    resource_id = f"{user.scope_id}-{slug}"
    resource = Resource(id=resource_id, **resource_data)
    db.add(resource)
    try:
        await db.commit()
    except IntegrityError:
        # Fall back to a UUID8-suffixed id in case of an id collision.
        await db.rollback()
        resource_id = f"{resource_id}-{uuid4().hex[:8]}"
        resource = Resource(id=resource_id, **resource_data)
        db.add(resource)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=409,
                detail={"code": 409, "message": "Resource with this slug already exists"},
            )
    # Re-read with selectinload(category) so response serialization does not
    # trigger lazy loading in the async context (MissingGreenlet).
    return await crud_resource.get_with_relations(db, resource_id)


@router.put("/{resource_id}", response_model=ResourceRead)
async def update_resource(
    resource_id: str,
    category_id: str | None = Form(None),
    title: str | None = Form(None),
    slug: str | None = Form(None),
    description: str | None = Form(None),
    external_url: str | None = Form(None),
    thumbnail_url: str | None = Form(None),
    sort_order: int | None = Form(None),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("resources")),
):
    resource = await _check_resource_ownership(db, user, resource_id)

    if file is not None:
        if resource.file_url_path:
            delete_resource_file(resource.file_url_path)
        file_filename, file_content_type, file_size_bytes, file_url_path = await save_resource_file(file)
        resource.file_filename = file_filename
        resource.file_content_type = file_content_type
        resource.file_size_bytes = file_size_bytes
        resource.file_url_path = file_url_path

    # Portal users cannot change scope_type/scope_id/is_published.
    updates = {
        "category_id": category_id,
        "title": title,
        "slug": slug,
        "description": description,
        "external_url": external_url,
        "thumbnail_url": thumbnail_url,
        "sort_order": sort_order,
    }
    for field, value in updates.items():
        if value is not None:
            setattr(resource, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail={"code": 409, "message": "Resource with this slug already exists"},
        )
    return await crud_resource.get_with_relations(db, resource_id)


@router.delete("/{resource_id}", status_code=204)
async def delete_resource(
    resource_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("resources")),
):
    resource = await _check_resource_ownership(db, user, resource_id)
    if resource.file_url_path:
        delete_resource_file(resource.file_url_path)
    await db.delete(resource)
    await db.commit()
    return None
