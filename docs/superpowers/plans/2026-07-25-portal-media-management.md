---
change: portal-media-management
design-doc: docs/superpowers/specs/2026-07-25-portal-media-management-design.md
base-ref: 0aebc5a728a9c558e048501f8dd7ee2f736b0446
---

# portal-media-management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add portal-side image upload, folder creation, and scoped delete with a media library page and a media picker wired into the cable/equipment edit/create forms.

**Architecture:** Three-layer portal pattern: Browser → Next.js BFF (`/api/portal/*`) → FastAPI (`/api/portal/*`). Scope is always derived server-side from the `portal_token`; the frontend never sends `scope_type`/`scope_id`. New write paths go through typed `portalApiClient` methods → BFF → backend.

**Tech Stack:** FastAPI + SQLAlchemy + Pillow (backend), Next.js App Router + React 18 + TypeScript (frontend). No new dependencies.

**Implementation order:** follows design doc §10 — Backend → Types → Lib → BFF → Components → Page → Form integration → Verification.

## Global Constraints

- No new npm/pip dependencies.
- No DB schema changes or migrations.
- Portal users cannot create orphan uploads (`folder_id` required on POST).
- Out-of-scope requests return `404` (not `403`) to avoid existence leaks.
- All portal mutations go through `portalApiClient` → BFF → backend (no raw `fetch` in components).
- Project MVP constraint: no automated frontend tests; verify via `tsc`, `next build`, manual smoke.
- All UI strings: English.

---

## 1. Backend Upload Endpoint

Tasks for `backend/app/api/routes/portal_media.py`. Copy the admin upload pipeline (~50 lines) per design doc §6.1; patch `DELETE` per design doc §6.2.

- [ ] 1.1 Add `POST /api/portal/uploads` to `backend/app/api/routes/portal_media.py`. Signature: `async def upload_to_folder(file: UploadFile = File(...), folder_id: int = Form(...), user: User = Depends(require_factory_module("media")), db: AsyncSession = Depends(get_db))`. Import `UploadFile, File, Form` from `fastapi`, `Image` from `PIL`, `uuid`, `BytesIO` from `io`, `os`, and `MEDIA_DIR` from the same module admin `uploads.py` imports it. **Per design doc §6.1 (correction to original task 1.2): `folder_id` is REQUIRED via `Form(...)`, NOT `Form(default=None)`.** FastAPI returns 422/400 automatically if the field is missing.
- [ ] 1.2 Inside `upload_to_folder`: derive `scope_type = user.role.scope_type`, `scope_id = user.scope_id`. Call `await crud_folder.assert_folder_in_scope(db, folder_id, scope_type, scope_id)`; wrap in try/except `HTTPException` → re-raise as `HTTPException(status_code=404, detail={"code": 404, "message": "Folder not found"})` so out-of-scope folders don't leak existence. Matches design doc §6.1 step 3 and spec scenario "Upload to a folder outside scope is rejected".
- [ ] 1.3 Inside `upload_to_folder`: validate `file.content_type` starts with `image/` → else `400` with `{"code": 400, "message": "File must be an image"}`. Read `content = await file.read()`; if `len(content) > 5 * 1024 * 1024` → `413` with `{"code": 413, "message": "File too large (max 5MB)"}`. Wrap `Image.open(BytesIO(content))` in try/except `Exception` → `400` with `{"code": 400, "message": "Invalid image file"}`. Matches design doc §6.1 steps 4-6.
- [ ] 1.4 Inside `upload_to_folder`: re-encode via `img = img.convert("RGB"); img.thumbnail((400, 400))`. Generate `filename = f"{uuid.uuid4().hex}.webp"`. Save to `MEDIA_DIR/uploads/{filename}` with `img.save(path, "WEBP", quality=85)`. Set `url_path = f"/media/uploads/{filename}"`. Capture `size_bytes = os.path.getsize(path)`. Matches design doc §6.1 step 7.
- [ ] 1.5 Inside `upload_to_folder`: insert the `Upload` row (via `crud_upload.create` or direct model — match admin `uploads.py` row construction) with `filename`, `original_filename=file.filename`, `content_type="image/webp"`, `size_bytes`, `url_path`, `folder_id=folder_id`, `scope_type=scope_type`, `scope_id=scope_id`. `await db.commit()` + `await db.refresh(upload)`. Return `201` with `{"id", "filename", "url_path", "folder_id", "created_at"}` (use `upload.created_at.isoformat() + "Z"` if not None, else None — match the existing `list_uploads` shape). Matches design doc §6.1 step 8.
- [ ] 1.6 **NEW task per design doc §6.2 / §9 (spec patch).** Patch the existing `delete_upload` handler in `backend/app/api/routes/portal_media.py` (currently lines 94-124). AFTER the scope check passes (after the `else: raise HTTPException(404)` branch is skipped, BEFORE `await crud_upload.remove(db, id=upload_id)`), insert:

  ```python
  if upload.entity_id is not None:
      raise HTTPException(
          status_code=409,
          detail={"code": 409, "message": "Cannot delete: still associated with an entity"},
      )
  ```

  This matches admin `DELETE /uploads/{id}` behavior and the new spec scenario "Delete upload referenced by an entity returns 409".
- [ ] 1.7 Create `backend/tests/api/test_portal_uploads.py` covering `POST /api/portal/uploads`: success (valid image + in-scope `folder_id` → 201 with `{id, filename, url_path, folder_id, created_at}`); missing `folder_id` → 400/422; cross-scope `folder_id` → 404; non-image content type → 400; oversized file (> 5 MB) → 413; invalid image data (image content type, corrupt bytes) → 400. Reuse the portal auth/scope fixtures pattern from existing `backend/tests/api/test_portal_*.py` files (look for `portal_user` / `portal_token` fixtures).
- [ ] 1.8 In `backend/tests/api/test_portal_uploads.py` add `DELETE /api/portal/uploads/{id}` tests: 409 for an upload referenced by an entity (`upload.entity_id` set non-null); 404 for out-of-scope folder; 404 for orphan (no `folder_id`); 200 success path. Then run existing portal media tests to confirm no regression: if `backend/tests/api/test_portal_media*.py` exists, run `pytest backend/tests/api/test_portal_media*.py -v`. Update any existing test that previously asserted a successful delete of an upload with non-null `entity_id`.

## 2. Frontend Portal Types

Tasks for `frontend/lib/types/portal.ts`. Per the corrections: `PortalFolder`, `PortalUpload`, `PortalUploadsResponse` ALREADY EXIST (lines 155-179); only `PortalFolderCreate` is new and `PortalUploadsResponse` must be renamed to `PortalUploadPage`.

- [ ] 2.1 **VERIFIED — no change.** `PortalFolder` interface already exists in `frontend/lib/types/portal.ts` (lines 155-163) with `id`, `name`, `parent_id`, `scope_type`, `scope_id`, `upload_count`. Confirm only.
- [ ] 2.2 **VERIFIED — no change.** `PortalUpload` interface already exists in `frontend/lib/types/portal.ts` (lines 165-172) with `id`, `filename`, `url_path`, `folder_id`, `created_at`. Confirm only.
- [ ] 2.3 **RENAME** `PortalUploadsResponse` → `PortalUploadPage` in `frontend/lib/types/portal.ts` (line 174). The field shape (`items`, `total`, `page`, `page_size`) is already correct — change only the interface name. Then update importers: `frontend/lib/portalApi.ts` (line 11 import + line 93-94 usage). Grep the repo for any other `PortalUploadsResponse` references and rename them.
- [ ] 2.4 **ADD** `PortalFolderCreate` interface to `frontend/lib/types/portal.ts` (insert immediately after the `PortalFolder` interface, ~line 163): `export interface PortalFolderCreate { name: string; parent_id: number | null; }`. Matches design doc §5 / brainstorm summary.

## 3. Frontend BFF Routes

Tasks for `frontend/app/api/portal/folders/route.ts`, `frontend/app/api/portal/uploads/route.ts`, and `frontend/app/api/portal/uploads/[id]/route.ts`.

- [ ] 3.1 Add a `POST` handler to `frontend/app/api/portal/folders/route.ts` (existing file has only `GET`). Implementation per design doc §6.8: read `const body = await req.json();` then forward to `${API_BASE}/api/portal/folders` with `method: 'POST'`, `headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: \`Bearer ${token}\` } : {}) }`, `body: JSON.stringify(body)`. Return `NextResponse.json(data, { status: res.status })` where `data = await res.json().catch(() => ({}))`.
- [ ] 3.2 Add a `POST` handler to `frontend/app/api/portal/uploads/route.ts` (existing file has only `GET`). Implementation per design doc §6.3: `const formData = await req.formData();` then forward to `${API_BASE}/api/portal/uploads` with `method: 'POST'`, `headers: token ? { Authorization: \`Bearer ${token}\` } : {}`, `body: formData`. **DO NOT set `Content-Type`** — `fetch` generates the correct `multipart/form-data; boundary=...` header automatically. Return `NextResponse.json(data, { status: res.status })`.
- [ ] 3.3 **VERIFIED — no change.** The existing `DELETE` handler in `frontend/app/api/portal/uploads/[id]/route.ts` (lines 1-14) correctly forwards `Authorization: Bearer {token}` and returns the upstream JSON with the upstream status. Confirmed in design doc §6 (corrections to tasks.md). Confirm only; do not edit.

## 4. Frontend portalApi (Server-Side) Type Safety

Tasks for `frontend/lib/portalApi.ts`.

- [ ] 4.1 **VERIFIED — no change.** `portalApi.folders.all()` (lines 87-90) already returns `Promise<PortalFolder[]>` typed. Confirm only.
- [ ] 4.2 Update `portalApi.uploads.all()` in `frontend/lib/portalApi.ts` (lines 92-95) to accept `params?: { folderId?: number; page?: number; pageSize?: number }` and forward as query params. Implementation:

  ```ts
  async all(params?: { folderId?: number; page?: number; pageSize?: number }): Promise<PortalUploadPage> {
    const qs = new URLSearchParams();
    if (params?.folderId != null) qs.set('folder_id', String(params.folderId));
    if (params?.page != null) qs.set('page', String(params.page));
    if (params?.pageSize != null) qs.set('page_size', String(params.pageSize));
    const suffix = qs.toString() ? `?${qs}` : '';
    return portalGet<PortalUploadPage>(`/api/portal/uploads${suffix}`);
  }
  ```

  Return type changes from `PortalUploadsResponse` → `PortalUploadPage` (already renamed in task 2.3).

## 5. Frontend portalApiClient (Client-Side) Methods

Tasks for `frontend/lib/portalApiClient.ts`. Per corrections: the client currently has NO `folders`/`uploads` methods at all; `bffFetch` already throws `PortalApiError` with the server message — just ensure the new methods use it.

- [ ] 5.1 **Explicit task per design doc §6.4.** Patch `bffFetch` in `frontend/lib/portalApiClient.ts` (lines 23-38) to accept a `skipDefaultContentType?: boolean` option. New signature and body:

  ```ts
  async function bffFetch(
    path: string,
    options: RequestInit & { skipDefaultContentType?: boolean } = {},
  ): Promise<Response> {
    const { skipDefaultContentType, headers, ...rest } = options;
    const finalHeaders = skipDefaultContentType
      ? (headers as Record<string, string> | undefined)
      : { 'Content-Type': 'application/json', ...((headers as Record<string, string>) ?? {}) };
    const res = await fetch(path, { ...rest, headers: finalHeaders });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new PortalApiError(
        res.status,
        data.code ?? res.status,
        data.message ?? 'Request failed',
        data.field_errors,
      );
    }
    return res;
  }
  ```

  Backward-compatible (default `false`); existing JSON callers are unaffected. **Task 5.2 below depends on this.**
- [ ] 5.2 Add a `folders` namespace to the `portalApiClient` object in `frontend/lib/portalApiClient.ts` (insert after the `auth` namespace, before the closing brace). Two methods:

  ```ts
  folders: {
    async all(): Promise<PortalFolder[]> {
      const res = await bffFetch('/api/portal/folders');
      return res.json();
    },
    async create(data: PortalFolderCreate): Promise<PortalFolder> {
      const res = await bffFetch('/api/portal/folders', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.json();
    },
  },
  ```

  Extend the existing type import at the top of the file to include `PortalFolder` and `PortalFolderCreate`. This satisfies original tasks 5.1 (folders.create) and the folders part of 5.4 (folders.all client-side).
- [ ] 5.3 Add an `uploads` namespace to the `portalApiClient` object. Three methods:

  ```ts
  uploads: {
    async all(params?: { folderId?: number; page?: number; pageSize?: number }): Promise<PortalUploadPage> {
      const qs = new URLSearchParams();
      if (params?.folderId != null) qs.set('folder_id', String(params.folderId));
      if (params?.page != null) qs.set('page', String(params.page));
      if (params?.pageSize != null) qs.set('page_size', String(params.pageSize));
      const suffix = qs.toString() ? `?${qs}` : '';
      const res = await bffFetch(`/api/portal/uploads${suffix}`);
      return res.json();
    },
    async create(formData: FormData): Promise<PortalUpload> {
      const res = await bffFetch('/api/portal/uploads', {
        method: 'POST',
        body: formData,
        skipDefaultContentType: true,
      });
      return res.json();
    },
    async remove(id: number): Promise<void> {
      await bffFetch(`/api/portal/uploads/${id}`, { method: 'DELETE' });
    },
  },
  ```

  `uploads.create` depends on task 5.1 for the `skipDefaultContentType` option. Extend the type import to include `PortalUpload` and `PortalUploadPage`. This satisfies original tasks 5.2, 5.3, and the uploads part of 5.4.
- [ ] 5.4 **VERIFIED — no change.** `bffFetch` already throws `PortalApiError` with `status`, `code`, server `message`, and `field_errors` (lines 28-37). The new methods in 5.2/5.3 inherit this error handling automatically. Confirm only.

## 6. Portal Media Library Page (Interactive)

Tasks for `frontend/app/portal/media/page.tsx` and `frontend/components/portal/media/MediaLibrary.tsx`.

- [ ] 6.1 Rewrite `frontend/app/portal/media/page.tsx` as a server-component shell. Replace the current read-only render (lines 1-63) with:

  ```tsx
  import { portalApi } from '@/lib/portalApi';
  import { MediaLibrary } from '@/components/portal/media/MediaLibrary';
  import type { PortalFolder, PortalUploadPage } from '@/lib/types/portal';

  export default async function PortalMediaPage() {
    const [folders, uploads] = await Promise.all([
      portalApi.folders.all().catch(() => [] as PortalFolder[]),
      portalApi.uploads.all({ page: 1, pageSize: 20 }).catch(
        () => ({ items: [], total: 0, page: 1, page_size: 20 }) as PortalUploadPage,
      ),
    ]);
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Media Library</h1>
        <MediaLibrary initialFolders={folders} initialUploads={uploads} />
      </div>
    );
  }
  ```

  Drops the inline `any` types (now typed via `portalApi`).
- [ ] 6.2 Create `frontend/components/portal/media/MediaLibrary.tsx` as a client component (`'use client';`). Props: `{ initialFolders: PortalFolder[]; initialUploads: PortalUploadPage }`. State: `folders: PortalFolder[]` (init from props), `uploads: PortalUploadPage` (init from props), `selectedFolder: 'all' | number` (init `'all'`), `currentPage: number` (init `1`), `uploading: boolean`, `creatingFolder: boolean`, `deleteTarget: PortalUpload | null`, `errorMessage: string`. Layout: top toolbar (Upload + New Folder buttons) + grid (left folder sidebar, right uploads grid + pagination). Import `portalApiClient` from `@/lib/portalApiClient`, `DeleteConfirmDialog` from `@/components/portal/form/DeleteConfirmDialog`, and types from `@/lib/types/portal`.
- [ ] 6.3 In `MediaLibrary`: add a `useEffect` with deps `[selectedFolder, currentPage]` that calls `portalApiClient.uploads.all({ folderId: selectedFolder === 'all' ? undefined : selectedFolder, page: currentPage, pageSize: 20 })` and updates `uploads` state. Show a loading spinner while fetching; show empty state ("No uploads.") when `uploads.items.length === 0`. Skip the effect on the initial render (initial data already comes from SSR props) — guard with a `didMount` ref or compare against initial values.
- [ ] 6.4 Add an "Upload" button in `MediaLibrary` toolbar wired to a hidden `<input type="file" accept="image/*" />`. On file selection: determine `targetFolderId = selectedFolder === 'all' ? folders[0]?.id : selectedFolder`. If `targetFolderId` is undefined → set `errorMessage = 'Create a folder first.'` and abort. Build `const formData = new FormData(); formData.append('file', file); formData.append('folder_id', String(targetFolderId));`. Call `portalApiClient.uploads.create(formData)`; on success, refresh `uploads` (re-run the effect's fetch logic) and `folders` (`portalApiClient.folders.all()`). On `PortalApiError`, set `errorMessage = err.message`. Reset the input's value to `''` after.
- [ ] 6.5 Add a "New Folder" button in `MediaLibrary` toolbar that toggles an inline text input (state `creatingFolder` controls visibility; a local `newFolderName` state holds the value). On submit (Enter key or "Create" button): call `portalApiClient.folders.create({ name: newFolderName, parent_id: null })`; on success refresh `folders` (`portalApiClient.folders.all()`), clear `newFolderName`, set `creatingFolder=false`. On `PortalApiError`, set `errorMessage`.
- [ ] 6.6 Add a delete control (trash icon button) on each upload card in the grid. Clicking it sets `deleteTarget` to that upload. Render `<DeleteConfirmDialog open={!!deleteTarget} title="Delete file" message="Are you sure you want to delete this file? This action cannot be undone." onCancel={() => setDeleteTarget(null)} onConfirm={handleDelete} />` where `handleDelete` calls `await portalApiClient.uploads.remove(deleteTarget.id)`, then `setDeleteTarget(null)`, then refreshes `uploads` and `folders`. Import `DeleteConfirmDialog` from `@/components/portal/form/DeleteConfirmDialog` (**VERIFIED — already exists from change 2; do NOT create a new file**). The dialog already surfaces errors thrown by `onConfirm`, so a 409 from the backend `entity_id` check displays automatically.
- [ ] 6.7 Add pagination controls in `MediaLibrary` (Prev / Next buttons + "Page X of Y" label, where Y = `Math.max(1, Math.ceil(uploads.total / uploads.page_size))`). On Prev/Next click, update `currentPage` clamped to `[1, Y]`; the `useEffect` from 6.3 re-fetches. Show loading states for both the sidebar (folders) and the grid (uploads).

## 7. Portal Media Picker Components

Tasks for `frontend/components/portal/media/PortalMediaPickerModal.tsx` and `frontend/components/portal/form/ImageFieldWithPicker.tsx`. Reference admin `frontend/components/admin/form/MediaPickerModal.tsx` for layout pattern; DO NOT import admin `FolderTree` / `MediaGrid` / `MediaUploader` (they hit admin endpoints).

- [ ] 7.1 Create `frontend/components/portal/media/PortalMediaPickerModal.tsx` as a client component. Props: `{ open: boolean; onSelect: (urlPath: string) => void; onClose: () => void }`. When `open`, fetch `portalApiClient.folders.all()` and `portalApiClient.uploads.all({ folderId: typeof selectedFolder === 'number' ? selectedFolder : undefined, page: 1, pageSize: 20 })` (init `selectedFolder` to `'all'` or first folder id). Layout: modal overlay + folder sidebar + uploads grid + inline "Upload" toggle (file input + target = currently selected folder; uses `portalApiClient.uploads.create(formData)`) + Select/Cancel buttons. Clicking an upload card calls `onSelect(upload.url_path)` then `onClose()`. **Only call `/api/portal/*` BFF routes (never `/api/folders` or `/api/uploads`).**
- [ ] 7.2 Create `frontend/components/portal/form/ImageFieldWithPicker.tsx` as a client component. Props: `{ label?: string; value: string; onChange: (v: string) => void }`. Layout: text input for `image_url` (bound to `value`/`onChange`) + "Media" button that opens `<PortalMediaPickerModal open={pickerOpen} onSelect={(url) => { onChange(url); setPickerOpen(false); }} onClose={() => setPickerOpen(false)} />` + preview `<img src={value} alt="Preview" />` (render only when `value` is non-empty and looks like an image). Import `PortalMediaPickerModal` from `@/components/portal/media/PortalMediaPickerModal`. Reference admin `frontend/components/admin/form/ImageFieldWithPicker.tsx` (if present) for layout pattern.
- [ ] 7.3 **VERIFIED via construction** — confirm during implementation that `PortalMediaPickerModal` only imports from `@/lib/portalApiClient` (never `@/lib/clientFolders` or `@/lib/clientUploads`) and only calls `/api/portal/*` BFF routes. Self-review the file before marking complete.

## 8. Media Picker Integration into Cable/Equipment Forms

Tasks for `frontend/components/portal/form/CableEditForm.tsx`, `CableCreateForm.tsx`, `EquipmentEditForm.tsx`, `EquipmentCreateForm.tsx`. Replace the plain `image_url` text input with `<ImageFieldWithPicker>`.

- [ ] 8.1 In `frontend/components/portal/form/CableEditForm.tsx`: locate the `image_url` text input (grep for `image_url` in the file). Replace it with `<ImageFieldWithPicker label="Image URL" value={form.image_url ?? ''} onChange={(v) => setForm({ ...form, image_url: v })} />` (adjust to the actual state setter pattern used in the file — match the existing field handlers). Import `ImageFieldWithPicker` from `@/components/portal/form/ImageFieldWithPicker`. Preserve the existing form submit logic (`portalApiClient.cables.update`).
- [ ] 8.2 In `frontend/components/portal/form/CableCreateForm.tsx`: same replacement as 8.1. Preserve the existing submit logic (`portalApiClient.cables.create`).
- [ ] 8.3 In `frontend/components/portal/form/EquipmentEditForm.tsx`: same replacement as 8.1. Preserve the existing submit logic (`portalApiClient.equipment.update`).
- [ ] 8.4 In `frontend/components/portal/form/EquipmentCreateForm.tsx`: same replacement as 8.1. Preserve the existing submit logic (`portalApiClient.equipment.create`).
- [ ] 8.5 Verify (manual, no code change unless broken): the `ImageFieldWithPicker` `onChange` flows the chosen `url_path` into the form state, and the form's existing submit handler sends `image_url` to the backend via the existing `portalApiClient.cables.*` / `portalApiClient.equipment.*` call. No BFF/backend changes in this task.

## 9. Verification

- [ ] 9.1 Run `npx tsc --noEmit` in `frontend/` — expect 0 type errors. Pay attention to: the `PortalUploadsResponse` → `PortalUploadPage` rename (all importers updated), the new `portalApiClient.folders` / `portalApiClient.uploads` namespaces, the `bffFetch` signature change (no existing callers broken), and the new component props.
- [ ] 9.2 Run backend tests: `pytest backend/tests/api/test_portal_uploads.py -v` (new file, all green) AND `pytest backend/tests/api/test_portal_media*.py -v` (existing tests still green — the new `entity_id` 409 check must not regress existing delete tests; update any test that previously asserted a successful delete of an upload with a non-null `entity_id`).
- [ ] 9.3 Run `npx next build` in `frontend/` — expect success. Confirm the portal routes compile: `/portal/media`, `/portal/cables/new`, `/portal/equipment/new`, `/portal/cables/[id]/edit`, `/portal/equipment/[id]/edit`, and the new BFF POST routes `/api/portal/folders` + `/api/portal/uploads`.
- [ ] 9.4 Smoke test (upload flow): as a manufacturer, log in → `/portal/media` → click "New Folder" → enter a name → confirm it appears in the sidebar with count 0. Click "Upload" → choose an image → confirm it appears in the grid and is accessible at its `url_path` (open in a new tab).
- [ ] 9.5 Smoke test (delete flow): as a manufacturer, delete an unreferenced upload via the confirmation dialog → confirm it disappears from the grid. Then attempt to delete an upload that is referenced by a cable/equipment `image_url` → confirm the dialog shows the 409 message "Cannot delete: still associated with an entity" (the `DeleteConfirmDialog` surfaces the `PortalApiError.message`).
- [ ] 9.6 Smoke test (scope enforcement): as manufacturer A, attempt (a) `POST /api/portal/uploads` with manufacturer B's `folder_id` → expect 404; (b) `GET /api/portal/uploads?folder_id={B_folder_id}` via direct API → expect empty `items`; (c) `DELETE /api/portal/uploads/{B_upload_id}` via direct API → expect 404.
- [ ] 9.7 Smoke test (validation): attempt `POST /api/portal/uploads` with a non-image file → expect 400 "File must be an image"; attempt with a > 5 MB image → expect 413 "File too large (max 5MB)"; attempt `POST` without `folder_id` (omit the form field) → expect 400/422 (FastAPI Form required-field validation).
- [ ] 9.8 Smoke test (media picker): log in → `/portal/cables/[id]/edit` → click "Media" on the `image_url` field → confirm `PortalMediaPickerModal` opens and lists scoped folders + uploads → select an image → confirm `image_url` is populated and the preview shows → save the form → confirm the value persists. Repeat for `/portal/cables/new`, `/portal/equipment/[id]/edit`, `/portal/equipment/new`.
- [ ] 9.9 Smoke test (orphan rejection): attempt `POST /api/portal/uploads` with a valid image but no `folder_id` (or `folder_id=null`) → confirm 400/422 (Form required-field validation). Attempt `DELETE /api/portal/uploads/{orphan_id}` (an upload with `folder_id IS NULL`, e.g. seeded via admin) → confirm 404 "Upload not found".
