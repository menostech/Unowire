"""Portal cable import routes. Scope-forced: manufacturer_id = user.scope_id."""
from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.models.user import User
from app.schemas.cable_import import ImportPreview, ImportResult
from app.services.cable_import import (
    MAX_ROWS,
    build_preview,
    commit_valid_rows,
    parse_file,
    validate_rows,
)

router = APIRouter(prefix="/api/portal/cables/import", tags=["portal-cable-import"])


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
    user: User = Depends(require_factory_module("cables")),
):
    content = await file.read()
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")

    # SECURITY: force manufacturer_id to user's scope, ignoring client input
    scope_id = str(user.scope_id)
    _force_manufacturer_id(parsed, scope_id)

    validated = await validate_rows(db, parsed)
    return build_preview(validated, format)


@router.post("/commit", response_model=ImportResult)
async def portal_commit_import(
    file: UploadFile,
    format: Literal["csv", "json"] = Form(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("cables")),
):
    content = await file.read()
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")

    # SECURITY: force manufacturer_id to user's scope, ignoring client input
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
        raise HTTPException(
            status_code=500,
            detail=f"Transaction failed: {str(e)}",
        )
