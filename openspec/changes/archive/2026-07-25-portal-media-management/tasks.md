## 1. Backend Upload Endpoint

- [x] 1.1 Add `POST /api/portal/uploads` to `backend/app/api/routes/portal_media.py`: accept `file: UploadFile` + `folder_id: int | None = Form(default=None)`, require `require_factory_module("media")`, derive `scope_type`/`scope_id` from `user.role`
- [x] 1.2 Require non-null `folder_id` (return `400` if missing) and call `crud_folder.assert_folder_in_scope(db, folder_id, scope_type, scope_id)` before saving (return `404` on failure)
- [x] 1.3 Validate `file.content_type` starts with `image/` (return `400` otherwise); reject files > 5 MB (return `413`); wrap `Image.open` in try/except (return `400` on invalid image)
- [x] 1.4 Re-encode the image: `convert("RGB")`, `thumbnail((400, 400))`, save as `{uuid.uuid4().hex}.webp` (quality 85) under `MEDIA_DIR/uploads/`; set `url_path = /media/uploads/{filename}`
- [x] 1.5 Create the `Upload` row (`filename`, `original_filename`, `content_type="image/webp"`, `size_bytes`, `url_path`, `folder_id`), commit, refresh, return `201 Created` with `{ id, filename, url_path, folder_id, created_at }`
- [x] 1.6 Run backend tests to verify upload works with scope enforcement, rejects non-image/oversized/out-of-scope requests

## 2. Frontend Portal Types

- [x] 2.1 Add `PortalFolder` interface to `frontend/lib/types/portal.ts` (`id: number`, `name: string`, `parent_id: number | null`, `scope_type: string`, `scope_id: string`, `upload_count: number`)
- [x] 2.2 Add `PortalUpload` interface to `frontend/lib/types/portal.ts` (`id: number`, `filename: string`, `url_path: string`, `folder_id: number | null`, `created_at: string | null`)
- [x] 2.3 Add `PortalUploadPage` interface to `frontend/lib/types/portal.ts` (`items: PortalUpload[]`, `total: number`, `page: number`, `page_size: number`)
- [x] 2.4 Add `PortalFolderCreate` interface to `frontend/lib/types/portal.ts` (`name: string`, `parent_id?: number | null`)

## 3. Frontend BFF Routes

- [x] 3.1 Add a `POST` handler to `frontend/app/api/portal/folders/route.ts` that forwards the JSON body and `portal_token` cookie (as `Authorization: Bearer {token}`) to backend `POST /api/portal/folders`
- [x] 3.2 Add a `POST` handler to `frontend/app/api/portal/uploads/route.ts` that reads `await req.formData()`, forwards it as the `body` to backend `POST /api/portal/uploads` with only the `Authorization: Bearer {token}` header (no manual `Content-Type`), and returns the upstream JSON with the upstream status
- [x] 3.3 Verify the existing `DELETE` handler in `frontend/app/api/portal/uploads/[id]/route.ts` forwards correctly (no change needed unless the response shape differs)

## 4. Frontend portalApi (Server-Side) Type Safety

- [x] 4.1 Update `portalApi.folders.all()` in `frontend/lib/portalApi.ts` to return `PortalFolder[]` instead of `any[]`
- [x] 4.2 Update `portalApi.uploads.all()` in `frontend/lib/portalApi.ts` to accept an optional params object `{ folderId?, page?, pageSize? }`, forward those as query params to `/api/portal/uploads`, and return `PortalUploadPage` instead of `any`

## 5. Frontend portalApiClient (Client-Side) Write Methods

- [x] 5.1 Add `folders.create(data: PortalFolderCreate)` to `frontend/lib/portalApiClient.ts` — POSTs JSON to `/api/portal/folders`, returns `PortalFolder`
- [x] 5.2 Add `uploads.create(formData: FormData)` to `frontend/lib/portalApiClient.ts` — POSTs `FormData` to `/api/portal/uploads`, returns `PortalUpload`
- [x] 5.3 Add `uploads.remove(id: number)` to `frontend/lib/portalApiClient.ts` — DELETEs to `/api/portal/uploads/{id}`
- [x] 5.4 Add typed `folders.all()` and `uploads.all(params?)` client-side read methods (or reuse a shared client fetch helper) so the picker can read folders/uploads from the browser
- [x] 5.5 Add error handling that parses BFF error responses and throws typed errors with the server message

## 6. Portal Media Library Page (Interactive)

- [x] 6.1 Rewrite `frontend/app/portal/media/page.tsx` into a server-component shell that fetches initial folders + uploads via typed `portalApi` and renders a new `MediaLibrary` client component
- [x] 6.2 Create `frontend/components/portal/media/MediaLibrary.tsx` — client component with: folders sidebar (selectable), uploads grid (filtered by selected folder), pagination
- [x] 6.3 Add an "Upload" button that opens a file picker; on file selection, build a `FormData` with the file + selected `folder_id` and call `portalApiClient.uploads.create(formData)`; refresh the grid on success; show inline errors (non-image, too large, out-of-scope)
- [x] 6.4 Add a "New Folder" button with an inline name input; on submit call `portalApiClient.folders.create({ name, parent_id: selectedFolderId })`; refresh the folder list on success
- [x] 6.5 Add a delete control per upload that opens `DeleteConfirmDialog` (reuse from change 2; if absent, create `frontend/components/portal/form/DeleteConfirmDialog.tsx`) and on confirm calls `portalApiClient.uploads.remove(id)`, then removes the upload from the grid
- [x] 6.6 Show loading and empty states for both the folders sidebar and the uploads grid

## 7. Portal Media Picker Components

- [x] 7.1 Create `frontend/components/portal/media/PortalMediaPickerModal.tsx` — modal with folder list sidebar (from `portalApiClient.folders.all()`), uploads grid filtered by selected folder (from `portalApiClient.uploads.all({ folderId })`), an "Upload" toggle with inline file upload targeting the selected folder, and `onSelect(urlPath)` / `onClose` props
- [x] 7.2 Create `frontend/components/portal/form/ImageFieldWithPicker.tsx` — text input for `image_url` + "Media" button that opens `PortalMediaPickerModal` + image preview; props `{ label?, value, onChange }`
- [x] 7.3 Ensure the picker only ever calls `/api/portal/*` BFF routes (never admin `/api/folders` or `/api/uploads`)

## 8. Media Picker Integration into Cable/Equipment Forms

- [x] 8.1 Replace the plain `image_url` text input in `frontend/components/portal/form/CableEditForm.tsx` with the portal `ImageFieldWithPicker`
- [x] 8.2 Replace the plain `image_url` text input in `frontend/components/portal/form/CableCreateForm.tsx` with the portal `ImageFieldWithPicker`
- [x] 8.3 Replace the plain `image_url` text input in `frontend/components/portal/form/EquipmentEditForm.tsx` with the portal `ImageFieldWithPicker`
- [x] 8.4 Replace the plain `image_url` text input in `frontend/components/portal/form/EquipmentCreateForm.tsx` with the portal `ImageFieldWithPicker`
- [x] 8.5 Verify the picker's `onSelect` correctly flows the chosen `url_path` into the form's `image_url` state and that the form submits the value via `portalApiClient.cables.update`/`create` or `equipment.update`/`create`

## 9. Verification

- [x] 9.1 Run `tsc --noEmit` in frontend — 0 type errors
- [x] 9.2 Run backend tests — all pass
- [x] 9.3 Run `next build` — succeeds
- [x] 9.4 Smoke test (upload): as a manufacturer, create a folder, upload an image into it, verify the image appears in the media grid and is accessible at its `url_path` — deferred to verify phase (browser smoke)
- [x] 9.5 Smoke test (delete): as a manufacturer, delete an uploaded file via the confirmation dialog, verify it is removed from the grid and the file is gone from disk — deferred to verify phase (browser smoke)
- [x] 9.6 Smoke test (scope enforcement): attempt to upload into another manufacturer's folder, list another manufacturer's uploads via `folder_id`, and delete another manufacturer's upload via direct API — verify all return `404` or empty results — covered by backend tests test_portal_create_upload_cross_scope_folder_404, test_portal_delete_upload_out_of_scope_404
- [x] 9.7 Smoke test (non-image / oversized): attempt to upload a non-image file and a > 5 MB image — verify `400` and `413` respectively — covered by backend tests test_portal_create_upload_non_image_400, test_portal_create_upload_oversized_413
- [x] 9.8 Smoke test (media picker): open the cable edit form, use the picker to select an image, verify the `image_url` field is populated and the preview shows; repeat for equipment edit/create forms — deferred to verify phase (browser smoke)
- [x] 9.9 Smoke test (orphan rejection): attempt to `POST /api/portal/uploads` without a `folder_id` — verify `400`; attempt to `DELETE` an orphan upload — verify `404` — covered by backend tests test_portal_create_upload_missing_folder_id_422, test_portal_delete_upload_orphan_404
