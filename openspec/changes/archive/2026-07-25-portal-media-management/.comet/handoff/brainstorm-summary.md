# Brainstorm Summary

- Change: portal-media-management
- Date: 2026-07-25

## Confirmed Technical Approach

Three-layer architecture (Browser → Next.js BFF → FastAPI backend), reusing the portalApiClient/portalApi split and BFF write pattern from change 1 (`portal-foundation-refactor`). Scope is always derived server-side from the `portal_token`; the frontend never sends `scope_type`/`scope_id`.

**Backend**:
- Add `POST /api/portal/uploads` to `portal_media.py` by copying the admin `upload_file` pipeline (~50 lines: image content_type check, 5 MB cap, Pillow `Image.open` + `convert("RGB")` + `thumbnail((400,400))`, WebP quality=85, `{uuid}.webp` under `MEDIA_DIR/uploads/`). Portal-specific: `folder_id` is required (Form field), `crud_folder.assert_folder_in_scope(db, folder_id, scope_type, scope_id)` is called before saving; failure returns 404 (no existence leak).
- Patch existing `DELETE /api/portal/uploads/{id}` to add `entity_id` reference check (409 Conflict when the upload is still referenced by a cable/equipment), matching admin behavior.

**BFF**:
- `frontend/app/api/portal/folders/route.ts`: add `POST` handler (JSON forward + `portal_token` cookie as Bearer).
- `frontend/app/api/portal/uploads/route.ts`: add `POST` handler that reads `await req.formData()` and forwards it directly as the `fetch` body; do NOT set `Content-Type` (the runtime attaches the correct `multipart/form-data; boundary=...`).

**Lib**:
- `portalApiClient.ts`: extend `bffFetch` with a `skipDefaultContentType` option (default false). JSON methods keep `Content-Type: application/json`; `uploads.create(formData)` passes `skipDefaultContentType: true`. Add `folders.create(data)`, `uploads.create(formData)`, `uploads.remove(id)`.
- `portalApi.ts`: `uploads.all({ folderId, page, pageSize })` accepts query params and forwards them as `folder_id`/`page`/`page_size`.
- `types/portal.ts`: add `PortalFolderCreate` (`{ name: string; parent_id: number | null }`). `PortalFolder`/`PortalUpload`/`PortalUploadsResponse` already exist; rename `PortalUploadsResponse` → `PortalUploadPage` for consistency with the spec.

**Page + components**:
- `app/portal/media/page.tsx`: rewrite as server shell that fetches `portalApi.folders.all()` + `portalApi.uploads.all({ page: 1, pageSize: 20 })` and passes them as initial props to a new `MediaLibrary` client component.
- `components/portal/media/MediaLibrary.tsx` (new): folder sidebar + uploads grid + "Upload" button (file picker + target folder) + "New Folder" button (inline name input) + per-upload delete with `DeleteConfirmDialog` (reused from change 2) + pagination. Folder switching and pagination call `portalApiClient.uploads.all({folderId, page, pageSize})` client-side (hybrid mode).
- `components/portal/media/PortalMediaPickerModal.tsx` (new): mirrors admin `MediaPickerModal` structure (folder list + uploads grid + inline uploader + Select), but sources data from `portalApiClient.folders.all()` / `portalApiClient.uploads.all({folderId})` and uploads via `portalApiClient.uploads.create(formData)`. Does NOT reuse admin `FolderTree`/`MediaGrid`/`MediaUploader` (they import admin `clientFolders`).
- `components/portal/form/ImageFieldWithPicker.tsx` (new): mirrors admin version, uses `PortalMediaPickerModal`.
- Form integration: replace the `image_url` text input in `CableEditForm`, `CableCreateForm`, `EquipmentEditForm`, `EquipmentCreateForm` with `ImageFieldWithPicker`.

## Key Trade-offs and Risks

- **Code duplication with admin upload handler**: ~50 lines duplicated. Accepted (user-confirmed); design.md decision #1 already notes a follow-up to extract a shared helper is possible.
- **Next.js route handler body-size limits on multipart**: keep the 5 MB cap; deployment's `bodyParser.sizeLimit` must be ≥ 5 MB; surface upstream errors to the user.
- **Portal media picker duplicates admin picker**: a second `MediaPickerModal`/`ImageFieldWithPicker` exists. Accepted — the portal copy is intentionally scoped and simpler; admin stays untouched.
- **`entity_id` 409 check may affect existing tests**: run existing `test_portal_media.py` (or equivalent) to confirm no regression; update tests if they asserted delete-without-reference-check behavior.
- **`bffFetch` signature change**: adding `skipDefaultContentType` is backward-compatible (default false); existing callers unaffected.

## Testing Strategy

- **Backend**: new `test_portal_uploads.py` covering POST success, missing `folder_id` (400), cross-scope folder (404), non-image content type (400), oversized file (413), invalid image data (400). DELETE: add a 409 test for an upload referenced by an entity. Run existing portal_media tests to confirm no regression.
- **Frontend**: `tsc --noEmit` (0 errors); `next build` succeeds. No automated tests (MVP constraint per project memory).
- **Smoke test**: upload an image → verify it appears in the list → open picker from a cable/equipment form → select the image → verify `image_url` is populated with a preview → try deleting a referenced upload (expect 409) → delete an unreferenced upload (expect success).

## Spec Patches

Add one scenario to `specs/portal-media-management/spec.md` under the "Portal SHALL allow manufacturers to delete their own uploads with confirmation" requirement:

```markdown
#### Scenario: Delete upload referenced by an entity returns 409
- **WHEN** a manufacturer user sends DELETE to `/api/portal/uploads/{id}` where the upload's `entity_id` is not null (referenced by a cable/equipment)
- **THEN** the backend returns `409 Conflict` with the message "Cannot delete: still associated with an entity"
```

Rationale: the original spec did not specify behavior for deleting an upload that is still referenced by a cable/equipment `image_url`. Aligning with the admin `DELETE /uploads/{id}` behavior (which returns 409 when `entity_id is not None`) prevents dangling references and gives the user a clear error. This is a supplementary scenario (boundary condition), not a structural change to the delta spec.
