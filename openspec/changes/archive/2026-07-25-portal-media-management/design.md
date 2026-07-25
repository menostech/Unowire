## Context

The manufacturer portal media page (`frontend/app/portal/media/page.tsx`) is a read-only server component: it calls `portalApi.folders.all()` and `portalApi.uploads.all()` (both returning `any`) and renders a static folders sidebar + uploads grid with no upload, create-folder, or delete affordances.

Backend state (`backend/app/api/routes/portal_media.py`):
- `GET /api/portal/folders` — lists folders filtered by `scope_type` + `scope_id` with upload counts.
- `POST /api/portal/folders` — creates a folder, forcing `scope_type`/`scope_id` to the authenticated user's scope via `crud_folder.create_with_depth_check`.
- `GET /api/portal/uploads` — paginated, scope-filtered uploads list (supports `folder_id`, `page`, `page_size`).
- `DELETE /api/portal/uploads/{id}` — deletes an upload after verifying the upload's folder is within the caller's scope; rejects orphan (no-folder) uploads for portal users.
- **No `POST /api/portal/uploads` exists** — there is no portal upload endpoint.

The admin backend (`backend/app/api/routes/uploads.py`) already implements a robust upload endpoint: `POST /` accepts `UploadFile` + `folder_id` form field, enforces image-only content type, 5 MB max size, re-encodes to WebP via Pillow with a 400x400 thumbnail, saves to `MEDIA_DIR/uploads/{uuid}.webp`, and creates an `Upload` row. Scoped admin users must upload to a folder within their scope (`crud_folder.assert_folder_in_scope`). This is the proven pattern to mirror for the portal.

BFF state:
- `frontend/app/api/portal/folders/route.ts` — GET-only (forwards to backend `GET /api/portal/folders`).
- `frontend/app/api/portal/uploads/route.ts` — GET-only (forwards to backend `GET /api/portal/uploads`).
- `frontend/app/api/portal/uploads/[id]/route.ts` — DELETE (forwards to backend `DELETE /api/portal/uploads/{id}`).

Frontend admin components `components/admin/form/MediaPickerModal.tsx` and `ImageFieldWithPicker.tsx` implement a media picker modal (folder tree + media grid + inline uploader) and a text-input-plus-"Media"-button field. They are NOT directly reusable because they import `lib/clientFolders` (admin endpoints) and the admin `MediaUploader`/`MediaGrid` which call admin upload endpoints. Their structure is the template for portal-scoped equivalents.

This change depends on `portal-foundation-refactor` (change 1), which established the `portalApi` (server-side, cookie via `next/headers`) / `portalApiClient` (client-side, browser httpOnly cookie via BFF) split and the unified BFF write pattern. It also depends on `portal-cable-equipment-crud` (change 2) for the `image_url` field on the cable/equipment edit forms and the shared `DeleteConfirmDialog` component.

## Goals / Non-Goals

**Goals:**
- Add a portal file upload endpoint that accepts images, enforces scope, and stores them alongside the existing admin uploads.
- Let manufacturers create folders within their scope from the portal UI.
- Let manufacturers delete their own uploads with a confirmation step.
- Make uploaded media strictly scoped: a manufacturer can never list, access, or delete another manufacturer's media or orphan (no-folder) uploads.
- Provide a media picker that lets users select an uploaded image for a cable/equipment `image_url` field directly inside the edit/create forms.
- Route all portal mutations through typed `portalApiClient` methods + BFF routes (no raw `fetch` in components).

**Non-Goals:**
- Cable/equipment CRUD — covered by change 2 (`portal-cable-equipment-crud`).
- Foundation refactoring (type-safe `portalApi`, BFF write layer, error resilience) — covered by change 1 (`portal-foundation-refactor`).
- Upload rename/move operations (the admin has `PUT`/`PATCH` on uploads; the portal does not need them yet).
- Non-image file uploads (PDFs, documents) — out of scope; the admin upload endpoint is image-only and the portal mirrors that.
- Database schema changes or new migrations.
- New npm/pip dependencies.

## Decisions

### 1. Upload endpoint: `POST /api/portal/uploads` mirroring the admin pattern

**Choice**: Add a `POST /api/portal/uploads` route to `portal_media.py` that accepts `file: UploadFile` + `folder_id: int | None = Form(default=None)`, requires the `media` module via `require_factory_module("media")`, and reuses the admin upload pipeline: image-only `content_type` check, 5 MB max (`MAX_FILE_SIZE`), Pillow `Image.open` + `convert("RGB")` + `thumbnail((400, 400))`, save as `{uuid}.webp` under `MEDIA_DIR/uploads`, and create an `Upload` row.

**Rationale**: The admin `uploads.py` upload handler is already battle-tested. Duplicating the pipeline in the portal router (rather than refactoring a shared helper) keeps the change scoped and avoids touching the admin path. The two handlers share the same storage layout and `Upload` model, so portal and admin uploads are interchangeable on disk and in the DB.

**Portal-specific scope rule**: Because portal users are always scoped (`scope_type`/`scope_id` from `user.role`), the portal upload endpoint SHALL require a non-null `folder_id` and SHALL call `crud_folder.assert_folder_in_scope(db, folder_id, scope_type, scope_id)` before saving. This matches the existing portal `DELETE` handler's "reject orphan uploads" rule and prevents uploads from escaping the manufacturer's scope.

**Alternative considered**: Refactoring `uploads.py`'s `upload_file` into a shared `crud_upload.save_image()` helper and calling it from both routers. Rejected for this change to minimize blast radius; can be done as a follow-up cleanup.

### 2. BFF multipart forwarding: pass `FormData` straight through

**Choice**: The `POST` handler in `frontend/app/api/portal/uploads/route.ts` reads the incoming request as `await req.formData()` and forwards that `FormData` object directly as the `body` of the backend `fetch`, setting only the `Authorization: Bearer {portal_token}` header. It does NOT manually set `Content-Type` (so the runtime attaches the correct `multipart/form-data; boundary=...`).

**Rationale**: Manually reconstructing multipart bodies in the BFF is error-prone. `fetch` natively accepts a `FormData` body and generates the boundary. This keeps the BFF a thin proxy and preserves the file bytes without re-serialization.

**Size limit**: Next.js Server Actions / route handlers default to a ~4 MB body limit for `formData()` in some deployments. The backend enforces 5 MB. If the platform rejects large payloads at the BFF edge, the BFF SHALL return the upstream error to the client. Mitigation noted in Risks.

### 3. Folder creation: backend already exists; only the BFF `POST` is new

**Choice**: The backend `POST /api/portal/folders` route already exists and already forces `scope_type`/`scope_id` to the caller's scope. No backend change is needed for folder creation. We only add a `POST` handler to `frontend/app/api/portal/folders/route.ts` that forwards the JSON body + `portal_token` cookie.

**Rationale**: Avoids redundant backend work. The portal folder-creation UI calls `portalApiClient.folders.create({ name, parent_id })` → BFF `POST /api/portal/folders` → backend `POST /api/portal/folders`.

### 4. Portal-scoped media picker (not direct reuse of admin components)

**Choice**: Create new `frontend/components/portal/media/PortalMediaPickerModal.tsx` and `frontend/components/portal/form/ImageFieldWithPicker.tsx` that mirror the admin `MediaPickerModal` / `ImageFieldWithPicker` structure but source folders/uploads from `portalApiClient` (which hits `/api/portal/folders` and `/api/portal/uploads`) and upload via the portal BFF `POST /api/portal/uploads`.

**Rationale**: The admin `MediaPickerModal` imports `lib/clientFolders` (admin `/api/folders`), `MediaUploader` (admin `/api/uploads`), and `MediaGrid` (admin endpoints). These would leak admin endpoints and bypass portal scope enforcement. A portal-scoped copy is safer and clearer than parameterizing the admin component with an "endpoint set" prop, and keeps the admin surface untouched.

**Modal contents**: The portal modal renders a folder list (from `portalApiClient.folders.all()`), an uploads grid filtered by the selected folder (from `portalApi.uploads.all({ folderId })`), an inline uploader (file input → `portalApiClient.uploads.create(formData)` targeting the selected folder), and an "Upload" toggle. Selecting an upload calls `onSelect(urlPath)` and closes.

### 5. Type-safe `portalApi` + `portalApiClient` media methods

**Choice**:
- Server-side `portalApi.folders.all()` returns `PortalFolder[]`; `portalApi.uploads.all(params?)` returns `PortalUploadPage` and forwards `folder_id`/`page`/`page_size` query params.
- Client-side `portalApiClient.folders.create(data: PortalFolderCreate)`, `portalApiClient.uploads.create(formData: FormData)`, `portalApiClient.uploads.remove(id: number)` — all backed by BFF routes that forward the `portal_token` cookie.

**Rationale**: Consistent with the `portalApiClient` write layer established in change 1. The upload method takes a `FormData` (not a typed JSON object) because the backend expects multipart; the other two methods take typed payloads.

### 6. Delete confirmation reuses change 2's `DeleteConfirmDialog`

**Choice**: The media page delete action uses the shared `DeleteConfirmDialog` component introduced by change 2 (`portal-cable-equipment-crud`), configured with a media-specific message ("Are you sure you want to delete this file? This action cannot be undone.").

**Rationale**: Avoids a duplicate dialog component and keeps confirmation UX consistent across the portal. If change 2 is not yet implemented when this change starts, the task list includes a fallback to create the dialog.

### 7. Scope enforcement on the upload path is defense-in-depth

**Choice**: Scope is enforced at three layers: (a) the backend `POST /api/portal/uploads` calls `crud_folder.assert_folder_in_scope` on `folder_id`; (b) the backend `GET /api/portal/uploads` filters by `scope_type`/`scope_id`; (c) the backend `DELETE /api/portal/uploads/{id}` re-checks the upload's folder scope and rejects orphans. The BFF and frontend never trust a client-supplied scope — they only forward the `portal_token`, and the backend derives scope from the token's user.

**Rationale**: The frontend cannot be trusted to enforce scope. All scope decisions are server-side, keyed off the authenticated user. This matches the existing portal pattern.

## Risks / Trade-offs

- **[BFF body-size limits on multipart]** → Next.js route handlers may reject `formData()` payloads above a platform-configured limit before the request reaches the backend. Mitigation: keep the 5 MB cap; document that the deployment's body-size limit must be ≥ 5 MB; surface upstream errors to the user. Trade-off: a single hard cap rather than chunked/resumable uploads — acceptable for portal image thumbnails.
- **[Code duplication with admin upload handler]** → The portal `POST /api/portal/uploads` duplicates the admin `uploads.py` image-processing pipeline. Mitigation: keep the duplicate minimal and note a follow-up to extract a shared helper. Trade-off: smaller blast radius now vs. some duplication.
- **[Portal media picker duplicates admin picker]** → A second `MediaPickerModal`/`ImageFieldWithPicker` exists. Mitigation: the portal copy is intentionally scoped and simpler; admin stays untouched. Trade-off: two components to maintain, but they target different endpoints and audiences.
- **[Cross-manufacturer access via direct API]** → A malicious manufacturer could try `GET /api/portal/uploads?folder_id=<other_manufacturer_folder>` or `DELETE /api/portal/uploads/{other_id}`. Mitigation: every portal read/delete filters/rechecks by the caller's `scope_type`/`scope_id`; out-of-scope requests return `404` (no existence leak). This is already the behavior of the existing portal routes; the new upload route follows the same rule.
- **[Orphan uploads]** → Portal users cannot create orphan (no-folder) uploads because `folder_id` is required on `POST /api/portal/uploads`, and the existing `DELETE` rejects orphans. No new risk introduced.
- **[Dependency on change 1 & 2 artifacts]** → This change assumes `portalApiClient`, `frontend/lib/types/portal.ts`, the BFF write pattern, `DeleteConfirmDialog`, and the `image_url` field on cable/equipment forms all exist. If those land in a different order, the integration tasks (picker wiring) must be sequenced after change 2's form work. Mitigation: task groups are ordered so backend + standalone media UI can proceed independently of the form-wiring tasks.
