from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EquipmentManufacturer(Base):
    __tablename__ = "equipment_manufacturers"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    country: Mapped[str | None] = mapped_column(String(100))
    website: Mapped[str | None] = mapped_column(String(500))
    image_url: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    founded_year: Mapped[int | None] = mapped_column(Integer)
    address: Mapped[str | None] = mapped_column(String(500))
    phone: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    equipments: Mapped[list["RecommendedEquipment"]] = relationship(
        back_populates="manufacturer"
    )


class EquipmentCategory(Base):
    __tablename__ = "equipment_categories"
    __table_args__ = (UniqueConstraint("parent_id", "slug"),)

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    parent_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("equipment_categories.id", ondelete="CASCADE")
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    parent: Mapped["EquipmentCategory | None"] = relationship(
        back_populates="children", remote_side="EquipmentCategory.id"
    )
    children: Mapped[list["EquipmentCategory"]] = relationship(
        back_populates="parent", order_by="EquipmentCategory.sort_order"
    )
    equipments: Mapped[list["RecommendedEquipment"]] = relationship(
        back_populates="category"
    )


class RecommendedEquipment(Base):
    __tablename__ = "recommended_equipments"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    manufacturer_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("equipment_manufacturers.id", ondelete="RESTRICT"), nullable=False
    )
    category_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("equipment_categories.id", ondelete="RESTRICT"), nullable=False
    )
    model: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    applicable_specs: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    external_url: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    manufacturer: Mapped[EquipmentManufacturer] = relationship(
        back_populates="equipments"
    )
    category: Mapped[EquipmentCategory] = relationship(
        back_populates="equipments"
    )
