from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserRead(BaseModel):
    id: int
    email: EmailStr
    role_id: str
    scope_id: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    # Joined fields (optional, populated by CRUD layer)
    role_name: str | None = None
    role_scope_type: str | None = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role_id: str
    scope_id: str | None = None
    is_active: bool = True


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role_id: str | None = None
    scope_id: str | None = None
    is_active: bool | None = None


class UserPermissions(BaseModel):
    """Returned by GET /api/admin/me/permissions — drives sidebar filtering."""
    user_id: int
    email: str
    role_id: str
    role_name: str
    scope_type: str | None
    scope_id: str | None
    allowed_modules: list[str]
