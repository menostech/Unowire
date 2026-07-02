"""Seed script: read frontend/data/*.json → insert into PostgreSQL.

Usage:
    cd backend && python -m scripts.seed
    cd backend && python -m scripts.seed --dry-run
"""

import argparse
import asyncio
import json
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session, engine
from app.models import *  # noqa: F401, F403
from app.models.cable import Cable, CableVariant, SpecItem
from app.models.equipment import RecommendedEquipment
from app.models.manufacturer import Manufacturer
from app.models.brand import Brand
from app.models.taxonomy import Category, Industry, ProductType

DATA_DIR = Path(__file__).resolve().parents[2] / "frontend" / "data"


def load_json(filename: str):
    path = DATA_DIR / filename
    with open(path, encoding="utf-8") as f:
        return json.load(f)


async def truncate_all(db: AsyncSession):
    """Truncate all tables in reverse FK order."""
    from sqlalchemy import text
    tables = [
        "spec_items", "cable_variants", "cables",
        "recommended_equipments", "product_types", "categories", "industries",
        "brands", "manufacturers", "audit_log", "users",
    ]
    for t in tables:
        await db.execute(text(f'TRUNCATE TABLE "{t}" CASCADE'))
    await db.commit()


async def seed_manufacturers(db: AsyncSession, dry_run: bool):
    data = load_json("manufacturers.json")
    for item in data:
        obj = Manufacturer(
            id=item["id"],
            name=item["name"],
            slug=item["slug"],
            country=item.get("country"),
            website=item.get("website"),
        )
        if dry_run:
            print(f"  + Manufacturer: {obj.id} - {obj.name}")
            continue
        db.add(obj)
    if not dry_run:
        await db.commit()


async def seed_brands(db: AsyncSession, dry_run: bool):
    data = load_json("brands.json")
    for item in data:
        obj = Brand(
            id=item["id"],
            name=item["name"],
            slug=item["slug"],
            manufacturer_id=item["manufacturer_id"],
        )
        if dry_run:
            print(f"  + Brand: {obj.id} - {obj.name}")
            continue
        db.add(obj)
    if not dry_run:
        await db.commit()


async def seed_taxonomy(db: AsyncSession, dry_run: bool):
    data = load_json("taxonomy.json")
    for ind_key, ind_data in data.items():
        industry = Industry(
            id=ind_key,
            label=ind_data["label"],
            slug=ind_data["slug"],
            description=ind_data.get("description"),
        )
        if dry_run:
            print(f"  + Industry: {ind_key} - {ind_data['label']}")
        else:
            db.add(industry)

        for cat_key, cat_data in ind_data["categories"].items():
            category = Category(
                id=f"{ind_key}/{cat_key}",
                industry_id=ind_key,
                label=cat_data["label"],
                slug=cat_data["slug"],
            )
            if dry_run:
                print(f"    + Category: {cat_key} - {cat_data['label']}")
            else:
                db.add(category)

            for pt_key, pt_data in cat_data["product_types"].items():
                product_type = ProductType(
                    id=f"{ind_key}/{cat_key}/{pt_key}",
                    category_id=f"{ind_key}/{cat_key}",
                    label=pt_data["label"],
                    slug=pt_data["slug"],
                    size_system=pt_data["size_system"],
                    filters=pt_data.get("filters", []),
                )
                if dry_run:
                    print(f"      + ProductType: {pt_key} - {pt_data['label']}")
                else:
                    db.add(product_type)
    if not dry_run:
        await db.commit()


async def seed_cables(db: AsyncSession, dry_run: bool):
    data = load_json("cables.json")
    for cable_data in data:
        industry = cable_data["industry"]
        category = cable_data["category"]
        product_type = cable_data["product_type"]

        cable = Cable(
            id=cable_data["id"],
            brand_id=cable_data["brand_id"],
            product_type_id=f"{industry}/{category}/{product_type}",
            model=cable_data["model"],
            slug=cable_data["slug"],
            industry_id=industry,
            category_id=f"{industry}/{category}",
            size_system=cable_data["size_system"],
            base_description=cable_data.get("base_description"),
            meta_title=cable_data.get("meta_title"),
            meta_description=cable_data.get("meta_description"),
            category_ids=cable_data.get("category_ids", []),
        )
        if dry_run:
            print(f"  + Cable: {cable.id} - {cable.model}")
        else:
            db.add(cable)
            await db.flush()

        cable_id = cable.id

        # Common specs
        for i, spec in enumerate(cable_data.get("common_specs", [])):
            spec_item = SpecItem(
                cable_id=cable_id,
                variant_id=None,
                spec_key=spec["key"],
                label=spec["label"],
                value_string=spec.get("value") if spec["type"] in ("enum", "string") else None,
                value_number=spec.get("value") if spec["type"] == "number" else None,
                unit=spec.get("unit"),
                spec_type=spec["type"],
                filterable=spec.get("filterable", False),
                sort_order=i,
            )
            if not dry_run:
                db.add(spec_item)

        # Variants + variant specs
        for v_idx, variant_data in enumerate(cable_data.get("variants", [])):
            variant = CableVariant(
                cable_id=cable_id,
                slug=variant_data["slug"],
                sort_order=v_idx,
            )
            if dry_run:
                variant_id = None
            else:
                db.add(variant)
                await db.flush()
                variant_id = variant.id

            for s_idx, spec in enumerate(variant_data.get("specs", [])):
                spec_item = SpecItem(
                    cable_id=cable_id,
                    variant_id=variant_id,
                    spec_key=spec["key"],
                    label=spec["label"],
                    value_string=spec.get("value") if spec["type"] in ("enum", "string") else None,
                    value_number=spec.get("value") if spec["type"] == "number" else None,
                    unit=spec.get("unit"),
                    spec_type=spec["type"],
                    filterable=spec.get("filterable", False),
                    sort_order=s_idx,
                )
                if not dry_run:
                    db.add(spec_item)

    if not dry_run:
        await db.commit()


async def seed_equipment(db: AsyncSession, dry_run: bool):
    data = load_json("recommended-equipments.json")
    for item in data:
        obj = RecommendedEquipment(
            id=item["id"],
            name=item["name"],
            slug=item["slug"],
            brand=item.get("brand"),
            applicable_specs=item.get("applicable_specs", []),
            description=item.get("description"),
        )
        if dry_run:
            print(f"  + Equipment: {obj.id} - {obj.name}")
            continue
        db.add(obj)
    if not dry_run:
        await db.commit()


async def main(dry_run: bool):
    async with async_session() as db:
        if dry_run:
            print("DRY RUN: no database writes will be performed")
        else:
            print("Truncating all tables...")
            await truncate_all(db)

        print("Seeding manufacturers...")
        await seed_manufacturers(db, dry_run)

        print("Seeding brands...")
        await seed_brands(db, dry_run)

        print("Seeding taxonomy...")
        await seed_taxonomy(db, dry_run)

        print("Seeding cables (with variants + specs)...")
        await seed_cables(db, dry_run)

        print("Seeding recommended equipment...")
        await seed_equipment(db, dry_run)

        print("Seed complete!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed database from JSON files")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without writing to DB")
    args = parser.parse_args()
    asyncio.run(main(dry_run=args.dry_run))
