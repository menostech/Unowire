"""Tests for portal uploads routes: POST /api/portal/uploads + DELETE entity_id check."""
import asyncio
import io
import uuid

import pytest
from PIL import Image
from sqlalchemy import text

from app.core.database import async_session


def _valid_png() -> io.BytesIO:
    """Generate a valid 1x1 red PNG image for upload tests."""
    img = Image.new("RGB", (1, 1), color="red")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def _get_first_folder_id(client, headers) -> int:
    """Fetch the first in-scope folder id via GET /api/portal/folders."""
    res = client.get("/api/portal/folders", headers=headers)
    assert res.status_code == 200
    folders = res.json()
    assert folders, "No folders provisioned for scope"
    return folders[0]["id"]


# === POST /api/portal/uploads ===


def test_portal_create_upload_success(client, cable_manager_headers):
    """Valid image + in-scope folder_id returns 201 with the upload shape."""
    folder_id = _get_first_folder_id(client, cable_manager_headers)
    res = client.post(
        "/api/portal/uploads",
        headers=cable_manager_headers,
        files={"file": ("test.png", _valid_png(), "image/png")},
        data={"folder_id": str(folder_id)},
    )
    assert res.status_code == 201, f"Create failed: {res.text}"
    data = res.json()
    assert "id" in data
    assert data["filename"].endswith(".webp")
    assert data["url_path"].startswith("/media/uploads/")
    assert data["folder_id"] == folder_id
    assert data["created_at"] is not None


def test_portal_create_upload_missing_folder_id_422(client, cable_manager_headers):
    """Missing folder_id (required Form field) returns 422."""
    res = client.post(
        "/api/portal/uploads",
        headers=cable_manager_headers,
        files={"file": ("test.png", _valid_png(), "image/png")},
    )
    assert res.status_code == 422


def test_portal_create_upload_cross_scope_folder_404(
    client, cable_manager_headers, equipment_manager_headers
):
    """Uploading to a folder in another scope returns 404 (no existence leak)."""
    # Fetch equipment_manager's folder (em-1 scope)
    em_folder_id = _get_first_folder_id(client, equipment_manager_headers)
    # Try to upload to it as cable_manager (mfr-1 scope) -> 404
    res = client.post(
        "/api/portal/uploads",
        headers=cable_manager_headers,
        files={"file": ("test.png", _valid_png(), "image/png")},
        data={"folder_id": str(em_folder_id)},
    )
    assert res.status_code == 404
    assert res.json()["code"] == 404


def test_portal_create_upload_nonexistent_folder_404(client, cable_manager_headers):
    """Uploading to a non-existent folder returns 404."""
    res = client.post(
        "/api/portal/uploads",
        headers=cable_manager_headers,
        files={"file": ("test.png", _valid_png(), "image/png")},
        data={"folder_id": "999999"},
    )
    assert res.status_code == 404
    assert res.json()["code"] == 404


def test_portal_create_upload_non_image_400(client, cable_manager_headers):
    """Non-image content_type returns 400 'File must be an image'."""
    folder_id = _get_first_folder_id(client, cable_manager_headers)
    res = client.post(
        "/api/portal/uploads",
        headers=cable_manager_headers,
        files={"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")},
        data={"folder_id": str(folder_id)},
    )
    assert res.status_code == 400
    assert res.json()["message"] == "File must be an image"


def test_portal_create_upload_oversized_413(client, cable_manager_headers):
    """File > 5MB returns 413 'File too large (max 5MB)'."""
    folder_id = _get_first_folder_id(client, cable_manager_headers)
    # Size check runs before Image.open, so raw bytes with image content_type suffice
    big_payload = b"\x00" * (5 * 1024 * 1024 + 1)
    res = client.post(
        "/api/portal/uploads",
        headers=cable_manager_headers,
        files={"file": ("big.png", io.BytesIO(big_payload), "image/png")},
        data={"folder_id": str(folder_id)},
    )
    assert res.status_code == 413
    assert res.json()["message"] == "File too large (max 5MB)"


def test_portal_create_upload_corrupt_image_400(client, cable_manager_headers):
    """Image content_type but corrupt bytes returns 400 'Invalid image file'."""
    folder_id = _get_first_folder_id(client, cable_manager_headers)
    res = client.post(
        "/api/portal/uploads",
        headers=cable_manager_headers,
        files={"file": ("corrupt.png", io.BytesIO(b"not an image"), "image/png")},
        data={"folder_id": str(folder_id)},
    )
    assert res.status_code == 400
    assert res.json()["message"] == "Invalid image file"


# === DELETE /api/portal/uploads/{id} ===


def test_portal_delete_upload_referenced_409(client, cable_manager_headers):
    """Deleting an upload still referenced by an entity returns 409."""
    folder_id = _get_first_folder_id(client, cable_manager_headers)
    create_res = client.post(
        "/api/portal/uploads",
        headers=cable_manager_headers,
        files={"file": ("test.png", _valid_png(), "image/png")},
        data={"folder_id": str(folder_id)},
    )
    assert create_res.status_code == 201
    upload_id = create_res.json()["id"]

    # Direct DB update: simulate an entity reference
    async def _set_entity():
        async with async_session() as s:
            await s.execute(
                text(
                    "UPDATE uploads SET entity_id = :eid, entity_type = :et "
                    "WHERE id = :uid"
                ),
                {"eid": "test-entity-1", "et": "cable", "uid": upload_id},
            )
            await s.commit()

    asyncio.run(_set_entity())

    # Delete should now return 409
    del_res = client.delete(f"/api/portal/uploads/{upload_id}", headers=cable_manager_headers)
    assert del_res.status_code == 409
    assert del_res.json()["code"] == 409

    # Cleanup the referenced upload so it doesn't leak across test runs
    async def _cleanup():
        async with async_session() as s:
            await s.execute(
                text("DELETE FROM uploads WHERE id = :uid"), {"uid": upload_id}
            )
            await s.commit()

    asyncio.run(_cleanup())


def test_portal_delete_upload_out_of_scope_404(
    client, cable_manager_headers, equipment_manager_headers
):
    """Deleting an upload whose folder is in another scope returns 404."""
    # Create upload as equipment_manager (em-1 scope)
    em_folder_id = _get_first_folder_id(client, equipment_manager_headers)
    create_res = client.post(
        "/api/portal/uploads",
        headers=equipment_manager_headers,
        files={"file": ("test.png", _valid_png(), "image/png")},
        data={"folder_id": str(em_folder_id)},
    )
    assert create_res.status_code == 201
    upload_id = create_res.json()["id"]

    # Delete as cable_manager (mfr-1 scope) -> folder in em-1 -> 404
    del_res = client.delete(f"/api/portal/uploads/{upload_id}", headers=cable_manager_headers)
    assert del_res.status_code == 404
    assert del_res.json()["code"] == 404


def test_portal_delete_upload_orphan_404(client, cable_manager_headers):
    """Deleting an upload with folder_id=NULL (orphan) returns 404."""
    orphan_filename = f"orphan-{uuid.uuid4().hex}.webp"

    async def _insert_orphan():
        async with async_session() as s:
            result = await s.execute(
                text(
                    "INSERT INTO uploads (filename, original_filename, content_type, "
                    "size_bytes, url_path, folder_id, created_at) "
                    "VALUES (:fn, :ofn, 'image/webp', 100, "
                    "'/media/uploads/test-orphan.webp', NULL, NOW()) RETURNING id"
                ),
                {"fn": orphan_filename, "ofn": "orphan.webp"},
            )
            await s.commit()
            return result.scalar_one()

    upload_id = asyncio.run(_insert_orphan())

    del_res = client.delete(f"/api/portal/uploads/{upload_id}", headers=cable_manager_headers)
    assert del_res.status_code == 404
    assert del_res.json()["code"] == 404

    # Cleanup orphan (delete route won't remove NULL-folder uploads)
    async def _cleanup_orphan():
        async with async_session() as s:
            await s.execute(
                text("DELETE FROM uploads WHERE id = :uid"), {"uid": upload_id}
            )
            await s.commit()

    asyncio.run(_cleanup_orphan())


def test_portal_delete_upload_nonexistent_404(client, cable_manager_headers):
    """Deleting a non-existent upload returns 404."""
    del_res = client.delete("/api/portal/uploads/999999999", headers=cable_manager_headers)
    assert del_res.status_code == 404
    assert del_res.json()["code"] == 404


def test_portal_delete_upload_success(client, cable_manager_headers):
    """Successful delete returns 200; subsequent delete returns 404."""
    folder_id = _get_first_folder_id(client, cable_manager_headers)
    create_res = client.post(
        "/api/portal/uploads",
        headers=cable_manager_headers,
        files={"file": ("test.png", _valid_png(), "image/png")},
        data={"folder_id": str(folder_id)},
    )
    assert create_res.status_code == 201
    upload_id = create_res.json()["id"]

    del_res = client.delete(f"/api/portal/uploads/{upload_id}", headers=cable_manager_headers)
    assert del_res.status_code == 200
    assert del_res.json()["ok"] is True

    # Verify gone: deleting again returns 404
    del_again = client.delete(f"/api/portal/uploads/{upload_id}", headers=cable_manager_headers)
    assert del_again.status_code == 404


# === Auth gate ===


def test_portal_uploads_requires_portal_token(client, admin_headers):
    """admin_token cannot access portal uploads (401)."""
    res = client.post(
        "/api/portal/uploads",
        headers=admin_headers,
        files={"file": ("test.png", _valid_png(), "image/png")},
        data={"folder_id": "1"},
    )
    assert res.status_code == 401
