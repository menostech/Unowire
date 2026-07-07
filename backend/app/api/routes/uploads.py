import os
import uuid
from io import BytesIO
from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_module
from app.models.user import User
from app.core.database import get_db
from app.crud.upload import crud_upload
from app.models.upload import Upload
from app.schemas.upload import (
    UploadListResponse,
    UploadMove,
    UploadRead,
    UploadRename,
)

router = APIRouter()

MAX_FILE_SIZE = 5 * 1024 * 1024


@router.post("/", response_model=UploadRead, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile,
    folder_id: int | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail={"code": 400, "message": "File must be an image"})

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail={"code": 413, "message": "File too large (max 5MB)"})

    try:
        image = Image.open(BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail={"code": 400, "message": f"Invalid image file: {str(e)}"})

    image = image.convert("RGB")
    image.thumbnail((400, 400))

    filename = f"{uuid.uuid4().hex}.webp"
    media_dir = os.environ.get("MEDIA_DIR", "/app/media")
    uploads_dir = os.path.join(media_dir, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    file_path = os.path.join(uploads_dir, filename)

    image.save(file_path, format="WebP", quality=85)
    saved_size = os.path.getsize(file_path)
    url_path = f"/media/uploads/{filename}"

    db_obj = Upload(
        filename=filename,
        original_filename=file.filename or "",
        content_type="image/webp",
        size_bytes=saved_size,
        url_path=url_path,
        folder_id=folder_id,
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)

    return db_obj


@router.get("/", response_model=UploadListResponse)
async def list_uploads(
    page: int = 1,
    page_size: int = 20,
    folder_id: int | Literal["none"] | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
):
    items, total = await crud_upload.list_paginated(
        db, page=page, page_size=page_size, folder_id=folder_id
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.put("/{id}", response_model=UploadRead)
async def rename_upload(
    id: int,
    body: UploadRename,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
):
    upload = await crud_upload.get(db, id=id)
    if not upload:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})
    upload.original_filename = body.original_filename
    db.add(upload)
    await db.commit()
    await db.refresh(upload)
    return upload


@router.patch("/{id}", response_model=UploadRead)
async def move_upload(
    id: int,
    body: UploadMove,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
):
    upload = await crud_upload.get(db, id=id)
    if not upload:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})
    if body.folder_id is not None:
        from app.models.folder import Folder
        folder = await db.get(Folder, body.folder_id)
        if not folder:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Target folder not found"})
    upload.folder_id = body.folder_id
    db.add(upload)
    await db.commit()
    await db.refresh(upload)
    return upload


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_upload(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media"))
):
    upload = await crud_upload.get(db, id=id)
    if not upload:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Upload not found"})

    if upload.entity_id is not None:
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Cannot delete: still associated with an entity"})

    media_dir = os.environ.get("MEDIA_DIR", "/app/media")
    file_path = os.path.join(media_dir, "uploads", upload.filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    await crud_upload.remove(db, id=id)
