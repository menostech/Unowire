from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class MemberRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)
    company: str | None = None
    phone: str | None = None


class MemberLogin(BaseModel):
    email: EmailStr
    password: str


class MemberVerify(BaseModel):
    token: str


class MemberRead(BaseModel):
    id: int
    email: EmailStr
    name: str
    company: str | None = None
    phone: str | None = None
    is_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    company: str | None = None
    phone: str | None = None
