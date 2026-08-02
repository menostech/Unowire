from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ResourceCategory(Base):
    __tablename__ = "resource_categories"
    __table_args__ = (
        UniqueConstraint("parent_id", "slug", name="uq_resource_categories_parent_slug"),
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    parent_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("resource_categories.id", ondelete="CASCADE")
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    parent: Mapped["ResourceCategory | None"] = relationship(
        back_populates="children", remote_side="ResourceCategory.id"
    )
    children: Mapped[list["ResourceCategory"]] = relationship(
        back_populates="parent", order_by="ResourceCategory.sort_order"
    )
    resources: Mapped[list["Resource"]] = relationship(
        back_populates="category"
    )


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    category_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("resource_categories.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    slug: Mapped[str] = mapped_column(String(300), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    file_filename: Mapped[str | None] = mapped_column(String(500))
    file_content_type: Mapped[str | None] = mapped_column(String(200))
    file_size_bytes: Mapped[int | None] = mapped_column(Integer)
    file_url_path: Mapped[str | None] = mapped_column(String(500))
    external_url: Mapped[str | None] = mapped_column(String(500))
    thumbnail_url: Mapped[str | None] = mapped_column(String(500))
    scope_type: Mapped[str | None] = mapped_column(String(50))
    scope_id: Mapped[str | None] = mapped_column(String(100))
    download_count: Mapped[int] = mapped_column(Integer, default=0)
    sort_order: Mapped[int] = mapped_column(default=0)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    category: Mapped[ResourceCategory] = relationship(
        back_populates="resources", lazy="selectin"
    )
