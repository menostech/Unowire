## Why

The manufacturer portal media page (`/portal/media`) is currently read-only: it displays folders in a static list and renders an uploads grid with no interactivity. Manufacturers cannot upload images, create folders, or delete their own uploads from the portal, even though the backend already supports listing scope-filtered folders/uploads and deleting uploads. There is also no upload (`POST`) endpoint on the portal backend — only the admin backend (`uploads.py`) can accept file uploads. As a result, portal users cannot manage the images they need for cable and equipment `image_url` fields without asking an admin to upload on their behalf.

This is change 3 of a 3-change batch refactoring the manufacturer portal. It builds on change 1 (`portal-foundation-refactor`), which establishes the type-safe `portalApi`/`portalApiClient` split and the unified BFF write layer, and on change 2 (`portal-cable-equipment-crud`), which expands the cable/equipment edit forms to include `image_url` fields. This change closes the loop by giving manufacturers self-service media upload, folder management, deletion, and an in-form media picker.

## What Changes

- **Portal upload endpoint**: Add `POST /api/portal/uploads` to `backend/app/api/routes/portal_media.py` accepting multipart form data (`file` + optional `folder_id`), enforcing image-only content, 5 MB max size, scope-bound folder validation, WebP re-encode + 400x400 thumbnail (mirroring the admin `uploads.py` pattern), and returning `201 Created` with the new `Upload` record.
- **Folder creation BFF**: Add a `POST` handler to `frontend/app/api/portal/folders/route.ts` (currently GET-only) that forwards the folder name + `parent_id` and the `portal_token` cookie to the backend `POST /api/portal/folders`.
- **Upload BFF (multipart)**: Add a `POST` handler to `frontend/app/api/portal/uploads/route.ts` (currently GET-only) that reads the incoming `multipart/form-data`, forwards it to the backend `POST /api/portal/uploads` with the `portal_token` cookie as a Bearer token, and streams the JSON response back.
- **Type-safe portalApi (server-side)**: Replace the `any` return types on `portalApi.folders.all()` and `portalApi.uploads.all()` with `PortalFolder[]` and `PortalUploadPage` interfaces; add `portalApi.uploads.all({ folderId, page, pageSize })` query-parameter support.
- **portalApiClient (client-side) write methods**: Add `portalApiClient.folders.create(data)`, `portalApiClient.uploads.create(formData)`, and `portalApiClient.uploads.remove(id)` to `frontend/lib/portalApiClient.ts`, backed by the new BFF routes.
- **Portal types**: Add `PortalFolder`, `PortalUpload`, `PortalUploadPage`, and `PortalFolderCreate` interfaces to `frontend/lib/types/portal.ts`.
- **Interactive media page**: Rewrite `frontend/app/portal/media/page.tsx` into a server component shell + a new `MediaLibrary` client component that supports folder selection, an "Upload" button (with file picker + target folder), a "New Folder" button (with inline name input), per-upload delete with a confirmation dialog, and pagination.
- **Portal media picker**: Create `frontend/components/portal/media/PortalMediaPickerModal.tsx` and `frontend/components/portal/form/ImageFieldWithPicker.tsx` — portal-scoped adaptations of the admin `MediaPickerModal` and `ImageFieldWithPicker` that call `portalApiClient` (folders/uploads) and `/api/portal/uploads` instead of the admin `lib/clientFolders`/admin upload endpoints.
- **Picker integration**: Wire the portal `ImageFieldWithPicker` into the `image_url` field of `CableEditForm` and `EquipmentEditForm` (and their create-form counterparts from change 2) so users can pick an uploaded image without leaving the form.

## Capabilities

### New Capabilities

- `portal-media-management`: Manufacturer-scoped media upload (image files to scoped folders), folder creation within scope, deletion of own uploads with confirmation, scope-enforced access (no cross-manufacturer media access, no orphan uploads), and an in-form media picker for cable/equipment `image_url` fields. All operations flow through typed `portalApiClient` methods and BFF routes that forward the `portal_token` cookie.

### Modified Capabilities

<!-- No existing specs to modify — this is the third change in a 3-change batch. It builds on portal-api-layer and portal-error-resilience from change 1 (portal-foundation-refactor) and on portal-cable-crud / portal-equipment-crud from change 2 (portal-cable-equipment-crud), none of which are archived yet. -->

## Impact

- **Backend routes**: `backend/app/api/routes/portal_media.py` — add `POST /api/portal/uploads` (multipart upload, scope-bound, image-only, WebP re-encode). The existing `GET /folders`, `POST /folders`, `GET /uploads`, and `DELETE /uploads/{id}` routes are reused unchanged.
- **Backend deps**: Reuses existing `Pillow`, `UploadFile`, `crud_upload`, `crud_folder`, and `MEDIA_DIR` env — no new dependencies, no schema migrations.
- **Frontend BFF routes**: `frontend/app/api/portal/folders/route.ts` — add `POST` handler; `frontend/app/api/portal/uploads/route.ts` — add `POST` (multipart-forwarding) handler; `frontend/app/api/portal/uploads/[id]/route.ts` — already has `DELETE` (reused).
- **Frontend lib**: `frontend/lib/portalApi.ts` — type `folders` and `uploads` returns, add query-param support to `uploads.all()`; `frontend/lib/portalApiClient.ts` — add `folders.create()`, `uploads.create()`, `uploads.remove()`; `frontend/lib/types/portal.ts` — add `PortalFolder`, `PortalUpload`, `PortalUploadPage`, `PortalFolderCreate`.
- **Frontend pages**: `frontend/app/portal/media/page.tsx` — rewrite into server shell + `MediaLibrary` client component with upload, create-folder, delete, and folder filtering.
- **Frontend components**: new `frontend/components/portal/media/PortalMediaPickerModal.tsx`, new `frontend/components/portal/media/MediaLibrary.tsx`, new `frontend/components/portal/form/ImageFieldWithPicker.tsx`; reuse `DeleteConfirmDialog` from change 2 for delete confirmation.
- **Frontend form integration**: `frontend/components/portal/form/CableEditForm.tsx`, `CableCreateForm.tsx`, `EquipmentEditForm.tsx`, `EquipmentCreateForm.tsx` — replace the plain `image_url` text input with the portal `ImageFieldWithPicker`.
- **No database changes**: No schema migrations required.
- **No new dependencies**: Uses existing Next.js, React, TypeScript, FastAPI, and Pillow stack.
