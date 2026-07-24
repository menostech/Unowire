"""Portal media routes: folders + uploads. Scope-filtered to user's manufacturer."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.crud.folder import crud_folder
from app.crud.upload import crud_upload
from app.models.user import User
from app.schemas.folder import FolderCreate

router = APIRouter(prefix="/api/portal", tags=["portal-media"])


@router.get("/folders")
async def list_folders(
    user: User = Depends(require_factory_module("media")),
    db: AsyncSession = Depends(get_db),
):
    scope_type = user.role.scope_type
    scope_id = user.scope_id
    folders = await crud_folder.list_all_with_counts(
        db, scope_type=scope_type, scope_id=scope_id
    )
    return [
        {
            "id": f.id,
            "name": f.name,
            "parent_id": f.parent_id,
            "scope_type": f.scope_type,
            "scope_id": f.scope_id,
            "upload_count": count,
        }
        for f, count in folders
    ]


@router.post("/folders")
async def create_folder(
    body: FolderCreate,
    user: User = Depends(require_factory_module("media")),
    db: AsyncSession = Depends(get_db),
):
    scope_type = user.role.scope_type
    scope_id = user.scope_id
    # Force the folder to be created within the user's scope
    folder = await crud_folder.create_with_depth_check(
        db,
        obj_in=FolderCreate(
            name=body.name,
            parent_id=body.parent_id,
            scope_type=scope_type,
            scope_id=scope_id,
        ),
    )
    return folder


@router.get("/uploads")
async def list_uploads(
    user: User = Depends(require_factory_module("media")),
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
    folder_id: int | None = None,
):
    scope_type = user.role.scope_type
    scope_id = user.scope_id
    uploads, total = await crud_upload.list_paginated(
        db,
        page=page,
        page_size=page_size,
        folder_id=folder_id,
        scope_type=scope_type,
        scope_id=scope_id,
    )
    return {
        "items": [
            {
                "id": u.id,
                "filename": u.filename,
                "url_path": u.url_path,
                "folder_id": u.folder_id,
                "created_at": u.created_at.isoformat() + "Z" if u.created_at else None,
            }
            for u in uploads
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.delete("/uploads/{upload_id}")
async def delete_upload(
    upload_id: int,
    user: User = Depends(require_factory_module("media")),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership: upload must be in a folder within user's scope
    scope_type = user.role.scope_type
    scope_id = user.scope_id
    from app.crud.folder import crud_folder as _crud_folder
    from app.models.upload import Upload
    from sqlalchemy import select

    stmt = select(Upload).where(Upload.id == upload_id)
    result = await db.execute(stmt)
    upload = result.scalar_one_or_none()
    if upload is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})

    # If upload has a folder, verify folder is in scope
    if upload.folder_id is not None:
        try:
            await _crud_folder.assert_folder_in_scope(db, upload.folder_id, scope_type, scope_id)
        except HTTPException:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})
    else:
        # Uploads without a folder are not in any scope — reject for portal users
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})

    await crud_upload.remove(db, id=upload_id)
    return {"ok": True}
