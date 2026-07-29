import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ClaimRequestCreate(BaseModel):
    manufacturer_type: Literal["cable", "equipment"]
    manufacturer_id: str
    contact_name: str
    contact_email: str
    contact_phone: str | None = None
    proof_description: str


class ClaimRequestRead(BaseModel):
    id: uuid.UUID
    manufacturer_type: str
    manufacturer_id: str
    contact_name: str
    contact_email: str
    contact_phone: str | None = None
    proof_description: str
    status: str
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ClaimRequestWithManufacturer(ClaimRequestRead):
    manufacturer_name: str
