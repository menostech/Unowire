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
