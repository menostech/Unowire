from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Folder(Base):
    __tablename__ = "media_folders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("media_folders.id", ondelete="CASCADE"), nullable=True
    )
    scope_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    scope_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint("parent_id", "name", name="uq_folder_parent_name"),
        Index("idx_media_folders_scope", "scope_type", "scope_id"),
    )
