from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.menu import AdminMenuItem
from app.schemas.menu import MenuItemCreate, MenuItemUpdate


# Whitelist of page_id values allowed in the database.
# Must stay in sync with frontend/lib/adminMenuRegistry.ts ADMIN_PAGES.
ALLOWED_PAGE_IDS = {
    "dashboard",
    "cables",
    "manufacturers",
    "industries",
    "equipment-mfrs",
    "equipment-cats",
    "equipment-list",
    "media",
    "menu-config",
    "users",
    "roles",
    "inquiries",
    "email_config",
    "members",
    "messages",
}

# IDs that cannot be deleted (would lock admin out of menu editor).
PROTECTED_IDS = {"menu-config"}


class CRUDMenuItem(CRUDBase[AdminMenuItem, MenuItemCreate, MenuItemUpdate]):
    async def get_tree(self, db: AsyncSession, only_visible: bool = True) -> list[AdminMenuItem]:
        """Return top-level items with their children eagerly loaded."""
        stmt = (
            select(AdminMenuItem)
            .where(AdminMenuItem.parent_id.is_(None))
            .options(selectinload(AdminMenuItem.children))
            .order_by(AdminMenuItem.sort_order)
        )
        if only_visible:
            stmt = stmt.where(AdminMenuItem.is_visible.is_(True))
        result = await db.execute(stmt)
        top_level = list(result.scalars().all())
        if only_visible:
            # Filter hidden children in Python (selectinload already loaded them).
            for item in top_level:
                item.children = [c for c in item.children if c.is_visible]
        return top_level

    async def get_flat(self, db: AsyncSession) -> list[AdminMenuItem]:
        """Return all items flat, ordered for tree display."""
        stmt = (
            select(AdminMenuItem)
            .order_by(AdminMenuItem.parent_id.asc().nullsfirst(), AdminMenuItem.sort_order)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_with_children(self, db: AsyncSession, id: str) -> AdminMenuItem | None:
        stmt = (
            select(AdminMenuItem)
            .where(AdminMenuItem.id == id)
            .options(selectinload(AdminMenuItem.children))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def validate_parent(self, db: AsyncSession, parent_id: str | None) -> None:
        """Validate hierarchy rules. Raises HTTPException(422) on violation."""
        if parent_id is None:
            return
        parent = await self.get(db, parent_id)
        if parent is None:
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": "Parent menu item not found"},
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

    async def validate_page_id(self, page_id: str | None) -> None:
        """Validate page_id is in the whitelist. Raises HTTPException(422)."""
        if page_id is not None and page_id not in ALLOWED_PAGE_IDS:
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": "Unknown page_id"},
            )

    async def validate_type_fields(
        self, type_: str, page_id: str | None, url: str | None
    ) -> None:
        """Validate type-conditional fields. Raises HTTPException(422)."""
        if type_ == "page":
            if not page_id:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "page_id is required when type is 'page'"},
                )
            if url is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "url must be null when type is 'page'"},
                )
        elif type_ == "link":
            if not url:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "url is required when type is 'link'"},
                )
            if page_id is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "page_id must be null when type is 'link'"},
                )
        elif type_ == "group":
            if page_id is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "page_id must be null when type is 'group'"},
                )
            if url is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "url must be null when type is 'group'"},
                )

    async def assert_not_protected(self, id: str) -> None:
        """Raise 403 if the item is protected from deletion."""
        if id in PROTECTED_IDS:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete protected menu item"},
            )

    async def create(self, db: AsyncSession, *, obj_in: MenuItemCreate) -> AdminMenuItem:
        await self.validate_parent(db, obj_in.parent_id)
        await self.validate_page_id(obj_in.page_id)
        await self.validate_type_fields(obj_in.type, obj_in.page_id, obj_in.url)
        return await super().create(db, obj_in=obj_in)

    async def update(
        self, db: AsyncSession, *, db_obj: AdminMenuItem, obj_in: MenuItemUpdate
    ) -> AdminMenuItem:
        update_data = obj_in.model_dump(exclude_unset=True)
        # Merge onto existing for validation.
        new_type = update_data.get("type", db_obj.type)
        new_page_id = update_data.get("page_id", db_obj.page_id)
        new_url = update_data.get("url", db_obj.url)
        new_parent_id = update_data.get("parent_id", db_obj.parent_id)

        await self.validate_parent(db, new_parent_id)
        await self.validate_page_id(new_page_id)
        await self.validate_type_fields(new_type, new_page_id, new_url)

        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def move(
        self, db: AsyncSession, id: str, direction: Literal["up", "down"]
    ) -> AdminMenuItem:
        """Swap sort_order with adjacent sibling. Raises 400 at boundary."""
        item = await self.get(db, id)
        if item is None:
            raise HTTPException(
                status_code=404,
                detail={"code": 404, "message": "Menu item not found"},
            )
        # Find siblings (same parent_id), ordered by sort_order.
        if item.parent_id is None:
            parent_filter = AdminMenuItem.parent_id.is_(None)
        else:
            parent_filter = AdminMenuItem.parent_id == item.parent_id
        stmt = (
            select(AdminMenuItem)
            .where(parent_filter)
            .order_by(AdminMenuItem.sort_order)
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


crud_menu_item = CRUDMenuItem(AdminMenuItem)
