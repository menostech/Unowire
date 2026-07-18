"""Tests for scoped media folder access control."""
import io

from PIL import Image


def _valid_png() -> bytes:
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

    def test_cable_manager_sees_only_own_folders(self, client, cable_manager_headers):
        """Cable manager sees only their 4 folders (root + logos/products/docs)."""
        res = client.get("/api/admin/folders", headers=cable_manager_headers)
        assert res.status_code == 200
        folders = res.json()["folders"]
        # Should see exactly 4 folders (root + 3 protected sub-folders)
        assert len(folders) == 4
        names = [f["name"] for f in folders]
        assert "logos" in names
        assert "products" in names
        assert "docs" in names
        # Should NOT see container folders
        assert "Cable Manufacturers" not in names
        assert "Equipment Manufacturers" not in names

    def test_equipment_manager_sees_only_own_folders(self, client, equipment_manager_headers):
        """Equipment manager sees only their own folders, not cable manufacturer's."""
        res = client.get("/api/admin/folders", headers=equipment_manager_headers)
        assert res.status_code == 200
        folders = res.json()["folders"]
        assert len(folders) == 4
        names = [f["name"] for f in folders]
        assert "logos" in names
        assert "products" in names
        assert "docs" in names
        assert "Cable Manufacturers" not in names
        assert "Equipment Manufacturers" not in names


class TestUploadScopeGuards:
    def test_scoped_user_upload_without_folder_id_rejected(self, client, cable_manager_headers):
        """Scoped user must provide folder_id when uploading."""
        img = _valid_png()
        res = client.post(
            "/api/uploads/",
            headers=cable_manager_headers,
            files={"file": ("test.png", img, "image/png")},
        )
        assert res.status_code == 400
        assert "must upload to a specific folder" in res.json()["message"]

    def test_scoped_user_upload_to_own_folder_succeeds(self, client, cable_manager_headers):
        """Scoped user can upload to their own folder."""
        folders_res = client.get("/api/admin/folders", headers=cable_manager_headers)
        folders = folders_res.json()["folders"]
        assert len(folders) > 0, "Fixture should have provisioned folders"
        # Use the 'products' sub-folder
        folder_id = _get_folder_id_by_name(folders_res, "products")
        assert folder_id is not None

        img = _valid_png()
        res = client.post(
            "/api/uploads/",
            headers=cable_manager_headers,
            files={"file": ("test.png", img, "image/png")},
            data={"folder_id": folder_id},
        )
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"

    def test_scoped_user_upload_to_other_scope_rejected(self, client, cable_manager_headers):
        """Scoped user cannot upload to a container folder (outside their scope)."""
        # folder_id=1 is the "Cable Manufacturers" container (scope_type=NULL)
        img = _valid_png()
        res = client.post(
            "/api/uploads/",
            headers=cable_manager_headers,
            files={"file": ("test.png", img, "image/png")},
            data={"folder_id": 1},
        )
        assert res.status_code == 403


class TestFolderCrudGuards:
    def test_scoped_user_cannot_create_root_folder(self, client, cable_manager_headers):
        """Scoped user cannot create folders at root level (parent_id=NULL)."""
        res = client.post(
            "/api/admin/folders",
            headers=cable_manager_headers,
            json={"name": "My Root", "parent_id": None},
        )
        assert res.status_code == 400

    def test_scoped_user_cannot_delete_protected_subfolder(self, client, cable_manager_headers):
        """Protected sub-folders (logos/products/docs) cannot be deleted."""
        folders_res = client.get("/api/admin/folders", headers=cable_manager_headers)
        for f in folders_res.json()["folders"]:
            if f["name"] in ("logos", "products", "docs"):
                res = client.delete(f"/api/admin/folders/{f['id']}", headers=cable_manager_headers)
                assert res.status_code == 403, f"Should not delete protected folder {f['name']}"
                return
        assert False, "Expected at least one protected sub-folder"

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
