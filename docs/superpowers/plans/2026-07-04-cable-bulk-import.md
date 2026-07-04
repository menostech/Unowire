# Cable Bulk Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bulk cable import feature at `/admin/cables/import` supporting CSV (basic fields) and JSON (full nested) formats with a two-step preview + confirm flow.

**Architecture:** Stateless two-endpoint backend (`/api/admin/cables/import/validate` parses + validates, `/api/admin/cables/import/commit` re-parses + validates + commits in a single transaction). Service layer decoupled from route layer. Frontend re-uploads the original file on commit. Next.js API routes proxy requests with cookie-to-Bearer pattern.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + Pydantic 2 (backend); Next.js 15 App Router + React 19 + TypeScript + Tailwind (frontend); Python stdlib `csv` + `json` (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-07-04-cable-bulk-import-design.md`

**Testing note:** Project has no pytest infrastructure. Per MVP constraint, this plan uses manual smoke testing (Task 18) instead of adding test infrastructure. Backend tests are deferred.

---

## File Structure

### Backend (new files)
- `backend/app/schemas/cable_import.py` — `ImportPreviewRow`, `ImportPreview`, `ImportResult` Pydantic schemas
- `backend/app/services/cable_import.py` — `parse_file()`, `validate_rows()`, `commit_valid_rows()` + helpers
- `backend/app/api/routes/cable_import.py` — `POST /validate`, `POST /commit` endpoints
- `backend/app/api/routes/cable_import_templates.py` — `GET /csv-template`, `GET /json-example` endpoints

### Backend (modified files)
- `backend/app/main.py` — register `cable_import.router` and `cable_import_templates.router` under `/api/admin/cables/import`

### Frontend (new files)
- `frontend/lib/clientCableImport.ts` — `validateImport()`, `commitImport()`, `downloadCsvTemplate()`, `downloadJsonExample()` + TypeScript types
- `frontend/components/admin/cable/ImportPreviewTable.tsx` — paginated preview table with status badges
- `frontend/app/admin/(dashboard)/cables/import/page.tsx` — 3-stage state machine page (upload → preview → result)
- `frontend/app/api/admin/cables/import/validate/route.ts` — POST proxy (multipart)
- `frontend/app/api/admin/cables/import/commit/route.ts` — POST proxy (multipart)
- `frontend/app/api/admin/cables/import/csv-template/route.ts` — GET proxy
- `frontend/app/api/admin/cables/import/json-example/route.ts` — GET proxy

### Frontend (modified files)
- `frontend/app/admin/(dashboard)/cables/page.tsx` — add "Import" button next to "New"

---

## Phase 1: Backend — Schemas, Service Layer, Routes

### Task 1: Create cable import schemas

**Files:**
- Create: `backend/app/schemas/cable_import.py`

- [ ] **Step 1: Write the schemas**

Create `backend/app/schemas/cable_import.py`:

```python
from typing import Literal

from pydantic import BaseModel


class ImportPreviewRow(BaseModel):
    row_number: int          # 1-based index into data rows (1 = first data row after header for CSV; 1 = first array element for JSON)
    status: Literal["valid", "skipped", "error"]
    id: str | None           # Parsed cable id (CSV: value of `id` column; JSON: `id` field; None if parse failed)
    model: str | None        # Parsed model (for display)
    errors: list[str] = []   # Error messages (only for error status)


class ImportPreview(BaseModel):
    total_rows: int
    valid_count: int
    skipped_count: int
    error_count: int
    rows: list[ImportPreviewRow]
    file_format: Literal["csv", "json"]


class ImportResult(BaseModel):
    created_count: int
    skipped_count: int
    errors: list[str] = []   # Commit-phase exceptions (normally empty)
```

- [ ] **Step 2: Verify syntax**

Run: `docker compose exec backend python -c "from app.schemas.cable_import import ImportPreview, ImportResult, ImportPreviewRow; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/cable_import.py
git commit -m "feat(backend): add cable import schemas"
```

---

### Task 2: Create cable import service layer (parse + validate)

**Files:**
- Create: `backend/app/services/cable_import.py`

- [ ] **Step 1: Write the service layer with parse + validate functions**

Create `backend/app/services/cable_import.py`:

```python
import csv
import io
import json
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand import Brand
from app.models.cable import Cable
from app.models.category import Category
from app.models.industry import Industry
from app.models.product_type import ProductType
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
```

- [ ] **Step 2: Verify imports**

Run: `docker compose exec backend python -c "from app.services.cable_import import parse_file, validate_rows, build_preview; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/cable_import.py
git commit -m "feat(backend): add cable import service layer (parse + validate)"
```

---

### Task 3: Add commit function to service layer

**Files:**
- Modify: `backend/app/services/cable_import.py`

- [ ] **Step 1: Append the commit function to the service layer**

Append to `backend/app/services/cable_import.py`:

```python
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
```

- [ ] **Step 2: Verify import**

Run: `docker compose exec backend python -c "from app.services.cable_import import commit_valid_rows; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/cable_import.py
git commit -m "feat(backend): add commit_valid_rows to cable import service"
```

---

### Task 4: Create cable import routes

**Files:**
- Create: `backend/app/api/routes/cable_import.py`

- [ ] **Step 1: Write the import routes**

Create `backend/app/api/routes/cable_import.py`:

```python
from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.schemas.cable_import import ImportPreview, ImportResult
from app.services.cable_import import (
    MAX_ROWS,
    build_preview,
    commit_valid_rows,
    parse_file,
    validate_rows,
)

router = APIRouter()


@router.post("/validate", response_model=ImportPreview)
async def validate_import(
    file: UploadFile,
    format: Literal["csv", "json"] = Form(...),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    content = await file.read()
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")
    validated = await validate_rows(db, parsed)
    return build_preview(validated, format)


@router.post("/commit", response_model=ImportResult)
async def commit_import(
    file: UploadFile,
    format: Literal["csv", "json"] = Form(...),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    content = await file.read()
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")
    validated = await validate_rows(db, parsed)

    valid_rows = [v for v in validated if v.status == "valid"]
    skipped_count = sum(1 for v in validated if v.status == "skipped")

    if not valid_rows:
        return ImportResult(
            created_count=0,
            skipped_count=skipped_count,
            errors=["No valid rows to import"],
        )

    try:
        created = await commit_valid_rows(db, validated)
        return ImportResult(created_count=created, skipped_count=skipped_count, errors=[])
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Transaction failed: {str(e)}",
        )
```

- [ ] **Step 2: Verify import**

Run: `docker compose exec backend python -c "from app.api.routes.cable_import import router; print(len(router.routes))"`
Expected: `2`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/cable_import.py
git commit -m "feat(backend): add cable import routes (validate + commit)"
```

---

### Task 5: Create template routes

**Files:**
- Create: `backend/app/api/routes/cable_import_templates.py`

- [ ] **Step 1: Write the template routes**

Create `backend/app/api/routes/cable_import_templates.py`:

```python
import json
from io import StringIO

import csv
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_admin

router = APIRouter()


CSV_TEMPLATE_HEADERS = [
    "id", "model", "slug", "brand_id", "industry_id",
    "category_id", "product_type_id", "size_system",
    "base_description", "meta_title", "meta_description", "category_ids",
]

CSV_TEMPLATE_EXAMPLE = {
    "id": "consumer_electronics_premium_hdmi_cable",
    "model": "Premium HDMI Cable 4K",
    "slug": "premium-hdmi-cable-4k",
    "brand_id": "sony",
    "industry_id": "consumer_electronics",
    "category_id": "consumer_electronics/internal_wiring",
    "product_type_id": "consumer_electronics/internal_wiring/electronic_wire",
    "size_system": "none",
    "base_description": "High-speed HDMI cable with Ethernet",
    "meta_title": "Premium HDMI Cable 4K - Sony",
    "meta_description": "High-speed HDMI cable supporting 4K resolution",
    "category_ids": '["consumer_electronics/internal_wiring"]',
}


@router.get("/csv-template")
async def download_csv_template(_: dict = Depends(get_current_admin)):
    """Return CSV template file (header + 1 example row)."""
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_TEMPLATE_HEADERS)
    writer.writeheader()
    writer.writerow(CSV_TEMPLATE_EXAMPLE)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=cable-import-template.csv"},
    )


@router.get("/json-example")
async def download_json_example(_: dict = Depends(get_current_admin)):
    """Return JSON example file (1 complete cable object with nested specs/variants)."""
    example = [
        {
            "id": "consumer_electronics_premium_hdmi",
            "model": "Premium HDMI Cable 4K",
            "slug": "premium-hdmi-cable-4k",
            "brand_id": "sony",
            "industry_id": "consumer_electronics",
            "category_id": "consumer_electronics/internal_wiring",
            "product_type_id": "consumer_electronics/internal_wiring/electronic_wire",
            "size_system": "none",
            "base_description": "High-speed HDMI cable with Ethernet",
            "meta_title": "Premium HDMI Cable 4K - Sony",
            "meta_description": "High-speed HDMI cable supporting 4K resolution",
            "category_ids": ["consumer_electronics/internal_wiring"],
            "common_specs": [
                {
                    "spec_key": "length",
                    "label": "Length",
                    "value_string": "2m",
                    "value_number": None,
                    "unit": "m",
                    "spec_type": "string",
                    "filterable": False,
                    "sort_order": 0,
                }
            ],
            "variants": [
                {
                    "slug": "2m",
                    "sort_order": 0,
                    "specs": [
                        {
                            "spec_key": "color",
                            "label": "Color",
                            "value_string": "Black",
                            "value_number": None,
                            "unit": None,
                            "spec_type": "string",
                            "filterable": False,
                            "sort_order": 0,
                        }
                    ],
                }
            ],
        }
    ]

    content = json.dumps(example, indent=2)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=cable-import-example.json"},
    )
```

- [ ] **Step 2: Verify import**

Run: `docker compose exec backend python -c "from app.api.routes.cable_import_templates import router; print(len(router.routes))"`
Expected: `2`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/cable_import_templates.py
git commit -m "feat(backend): add cable import template download routes"
```

---

### Task 6: Register routers in main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Update imports**

In `backend/app/main.py`, update the route import line (line 11) to include `cable_import` and `cable_import_templates`:

```python
from app.api.routes import auth, brands, cable_import, cable_import_templates, cables, categories, equipment, folders, health, industries, manufacturers, product_types, taxonomy, uploads
```

- [ ] **Step 2: Register routers**

Add these two lines after the `folders` router registration (after line 92, before the `# Mount media directory` comment):

```python
app.include_router(cable_import.router, prefix=f"{settings.api_prefix}/admin/cables/import", tags=["cable-import"])
app.include_router(cable_import_templates.router, prefix=f"{settings.api_prefix}/admin/cables/import", tags=["cable-import"])
```

- [ ] **Step 3: Verify registration**

Run: `docker compose exec backend python -c "from app.main import app; paths = [r.path for r in app.routes]; print([p for p in paths if 'import' in p])"`
Expected: list containing `/api/admin/cables/import/validate`, `/api/admin/cables/import/commit`, `/api/admin/cables/import/csv-template`, `/api/admin/cables/import/json-example`

- [ ] **Step 4: Restart backend and verify OpenAPI**

Run: `docker compose restart backend`
Wait ~3 seconds, then:
Run: `docker compose exec backend python -c "import urllib.request; import json; data = json.loads(urllib.request.urlopen('http://localhost:8000/api/openapi.json').read()); print(sorted([p for p in data['paths'] if 'import' in p]))"`
Expected: list of 4 import paths

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(backend): register cable import routers in main.py"
```

---

## Phase 2: Frontend — Client Module, Proxy Routes, Components

### Task 7: Create client module for cable import

**Files:**
- Create: `frontend/lib/clientCableImport.ts`

- [ ] **Step 1: Write the client module**

Create `frontend/lib/clientCableImport.ts`:

```typescript
// Client-side cable import module — safe to import from 'use client' components.
// Uses relative URLs (/api/admin/cables/import/*) which the browser automatically
// sends cookies with; the Next.js API Route proxy reads admin_token cookie and
// forwards as Bearer header to FastAPI.

export type ImportFormat = 'csv' | 'json';
export type RowStatus = 'valid' | 'skipped' | 'error';

export interface ImportPreviewRow {
  row_number: number;
  status: RowStatus;
  id: string | null;
  model: string | null;
  errors: string[];
}

export interface ImportPreview {
  total_rows: number;
  valid_count: number;
  skipped_count: number;
  error_count: number;
  rows: ImportPreviewRow[];
  file_format: ImportFormat;
}

export interface ImportResult {
  created_count: number;
  skipped_count: number;
  errors: string[];
}

export async function validateImport(
  file: File,
  format: ImportFormat
): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', format);
  const res = await fetch('/api/admin/cables/import/validate', {
    method: 'POST',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || 'Validation failed');
  }
  return data as ImportPreview;
}

export async function commitImport(
  file: File,
  format: ImportFormat
): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', format);
  const res = await fetch('/api/admin/cables/import/commit', {
    method: 'POST',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || 'Commit failed');
  }
  return data as ImportResult;
}

export async function downloadCsvTemplate(): Promise<Blob> {
  const res = await fetch('/api/admin/cables/import/csv-template', {
    method: 'GET',
  });
  if (!res.ok) {
    throw new Error('Failed to download CSV template');
  }
  return res.blob();
}

export async function downloadJsonExample(): Promise<Blob> {
  const res = await fetch('/api/admin/cables/import/json-example', {
    method: 'GET',
  });
  if (!res.ok) {
    throw new Error('Failed to download JSON example');
  }
  return res.blob();
}

/** Helper to trigger browser download of a Blob with a given filename. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no new errors related to `clientCableImport.ts`

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/clientCableImport.ts
git commit -m "feat(frontend): add clientCableImport module"
```

---

### Task 8: Create Next.js proxy routes for validate + commit

**Files:**
- Create: `frontend/app/api/admin/cables/import/validate/route.ts`
- Create: `frontend/app/api/admin/cables/import/commit/route.ts`

- [ ] **Step 1: Write the validate proxy route**

Create `frontend/app/api/admin/cables/import/validate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// POST /api/admin/cables/import/validate — multipart proxy (cookie-to-Bearer)
export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  if (!token) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const res = await fetch(`${API_BASE}/api/admin/cables/import/validate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData, // pass through multipart; do NOT set Content-Type
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Write the commit proxy route**

Create `frontend/app/api/admin/cables/import/commit/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// POST /api/admin/cables/import/commit — multipart proxy (cookie-to-Bearer)
export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  if (!token) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const res = await fetch(`${API_BASE}/api/admin/cables/import/commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no new errors related to the proxy routes

- [ ] **Step 4: Commit**

```bash
git add frontend/app/api/admin/cables/import/validate/route.ts frontend/app/api/admin/cables/import/commit/route.ts
git commit -m "feat(frontend): add cable import validate + commit proxy routes"
```

---

### Task 9: Create Next.js proxy routes for templates

**Files:**
- Create: `frontend/app/api/admin/cables/import/csv-template/route.ts`
- Create: `frontend/app/api/admin/cables/import/json-example/route.ts`

- [ ] **Step 1: Write the CSV template proxy route**

Create `frontend/app/api/admin/cables/import/csv-template/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// GET /api/admin/cables/import/csv-template — proxy template download (cookie-to-Bearer)
export async function GET(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  if (!token) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}/api/admin/cables/import/csv-template`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  }

  const blob = await res.blob();
  return new NextResponse(blob, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename=cable-import-template.csv',
    },
  });
}
```

- [ ] **Step 2: Write the JSON example proxy route**

Create `frontend/app/api/admin/cables/import/json-example/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// GET /api/admin/cables/import/json-example — proxy example download (cookie-to-Bearer)
export async function GET(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  if (!token) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}/api/admin/cables/import/json-example`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  }

  const blob = await res.blob();
  return new NextResponse(blob, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename=cable-import-example.json',
    },
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add frontend/app/api/admin/cables/import/csv-template/route.ts frontend/app/api/admin/cables/import/json-example/route.ts
git commit -m "feat(frontend): add cable import template proxy routes"
```

---

### Task 10: Create ImportPreviewTable component

**Files:**
- Create: `frontend/components/admin/cable/ImportPreviewTable.tsx`

- [ ] **Step 1: Write the ImportPreviewTable component**

Create `frontend/components/admin/cable/ImportPreviewTable.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { ImportPreviewRow } from '@/lib/clientCableImport';

interface ImportPreviewTableProps {
  rows: ImportPreviewRow[];
}

const PAGE_SIZE = 20;

export function ImportPreviewTable({ rows }: ImportPreviewTableProps) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const startIdx = (page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(startIdx, startIdx + PAGE_SIZE);

  function statusBadge(status: ImportPreviewRow['status']) {
    if (status === 'valid') {
      return <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-700">valid</span>;
    }
    if (status === 'skipped') {
      return <span className="px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-700">skipped</span>;
    }
    return <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-700">error</span>;
  }

  function rowClass(status: ImportPreviewRow['status']) {
    if (status === 'error') return 'bg-red-50';
    if (status === 'skipped') return 'bg-yellow-50';
    return '';
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium w-16">Row</th>
              <th className="px-4 py-3 font-medium w-24">Status</th>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">Errors</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.row_number} className={`border-b border-gray-100 last:border-0 ${rowClass(row.status)}`}>
                <td className="px-4 py-3 text-gray-600">{row.row_number}</td>
                <td className="px-4 py-3">{statusBadge(row.status)}</td>
                <td className="px-4 py-3 text-gray-900 font-mono text-xs">{row.id || '—'}</td>
                <td className="px-4 py-3 text-gray-900">{row.model || '—'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {row.status === 'skipped' && row.errors.length === 0 ? (
                    <span className="text-yellow-600">(already exists)</span>
                  ) : row.errors.length > 0 ? (
                    <ul className="list-disc list-inside text-red-600 text-xs space-y-0.5">
                      {row.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className={page === 1 ? 'text-gray-300' : 'text-blue-600 hover:underline'}
          >
            ← Prev
          </button>
          <span className="text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className={page === totalPages ? 'text-gray-300' : 'text-blue-600 hover:underline'}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no new errors related to `ImportPreviewTable.tsx`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/cable/ImportPreviewTable.tsx
git commit -m "feat(frontend): add ImportPreviewTable component"
```

---

### Task 11: Create import page (3-stage state machine)

**Files:**
- Create: `frontend/app/admin/(dashboard)/cables/import/page.tsx`

- [ ] **Step 1: Write the import page**

Create `frontend/app/admin/(dashboard)/cables/import/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Upload, FileText, ArrowLeft, Download } from 'lucide-react';
import {
  validateImport,
  commitImport,
  downloadCsvTemplate,
  downloadJsonExample,
  triggerBlobDownload,
  type ImportFormat,
  type ImportPreview,
  type ImportResult,
} from '@/lib/clientCableImport';
import { ImportPreviewTable } from '@/components/admin/cable/ImportPreviewTable';

type Stage = 'upload' | 'preview' | 'result';

export default function CableImportPage() {
  const [stage, setStage] = useState<Stage>('upload');
  const [format, setFormat] = useState<ImportFormat>('csv');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function resetToUpload() {
    setStage('upload');
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setLoading(false);
  }

  function handleFileSelected(f: File | null) {
    if (f === null) {
      setFile(null);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('File too large (max 5MB)');
      return;
    }
    setError(null);
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelected(f);
  }

  async function handleValidate() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const p = await validateImport(file, format);
      setPreview(p);
      setStage('preview');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const r = await commitImport(file, format);
      setResult(r);
      setStage('result');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadCsvTemplate() {
    try {
      const blob = await downloadCsvTemplate();
      triggerBlobDownload(blob, 'cable-import-template.csv');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDownloadJsonExample() {
    try {
      const blob = await downloadJsonExample();
      triggerBlobDownload(blob, 'cable-import-example.json');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/cables"
            className="text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Import Cables</h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
          {error}
        </div>
      )}

      {stage === 'upload' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="format"
                    value="csv"
                    checked={format === 'csv'}
                    onChange={() => setFormat('csv')}
                    className="text-blue-600"
                  />
                  <span className="text-sm text-gray-700">CSV (basic fields)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="format"
                    value="json"
                    checked={format === 'json'}
                    onChange={() => setFormat('json')}
                    className="text-blue-600"
                  />
                  <span className="text-sm text-gray-700">JSON (full nested)</span>
                </label>
              </div>
            </div>

            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
              }`}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById('cable-import-input')?.click()}
            >
              <input
                id="cable-import-input"
                type="file"
                accept=".csv,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  handleFileSelected(f);
                }}
              />
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-3" />
              <p className="text-gray-600">
                {file ? (
                  <span className="font-medium text-gray-900">{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                ) : (
                  'Drop file here or click to select'
                )}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Supports .csv / .json — max 5MB, 500 rows
              </p>
            </div>

            <div className="flex gap-3 text-sm">
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                <Download className="h-4 w-4" />
                Download CSV template
              </button>
              <button
                type="button"
                onClick={handleDownloadJsonExample}
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                <FileText className="h-4 w-4" />
                View JSON example
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleValidate}
                disabled={!file || loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Validating...' : 'Validate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'preview' && preview && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Preview — {preview.total_rows} rows total
              </h2>
              <div className="flex gap-4 text-sm">
                <span className="text-green-700">
                  ✓ {preview.valid_count} valid
                </span>
                <span className="text-yellow-700">
                  ⏭ {preview.skipped_count} skipped
                </span>
                <span className="text-red-700">
                  ✗ {preview.error_count} errors
                </span>
              </div>
            </div>

            <ImportPreviewTable rows={preview.rows} />
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStage('upload')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={preview.valid_count === 0 || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Committing...' : `Commit ${preview.valid_count} valid rows`}
            </button>
          </div>
        </div>
      )}

      {stage === 'result' && result && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Import Complete</h2>
            <div className="space-y-1 text-sm text-gray-600">
              <p><span className="font-medium text-gray-900">{result.created_count}</span> cables created</p>
              <p><span className="font-medium text-gray-900">{result.skipped_count}</span> cables skipped (already existed)</p>
              {result.errors.length > 0 && (
                <p className="text-red-600">{result.errors.length} errors</p>
              )}
            </div>

            <div className="flex justify-center gap-3 mt-6">
              <Link
                href="/admin/cables"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                View Cables List
              </Link>
              <button
                type="button"
                onClick={resetToUpload}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Import Another File
              </button>
            </div>

            {result.errors.length > 0 && (
              <div className="mt-4 text-left bg-red-50 border border-red-200 rounded p-3">
                <ul className="list-disc list-inside text-xs text-red-700 space-y-0.5">
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no new errors related to the import page

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/admin/(dashboard)/cables/import/page.tsx"
git commit -m "feat(frontend): add cable import page (3-stage state machine)"
```

---

### Task 12: Add Import button to cables list page

**Files:**
- Modify: `frontend/app/admin/(dashboard)/cables/page.tsx`

- [ ] **Step 1: Add Import button next to New**

In `frontend/app/admin/(dashboard)/cables/page.tsx`, find the "New" button block (lines 35-41):

```tsx
          <Link
            href="/admin/cables/new"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            New
          </Link>
```

Replace with:

```tsx
          <Link
            href="/admin/cables/import"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Import
          </Link>
          <Link
            href="/admin/cables/new"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            New
          </Link>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/admin/(dashboard)/cables/page.tsx"
git commit -m "feat(frontend): add Import button to cables list page"
```

---

## Phase 3: Verification

### Task 13: Restart containers and clear caches

**Files:** none

- [ ] **Step 1: Restart backend + frontend**

Run: `docker compose restart backend frontend`
Wait ~5 seconds.

- [ ] **Step 2: Verify containers are healthy**

Run: `docker compose ps`
Expected: backend and frontend both "Up" / "healthy"

- [ ] **Step 3: Clear Next.js .next cache**

Run: `docker compose exec frontend rm -rf .next && docker compose restart frontend`
Wait ~5 seconds.

- [ ] **Step 4: Verify backend routes registered**

Run: `docker compose exec backend python -c "from app.main import app; paths = [r.path for r in app.routes]; print([p for p in paths if 'import' in p])"`
Expected: list containing 4 import paths

---

### Task 14: Manual smoke testing

**Files:** none

Execute each smoke test scenario below. Use browser at http://localhost:3000/admin/cables/import and DevTools Network tab. For API-level tests, use PowerShell `Invoke-WebRequest` with the admin token cookie.

**Prerequisite: log in at http://localhost:3000/admin/login first.**

- [ ] **Step 1: CSV template download**

Action: Visit http://localhost:3000/admin/cables/import, click "Download CSV template".
Expected: Browser downloads `cable-import-template.csv` with 12-column header + 1 example row.

- [ ] **Step 2: JSON example download**

Action: Click "View JSON example".
Expected: Browser downloads `cable-import-example.json` with 1 complete cable object (including common_specs + 1 variant with specs).

- [ ] **Step 3: CSV upload — all valid (3 new cables)**

Action: Create a CSV file with header + 3 rows using valid existing brand_id/industry_id/category_id/product_type_id (verify these exist in DB first). Select CSV format, upload file, click Validate.
Expected: Preview shows 3 valid rows. Click Commit → result shows 3 cables created, 0 skipped, 0 errors.

- [ ] **Step 4: CSV upload — with skipped (existing id)**

Action: Re-upload the same CSV from Step 3.
Expected: Preview shows 0 valid, 3 skipped, 0 errors. Commit button disabled (0 valid).

- [ ] **Step 5: CSV upload — with error (missing brand_id)**

Action: Create a CSV row with empty `brand_id` cell.
Expected: Preview shows 1 error row with message `Row 1: missing required field 'brand_id'`.

- [ ] **Step 6: CSV upload — intra-file duplicate**

Action: Create a CSV with 2 rows using the same `id` value.
Expected: Preview shows 1 valid + 1 error with message `Row 2: duplicate id 'xxx' (first seen at row 1)`.

- [ ] **Step 7: JSON upload — all valid (1 cable with variants + specs)**

Action: Upload the JSON example file (after modifying id to avoid conflict with Step 3).
Expected: Preview shows 1 valid row. Commit creates 1 cable.

- [ ] **Step 8: JSON upload — nested validation error**

Action: Edit JSON example: set a variant spec's `spec_type` to `number` but leave `value_number` null.
Expected: Preview shows 1 error row with message like `Row 1: variant 0 spec 0 spec_type 'number' requires value_number`.

- [ ] **Step 9: FK does not exist**

Action: Create a CSV row with `brand_id` set to a non-existent value (e.g. `nonexistent_brand`).
Expected: Preview shows 1 error row with message `Row 1: brand_id 'nonexistent_brand' does not exist`.

- [ ] **Step 10: Empty file**

Action: Upload an empty .csv file.
Expected: Top red toast shows "File is empty".

- [ ] **Step 11: File > 5MB**

Action: Create a CSV file larger than 5MB (e.g. by repeating rows).
Expected: Top red toast shows "File too large (max 5MB)".

- [ ] **Step 12: Rows > 500**

Action: Create a CSV file with 501 data rows.
Expected: Top red toast shows "Too many rows (max 500)".

- [ ] **Step 13: Unauthenticated API access**

Action: Use PowerShell to call validate endpoint directly without token:
```powershell
Invoke-WebRequest -Uri http://localhost:8000/api/admin/cables/import/validate -Method POST -ErrorAction SilentlyContinue
```
Expected: 401 response with `{"code": 401, "message": "Not authenticated"}`.

- [ ] **Step 14: Commit with no valid rows**

Action: Upload a CSV where all rows have errors (e.g. all missing brand_id). Click Validate → preview shows all errors. Force-call commit API via PowerShell with the same file.
Expected: 200 response with `{"created_count": 0, "skipped_count": 0, "errors": ["No valid rows to import"]}`.

- [ ] **Step 15: Regression — cables list page**

Action: Visit http://localhost:3000/admin/cables.
Expected: Page loads normally. "Import" button visible next to "New", links to `/admin/cables/import`.

---

### Task 15: Final verification

**Files:** none

- [ ] **Step 1: Confirm backend tsc / syntax**

Run: `docker compose exec backend python -c "from app.main import app; print('routes:', len(app.routes))"`
Expected: no errors, prints route count.

- [ ] **Step 2: Confirm frontend tsc**

Run: `docker compose exec frontend npx tsc --noEmit`
Expected: only pre-existing errors (no new errors related to cable import).

- [ ] **Step 3: Final commit (if any cleanup needed)**

If any bugs were fixed during smoke testing, commit them now:
```bash
git add -A
git commit -m "fix: address smoke test findings"
```

---

## Notes

- **Pre-existing tsc errors:** The project has known pre-existing tsc errors in unrelated files (brands/manufacturers/ProductTypeForm/CableCard/lib/api.ts). These are NOT introduced by this plan and should not be fixed here.
- **No pytest:** Backend tests are deferred per MVP constraint. Verification is manual smoke testing.
- **Docker HMR limitation:** On Docker Desktop for Windows, file changes may not trigger Turbopack HMR. After frontend edits, run `docker compose restart frontend` to see changes.
- **PowerShell path escaping:** Paths containing `(dashboard)` route group must be quoted in git add commands: `git add "frontend/app/admin/(dashboard)/cables/import/page.tsx"`.
