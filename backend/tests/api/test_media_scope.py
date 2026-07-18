"""Tests for scoped media folder access control."""
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


class TestUploadVisibility:
    def test_global_admin_sees_all_uploads(self, client, admin_headers):
        """Global admin can list uploads across all scopes."""
        res = client.get("/api/uploads/", headers=admin_headers)
        assert res.status_code == 200
        data = res.json()
        assert "items" in data
        assert isinstance(data["items"], list)

    def test_cable_manager_sees_only_own_scope_uploads(self, client, cable_manager_headers):
        """Cable manager sees only uploads whose folder_id belongs to their scope."""
        # Fetch the set of folder IDs visible to cable_manager
        folders_res = client.get("/api/admin/folders", headers=cable_manager_headers)
        assert folders_res.status_code == 200
        allowed_folder_ids = {f["id"] for f in folders_res.json()["folders"]}
        assert len(allowed_folder_ids) > 0, "Fixture should have provisioned folders"

        # Upload a few images to an own folder (products)
        products_id = _get_folder_id_by_name(folders_res, "products")
        assert products_id is not None
        for _ in range(2):
            img = _valid_png()
            res = client.post(
                "/api/uploads/",
                headers=cable_manager_headers,
                files={"file": ("test.png", img, "image/png")},
                data={"folder_id": products_id},
            )
            assert res.status_code == 201, f"Upload failed: {res.text}"

        # List uploads as cable_manager — every returned folder_id must be in allowed set
        res = client.get("/api/uploads/", headers=cable_manager_headers)
        assert res.status_code == 200
        items = res.json()["items"]
        assert len(items) > 0, "Expected at least the uploads we just created"
        for item in items:
            assert item["folder_id"] in allowed_folder_ids, (
                f"Upload {item['id']} has folder_id {item['folder_id']} outside scope"
            )

    def test_cable_manager_cannot_see_orphan_uploads(self, client, admin_headers, cable_manager_headers):
        """Uploads with folder_id=NULL must NOT appear in a scoped user's list."""
        # Admin creates an orphan upload (no folder_id)
        img = _valid_png()
        res = client.post(
            "/api/uploads/",
            headers=admin_headers,
            files={"file": ("test.png", img, "image/png")},
        )
        assert res.status_code == 201, f"Admin orphan upload failed: {res.text}"
        orphan_id = res.json()["id"]

        try:
            # As cable_manager, list uploads — orphan must NOT be visible
            res = client.get("/api/uploads/", headers=cable_manager_headers)
            assert res.status_code == 200
            items = res.json()["items"]
            for item in items:
                assert item["folder_id"] is not None, (
                    f"Orphan upload {item['id']} leaked into scoped user's list"
                )
            # Sanity: the specific orphan we just created is not in the scoped list
            assert all(item["id"] != orphan_id for item in items), (
                "Orphan upload leaked into scoped user's list"
            )
        finally:
            # Cleanup the orphan upload (conftest _cleanup_test_data does not handle folder_id=NULL)
            client.delete(f"/api/uploads/{orphan_id}", headers=admin_headers)


class TestUploadMoveGuards:
    def test_cable_manager_can_move_upload_to_own_folder(self, client, cable_manager_headers):
        """Cable manager can move an upload between folders in their own scope."""
        folders_res = client.get("/api/admin/folders", headers=cable_manager_headers)
        products_id = _get_folder_id_by_name(folders_res, "products")
        docs_id = _get_folder_id_by_name(folders_res, "docs")
        assert products_id is not None
        assert docs_id is not None

        # Upload to products folder
        img = _valid_png()
        res = client.post(
            "/api/uploads/",
            headers=cable_manager_headers,
            files={"file": ("test.png", img, "image/png")},
            data={"folder_id": products_id},
        )
        assert res.status_code == 201, f"Upload failed: {res.text}"
        upload_id = res.json()["id"]

        # Move to docs folder (same scope)
        res = client.patch(
            f"/api/uploads/{upload_id}",
            headers=cable_manager_headers,
            json={"folder_id": docs_id},
        )
        assert res.status_code == 200, f"Move failed: {res.text}"
        assert res.json()["folder_id"] == docs_id

    def test_cable_manager_cannot_move_upload_to_other_scope_folder(
        self, client, cable_manager_headers, equipment_manager_headers
    ):
        """Cable manager cannot move an upload into equipment_manager's folder."""
        # Upload to cable_manager's products folder
        cable_folders_res = client.get("/api/admin/folders", headers=cable_manager_headers)
        products_id = _get_folder_id_by_name(cable_folders_res, "products")
        assert products_id is not None

        img = _valid_png()
        res = client.post(
            "/api/uploads/",
            headers=cable_manager_headers,
            files={"file": ("test.png", img, "image/png")},
            data={"folder_id": products_id},
        )
        assert res.status_code == 201, f"Upload failed: {res.text}"
        upload_id = res.json()["id"]

        # Fetch equipment_manager's folder id (different scope)
        em_folders_res = client.get("/api/admin/folders", headers=equipment_manager_headers)
        em_products_id = _get_folder_id_by_name(em_folders_res, "products")
        assert em_products_id is not None

        # Attempt move to equipment_manager's folder — must be rejected
        res = client.patch(
            f"/api/uploads/{upload_id}",
            headers=cable_manager_headers,
            json={"folder_id": em_products_id},
        )
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
