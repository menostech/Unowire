import os
import uuid

from fastapi import HTTPException, UploadFile

ALLOWED_EXTENSIONS = {
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "dwg", "dxf", "zip", "rar", "7z",
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg",
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def _media_dir() -> str:
    return os.environ.get("MEDIA_DIR", "/app/media")


async def save_resource_file(file: UploadFile) -> tuple[str, str, int, str]:
    """Read, validate, and store an uploaded resource file.

    Returns ``(original_filename, content_type, size_bytes, url_path)``.
    Files are stored as-is (no PIL re-encoding) under
    ``{MEDIA_DIR}/resources/{uuid}.{ext}`` and served from
    ``/media/resources/{uuid}.{ext}``.
    """
    content = await file.read()
    size = len(content)
    if size > MAX_FILE_SIZE:
        raise HTTPException(413, {"code": 413, "message": "File too large (max 50 MB)"})

    original_filename = file.filename or ""
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, {"code": 415, "message": "Unsupported file type"})

    stored_name = f"{uuid.uuid4().hex}.{ext}"
    resources_dir = os.path.join(_media_dir(), "resources")
    os.makedirs(resources_dir, exist_ok=True)
    file_path = os.path.join(resources_dir, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)

    url_path = f"/media/resources/{stored_name}"
    content_type = file.content_type or "application/octet-stream"
    return (original_filename, content_type, size, url_path)


def delete_resource_file(url_path: str) -> None:
    """Remove a resource file from disk. Silently ignore if missing."""
    if not url_path:
        return
    try:
        relative = url_path.lstrip("/media/")
        file_path = os.path.join(_media_dir(), relative)
        if os.path.exists(file_path):
            os.remove(file_path)
    except OSError:
        pass


def get_resource_file_path(url_path: str) -> str:
    """Convert a URL path (e.g. ``/media/resources/{uuid}.ext``) to the
    filesystem path for use with ``FileResponse``."""
    relative = url_path.lstrip("/media/")
    return os.path.join(_media_dir(), relative)
