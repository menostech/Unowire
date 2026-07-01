from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Cable(Base):
    __tablename__ = "cables"
    __table_args__ = (
        CheckConstraint(
            "size_system IN ('awg','mm2','kcmil','none')",
            name="ck_cables_size_system",
        ),
        UniqueConstraint("brand_id", "slug"),
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    brand_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("brands.id", ondelete="RESTRICT"), nullable=False
    )
    product_type_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("product_types.id", ondelete="RESTRICT"), nullable=False
    )
    model: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    industry_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("industries.id", ondelete="RESTRICT"), nullable=False
    )
    category_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False
    )
    size_system: Mapped[str] = mapped_column(String(20), nullable=False)
    base_description: Mapped[str | None] = mapped_column()
    meta_title: Mapped[str | None] = mapped_column(String(200))
    meta_description: Mapped[str | None] = mapped_column()
    category_ids: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    brand: Mapped["Brand"] = relationship(lazy="selectin")
    variants: Mapped[list["CableVariant"]] = relationship(
        back_populates="cable", lazy="selectin", order_by="CableVariant.sort_order"
    )
    common_specs: Mapped[list["SpecItem"]] = relationship(
        back_populates="cable",
        primaryjoin="and_(Cable.id == SpecItem.cable_id, SpecItem.variant_id.is_(None))",
        order_by="SpecItem.sort_order",
        lazy="selectin",
    )


class CableVariant(Base):
    __tablename__ = "cable_variants"
    __table_args__ = (UniqueConstraint("cable_id", "slug"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cable_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("cables.id", ondelete="CASCADE"), nullable=False
    )
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    cable: Mapped["Cable"] = relationship(back_populates="variants")
    specs: Mapped[list["SpecItem"]] = relationship(
        back_populates="variant",
        order_by="SpecItem.sort_order",
        lazy="selectin",
    )


class SpecItem(Base):
    __tablename__ = "spec_items"
    __table_args__ = (
        CheckConstraint(
            "(spec_type = 'number' AND value_number IS NOT NULL AND value_string IS NULL) "
            "OR (spec_type IN ('enum','string') AND value_string IS NOT NULL AND value_number IS NULL)",
            name="ck_spec_items_value_type",
        ),
        CheckConstraint(
            "spec_type IN ('string','number','enum')",
            name="ck_spec_items_spec_type",
        ),
        Index("idx_spec_items_variant_id", "variant_id"),
        Index("idx_spec_items_cable_common", "cable_id", "variant_id", postgresql_where=text("variant_id IS NULL")),
        Index("idx_spec_items_key_string", "spec_key", "value_string", postgresql_where=text("filterable = TRUE")),
        Index("idx_spec_items_key_number", "spec_key", "value_number", postgresql_where=text("filterable = TRUE")),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cable_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("cables.id", ondelete="CASCADE"), nullable=False
    )
    variant_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("cable_variants.id", ondelete="CASCADE"), nullable=True
    )
    spec_key: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    value_string: Mapped[str | None] = mapped_column()
    value_number: Mapped[float | None] = mapped_column(Numeric(20, 4))
    unit: Mapped[str | None] = mapped_column(String(50))
    spec_type: Mapped[str] = mapped_column(String(20), nullable=False)
    filterable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    cable: Mapped["Cable"] = relationship(back_populates="common_specs")
    variant: Mapped["CableVariant"] = relationship(back_populates="specs")
