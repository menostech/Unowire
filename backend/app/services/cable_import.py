import csv
import io
import json
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand import Brand
from app.models.cable import Cable
from app.models.taxonomy import Category, Industry, ProductType
from app.schemas.cable import CableCreate, CableVariantCreate, SpecItemCreate
from app.schemas.cable_import import ImportPreview, ImportPreviewRow

MAX_IMPORT_SIZE = 5 * 1024 * 1024  # 5MB
MAX_ROWS = 500
MAX_FOLDER_DEPTH = 5  # not used here, kept for parity with spec context

REQUIRED_CSV_COLUMNS = {
    "id", "model", "slug", "brand_id", "industry_id",
    "category_id", "product_type_id", "size_system",
}
VALID_SIZE_SYSTEMS = {"awg", "mm2", "kcmil", "none"}
VALID_SPEC_TYPES = {"string", "number", "enum"}


class ParsedRow:
    """Intermediate representation of a parsed row, before validation."""
    def __init__(self, row_number: int, data: dict[str, Any], parse_errors: list[str] | None = None):
        self.row_number = row_number
        self.data = data
        self.parse_errors = parse_errors or []


class ValidatedRow:
    """Result of validating a parsed row."""
    def __init__(
        self,
        row_number: int,
        status: Literal["valid", "skipped", "error"],
        id: str | None,
        model: str | None,
        errors: list[str] | None = None,
        cable_create: CableCreate | None = None,
    ):
        self.row_number = row_number
        self.status = status
        self.id = id
        self.model = model
        self.errors = errors or []
        self.cable_create = cable_create  # Only set for valid rows


def parse_file(content: bytes, format: Literal["csv", "json"]) -> list[ParsedRow]:
    """Parse file content into a list of ParsedRow.
    Does not validate against DB; only decodes format and extracts raw data.
    """
    if not content:
        raise HTTPException(status_code=400, detail="File is empty")

    if len(content) > MAX_IMPORT_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 5MB)")

    rows: list[ParsedRow] = []

    if format == "csv":
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        if reader.fieldnames is None:
            raise HTTPException(status_code=400, detail="CSV file has no header row")

        missing = REQUIRED_CSV_COLUMNS - set(reader.fieldnames)
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required columns: {', '.join(sorted(missing))}",
            )

        for idx, raw in enumerate(reader, start=1):
            # Skip fully blank rows
            if not raw or all((v is None or v == "") for v in raw.values()):
                continue
            rows.append(ParsedRow(row_number=idx, data=dict(raw)))

    elif format == "json":
        try:
            parsed = json.loads(content.decode("utf-8-sig"))
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {e.msg}")

        if not isinstance(parsed, list):
            raise HTTPException(status_code=400, detail="JSON must be an array")

        for idx, item in enumerate(parsed, start=1):
            if not isinstance(item, dict):
                rows.append(ParsedRow(row_number=idx, data={}, parse_errors=[f"Row {idx}: expected object"]))
                continue
            rows.append(ParsedRow(row_number=idx, data=item))

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")

    if len(rows) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")

    return rows


def _validate_spec(spec_data: dict[str, Any], row_number: int, spec_index: int) -> tuple[SpecItemCreate | None, list[str]]:
    """Validate a single spec item. Returns (parsed_spec_or_none, errors)."""
    errors: list[str] = []
    spec_key = spec_data.get("spec_key")
    label = spec_data.get("label")
    spec_type = spec_data.get("spec_type")

    if not spec_key:
        errors.append(f"Row {row_number}: spec {spec_index} missing spec_key")
    if not label:
        errors.append(f"Row {row_number}: spec {spec_index} missing label")
    if spec_type not in VALID_SPEC_TYPES:
        errors.append(f"Row {row_number}: spec {spec_index} invalid spec_type '{spec_type}' (must be {', '.join(sorted(VALID_SPEC_TYPES))})")

    if errors:
        return None, errors

    value_string = spec_data.get("value_string")
    value_number = spec_data.get("value_number")

    if spec_type == "number" and value_number is None:
        errors.append(f"Row {row_number}: spec {spec_index} spec_type 'number' requires value_number")
    if spec_type in ("string", "enum") and not value_string:
        errors.append(f"Row {row_number}: spec {spec_index} spec_type '{spec_type}' requires value_string")

    if errors:
        return None, errors

    try:
        return SpecItemCreate(
            spec_key=spec_key,
            label=label,
            value_string=value_string,
            value_number=value_number,
            unit=spec_data.get("unit"),
            spec_type=spec_type,
            filterable=bool(spec_data.get("filterable", False)),
            sort_order=int(spec_data.get("sort_order", 0)),
        ), []
    except Exception as e:
        return None, [f"Row {row_number}: spec {spec_index} invalid: {e}"]


def _validate_variant(variant_data: dict[str, Any], row_number: int, var_index: int) -> tuple[CableVariantCreate | None, list[str]]:
    """Validate a single variant + its specs. Returns (parsed_variant_or_none, errors)."""
    errors: list[str] = []
    slug = variant_data.get("slug")
    if not slug:
        errors.append(f"Row {row_number}: variant {var_index} missing slug")

    specs_raw = variant_data.get("specs", [])
    if not isinstance(specs_raw, list):
        errors.append(f"Row {row_number}: variant {var_index} specs must be a list")
        specs_raw = []

    specs: list[SpecItemCreate] = []
    for s_idx, spec_data in enumerate(specs_raw):
        if not isinstance(spec_data, dict):
            errors.append(f"Row {row_number}: variant {var_index} spec {s_idx} must be an object")
            continue
        spec, spec_errors = _validate_spec(spec_data, row_number, s_idx)
        errors.extend(spec_errors)
        if spec is not None:
            specs.append(spec)

    if errors:
        return None, errors

    try:
        return CableVariantCreate(
            slug=slug,
            sort_order=int(variant_data.get("sort_order", 0)),
            specs=specs,
        ), []
    except Exception as e:
        return None, [f"Row {row_number}: variant {var_index} invalid: {e}"]


def _validate_cable_fields(data: dict[str, Any], row_number: int) -> tuple[CableCreate | None, list[str]]:
    """Layer 2: validate cable fields + nested specs/variants via Pydantic schemas."""
    errors: list[str] = []

    cable_id = data.get("id")
    model = data.get("model")
    slug = data.get("slug")
    brand_id = data.get("brand_id")
    industry_id = data.get("industry_id")
    category_id = data.get("category_id")
    product_type_id = data.get("product_type_id")
    size_system = data.get("size_system")

    if not cable_id:
        errors.append(f"Row {row_number}: missing required field 'id'")
    if not model:
        errors.append(f"Row {row_number}: missing required field 'model'")
    if not slug:
        errors.append(f"Row {row_number}: missing required field 'slug'")
    if not brand_id:
        errors.append(f"Row {row_number}: missing required field 'brand_id'")
    if not industry_id:
        errors.append(f"Row {row_number}: missing required field 'industry_id'")
    if not category_id:
        errors.append(f"Row {row_number}: missing required field 'category_id'")
    if not product_type_id:
        errors.append(f"Row {row_number}: missing required field 'product_type_id'")
    if not size_system:
        errors.append(f"Row {row_number}: missing required field 'size_system'")
    elif size_system not in VALID_SIZE_SYSTEMS:
        errors.append(f"Row {row_number}: invalid size_system '{size_system}' (must be {', '.join(sorted(VALID_SIZE_SYSTEMS))})")

    # category_ids (optional)
    category_ids_raw = data.get("category_ids", [])
    if isinstance(category_ids_raw, str):
        if category_ids_raw == "":
            category_ids = []
        else:
            try:
                category_ids = json.loads(category_ids_raw)
                if not isinstance(category_ids, list):
                    errors.append(f"Row {row_number}: category_ids must be a JSON array string")
                    category_ids = []
            except json.JSONDecodeError:
                errors.append(f"Row {row_number}: category_ids is not valid JSON")
                category_ids = []
    elif isinstance(category_ids_raw, list):
        category_ids = category_ids_raw
    elif category_ids_raw is None:
        category_ids = []
    else:
        errors.append(f"Row {row_number}: category_ids must be a JSON array string or list")
        category_ids = []

    if errors:
        return None, errors

    # Validate nested common_specs
    common_specs_raw = data.get("common_specs", [])
    if not isinstance(common_specs_raw, list):
        errors.append(f"Row {row_number}: common_specs must be a list")
        common_specs_raw = []
    common_specs: list[SpecItemCreate] = []
    for s_idx, spec_data in enumerate(common_specs_raw):
        if not isinstance(spec_data, dict):
            errors.append(f"Row {row_number}: common_specs {s_idx} must be an object")
            continue
        spec, spec_errors = _validate_spec(spec_data, row_number, s_idx)
        errors.extend(spec_errors)
        if spec is not None:
            common_specs.append(spec)

    # Validate nested variants
    variants_raw = data.get("variants", [])
    if not isinstance(variants_raw, list):
        errors.append(f"Row {row_number}: variants must be a list")
        variants_raw = []
    variants: list[CableVariantCreate] = []
    for v_idx, variant_data in enumerate(variants_raw):
        if not isinstance(variant_data, dict):
            errors.append(f"Row {row_number}: variant {v_idx} must be an object")
            continue
        variant, variant_errors = _validate_variant(variant_data, row_number, v_idx)
        errors.extend(variant_errors)
        if variant is not None:
            variants.append(variant)

    if errors:
        return None, errors

    try:
        cable_create = CableCreate(
            id=cable_id,
            model=model,
            slug=slug,
            brand_id=brand_id,
            industry_id=industry_id,
            category_id=category_id,
            product_type_id=product_type_id,
            size_system=size_system,
            base_description=data.get("base_description"),
            meta_title=data.get("meta_title"),
            meta_description=data.get("meta_description"),
            category_ids=category_ids,
            common_specs=common_specs,
            variants=variants,
        )
        return cable_create, []
    except Exception as e:
        return None, [f"Row {row_number}: invalid cable data: {e}"]


async def _load_fk_sets(db: AsyncSession, rows: list[ParsedRow]) -> dict[str, set[str]]:
    """Layer 3: batch-load all FK target ids to avoid N+1 queries."""
    brand_ids = {r.data.get("brand_id") for r in rows if r.data.get("brand_id")}
    industry_ids = {r.data.get("industry_id") for r in rows if r.data.get("industry_id")}
    category_ids = {r.data.get("category_id") for r in rows if r.data.get("category_id")}
    product_type_ids = {r.data.get("product_type_id") for r in rows if r.data.get("product_type_id")}

    fk_sets: dict[str, set[str]] = {
        "brands": set(),
        "industries": set(),
        "categories": set(),
        "product_types": set(),
    }

    if brand_ids:
        result = await db.execute(select(Brand.id).where(Brand.id.in_(brand_ids)))
        fk_sets["brands"] = set(result.scalars().all())
    if industry_ids:
        result = await db.execute(select(Industry.id).where(Industry.id.in_(industry_ids)))
        fk_sets["industries"] = set(result.scalars().all())
    if category_ids:
        result = await db.execute(select(Category.id).where(Category.id.in_(category_ids)))
        fk_sets["categories"] = set(result.scalars().all())
    if product_type_ids:
        result = await db.execute(select(ProductType.id).where(ProductType.id.in_(product_type_ids)))
        fk_sets["product_types"] = set(result.scalars().all())

    return fk_sets


async def _load_existing_cable_ids(db: AsyncSession, cable_ids: set[str]) -> set[str]:
    """Layer 4: batch-load existing cable ids from DB."""
    if not cable_ids:
        return set()
    result = await db.execute(select(Cable.id).where(Cable.id.in_(cable_ids)))
    return set(result.scalars().all())


async def validate_rows(db: AsyncSession, parsed_rows: list[ParsedRow]) -> list[ValidatedRow]:
    """Run all 4 validation layers and return validated rows."""
    # Pre-load FK sets (one batch query per table)
    fk_sets = await _load_fk_sets(db, parsed_rows)

    # Pre-load existing cable ids (for skip detection)
    all_cable_ids = {r.data.get("id") for r in parsed_rows if r.data.get("id")}
    existing_ids = await _load_existing_cable_ids(db, all_cable_ids)

    # Track intra-file duplicates
    seen_ids: dict[str, int] = {}  # id -> first row_number

    validated: list[ValidatedRow] = []

    for parsed in parsed_rows:
        row_number = parsed.row_number
        data = parsed.data

        # If parse already failed, mark as error
        if parsed.parse_errors:
            validated.append(ValidatedRow(
                row_number=row_number,
                status="error",
                id=data.get("id"),
                model=data.get("model"),
                errors=parsed.parse_errors,
            ))
            continue

        # Layer 2: field validation
        cable_create, field_errors = _validate_cable_fields(data, row_number)
        if cable_create is None:
            validated.append(ValidatedRow(
                row_number=row_number,
                status="error",
                id=data.get("id"),
                model=data.get("model"),
                errors=field_errors,
            ))
            continue

        # Layer 3: FK existence
        fk_errors: list[str] = []
        if cable_create.brand_id not in fk_sets["brands"]:
            fk_errors.append(f"Row {row_number}: brand_id '{cable_create.brand_id}' does not exist")
        if cable_create.industry_id not in fk_sets["industries"]:
            fk_errors.append(f"Row {row_number}: industry_id '{cable_create.industry_id}' does not exist")
        if cable_create.category_id not in fk_sets["categories"]:
            fk_errors.append(f"Row {row_number}: category_id '{cable_create.category_id}' does not exist")
        if cable_create.product_type_id not in fk_sets["product_types"]:
            fk_errors.append(f"Row {row_number}: product_type_id '{cable_create.product_type_id}' does not exist")

        if fk_errors:
            validated.append(ValidatedRow(
                row_number=row_number,
                status="error",
                id=cable_create.id,
                model=cable_create.model,
                errors=fk_errors,
            ))
            continue

        # Layer 4: duplicate check
        cable_id = cable_create.id
        if cable_id in seen_ids:
            validated.append(ValidatedRow(
                row_number=row_number,
                status="error",
                id=cable_id,
                model=cable_create.model,
                errors=[f"Row {row_number}: duplicate id '{cable_id}' (first seen at row {seen_ids[cable_id]})"],
            ))
            continue

        if cable_id in existing_ids:
            validated.append(ValidatedRow(
                row_number=row_number,
                status="skipped",
                id=cable_id,
                model=cable_create.model,
                errors=[],
                cable_create=cable_create,  # Keep for reference, but won't be committed
            ))
            seen_ids[cable_id] = row_number
            continue

        # All validations passed
        seen_ids[cable_id] = row_number
        validated.append(ValidatedRow(
            row_number=row_number,
            status="valid",
            id=cable_id,
            model=cable_create.model,
            errors=[],
            cable_create=cable_create,
        ))

    return validated


def build_preview(validated: list[ValidatedRow], file_format: Literal["csv", "json"]) -> ImportPreview:
    """Build ImportPreview response from validated rows."""
    rows = [
        ImportPreviewRow(
            row_number=v.row_number,
            status=v.status,
            id=v.id,
            model=v.model,
            errors=v.errors,
        )
        for v in validated
    ]
    return ImportPreview(
        total_rows=len(validated),
        valid_count=sum(1 for v in validated if v.status == "valid"),
        skipped_count=sum(1 for v in validated if v.status == "skipped"),
        error_count=sum(1 for v in validated if v.status == "error"),
        rows=rows,
        file_format=file_format,
    )


async def commit_valid_rows(
    db: AsyncSession,
    validated_rows: list[ValidatedRow],
) -> int:
    """Commit all valid rows in a single transaction.
    Any exception → transaction rolls back, exception propagates.
    Returns created_count.
    """
    from app.models.cable import Cable as CableModel, CableVariant, SpecItem

    valid_rows = [v for v in validated_rows if v.status == "valid" and v.cable_create is not None]
    created_count = 0

    try:
        for row in valid_rows:
            cable_create = row.cable_create
            cable_data = cable_create.model_dump(exclude={"common_specs", "variants"})
            cable = CableModel(**cable_data)
            db.add(cable)
            await db.flush()

            # Common specs
            for spec_data in cable_create.common_specs:
                spec = SpecItem(cable_id=cable.id, variant_id=None, **spec_data.model_dump())
                db.add(spec)

            # Variants + their specs
            for variant_data in cable_create.variants:
                variant = CableVariant(
                    cable_id=cable.id,
                    slug=variant_data.slug,
                    sort_order=variant_data.sort_order,
                )
                db.add(variant)
                await db.flush()
                for spec_data in variant_data.specs:
                    spec = SpecItem(cable_id=cable.id, variant_id=variant.id, **spec_data.model_dump())
                    db.add(spec)

            created_count += 1

        await db.commit()
        return created_count
    except Exception:
        await db.rollback()
        raise
