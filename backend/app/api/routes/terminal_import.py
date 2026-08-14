from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.models.user import User
from app.core.database import get_db
from app.schemas.cable_import import ImportPreview, ImportResult
from app.services.terminal_import import (
    MAX_ROWS,
    build_preview,
    commit_valid_rows,
    parse_file,
    validate_rows,
)

router = APIRouter()

# Backward-compat alias router: legacy /api/admin/terminals/import paths return
# 410 Gone with a Location header pointing to /api/admin/connectivity/import.
legacy_router = APIRouter(prefix="/api/admin/terminals/import")


@legacy_router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def legacy_terminal_import_redirect(path: str, request: Request):
    new_url = f"/api/admin/connectivity/import/{path}" if path else "/api/admin/connectivity/import"
    if request.url.query:
        new_url += f"?{request.url.query}"
    raise HTTPException(status_code=410, headers={"Location": new_url})


@router.post("/validate", response_model=ImportPreview)
async def validate_import(
    file: UploadFile,
    format: Literal["csv", "json"] = Form(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("connectivity_list")),
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
    user: User = Depends(require_operator("connectivity_list")),
):
    content = await file.read()
    parsed = parse_file(content, format)
    if len(parsed) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows (max {MAX_ROWS})")
    validated = await validate_rows(db, parsed)

    valid_rows = [v for v in validated if v.status == "valid"]
    skipped_count = sum(1 for v in validated if v.status == "skipped")

    if not valid_rows:
        return ImportResult(created_count=0, skipped_count=skipped_count, errors=["No valid rows to import"])

    try:
        created = await commit_valid_rows(db, validated)
        return ImportResult(created_count=created, skipped_count=skipped_count, errors=[])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transaction failed: {str(e)}")
