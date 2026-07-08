from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class EmailConfigRead(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str  # masked in response (see route)
    from_name: str
    from_email: EmailStr
    use_tls: bool
    is_enabled: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmailConfigUpdate(BaseModel):
    smtp_host: str = Field(min_length=1, max_length=200)
    smtp_port: int = Field(ge=1, le=65535)
    smtp_user: str = Field(min_length=1, max_length=200)
    smtp_password: str = Field(min_length=1, max_length=200)  # plain text from form, encrypted on save
    from_name: str = Field(min_length=1, max_length=100)
    from_email: EmailStr
    use_tls: bool = True
    is_enabled: bool = False


class EmailTemplateRead(BaseModel):
    id: str
    name: str
    subject: str
    body: str
    is_system: bool
    is_active: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmailTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    subject: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, min_length=1)
    is_active: bool | None = None


class EmailTestRequest(BaseModel):
    """Empty request body — test email is sent to current user's email."""
    pass
