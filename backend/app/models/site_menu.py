from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SiteMenuItem(Base):
    __tablename__ = "site_menu_items"
    __table_args__ = (
        CheckConstraint(
            "location IN ('header', 'footer')",
            name="ck_site_menu_items_location",
        ),
        CheckConstraint(
            "type IN ('link', 'group')",
            name="ck_site_menu_items_type",
        ),
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    location: Mapped[str] = mapped_column(String(20), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(
        String(100),
        ForeignKey("site_menu_items.id", ondelete="CASCADE"),
        nullable=True,
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    parent: Mapped["SiteMenuItem | None"] = relationship(
        "SiteMenuItem",
        back_populates="children",
        remote_side="SiteMenuItem.id",
    )
    children: Mapped[list["SiteMenuItem"]] = relationship(
        "SiteMenuItem",
        back_populates="parent",
        order_by="SiteMenuItem.sort_order",
        cascade="all, delete-orphan",
    )
