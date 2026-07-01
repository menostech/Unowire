from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.cable import Cable, CableVariant, SpecItem
from app.models.equipment import RecommendedEquipment
from app.schemas.cable import (
    BrandFacet,
    CableCreate,
    CableFilterParams,
    CableUpdate,
    FilterFacets,
    ManufacturerFacet,
    OuterDiameterFacet,
    SizeFacet,
    SizeRangeFacet,
    SpecFacetValue,
)


class CRUDCable(CRUDBase[Cable, CableCreate, CableUpdate]):
    async def get_detail(self, db: AsyncSession, id: str) -> Cable | None:
        stmt = select(Cable).where(Cable.id == id).options(
            selectinload(Cable.brand).selectinload(
                Cable.brand.property.mapper.relationships["manufacturer"].mapper.class_
            ),
            selectinload(Cable.variants).selectinload(CableVariant.specs),
            selectinload(Cable.common_specs),
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_url(self, db: AsyncSession, brand_slug: str, cable_slug: str) -> Cable | None:
        from app.models.brand import Brand

        stmt = (
            select(Cable)
            .join(Brand, Cable.brand_id == Brand.id)
            .where(Brand.slug == brand_slug, Cable.slug == cable_slug)
            .options(
                selectinload(Cable.brand).selectinload(
                    Cable.brand.property.mapper.relationships["manufacturer"].mapper.class_
                ),
                selectinload(Cable.variants).selectinload(CableVariant.specs),
                selectinload(Cable.common_specs),
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_filtered(
        self, db: AsyncSession, params: CableFilterParams
    ) -> tuple[list[Cable], int, FilterFacets]:
        # Base query
        stmt = select(Cable)
        count_stmt = select(func.count()).select_from(Cable)

        # Apply taxonomy filters
        if params.industry:
            stmt = stmt.where(Cable.industry_id == params.industry)
            count_stmt = count_stmt.where(Cable.industry_id == params.industry)
        if params.category:
            stmt = stmt.where(Cable.category_id == params.category)
            count_stmt = count_stmt.where(Cable.category_id == params.category)
        if params.product_type:
            stmt = stmt.where(Cable.product_type_id == params.product_type)
            count_stmt = count_stmt.where(Cable.product_type_id == params.product_type)

        # Text search
        if params.q:
            search_filter = or_(
                Cable.model.ilike(f"%{params.q}%"),
                Cable.base_description.ilike(f"%{params.q}%"),
            )
            stmt = stmt.where(search_filter)
            count_stmt = count_stmt.where(search_filter)

        # Manufacturer / brand filters
        if params.manufacturer:
            from app.models.brand import Brand
            stmt = stmt.join(Brand, Cable.brand_id == Brand.id).where(
                Brand.manufacturer_id.in_(params.manufacturer)
            )
            count_stmt = count_stmt.join(Brand, Cable.brand_id == Brand.id).where(
                Brand.manufacturer_id.in_(params.manufacturer)
            )
        if params.brand:
            stmt = stmt.where(Cable.brand_id.in_(params.brand))
            count_stmt = count_stmt.where(Cable.brand_id.in_(params.brand))

        # Size filters via spec_items subquery
        if params.size:
            size_sub = (
                select(SpecItem.cable_id)
                .where(
                    SpecItem.spec_key == "size",
                    SpecItem.value_string.in_(params.size),
                    SpecItem.variant_id.isnot(None),
                )
                .group_by(SpecItem.cable_id)
                .having(func.count(func.distinct(SpecItem.value_string)) == len(params.size))
            )
            stmt = stmt.where(Cable.id.in_(size_sub))
            count_stmt = count_stmt.where(Cable.id.in_(size_sub))

        if params.min_size is not None or params.max_size is not None:
            size_range_sub = select(SpecItem.cable_id).where(
                SpecItem.spec_key == "size",
                SpecItem.variant_id.isnot(None),
                SpecItem.value_number.isnot(None),
            )
            if params.min_size is not None:
                size_range_sub = size_range_sub.where(SpecItem.value_number >= params.min_size)
            if params.max_size is not None:
                size_range_sub = size_range_sub.where(SpecItem.value_number <= params.max_size)
            stmt = stmt.where(Cable.id.in_(size_range_sub))
            count_stmt = count_stmt.where(Cable.id.in_(size_range_sub))

        # Outer diameter filter
        if params.min_od is not None or params.max_od is not None:
            od_sub = select(SpecItem.cable_id).where(
                SpecItem.spec_key == "outer_diameter",
                SpecItem.value_number.isnot(None),
            )
            if params.min_od is not None:
                od_sub = od_sub.where(SpecItem.value_number >= params.min_od)
            if params.max_od is not None:
                od_sub = od_sub.where(SpecItem.value_number <= params.max_od)
            stmt = stmt.where(Cable.id.in_(od_sub))
            count_stmt = count_stmt.where(Cable.id.in_(od_sub))

        # Config-driven spec filters
        if params.spec_filters:
            for spec_key, values in params.spec_filters.items():
                sub = (
                    select(SpecItem.cable_id)
                    .where(
                        SpecItem.spec_key == spec_key,
                        SpecItem.value_string.in_(values),
                    )
                    .group_by(SpecItem.cable_id)
                    .having(func.count(func.distinct(SpecItem.value_string)) == len(values))
                )
                stmt = stmt.where(Cable.id.in_(sub))
                count_stmt = count_stmt.where(Cable.id.in_(sub))

        # Get total count
        total = (await db.execute(count_stmt)).scalar() or 0

        # Build facets on the filtered set (before pagination)
        facets = await self._build_facets(db, stmt, params)

        # Pagination
        stmt = stmt.options(
            selectinload(Cable.brand),
            selectinload(Cable.variants).selectinload(CableVariant.specs),
            selectinload(Cable.common_specs),
        ).offset((params.page - 1) * params.page_size).limit(params.page_size)

        result = await db.execute(stmt)
        cables = list(result.scalars().all())

        return cables, total, facets

    async def _build_facets(
        self, db: AsyncSession, base_stmt, params: CableFilterParams
    ) -> FilterFacets:
        from app.models.brand import Brand
        from app.models.manufacturer import Manufacturer

        # Get cable IDs from the base query
        cable_id_sub = base_stmt.with_only_columns(Cable.id)
        cable_ids_result = await db.execute(cable_id_sub)
        cable_ids = [row[0] for row in cable_ids_result.all()]

        if not cable_ids:
            return FilterFacets()

        # Manufacturer facets
        mfr_stmt = (
            select(Manufacturer.id, Manufacturer.name, func.count(Cable.id.distinct()))
            .join(Brand, Brand.manufacturer_id == Manufacturer.id)
            .join(Cable, Cable.brand_id == Brand.id)
            .where(Cable.id.in_(cable_ids))
            .group_by(Manufacturer.id, Manufacturer.name)
        )
        mfr_result = await db.execute(mfr_stmt)
        manufacturers = [
            ManufacturerFacet(id=row[0], name=row[1], count=row[2])
            for row in mfr_result.all()
        ]

        # Brand facets
        brand_stmt = (
            select(Brand.id, Brand.name, func.count(Cable.id.distinct()))
            .join(Brand, Cable.brand_id == Brand.id)
            .where(Cable.id.in_(cable_ids))
            .group_by(Brand.id, Brand.name)
        )
        brand_result = await db.execute(brand_stmt)
        brands = [
            BrandFacet(id=row[0], name=row[1], count=row[2])
            for row in brand_result.all()
        ]

        # Size facets
        size_stmt = (
            select(SpecItem.value_string, func.count(func.distinct(SpecItem.cable_id)))
            .where(
                SpecItem.cable_id.in_(cable_ids),
                SpecItem.spec_key == "size",
                SpecItem.variant_id.isnot(None),
                SpecItem.value_string.isnot(None),
            )
            .group_by(SpecItem.value_string)
        )
        size_result = await db.execute(size_stmt)
        size_facets = [
            SizeFacet(value=row[0], count=row[1])
            for row in size_result.all()
        ]

        # Size range
        size_range_stmt = select(
            func.min(SpecItem.value_number), func.max(SpecItem.value_number)
        ).where(
            SpecItem.cable_id.in_(cable_ids),
            SpecItem.spec_key == "size",
            SpecItem.variant_id.isnot(None),
            SpecItem.value_number.isnot(None),
        )
        sr_result = await db.execute(size_range_stmt)
        sr_row = sr_result.one_or_none()
        size_range = SizeRangeFacet(min=sr_row[0], max=sr_row[1]) if sr_row and sr_row[0] is not None else None

        # Outer diameter range
        od_stmt = select(
            func.min(SpecItem.value_number), func.max(SpecItem.value_number)
        ).where(
            SpecItem.cable_id.in_(cable_ids),
            SpecItem.spec_key == "outer_diameter",
            SpecItem.value_number.isnot(None),
        )
        od_result = await db.execute(od_stmt)
        od_row = od_result.one_or_none()
        outer_diameter = OuterDiameterFacet(min=od_row[0], max=od_row[1]) if od_row and od_row[0] is not None else None

        # Spec facets (config-driven enum filters)
        spec_facets: dict[str, list[SpecFacetValue]] = {}
        # Get all distinct filterable spec_key + value_string pairs
        enum_spec_stmt = (
            select(SpecItem.spec_key, SpecItem.value_string, func.count(func.distinct(SpecItem.cable_id)))
            .where(
                SpecItem.cable_id.in_(cable_ids),
                SpecItem.filterable == True,
                SpecItem.value_string.isnot(None),
                SpecItem.spec_key != "size",
            )
            .group_by(SpecItem.spec_key, SpecItem.value_string)
        )
        enum_result = await db.execute(enum_spec_stmt)
        for row in enum_result.all():
            key = row[0]
            if key not in spec_facets:
                spec_facets[key] = []
            spec_facets[key].append(SpecFacetValue(value=row[1], count=row[2]))

        return FilterFacets(
            manufacturers=manufacturers,
            brands=brands,
            size=size_facets,
            size_range=size_range,
            spec_facets=spec_facets,
            outer_diameter=outer_diameter,
        )


crud_cable = CRUDCable(Cable)
