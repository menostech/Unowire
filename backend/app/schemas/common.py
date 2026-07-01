from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginationParams(BaseModel):
    page: int = 1
    page_size: int = 20


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class ErrorResponse(BaseModel):
    code: int
    message: str


class ValidationErrorDetail(BaseModel):
    field: str
    error: str


class ValidationErrorResponse(BaseModel):
    code: int = 422
    message: str = "Validation error"
    details: list[ValidationErrorDetail] = []
