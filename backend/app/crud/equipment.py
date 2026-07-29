from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.cable import SpecItem
from app.models.equipment import EquipmentCategory, EquipmentManufacturer, RecommendedEquipment
from app.schemas.equipment import (
    EquipmentCategoryCreate,
    EquipmentCategoryUpdate,
    EquipmentManufacturerCreate,
    EquipmentManufacturerUpdate,
    RecommendedEquipmentCreate,
    RecommendedEquipmentUpdate,
)


class CRUDEquipmentManufacturer(CRUDBase[EquipmentManufacturer, EquipmentManufacturerCreate, EquipmentManufacturerUpdate]):
    pass


class CRUDEquipmentCategory(CRUDBase[EquipmentCategory, EquipmentCategoryCreate, EquipmentCategoryUpdate]):
    async def get_with_children(self, db: AsyncSession, id: str) -> EquipmentCategory | None:
        stmt = select(EquipmentCategory).where(EquipmentCategory.id == id).options(
            selectinload(EquipmentCategory.children)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_top_level_with_children(self, db: AsyncSession) -> list[EquipmentCategory]:
        stmt = select(EquipmentCategory).where(
            EquipmentCategory.parent_id.is_(None)
        ).options(
            selectinload(EquipmentCategory.children)
        ).order_by(EquipmentCategory.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_all_flat(self, db: AsyncSession) -> list[EquipmentCategory]:
        stmt = select(EquipmentCategory).order_by(EquipmentCategory.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())


class CRUDEquipment(CRUDBase[RecommendedEquipment, RecommendedEquipmentCreate, RecommendedEquipmentUpdate]):
    async def get_with_relations(self, db: AsyncSession, id: str) -> RecommendedEquipment | None:
        stmt = select(RecommendedEquipment).where(RecommendedEquipment.id == id).options(
            selectinload(RecommendedEquipment.manufacturer),
            selectinload(RecommendedEquipment.category),
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
    ) -> tuple[list[RecommendedEquipment], int]:
        stmt = select(RecommendedEquipment)
        if q:
            stmt = stmt.where(RecommendedEquipment.model.ilike(f"%{q}%"))
        if category_id is not None:
            stmt = stmt.where(RecommendedEquipment.category_id == category_id)
        if manufacturer_id is not None:
            stmt = stmt.where(RecommendedEquipment.manufacturer_id == manufacturer_id)
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        stmt = stmt.options(
            selectinload(RecommendedEquipment.manufacturer),
            selectinload(RecommendedEquipment.category),
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
    ) -> tuple[list[RecommendedEquipment], int]:
        """List equipment where manufacturer_id == scope_id. For portal routes.

        Eager-loads `manufacturer` and `category` to avoid async lazy-load
        (MissingGreenlet) errors during response serialization.
        Returns (items, total) so the route can build a PaginatedResponse.
        """
        stmt = select(RecommendedEquipment).where(RecommendedEquipment.manufacturer_id == scope_id)
        if search:
            stmt = stmt.where(RecommendedEquipment.model.ilike(f"%{search}%"))
        if category_id:
            stmt = stmt.where(RecommendedEquipment.category_id == category_id)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0

        stmt = (
            stmt.options(
                selectinload(RecommendedEquipment.manufacturer),
                selectinload(RecommendedEquipment.category),
            )
            .order_by(RecommendedEquipment.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all()), total

    async def count_by_manufacturer(self, db: AsyncSession, *, scope_id: str) -> int:
        stmt = (
            select(func.count())
            .select_from(RecommendedEquipment)
            .where(RecommendedEquipment.manufacturer_id == scope_id)
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    async def get_matching_cable(self, db: AsyncSession, cable_id: str) -> list[RecommendedEquipment]:
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

        eq_stmt = select(RecommendedEquipment).options(
            selectinload(RecommendedEquipment.manufacturer),
            selectinload(RecommendedEquipment.category),
        )
        eq_result = await db.execute(eq_stmt)
        all_equipment = list(eq_result.scalars().all())

        matched = []
        for eq in all_equipment:
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


crud_equipment_manufacturer = CRUDEquipmentManufacturer(EquipmentManufacturer)
crud_equipment_category = CRUDEquipmentCategory(EquipmentCategory)
crud_equipment = CRUDEquipment(RecommendedEquipment)
