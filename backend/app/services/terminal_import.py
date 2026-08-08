import csv
import io
import json
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.terminal import TerminalCategory, TerminalManufacturer, Terminal
from app.schemas.cable_import import ImportPreview, ImportPreviewRow, ImportResult
from app.schemas.terminal import TerminalCreate

MAX_IMPORT_SIZE = 5 * 1024 * 1024  # 5MB
MAX_ROWS = 500

REQUIRED_CSV_COLUMNS = {"id", "model", "slug", "manufacturer_id", "category_id"}


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
        terminal_create: TerminalCreate | None = None,
    ):
        self.row_number = row_number
        self.status = status
        self.id = id
        self.model = model
        self.errors = errors or []
        self.terminal_create = terminal_create  # Only set for valid rows


def parse_file(content: bytes, format: Literal["csv", "json"]) -> list[ParsedRow]:
    """Parse file content into a list of ParsedRow. Does not validate against DB."""
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


def _validate_terminal_fields(data: dict[str, Any], row_number: int) -> tuple[TerminalCreate | None, list[str]]:
    """Layer 2: validate terminal fields via Pydantic schema. Parse applicable_specs JSON string for CSV."""
    errors: list[str] = []

    term_id = data.get("id")
    model = data.get("model")
    slug = data.get("slug")
    manufacturer_id = data.get("manufacturer_id")
    category_id = data.get("category_id")

    if not term_id:
        errors.append(f"Row {row_number}: missing required field 'id'")
    if not model:
        errors.append(f"Row {row_number}: missing required field 'model'")
    if not slug:
        errors.append(f"Row {row_number}: missing required field 'slug'")
    if not manufacturer_id:
        errors.append(f"Row {row_number}: missing required field 'manufacturer_id'")
    if not category_id:
        errors.append(f"Row {row_number}: missing required field 'category_id'")

    # applicable_specs: CSV -> JSON string (parse); JSON -> native list
    specs_raw = data.get("applicable_specs", [])
    if isinstance(specs_raw, str):
        if specs_raw == "":
            applicable_specs = []
        else:
            try:
                parsed_specs = json.loads(specs_raw)
                if not isinstance(parsed_specs, list):
                    errors.append(f"Row {row_number}: applicable_specs must be a JSON array string")
                    applicable_specs = []
                else:
                    applicable_specs = parsed_specs
            except json.JSONDecodeError:
                errors.append(f"Row {row_number}: applicable_specs is not valid JSON")
                applicable_specs = []
    elif isinstance(specs_raw, list):
        applicable_specs = specs_raw
    elif specs_raw is None:
        applicable_specs = []
    else:
        errors.append(f"Row {row_number}: applicable_specs must be a JSON array string or list")
        applicable_specs = []

    if errors:
        return None, errors

    try:
        terminal_create = TerminalCreate(
            id=term_id,
            model=model,
            slug=slug,
            manufacturer_id=manufacturer_id,
            category_id=category_id,
            applicable_specs=applicable_specs,
            description=data.get("description"),
            image_url=data.get("image_url"),
            external_url=data.get("external_url"),
            sort_order=int(data.get("sort_order", 0) or 0),
        )
        return terminal_create, []
    except Exception as e:
        return None, [f"Row {row_number}: invalid terminal data: {e}"]


async def _load_fk_sets(db: AsyncSession, rows: list[ParsedRow]) -> dict[str, set[str]]:
    """Layer 3: batch-load all FK target ids to avoid N+1 queries."""
    manufacturer_ids = {r.data.get("manufacturer_id") for r in rows if r.data.get("manufacturer_id")}
    category_ids = {r.data.get("category_id") for r in rows if r.data.get("category_id")}

    fk_sets: dict[str, set[str]] = {"manufacturers": set(), "categories": set()}
    if manufacturer_ids:
        result = await db.execute(select(TerminalManufacturer.id).where(TerminalManufacturer.id.in_(manufacturer_ids)))
        fk_sets["manufacturers"] = set(result.scalars().all())
    if category_ids:
        result = await db.execute(select(TerminalCategory.id).where(TerminalCategory.id.in_(category_ids)))
        fk_sets["categories"] = set(result.scalars().all())
    return fk_sets


async def _load_existing_terminal_ids(db: AsyncSession, ids: set[str]) -> set[str]:
    """Layer 4 (id): batch-load existing Terminal ids from DB."""
    if not ids:
        return set()
    result = await db.execute(select(Terminal.id).where(Terminal.id.in_(ids)))
    return set(result.scalars().all())


async def _load_existing_terminal_slugs(db: AsyncSession, slugs: set[str]) -> set[str]:
    """Layer 4 (slug): batch-load existing Terminal slugs from DB.

    `slug` is globally unique (model UniqueConstraint), so we do not need to
    scope by manufacturer_id.
    """
    if not slugs:
        return set()
    result = await db.execute(select(Terminal.slug).where(Terminal.slug.in_(slugs)))
    return set(result.scalars().all())


async def validate_rows(db: AsyncSession, parsed_rows: list[ParsedRow]) -> list[ValidatedRow]:
    """Run all 4 validation layers and return validated rows."""
    fk_sets = await _load_fk_sets(db, parsed_rows)

    all_ids = {r.data.get("id") for r in parsed_rows if r.data.get("id")}
    all_slugs = {r.data.get("slug") for r in parsed_rows if r.data.get("slug")}
    existing_ids = await _load_existing_terminal_ids(db, all_ids)
    existing_slugs = await _load_existing_terminal_slugs(db, all_slugs)

    seen_ids: dict[str, int] = {}
    seen_slugs: dict[str, int] = {}

    validated: list[ValidatedRow] = []

    for parsed in parsed_rows:
        row_number = parsed.row_number
        data = parsed.data

        # Layer 1: parse errors
        if parsed.parse_errors:
            validated.append(ValidatedRow(
                row_number=row_number, status="error",
                id=data.get("id"), model=data.get("model"), errors=parsed.parse_errors,
            ))
            continue

        # Layer 2: field validation
        terminal_create, field_errors = _validate_terminal_fields(data, row_number)
        if terminal_create is None:
            validated.append(ValidatedRow(
                row_number=row_number, status="error",
                id=data.get("id"), model=data.get("model"), errors=field_errors,
            ))
            continue

        # Layer 3: FK existence
        fk_errors: list[str] = []
        if terminal_create.manufacturer_id not in fk_sets["manufacturers"]:
            fk_errors.append(f"Row {row_number}: manufacturer_id '{terminal_create.manufacturer_id}' does not exist")
        if terminal_create.category_id not in fk_sets["categories"]:
            fk_errors.append(f"Row {row_number}: category_id '{terminal_create.category_id}' does not exist")
        if fk_errors:
            validated.append(ValidatedRow(
                row_number=row_number, status="error",
                id=terminal_create.id, model=terminal_create.model, errors=fk_errors,
            ))
            continue

        # Layer 4: duplicate detection (id AND slug)
        term_id = terminal_create.id
        term_slug = terminal_create.slug

        # Intra-file duplicate -> error
        if term_id in seen_ids:
            validated.append(ValidatedRow(
                row_number=row_number, status="error", id=term_id, model=terminal_create.model,
                errors=[f"Row {row_number}: duplicate id '{term_id}' (first seen at row {seen_ids[term_id]})"],
            ))
            continue
        if term_slug in seen_slugs:
            validated.append(ValidatedRow(
                row_number=row_number, status="error", id=term_id, model=terminal_create.model,
                errors=[f"Row {row_number}: duplicate slug '{term_slug}' (first seen at row {seen_slugs[term_slug]})"],
            ))
            continue

        # DB duplicate -> skipped (id or slug)
        if term_id in existing_ids or term_slug in existing_slugs:
            seen_ids[term_id] = row_number
            seen_slugs[term_slug] = row_number
            validated.append(ValidatedRow(
                row_number=row_number, status="skipped", id=term_id, model=terminal_create.model,
                errors=[], terminal_create=terminal_create,
            ))
            continue

        seen_ids[term_id] = row_number
        seen_slugs[term_slug] = row_number
        validated.append(ValidatedRow(
            row_number=row_number, status="valid", id=term_id, model=terminal_create.model,
            errors=[], terminal_create=terminal_create,
        ))

    return validated


def build_preview(validated: list[ValidatedRow], file_format: Literal["csv", "json"]) -> ImportPreview:
    """Build ImportPreview response from validated rows."""
    rows = [
        ImportPreviewRow(
            row_number=v.row_number, status=v.status, id=v.id, model=v.model, errors=v.errors,
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


async def commit_valid_rows(db: AsyncSession, validated_rows: list[ValidatedRow]) -> int:
    """Commit all valid rows in a single transaction.
    Any exception -> transaction rolls back, exception propagates.
    Returns created_count.
    """
    from app.models.terminal import Terminal as TerminalModel

    valid_rows = [v for v in validated_rows if v.status == "valid" and v.terminal_create is not None]
    created_count = 0
    try:
        for row in valid_rows:
            terminal = TerminalModel(**row.terminal_create.model_dump())
            db.add(terminal)
            await db.flush()
            created_count += 1
        await db.commit()
        return created_count
    except Exception:
        await db.rollback()
        raise
