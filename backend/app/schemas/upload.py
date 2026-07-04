from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UploadBase(BaseModel):
    filename: str
    original_filename: str
    content_type: str = "image/webp"
    size_bytes: int
    url_path: str
    entity_type: str | None = None
    entity_id: str | None = None
    folder_id: int | None = None


class UploadCreate(UploadBase):
    pass


class UploadUpdate(BaseModel):
    filename: str | None = None
    original_filename: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    url_path: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    folder_id: int | None = None


class UploadMove(BaseModel):
    folder_id: int | None  # None = move to root (unfiled)


class UploadRename(BaseModel):
    original_filename: str


class UploadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    filename: str
    original_filename: str
    content_type: str
    size_bytes: int
    url_path: str
    entity_type: str | None = None
    entity_id: str | None = None
    folder_id: int | None = None


class UploadListResponse(BaseModel):
    items: list[UploadRead]
    total: int
    page: int
    page_size: int
