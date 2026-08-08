"""Portal terminal import routes. Scope-forced: manufacturer_id = user.scope_id."""
import csv
import json
from io import StringIO
from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.models.user import User
from app.schemas.cable_import import ImportPreview, ImportResult
from app.services.terminal_import import (
    MAX_ROWS,
    build_preview,
    commit_valid_rows,
    parse_file,
    validate_rows,
)

router = APIRouter(prefix="/api/portal/terminals/import", tags=["portal-terminals-import"])


def _force_manufacturer_id(parsed_rows, scope_id: str) -> None:
    """Override manufacturer_id on every parsed row with the user's scope_id.
    SECURITY: this runs AFTER parsing and BEFORE validation, so any
    client-supplied manufacturer_id in the file is overwritten.
    """
    for row in parsed_rows:
        row.data["manufacturer_id"] = scope_id


@router.post("/validate", response_model=ImportPreview)
async def portal_validate_import(
    file: UploadFile,
    format: Literal["csv", "json"] = Form(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("terminals")),
):
    content = await file.read()
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")

    scope_id = str(user.scope_id)
    _force_manufacturer_id(parsed, scope_id)

    validated = await validate_rows(db, parsed)
    return build_preview(validated, format)


@router.post("/commit", response_model=ImportResult)
async def portal_commit_import(
    file: UploadFile,
    format: Literal["csv", "json"] = Form(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("terminals")),
):
    content = await file.read()
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")

    scope_id = str(user.scope_id)
    _force_manufacturer_id(parsed, scope_id)

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
        raise HTTPException(status_code=500, detail=f"Transaction failed: {str(e)}")


CSV_TEMPLATE_HEADERS = [
    "id", "model", "slug", "manufacturer_id", "category_id",
    "description", "image_url", "external_url", "sort_order", "applicable_specs",
]

CSV_TEMPLATE_EXAMPLE = {
    "id": "tm-1-compression-lug-100",
    "model": "Compression Lug 100",
    "slug": "compression-lug-100",
    "manufacturer_id": "tm-1",
    "category_id": "lugs/compression-lugs",
    "description": "Copper compression lug for 100mm² cable",
    "image_url": "",
    "external_url": "",
    "sort_order": "0",
    "applicable_specs": '[{"spec_key":"cross_section","label":"Cross Section","allowed_values":["100mm²"]}]',
}


@router.get("/csv-template")
async def portal_download_csv_template(user: User = Depends(require_factory_module("terminals"))):
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_TEMPLATE_HEADERS)
    writer.writeheader()
    writer.writerow(CSV_TEMPLATE_EXAMPLE)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=terminal-import-template.csv"},
    )


@router.get("/json-example")
async def portal_download_json_example(user: User = Depends(require_factory_module("terminals"))):
    example = [
        {
            "id": "tm-1-compression-lug-100",
            "model": "Compression Lug 100",
            "slug": "compression-lug-100",
            "manufacturer_id": "tm-1",
            "category_id": "lugs/compression-lugs",
            "description": "Copper compression lug for 100mm² cable",
            "image_url": None,
            "external_url": None,
            "sort_order": 0,
            "applicable_specs": [
                {"spec_key": "cross_section", "label": "Cross Section", "allowed_values": ["100mm²"]}
            ],
        }
    ]
    content = json.dumps(example, indent=2)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=terminal-import-example.json"},
    )
