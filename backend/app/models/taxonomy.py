from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Industry(Base):
    __tablename__ = "industries"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column()
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    categories: Mapped[list["Category"]] = relationship(
        back_populates="industry", lazy="selectin", order_by="Category.sort_order"
    )


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("industry_id", "slug"),)

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    industry_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("industries.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column()
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    industry: Mapped["Industry"] = relationship(back_populates="categories")
    product_types: Mapped[list["ProductType"]] = relationship(
        back_populates="category", lazy="selectin", order_by="ProductType.sort_order"
    )


class ProductType(Base):
    __tablename__ = "product_types"
    __table_args__ = (
        CheckConstraint(
            "size_system IN ('awg','mm2','kcmil','none')",
            name="ck_product_types_size_system",
        ),
        UniqueConstraint("category_id", "slug"),
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    category_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    size_system: Mapped[str] = mapped_column(String(20), nullable=False)
    filters: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="[]")
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    category: Mapped["Category"] = relationship(back_populates="product_types")
