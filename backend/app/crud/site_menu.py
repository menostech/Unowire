from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.site_menu import SiteMenuItem
from app.schemas.site_menu import SiteMenuItemCreate, SiteMenuItemUpdate


class CRUDSiteMenuItem(CRUDBase[SiteMenuItem, SiteMenuItemCreate, SiteMenuItemUpdate]):
    async def get_flat(self, db: AsyncSession, location: str | None = None) -> list[SiteMenuItem]:
        """Flat list ordered for tree display."""
        stmt = select(SiteMenuItem).order_by(
            SiteMenuItem.location,
            SiteMenuItem.parent_id.asc().nullsfirst(),
            SiteMenuItem.sort_order,
        )
        if location is not None:
            stmt = stmt.where(SiteMenuItem.location == location)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_tree(
        self, db: AsyncSession, location: str, include_hidden: bool = False
    ) -> list[SiteMenuItem]:
        """Top-level items with children eagerly loaded."""
        stmt = (
            select(SiteMenuItem)
            .where(SiteMenuItem.location == location)
            .where(SiteMenuItem.parent_id.is_(None))
            .options(selectinload(SiteMenuItem.children))
            .order_by(SiteMenuItem.sort_order)
        )
        if not include_hidden:
            stmt = stmt.where(SiteMenuItem.is_visible.is_(True))
        result = await db.execute(stmt)
        top_level = list(result.scalars().all())
        if not include_hidden:
            # Filter hidden children in Python (selectinload already loaded them).
            for item in top_level:
                item.children = [c for c in item.children if c.is_visible]
        return top_level

    async def validate_parent(
        self, db: AsyncSession, parent_id: str | None, location: str
    ) -> None:
        """Validate hierarchy rules. Raises HTTPException(422) on violation."""
        if parent_id is None:
            return
        parent = await self.get(db, parent_id)
        if parent is None:
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": "Parent menu item not found"},
            )
        if parent.location != location:
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": "Parent must be in the same location"},
            )
        if parent.type != "group":
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": "Parent must be a group type"},
            )
        if parent.parent_id is not None:
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": "Maximum depth is 2 levels"},
            )

    async def validate_type_fields(
        self, type_: str, url: str | None
    ) -> None:
        """Validate type-conditional fields. Raises HTTPException(422)."""
        if type_ == "link":
            if not url:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "url is required when type is 'link'"},
                )
        elif type_ == "group":
            if url is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "url must be null when type is 'group'"},
                )

    async def create(self, db: AsyncSession, *, obj_in: SiteMenuItemCreate) -> SiteMenuItem:
        await self.validate_parent(db, obj_in.parent_id, obj_in.location)
        await self.validate_type_fields(obj_in.type, obj_in.url)
        return await super().create(db, obj_in=obj_in)

    async def update(
        self, db: AsyncSession, *, db_obj: SiteMenuItem, obj_in: SiteMenuItemUpdate
    ) -> SiteMenuItem:
        update_data = obj_in.model_dump(exclude_unset=True)
        # Merge onto existing for validation.
        new_location = update_data.get("location", db_obj.location)
        new_type = update_data.get("type", db_obj.type)
        new_url = update_data.get("url", db_obj.url)
        new_parent_id = update_data.get("parent_id", db_obj.parent_id)

        await self.validate_parent(db, new_parent_id, new_location)
        await self.validate_type_fields(new_type, new_url)

        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def move(
        self, db: AsyncSession, id: str, direction: Literal["up", "down"]
    ) -> SiteMenuItem:
        """Swap sort_order with adjacent sibling. Raises 400 at boundary."""
        item = await self.get(db, id)
        if item is None:
            raise HTTPException(
                status_code=404,
                detail={"code": 404, "message": "Menu item not found"},
            )
        # Find siblings (same parent_id AND same location), ordered by sort_order.
        if item.parent_id is None:
            parent_filter = SiteMenuItem.parent_id.is_(None)
        else:
            parent_filter = SiteMenuItem.parent_id == item.parent_id
        stmt = (
            select(SiteMenuItem)
            .where(parent_filter)
            .where(SiteMenuItem.location == item.location)
            .order_by(SiteMenuItem.sort_order, SiteMenuItem.id)
        )
        result = await db.execute(stmt)
        siblings = list(result.scalars().all())
        idx = next((i for i, s in enumerate(siblings) if s.id == id), -1)
        if idx == -1:
            raise HTTPException(
                status_code=404,
                detail={"code": 404, "message": "Menu item not found in siblings"},
            )
        if direction == "up":
            if idx == 0:
                raise HTTPException(
                    status_code=400,
                    detail={"code": 400, "message": "Already at top of siblings"},
                )
            swap = siblings[idx - 1]
        else:  # "down"
            if idx == len(siblings) - 1:
                raise HTTPException(
                    status_code=400,
                    detail={"code": 400, "message": "Already at bottom of siblings"},
                )
            swap = siblings[idx + 1]
        item.sort_order, swap.sort_order = swap.sort_order, item.sort_order
        db.add_all([item, swap])
        await db.commit()
        await db.refresh(item)
        return item


crud_site_menu = CRUDSiteMenuItem(SiteMenuItem)
