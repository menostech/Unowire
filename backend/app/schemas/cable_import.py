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
