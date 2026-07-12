from datetime import datetime

from pydantic import BaseModel, model_validator

from app.core.modules import VALID_SCOPE_TYPES


class RolePermissionRead(BaseModel):
    module: str

    model_config = {"from_attributes": True}


class RoleRead(BaseModel):
    id: str
    name: str
    description: str | None = None
    scope_type: str | None = None
    is_system: bool
    sort_order: int
    permissions: list[str] = []  # list of module IDs
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    id: str
    name: str
    description: str | None = None
    scope_type: str | None = None
    sort_order: int = 0
    permissions: list[str] = []  # module IDs

    @model_validator(mode="after")
    def validate_scope_type(self):
        if self.scope_type not in VALID_SCOPE_TYPES:
            raise ValueError(f"Invalid scope_type: {self.scope_type}")
        return self


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    scope_type: str | None = None
    sort_order: int | None = None
    permissions: list[str] | None = None  # if provided, replaces all permissions

    @model_validator(mode="after")
    def validate_scope_type(self):
        if self.scope_type is not None and self.scope_type not in VALID_SCOPE_TYPES:
            raise ValueError(f"Invalid scope_type: {self.scope_type}")
        return self
