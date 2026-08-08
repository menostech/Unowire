from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.resource import Resource, ResourceCategory
from app.schemas.resource import (
    ResourceCategoryCreate,
    ResourceCategoryUpdate,
    ResourceCreate,
    ResourceUpdate,
)


class CRUDResourceCategory(CRUDBase[ResourceCategory, ResourceCategoryCreate, ResourceCategoryUpdate]):
    async def get_with_children(self, db: AsyncSession, id: str) -> ResourceCategory | None:
        stmt = select(ResourceCategory).where(ResourceCategory.id == id).options(
            selectinload(ResourceCategory.children)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_top_level_with_children(self, db: AsyncSession) -> list[ResourceCategory]:
        stmt = select(ResourceCategory).where(
            ResourceCategory.parent_id.is_(None)
        ).options(
            selectinload(ResourceCategory.children)
        ).order_by(ResourceCategory.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_all_flat(self, db: AsyncSession) -> list[ResourceCategory]:
        stmt = select(ResourceCategory).order_by(ResourceCategory.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())


class CRUDResource(CRUDBase[Resource, ResourceCreate, ResourceUpdate]):
    async def get_with_relations(self, db: AsyncSession, id: str) -> Resource | None:
        stmt = select(Resource).where(Resource.id == id).options(
            selectinload(Resource.category),
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_slug(self, db: AsyncSession, slug: str) -> Resource | None:
        stmt = select(Resource).where(Resource.slug == slug).options(
            selectinload(Resource.category),
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_with_relations(
        self,
        db: AsyncSession,
        *,
        page: int = 1,
        page_size: int = 20,
        category_id: str | None = None,
        scope_type: str | None = None,
        scope_id: str | None = None,
        q: str | None = None,
        is_published: bool | None = None,
    ) -> tuple[list[Resource], int]:
        """Paginated list with optional filters. When `category_id` is a root,
        also matches its children's resources."""
        stmt = select(Resource)
        if q:
            stmt = stmt.where(
                or_(
                    Resource.title.ilike(f"%{q}%"),
                    Resource.description.ilike(f"%{q}%"),
                )
            )
        if category_id is not None:
            # Query child category IDs first, then filter resources where
            # category_id IN [root_id, ...child_ids].
            child_stmt = select(ResourceCategory.id).where(
                ResourceCategory.parent_id == category_id
            )
            child_result = await db.execute(child_stmt)
            matching_ids = [category_id] + [row[0] for row in child_result.all()]
            stmt = stmt.where(Resource.category_id.in_(matching_ids))
        if scope_type is not None:
            stmt = stmt.where(Resource.scope_type == scope_type)
        if scope_id is not None:
            stmt = stmt.where(Resource.scope_id == scope_id)
        if is_published is not None:
            stmt = stmt.where(Resource.is_published == is_published)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0

        stmt = stmt.options(
            selectinload(Resource.category),
        ).offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(stmt)
        return list(result.scalars().all()), total

    async def list_by_scope(
        self,
        db: AsyncSession,
        *,
        scope_type: str,
        scope_id: str,
        skip: int = 0,
        limit: int = 50,
        search: str | None = None,
        category_id: str | None = None,
    ) -> tuple[list[Resource], int]:
        """List resources where scope_type AND scope_id match. For portal routes.

        Eager-loads `category` to avoid async lazy-load (MissingGreenlet) errors
        during response serialization. Returns (items, total).
        """
        stmt = select(Resource).where(
            Resource.scope_type == scope_type,
            Resource.scope_id == scope_id,
        )
        if search:
            stmt = stmt.where(Resource.title.ilike(f"%{search}%"))
        if category_id:
            stmt = stmt.where(Resource.category_id == category_id)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0

        stmt = (
            stmt.options(selectinload(Resource.category))
            .order_by(Resource.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all()), total

    async def increment_download_count(self, db: AsyncSession, id: str) -> None:
        """Atomically increment the download counter for a resource."""
        stmt = (
            update(Resource)
            .where(Resource.id == id)
            .values(download_count=Resource.download_count + 1)
        )
        await db.execute(stmt)
        await db.commit()


crud_resource_category = CRUDResourceCategory(ResourceCategory)
crud_resource = CRUDResource(Resource)
