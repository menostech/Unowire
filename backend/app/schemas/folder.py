from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FolderBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    parent_id: int | None = None


class FolderCreate(FolderBase):
    pass


class FolderUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class FolderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    parent_id: int | None
    created_at: datetime
    upload_count: int = 0


class FolderTreeResponse(BaseModel):
    folders: list[FolderRead]
