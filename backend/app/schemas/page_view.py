from pydantic import BaseModel


class PageViewCreate(BaseModel):
    entity_type: str  # "cable" | "equipment"
    entity_id: str
