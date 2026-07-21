from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PageView(Base):
    __tablename__ = "page_views"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)  # "cable" | "equipment"
    entity_id: Mapped[str] = mapped_column(String(100), nullable=False)
    scope_type: Mapped[str] = mapped_column(String(50), nullable=False)  # denormalized for fast scope aggregation
    scope_id: Mapped[str] = mapped_column(String(100), nullable=False)
    viewed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_page_views_scope_date", "scope_type", "scope_id", "viewed_at"),
        Index("ix_page_views_entity", "entity_type", "entity_id"),
    )
