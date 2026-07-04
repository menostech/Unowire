from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False, default="image/webp")
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    url_path: Mapped[str] = mapped_column(String(500), nullable=False)
    entity_type: Mapped[Optional[str]] = mapped_column(String(50))
    entity_id: Mapped[Optional[str]] = mapped_column(String(100))
    folder_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("media_folders.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_uploads_entity", "entity_type", "entity_id"),
        Index("idx_uploads_orphan", "entity_id"),
        Index("idx_uploads_folder", "folder_id"),
    )
