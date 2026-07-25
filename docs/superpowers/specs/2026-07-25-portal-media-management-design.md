---
comet_change: portal-media-management
role: technical-design
canonical_spec: openspec
---

# Design Doc: portal-media-management

**Change**: portal-media-management
**Date**: 2026-07-25
**Status**: confirmed
**Canonical spec**: `openspec/changes/portal-media-management/specs/portal-media-management/spec.md`

## 1. Context

The manufacturer portal media page (`frontend/app/portal/media/page.tsx`) is currently a read-only server component. Manufacturers cannot upload images, create folders, or delete their own uploads from the portal. The backend already supports `GET /folders`, `POST /folders`, `GET /uploads`, and `DELETE /uploads/{id}` (scope-filtered), but there is no `POST /uploads` portal endpoint — only the admin backend (`uploads.py`) can accept file uploads. As a result, portal users cannot self-serve the images they need for cable/equipment `image_url` fields.

This change is the third of a 3-change batch refactoring the manufacturer portal. It depends on:
- Change 1 (`portal-foundation-refactor`): established the type-safe `portalApi` (server) / `portalApiClient` (client) split and the unified BFF write layer.
- Change 2 (`portal-cable-equipment-crud`): added `image_url` fields to cable/equipment edit/create forms and introduced the shared `DeleteConfirmDialog` component.

## 2. Goals

- Add a portal file upload endpoint that accepts images, enforces scope, and stores them alongside existing admin uploads.
- Let manufacturers create folders within their scope from the portal UI.
- Let manufacturers delete their own uploads with a confirmation step; reject deletion of uploads still referenced by an entity (409).
- Make uploaded media strictly scoped: a manufacturer can never list, access, or delete another manufacturer's media or orphan (no-folder) uploads.
- Provide a media picker that lets users select an uploaded image for a cable/equipment `image_url` field directly inside the edit/create forms.
- Route all portal mutations through typed `portalApiClient` methods + BFF routes (no raw `fetch` in components).

## 3. Non-Goals

- Cable/equipment CRUD — covered by change 2.
- Foundation refactoring — covered by change 1.
- Upload rename/move operations (admin has `PUT`/`PATCH`; portal does not need them yet).
- Non-image file uploads (PDFs, documents) — out of scope.
- Database schema changes or new migrations.
- New npm/pip dependencies.
- Extracting a shared upload helper from admin + portal (noted as a follow-up).

## 4. Architecture

Three-layer architecture, reusing the established portal pattern:

```
Browser (client) ──httpOnly cookie──> Next.js BFF (/api/portal/*) ──Bearer token──> FastAPI (/api/portal/*)
  portalApiClient.ts                     route.ts (GET/POST/DELETE)                  portal_media.py
  MediaLibrary.tsx                       forwards FormData/JSON                      scope-bound queries
  PortalMediaPickerModal.tsx                                                         Pillow re-encode
```

**Data flow**: All write operations go through `portalApiClient` → BFF route → backend. Server-side reads use `portalApi` (cookie via `next/headers`); client-side reads use `portalApiClient` (browser httpOnly cookie via BFF). Scope is always derived from the `portal_token` on the backend; the frontend never sends `scope_type`/`scope_id`.

## 5. Components

| Layer | File | Action |
|-------|------|--------|
| Backend | `backend/app/api/routes/portal_media.py` | Add `POST /api/portal/uploads` (copy admin pipeline); patch `DELETE /api/portal/uploads/{id}` to add `entity_id` 409 check |
| BFF | `frontend/app/api/portal/folders/route.ts` | Add `POST` handler (JSON forward) |
| BFF | `frontend/app/api/portal/uploads/route.ts` | Add `POST` handler (FormData forward, no `Content-Type`) |
| Lib | `frontend/lib/portalApi.ts` | `uploads.all({folderId, page, pageSize})` accepts query params |
| Lib | `frontend/lib/portalApiClient.ts` | `bffFetch` gains `skipDefaultContentType`; add `folders.create` / `uploads.create(formData)` / `uploads.remove(id)` |
| Types | `frontend/lib/types/portal.ts` | Add `PortalFolderCreate`; rename `PortalUploadsResponse` → `PortalUploadPage` |
| Page | `frontend/app/portal/media/page.tsx` | Rewrite as server shell (folders + first uploads page → client) |
| Component | `frontend/components/portal/media/MediaLibrary.tsx` | New client component: folder sidebar + uploads grid + upload + new folder + delete (with confirmation) + pagination |
| Component | `frontend/components/portal/media/PortalMediaPickerModal.tsx` | New: mirrors admin modal, sources from `portalApiClient` |
| Component | `frontend/components/portal/form/ImageFieldWithPicker.tsx` | New: mirrors admin version, uses `PortalMediaPickerModal` |
| Form integration | `CableEditForm`, `CableCreateForm`, `EquipmentEditForm`, `EquipmentCreateForm` | Replace `image_url` text input with `ImageFieldWithPicker` |

## 6. Technical Decisions

### 6.1 Backend `POST /api/portal/uploads` — copy admin pipeline

Copy the admin `upload_file` pipeline (~50 lines) into `portal_media.py`. The pipeline:
1. Accept `file: UploadFile` + `folder_id: int = Form(...)` (required, not optional).
2. Require the `media` module via `require_factory_module("media")`.
3. Call `crud_folder.assert_folder_in_scope(db, folder_id, scope_type, scope_id)`; on failure return 404 (no folder existence leak).
4. Reject non-image `content_type` with 400.
5. Read content; reject > 5 MB with 413.
6. `Image.open` + `convert("RGB")` + `thumbnail((400, 400))`; on exception return 400.
7. Save as `{uuid}.webp` under `MEDIA_DIR/uploads/`, quality 85.
8. Insert `Upload` row with `folder_id`; commit; return `201 Created` with the record.

**Why copy instead of extract a shared helper**: user-confirmed decision to minimize blast radius (the admin path is untouched, no regression risk). A follow-up cleanup can extract `crud_upload.save_image()` later.

**Portal-specific scope rule**: `folder_id` is required (not optional like admin). Portal users cannot create orphan uploads. This matches the existing portal `DELETE` handler's "reject orphan uploads" rule.

### 6.2 Backend `DELETE` — patch with `entity_id` 409 check

In the existing `delete_upload` portal handler, after the scope check passes and before `crud_upload.remove`, add:

```python
if upload.entity_id is not None:
    raise HTTPException(
        status_code=409,
        detail={"code": 409, "message": "Cannot delete: still associated with an entity"},
    )
```

This matches the admin `DELETE /uploads/{id}` behavior and prevents dangling `image_url` references in cable/equipment records. The original spec did not specify this; a Spec Patch adds the scenario.

### 6.3 BFF multipart forwarding — pass `FormData` straight through

The `POST` handler in `frontend/app/api/portal/uploads/route.ts`:

```ts
export async function POST(req: NextRequest) {
  const token = req.cookies.get('portal_token')?.value;
  const formData = await req.formData();
  const res = await fetch(`${API_BASE}/api/portal/uploads`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

**Why not set `Content-Type`**: `fetch` natively accepts a `FormData` body and generates the correct `multipart/form-data; boundary=...` header. Manually setting it would break the boundary. This keeps the BFF a thin proxy and preserves file bytes without re-serialization.

**Size limit**: Next.js route handlers may reject `formData()` payloads above a platform-configured limit. The backend enforces 5 MB. Deployment must ensure `bodyParser.sizeLimit` ≥ 5 MB; upstream errors are surfaced to the user.

### 6.4 `portalApiClient.bffFetch` — add `skipDefaultContentType`

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
    throw new PortalApiError(res.status, data.code ?? res.status, data.message ?? 'Request failed', data.field_errors);
  }
  return res;
}
```

- JSON methods (existing + `folders.create`) keep the default `Content-Type: application/json`.
- `uploads.create(formData)` passes `{ method: 'POST', body: formData, skipDefaultContentType: true }`.
- Backward-compatible: existing callers are unaffected (default `false`).

### 6.5 `MediaLibrary` — hybrid data fetching

- **Server shell** (`page.tsx`): `Promise.all([portalApi.folders.all(), portalApi.uploads.all({ page: 1, pageSize: 20 })])` → pass as initial props to `<MediaLibrary initialFolders={...} initialUploads={...} />`.
- **Client component**: folder switching, pagination, and post-upload/post-delete refresh call `portalApiClient.uploads.all({ folderId, page, pageSize })` (and `portalApiClient.folders.all()` for count updates).
- **State**: `selectedFolder: 'all' | number`, `currentPage: number`, `uploads: PortalUploadPage`, `folders: PortalFolder[]`, `uploading: boolean`, `creatingFolder: boolean`, `deleteTarget: PortalUpload | null`, `errorMessage: string`.

This gives fast first paint (SSR data) and snappy subsequent interaction (client-side fetch, no SSR round-trip).

### 6.6 `PortalMediaPickerModal` — portal-scoped, not admin reuse

New component mirroring admin `MediaPickerModal` structure (folder list sidebar + uploads grid + inline uploader + Select button), but:
- Data source: `portalApiClient.folders.all()` / `portalApiClient.uploads.all({folderId})`.
- Upload: `portalApiClient.uploads.create(formData)` targeting the currently selected folder.
- Select: `onSelect(urlPath)` callback closes the modal and returns the chosen `url_path`.
- Does NOT import admin `FolderTree`/`MediaGrid`/`MediaUploader` (they import `lib/clientFolders` which hits admin endpoints and would bypass portal scope enforcement).

### 6.7 `ImageFieldWithPicker` — portal version

New component mirroring admin `ImageFieldWithPicker`: text input + "Media" button + preview `<img>`. Clicking "Media" opens `PortalMediaPickerModal`; `onSelect` sets the field value. Used in `CableEditForm`, `CableCreateForm`, `EquipmentEditForm`, `EquipmentCreateForm` to replace the plain `image_url` text input.

### 6.8 Folder creation — backend already exists; only BFF POST is new

The backend `POST /api/portal/folders` route already exists and forces `scope_type`/`scope_id` to the caller's scope via `crud_folder.create_with_depth_check`. No backend change is needed. We only add a `POST` handler to `frontend/app/api/portal/folders/route.ts` that forwards the JSON body + `portal_token` cookie.

### 6.9 Delete confirmation — reuse change 2's `DeleteConfirmDialog`

The media page delete action uses the shared `DeleteConfirmDialog` from change 2 (`portal-cable-equipment-crud`), configured with a media-specific message ("Are you sure you want to delete this file? This action cannot be undone.").

### 6.10 Scope enforcement — defense-in-depth

Scope is enforced at three layers:
1. `POST /api/portal/uploads`: `crud_folder.assert_folder_in_scope` on `folder_id`.
2. `GET /api/portal/uploads`: filters by `scope_type`/`scope_id`.
3. `DELETE /api/portal/uploads/{id}`: re-checks the upload's folder scope; rejects orphans.

The BFF and frontend never trust a client-supplied scope — they only forward the `portal_token`, and the backend derives scope from the token's user. Out-of-scope requests return 404 (not 403) to avoid leaking the existence of other manufacturers' resources.

## 7. Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Next.js route handler body-size limit on multipart | Keep 5 MB cap; deployment ensures `bodyParser.sizeLimit` ≥ 5 MB; upstream errors surface to user |
| Code duplication with admin upload handler (~50 lines) | Accepted (user-confirmed); follow-up cleanup noted |
| Portal media picker duplicates admin picker | Accepted — portal copy is intentionally scoped and simpler; admin untouched |
| `entity_id` 409 check may affect existing tests | Run existing portal_media tests; update if they assumed delete-without-reference-check |
| `bffFetch` signature change | Backward-compatible (default `skipDefaultContentType: false`) |
| Cross-manufacturer access via direct API | Every portal read/delete filters/rechecks by caller's `scope_type`/`scope_id`; out-of-scope returns 404 |
| Orphan uploads | Portal users cannot create them (`folder_id` required on POST); existing DELETE rejects orphans |

## 8. Testing Strategy

### Backend
New `backend/tests/api/test_portal_uploads.py` covering `POST /api/portal/uploads`:
- Success (valid image + in-scope `folder_id` → 201 with record)
- Missing `folder_id` → 400
- Cross-scope `folder_id` → 404
- Non-image content type → 400
- Oversized file (> 5 MB) → 413
- Invalid image data (image content type but corrupt bytes) → 400

`DELETE /api/portal/uploads/{id}`:
- Add a 409 test for an upload referenced by an entity (`entity_id is not None`).
- Existing 404 scope/orphan tests remain.

Run existing portal_media tests to confirm no regression.

### Frontend
- `npx tsc --noEmit` → 0 errors.
- `npx next build` → succeeds (all portal routes compile, including `/portal/media`, `/portal/cables/new`, `/portal/equipment/new`, and the new BFF POST routes).
- No automated tests (MVP constraint per project memory).

### Smoke test (manual)
1. Upload an image from `/portal/media` → verify it appears in the grid.
2. Open a cable edit form → click "Media" on the `image_url` field → verify picker shows the uploaded image → select it → verify `image_url` is populated and preview shows.
3. Try to delete the uploaded image from `/portal/media` while it is referenced by the cable → expect 409.
4. Remove the `image_url` reference from the cable (or upload a second unreferenced image) → delete it → expect success and the image disappears from the grid.
5. Create a new folder → verify it appears in the sidebar with count 0.

## 9. Spec Patches

Add one scenario to `openspec/changes/portal-media-management/specs/portal-media-management/spec.md` under the "Portal SHALL allow manufacturers to delete their own uploads with confirmation" requirement:

```markdown
#### Scenario: Delete upload referenced by an entity returns 409
- **WHEN** a manufacturer user sends DELETE to `/api/portal/uploads/{id}` where the upload's `entity_id` is not null (referenced by a cable/equipment)
- **THEN** the backend returns `409 Conflict` with the message "Cannot delete: still associated with an entity"
```

**Rationale**: the original spec did not specify behavior for deleting an upload still referenced by a cable/equipment `image_url`. Aligning with the admin `DELETE /uploads/{id}` behavior (which returns 409 when `entity_id is not None`) prevents dangling references and gives the user a clear error. This is a supplementary scenario (boundary condition), not a structural change to the delta spec.

## 10. Implementation Order

1. Backend: `POST /api/portal/uploads` + `DELETE` entity_id patch + backend tests.
2. Types: `PortalFolderCreate`, rename `PortalUploadsResponse` → `PortalUploadPage`.
3. Lib: `portalApi.uploads.all({folderId,page,pageSize})`; `portalApiClient` `bffFetch` patch + `folders.create` / `uploads.create` / `uploads.remove`.
4. BFF: `folders/route.ts` POST; `uploads/route.ts` POST.
5. Components: `MediaLibrary`, `PortalMediaPickerModal`, `ImageFieldWithPicker`.
6. Page: rewrite `portal/media/page.tsx` as server shell.
7. Form integration: wire `ImageFieldWithPicker` into the 4 cable/equipment forms.
8. Verification: tsc, next build, backend tests, manual smoke test.
