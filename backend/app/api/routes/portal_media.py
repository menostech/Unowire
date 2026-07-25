"""Portal media routes: folders + uploads. Scope-filtered to user's manufacturer."""
import os
import uuid
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.crud.folder import crud_folder
from app.crud.upload import crud_upload
from app.models.upload import Upload
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


@router.post("/uploads", status_code=status.HTTP_201_CREATED)
async def upload_to_folder(
    file: UploadFile = File(...),
    folder_id: int = Form(...),
    user: User = Depends(require_factory_module("media")),
    db: AsyncSession = Depends(get_db),
):
    scope_type = user.role.scope_type
    scope_id = user.scope_id
    try:
        await crud_folder.assert_folder_in_scope(db, folder_id, scope_type, scope_id)
    except HTTPException:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Folder not found"})

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail={"code": 400, "message": "File must be an image"})

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail={"code": 413, "message": "File too large (max 5MB)"})

    try:
        img = Image.open(BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail={"code": 400, "message": "Invalid image file"})

    img = img.convert("RGB")
    img.thumbnail((400, 400))

    filename = f"{uuid.uuid4().hex}.webp"
    media_dir = os.environ.get("MEDIA_DIR", "/app/media")
    uploads_dir = os.path.join(media_dir, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    file_path = os.path.join(uploads_dir, filename)
    img.save(file_path, "WEBP", quality=85)
    size_bytes = os.path.getsize(file_path)
    url_path = f"/media/uploads/{filename}"

    db_obj = Upload(
        filename=filename,
        original_filename=file.filename or "",
        content_type="image/webp",
        size_bytes=size_bytes,
        url_path=url_path,
        folder_id=folder_id,
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)

    return {
        "id": db_obj.id,
        "filename": db_obj.filename,
        "url_path": db_obj.url_path,
        "folder_id": db_obj.folder_id,
        "created_at": db_obj.created_at.isoformat() + "Z" if db_obj.created_at else None,
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

    stmt = select(Upload).where(Upload.id == upload_id)
    result = await db.execute(stmt)
    upload = result.scalar_one_or_none()
    if upload is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})

    # If upload has a folder, verify folder is in scope
    if upload.folder_id is not None:
        try:
            await crud_folder.assert_folder_in_scope(db, upload.folder_id, scope_type, scope_id)
        except HTTPException:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})
    else:
        # Uploads without a folder are not in any scope — reject for portal users
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})

    if upload.entity_id is not None:
        raise HTTPException(
            status_code=409,
            detail={"code": 409, "message": "Cannot delete: still associated with an entity"},
        )

    media_dir = os.environ.get("MEDIA_DIR", "/app/media")
    file_path = os.path.join(media_dir, "uploads", upload.filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    await crud_upload.remove(db, id=upload_id)
    return {"ok": True}
