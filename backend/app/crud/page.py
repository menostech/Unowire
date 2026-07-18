from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.page import Page
from app.schemas.page import PageCreate, PageUpdate


# Reserved slugs that would collide with Next.js static routes or the
# /api/pages/sitemap endpoint. Enforced on create and on slug change.
RESERVED_SLUGS = frozenset({
    "admin", "api", "cables", "cable", "categories",
    "manufacturers", "member", "login", "register", "verify",
    "sitemap",
})


class SlugReservedError(ValueError):
    """Raised when a slug is in the reserved blacklist."""


class SlugConflictError(ValueError):
    """Raised when a slug is already used by another page."""


class CRUDDPage(CRUDBase[Page, PageCreate, PageUpdate]):
    async def assert_slug_not_reserved(self, slug: str) -> None:
        if slug in RESERVED_SLUGS:
            raise SlugReservedError(f"Slug '{slug}' is reserved")

    async def assert_slug_unique(
        self, db: AsyncSession, slug: str, exclude_id: str | None = None
    ) -> None:
        stmt = select(Page).where(Page.slug == slug)
        if exclude_id is not None:
            stmt = stmt.where(Page.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            raise SlugConflictError(f"Slug '{slug}' already exists")

    async def get_by_slug(self, db: AsyncSession, slug: str) -> Page | None:
        result = await db.execute(select(Page).where(Page.slug == slug))
        return result.scalar_one_or_none()

    async def get_public_by_slug(self, db: AsyncSession, slug: str) -> Page | None:
        """Returns page only if status='published' AND is_visible=true."""
        result = await db.execute(
            select(Page).where(
                Page.slug == slug,
                Page.status == "published",
                Page.is_visible.is_(True),
            )
        )
        return result.scalar_one_or_none()

    async def list_paginated(
        self,
        db: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        status_filter: str | None = None,
    ) -> tuple[list[Page], int]:
        stmt = select(Page)
        count_stmt = select(func.count()).select_from(Page)
        if status_filter in ("draft", "published"):
            stmt = stmt.where(Page.status == status_filter)
            count_stmt = count_stmt.where(Page.status == status_filter)
        total = (await db.execute(count_stmt)).scalar() or 0
        stmt = (
            stmt.order_by(Page.sort_order.asc(), Page.updated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all()), total

    async def list_for_sitemap(self, db: AsyncSession) -> list[Page]:
        result = await db.execute(
            select(Page).where(
                Page.status == "published",
                Page.is_visible.is_(True),
            ).order_by(Page.updated_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, db: AsyncSession, *, obj_in: PageCreate) -> Page:
        await self.assert_slug_not_reserved(obj_in.slug)
        await self.assert_slug_unique(db, obj_in.slug)
        obj_data = obj_in.model_dump()
        # Set published_at on creation if status is published
        if obj_data.get("status") == "published":
            obj_data["published_at"] = datetime.utcnow()
        db_obj = self.model(**obj_data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def update(self, db: AsyncSession, *, db_obj: Page, obj_in: PageUpdate) -> Page:
        update_data = obj_in.model_dump(exclude_unset=True)
        # Validate slug change
        if "slug" in update_data and update_data["slug"] != db_obj.slug:
            await self.assert_slug_not_reserved(update_data["slug"])
            await self.assert_slug_unique(db, update_data["slug"], exclude_id=db_obj.id)
        # Capture old status before applying update
        old_status = db_obj.status
        # Apply update
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        # Set published_at on draft -> published transition, only if currently NULL
        new_status = update_data.get("status", old_status)
        if old_status == "draft" and new_status == "published" and db_obj.published_at is None:
            db_obj.published_at = datetime.utcnow()
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj


crud_page = CRUDDPage(Page)
