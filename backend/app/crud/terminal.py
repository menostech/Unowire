from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.cable import SpecItem
from app.models.terminal import Terminal, TerminalCategory, TerminalManufacturer
from app.schemas.terminal import (
    TerminalCategoryCreate,
    TerminalCategoryUpdate,
    TerminalCreate,
    TerminalManufacturerCreate,
    TerminalManufacturerUpdate,
    TerminalUpdate,
)


class CRUDTerminalManufacturer(CRUDBase[TerminalManufacturer, TerminalManufacturerCreate, TerminalManufacturerUpdate]):
    pass


class CRUDTerminalCategory(CRUDBase[TerminalCategory, TerminalCategoryCreate, TerminalCategoryUpdate]):
    async def get_with_children(self, db: AsyncSession, id: str) -> TerminalCategory | None:
        stmt = select(TerminalCategory).where(TerminalCategory.id == id).options(
            selectinload(TerminalCategory.children)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_top_level_with_children(self, db: AsyncSession) -> list[TerminalCategory]:
        stmt = select(TerminalCategory).where(
            TerminalCategory.parent_id.is_(None)
        ).options(
            selectinload(TerminalCategory.children)
        ).order_by(TerminalCategory.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_all_flat(self, db: AsyncSession) -> list[TerminalCategory]:
        stmt = select(TerminalCategory).order_by(TerminalCategory.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())


class CRUDTerminal(CRUDBase[Terminal, TerminalCreate, TerminalUpdate]):
    async def get_with_relations(self, db: AsyncSession, id: str) -> Terminal | None:
        stmt = select(Terminal).where(Terminal.id == id).options(
            selectinload(Terminal.manufacturer),
            selectinload(Terminal.category),
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_with_relations(
        self,
        db: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        category_id: str | None = None,
        manufacturer_id: str | None = None,
        q: str | None = None,
    ) -> tuple[list[Terminal], int]:
        stmt = select(Terminal)
        if q:
            stmt = stmt.where(Terminal.model.ilike(f"%{q}%"))
        if category_id is not None:
            stmt = stmt.where(Terminal.category_id == category_id)
        if manufacturer_id is not None:
            stmt = stmt.where(Terminal.manufacturer_id == manufacturer_id)
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        stmt = stmt.options(
            selectinload(Terminal.manufacturer),
            selectinload(Terminal.category),
        ).offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(stmt)
        return list(result.scalars().all()), total

    async def list_by_manufacturer(
        self,
        db: AsyncSession,
        *,
        scope_id: str,
        skip: int = 0,
        limit: int = 50,
        search: str | None = None,
        category_id: str | None = None,
    ) -> tuple[list[Terminal], int]:
        """List terminals where manufacturer_id == scope_id. For portal routes.

        Eager-loads `manufacturer` and `category` to avoid async lazy-load
        (MissingGreenlet) errors during response serialization.
        Returns (items, total) so the route can build a PaginatedResponse.
        """
        stmt = select(Terminal).where(Terminal.manufacturer_id == scope_id)
        if search:
            stmt = stmt.where(Terminal.model.ilike(f"%{search}%"))
        if category_id:
            stmt = stmt.where(Terminal.category_id == category_id)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0

        stmt = (
            stmt.options(
                selectinload(Terminal.manufacturer),
                selectinload(Terminal.category),
            )
            .order_by(Terminal.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all()), total

    async def count_by_manufacturer(self, db: AsyncSession, *, scope_id: str) -> int:
        stmt = (
            select(func.count())
            .select_from(Terminal)
            .where(Terminal.manufacturer_id == scope_id)
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    async def get_matching_cable(self, db: AsyncSession, cable_id: str) -> list[Terminal]:
        spec_stmt = select(SpecItem).where(
            SpecItem.cable_id == cable_id,
            SpecItem.variant_id.isnot(None),
        )
        spec_result = await db.execute(spec_stmt)
        specs = list(spec_result.scalars().all())

        spec_values: dict[str, list[float | str]] = {}
        for s in specs:
            if s.spec_key not in spec_values:
                spec_values[s.spec_key] = []
            if s.value_number is not None:
                spec_values[s.spec_key].append(s.value_number)
            if s.value_string is not None:
                spec_values[s.spec_key].append(s.value_string)

        eq_stmt = select(Terminal).options(
            selectinload(Terminal.manufacturer),
            selectinload(Terminal.category),
        )
        eq_result = await db.execute(eq_stmt)
        all_terminals = list(eq_result.scalars().all())

        matched = []
        for eq in all_terminals:
            rules = eq.applicable_specs if isinstance(eq.applicable_specs, list) else []
            if not rules:
                continue
            all_match = True
            for rule in rules:
                key = rule.get("spec_key")
                if key not in spec_values:
                    all_match = False
                    break
                vals = spec_values[key]
                if "min" in rule or "max" in rule:
                    numeric_vals = [v for v in vals if isinstance(v, (int, float))]
                    if not numeric_vals:
                        all_match = False
                        break
                    if "min" in rule and not any(v >= rule["min"] for v in numeric_vals):
                        all_match = False
                        break
                    if "max" in rule and not any(v <= rule["max"] for v in numeric_vals):
                        all_match = False
                        break
                if "allowed_values" in rule:
                    if not any(str(v) in rule["allowed_values"] for v in vals):
                        all_match = False
                        break
            if all_match:
                matched.append(eq)

        return matched


crud_terminal_manufacturer = CRUDTerminalManufacturer(TerminalManufacturer)
crud_terminal_category = CRUDTerminalCategory(TerminalCategory)
crud_terminal = CRUDTerminal(Terminal)
