"""Tests for scoped media folder access control.

NOTE: Factory-user-on-admin-route tests were removed in the portal-separation
effort. Factory users (scope_type != null) are now rejected by `require_operator`
before reaching admin route logic. Scope-isolation behavior is now covered from
the factory-user perspective via portal routes (Tasks 7/8). The remaining tests
here exercise admin-only behavior using `admin_headers`.
"""
import io

from PIL import Image


def _valid_png() -> io.BytesIO:
    """Generate a valid 10x10 red PNG image for upload tests."""
    img = Image.new("RGB", (10, 10), color="red")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def _get_folder_id_by_name(folders_response, name):
    """Helper: extract folder id by name from GET /api/admin/folders response."""
    for f in folders_response.json()["folders"]:
        if f["name"] == name:
            return f["id"]
    return None


class TestFolderVisibility:
    def test_global_admin_sees_all_folders(self, client, admin_headers):
        """Global admin sees container folders + all manufacturer folders."""
        res = client.get("/api/admin/folders", headers=admin_headers)
        assert res.status_code == 200
        names = [f["name"] for f in res.json()["folders"]]
        # Should see container folders
        assert "Cable Manufacturers" in names
        assert "Equipment Manufacturers" in names


class TestFolderCrudGuards:
    def test_global_admin_cannot_delete_protected_subfolder(self, client, admin_headers):
        """Even global admin cannot delete protected sub-folders."""
        folders_res = client.get("/api/admin/folders", headers=admin_headers)
        for f in folders_res.json()["folders"]:
            if f["name"] in ("logos", "products", "docs"):
                res = client.delete(f"/api/admin/folders/{f['id']}", headers=admin_headers)
                assert res.status_code == 403
                return
        assert False, "Expected at least one protected sub-folder"


class TestAutoProvisioning:
    def test_create_manufacturer_provisions_folders(self, client, admin_headers):
        """Creating a manufacturer auto-creates 4 folders."""
        import asyncio
        from sqlalchemy import text
        from app.core.database import async_session

        res = client.post(
            "/api/manufacturers",
            headers=admin_headers,
            json={
                "id": "mfr-test-provision",
                "name": "Test Provision Mfr",
                "slug": "test-provision-mfr",
            },
        )
        assert res.status_code == 201, f"Create failed: {res.text}"

        async def check():
            async with async_session() as s:
                rows = (await s.execute(text(
                    "SELECT name FROM media_folders WHERE scope_type='manufacturer' AND scope_id='mfr-test-provision' ORDER BY name"
                ))).fetchall()
                return [r[0] for r in rows]

        names = asyncio.run(check())
        assert sorted(names) == ["Test Provision Mfr", "docs", "logos", "products"]

        # Cleanup
        client.delete("/api/manufacturers/mfr-test-provision", headers=admin_headers)

    def test_provisioning_is_idempotent(self, client, admin_headers):
        """Calling provision_for_manufacturer twice for same scope returns existing."""
        import asyncio
        from sqlalchemy import text
        from app.core.database import async_session
        from app.crud.folder import crud_folder

        client.post(
            "/api/manufacturers",
            headers=admin_headers,
            json={
                "id": "mfr-test-idem",
                "name": "Test Idem Mfr",
                "slug": "test-idem-mfr",
            },
        )

        async def provision_again():
            async with async_session() as s:
                await crud_folder.provision_for_manufacturer(
                    s, scope_type="manufacturer", scope_id="mfr-test-idem", name="Test Idem Mfr"
                )

        asyncio.run(provision_again())

        async def count():
            async with async_session() as s:
                result = await s.execute(text(
                    "SELECT COUNT(*) FROM media_folders WHERE scope_type='manufacturer' AND scope_id='mfr-test-idem'"
                ))
                return result.scalar_one()

        count_val = asyncio.run(count())
        assert count_val == 4

        # Cleanup
        client.delete("/api/manufacturers/mfr-test-idem", headers=admin_headers)


class TestLifecycle:
    def test_delete_manufacturer_cleans_up_folders(self, client, admin_headers):
        """Deleting a manufacturer deletes all its folders."""
        import asyncio
        from sqlalchemy import text
        from app.core.database import async_session

        client.post(
            "/api/manufacturers",
            headers=admin_headers,
            json={
                "id": "mfr-test-delete",
                "name": "Test Delete Mfr",
                "slug": "test-delete-mfr",
            },
        )

        res = client.delete("/api/manufacturers/mfr-test-delete", headers=admin_headers)
        assert res.status_code == 200

        async def check():
            async with async_session() as s:
                result = await s.execute(text(
                    "SELECT COUNT(*) FROM media_folders WHERE scope_type='manufacturer' AND scope_id='mfr-test-delete'"
                ))
                return result.scalar_one()

        count_val = asyncio.run(check())
        assert count_val == 0

    def test_rename_manufacturer_renames_root_folder(self, client, admin_headers):
        """Renaming a manufacturer updates the root folder name."""
        import asyncio
        from sqlalchemy import text
        from app.core.database import async_session

        client.post(
            "/api/manufacturers",
            headers=admin_headers,
            json={
                "id": "mfr-test-rename",
                "name": "Old Name",
                "slug": "old-name-mfr",
            },
        )

        client.put(
            "/api/manufacturers/mfr-test-rename",
            headers=admin_headers,
            json={"name": "New Name"},
        )

        async def check():
            async with async_session() as s:
                result = await s.execute(text(
                    "SELECT name FROM media_folders WHERE scope_type='manufacturer' AND scope_id='mfr-test-rename' AND parent_id IN (SELECT id FROM media_folders WHERE name='Cable Manufacturers')"
                ))
                return result.scalar_one()

        name = asyncio.run(check())
        assert name == "New Name"

        # Cleanup
        client.delete("/api/manufacturers/mfr-test-rename", headers=admin_headers)


class TestUploadVisibility:
    def test_global_admin_sees_all_uploads(self, client, admin_headers):
        """Global admin can list uploads across all scopes."""
        res = client.get("/api/uploads/", headers=admin_headers)
        assert res.status_code == 200
        data = res.json()
        assert "items" in data
        assert isinstance(data["items"], list)
