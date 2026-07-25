## ADDED Requirements

### Requirement: Portal SHALL allow manufacturers to upload image files to their scoped folders

The portal backend SHALL expose a `POST /api/portal/uploads` endpoint that accepts `multipart/form-data` with a `file` field (an image) and a `folder_id` field. The endpoint SHALL require the `media` module permission via `require_factory_module("media")`. The endpoint SHALL require a non-null `folder_id` and SHALL verify the folder is within the authenticated user's scope via `crud_folder.assert_folder_in_scope(db, folder_id, scope_type, scope_id)` before saving. The endpoint SHALL reject non-image content types with `400`, SHALL reject files larger than 5 MB with `413`, and SHALL re-encode the image to WebP (400x400 thumbnail, quality 85) saved under `MEDIA_DIR/uploads/{uuid}.webp`. On success the endpoint SHALL return `201 Created` with the new `Upload` record (`id`, `filename`, `url_path`, `folder_id`, `created_at`).

#### Scenario: Manufacturer uploads an image to a folder in their scope
- **WHEN** a manufacturer user submits a POST to `/api/portal/uploads` with a valid image file and a `folder_id` that belongs to their scope
- **THEN** the backend re-encodes the image to WebP, saves it to `MEDIA_DIR/uploads/`, creates an `Upload` row scoped to that folder, and returns `201 Created` with the upload record

#### Scenario: Upload requires a folder_id
- **WHEN** a manufacturer user submits a POST to `/api/portal/uploads` without a `folder_id`
- **THEN** the backend returns `400 Bad Request` because portal users must upload to a specific folder in their scope

#### Scenario: Upload to a folder outside scope is rejected
- **WHEN** a manufacturer user submits a POST to `/api/portal/uploads` with a `folder_id` belonging to a different manufacturer
- **THEN** `crud_folder.assert_folder_in_scope` raises and the backend returns `404 Not Found` (no information leak about the folder's existence)

#### Scenario: Non-image file is rejected
- **WHEN** a manufacturer user submits a POST to `/api/portal/uploads` with a file whose `content_type` does not start with `image/`
- **THEN** the backend returns `400 Bad Request` with the message "File must be an image"

#### Scenario: Oversized file is rejected
- **WHEN** a manufacturer user submits a POST to `/api/portal/uploads` with an image larger than 5 MB
- **THEN** the backend returns `413 Payload Too Large` with the message "File too large (max 5MB)"

#### Scenario: Invalid image data is rejected
- **WHEN** a manufacturer user submits a POST to `/api/portal/uploads` with a file that has an image content type but is not a valid image
- **THEN** the backend returns `400 Bad Request` with a message indicating the image file is invalid

### Requirement: Portal SHALL allow manufacturers to create folders within their scope

The portal backend `POST /api/portal/folders` endpoint (already present) SHALL force `scope_type` and `scope_id` to the authenticated user's scope and SHALL create the folder via `crud_folder.create_with_depth_check`. The portal frontend SHALL expose a "New Folder" affordance that calls `portalApiClient.folders.create({ name, parent_id })`, which POSTs through the BFF route `/api/portal/folders` to the backend.

#### Scenario: Manufacturer creates a folder
- **WHEN** a manufacturer user clicks "New Folder", enters a name, and confirms
- **THEN** the frontend calls `portalApiClient.folders.create({ name, parent_id })` which POSTs to `/api/portal/folders` via the BFF, the backend creates the folder scoped to the user's `scope_type`/`scope_id`, and the new folder appears in the folder list

#### Scenario: Folder create enforces scope server-side
- **WHEN** a manufacturer user submits a folder create with a `scope_type` or `scope_id` field in the body
- **THEN** the backend ignores the client-supplied scope values and forces them to the authenticated user's `scope_type`/`scope_id`

#### Scenario: BFF route forwards token for folder create
- **WHEN** the BFF route `/api/portal/folders` receives a POST request
- **THEN** it forwards the request body and the `portal_token` cookie as `Authorization: Bearer {token}` to the backend `POST /api/portal/folders`

### Requirement: Portal SHALL allow manufacturers to delete their own uploads with confirmation

The portal frontend SHALL display a delete affordance on each upload in the media library. Activating delete SHALL show a confirmation dialog warning that deletion is irreversible. On confirmation, the frontend SHALL call `portalApiClient.uploads.remove(id)`, which sends `DELETE` to `/api/portal/uploads/{id}` via the BFF. The existing backend `DELETE /api/portal/uploads/{id}` route SHALL verify the upload's folder is within the caller's scope and SHALL reject orphan (no-folder) uploads with `404`. The backend SHALL remove the file from disk and delete the `Upload` row.

#### Scenario: Delete button shows confirmation dialog
- **WHEN** a user clicks the delete control on an upload in the media library
- **THEN** a confirmation modal appears with the message "Are you sure you want to delete this file? This action cannot be undone." and "Cancel" and "Delete" buttons

#### Scenario: Confirm delete removes the upload
- **WHEN** a user confirms the delete dialog and the API returns success
- **THEN** the frontend calls `portalApiClient.uploads.remove(id)`, the backend deletes the file from disk and the `Upload` row, and the upload disappears from the media grid

#### Scenario: Cancel delete does nothing
- **WHEN** a user clicks "Cancel" in the delete confirmation dialog
- **THEN** the modal closes and no API call is made

#### Scenario: Delete upload outside scope returns 404
- **WHEN** a manufacturer user sends DELETE to `/api/portal/uploads/{id}` where the upload's folder belongs to a different manufacturer
- **THEN** the backend returns `404 Not Found` (scope check fails; no information leak)

#### Scenario: Delete orphan upload returns 404
- **WHEN** a manufacturer user sends DELETE to `/api/portal/uploads/{id}` where the upload has no `folder_id`
- **THEN** the backend returns `404 Not Found` because portal users cannot access orphan uploads

#### Scenario: Delete upload referenced by an entity returns 409
- **WHEN** a manufacturer user sends DELETE to `/api/portal/uploads/{id}` where the upload's `entity_id` is not null (referenced by a cable/equipment)
- **THEN** the backend returns `409 Conflict` with the message "Cannot delete: still associated with an entity"

### Requirement: Portal uploads SHALL be scoped to the manufacturer

All portal media read, upload, and delete operations SHALL derive scope from the authenticated user's `role.scope_type` and `scope_id`. The `GET /api/portal/uploads` endpoint SHALL filter results by `scope_type` and `scope_id`. A manufacturer SHALL NOT be able to list, upload into, or delete uploads belonging to another manufacturer. Out-of-scope requests SHALL return `404` (not `403`) to avoid leaking the existence of other manufacturers' resources.

#### Scenario: List uploads only returns own uploads
- **WHEN** a manufacturer user calls `GET /api/portal/uploads`
- **THEN** the response contains only uploads whose folder is within the user's `scope_type`/`scope_id`

#### Scenario: List uploads with another manufacturer's folder_id returns empty
- **WHEN** a manufacturer user calls `GET /api/portal/uploads?folder_id={other_manufacturer_folder_id}`
- **THEN** the backend returns an empty `items` list (the folder is out of scope, so no uploads match)

#### Scenario: Upload is bound to the caller's scope via folder
- **WHEN** a manufacturer user uploads a file with a `folder_id` in their scope
- **THEN** the resulting `Upload.folder_id` references a folder within the user's scope, and no other manufacturer can see or delete it

### Requirement: Portal SHALL provide a media picker for cable/equipment image_url fields

The portal SHALL provide a `PortalMediaPickerModal` component and an `ImageFieldWithPicker` component (portal-scoped) that let a user select an uploaded image's `url_path` for a cable or equipment `image_url` field. The picker SHALL list the user's folders and uploads via `portalApiClient`/`portalApi` (hitting `/api/portal/folders` and `/api/portal/uploads`), SHALL support inline upload via the portal BFF `POST /api/portal/uploads`, and SHALL call `onSelect(urlPath)` when a user chooses an image. The `CableEditForm`, `CableCreateForm`, `EquipmentEditForm`, and `EquipmentCreateForm` SHALL use `ImageFieldWithPicker` for their `image_url` field instead of a plain text input.

#### Scenario: Media picker shows scoped folders and uploads
- **WHEN** a user opens the media picker from a cable/equipment form's image field
- **THEN** the picker displays the user's folders in a sidebar and the uploads (filtered by the selected folder) in a grid, sourced from `/api/portal/folders` and `/api/portal/uploads`

#### Scenario: Selecting an image populates the image_url field
- **WHEN** a user clicks an upload in the picker grid
- **THEN** the picker calls `onSelect(urlPath)` with the upload's `url_path`, closes, and the form's `image_url` field is set to that URL with a preview shown

#### Scenario: Media picker supports inline upload
- **WHEN** a user opens the picker, selects a target folder, chooses a file, and triggers upload
- **THEN** the picker calls `portalApiClient.uploads.create(formData)` which POSTs multipart to `/api/portal/uploads` via the BFF, the new upload appears in the grid, and the user can then select it

#### Scenario: Cable and equipment forms use ImageFieldWithPicker
- **WHEN** a user edits or creates a cable or equipment record
- **THEN** the `image_url` field is rendered as an `ImageFieldWithPicker` (text input + "Media" button + preview), not a plain text input

### Requirement: Portal media operations SHALL go through BFF and typed portalApiClient

Portal media mutations (folder create, upload, upload delete) SHALL use typed `portalApiClient` methods: `portalApiClient.folders.create(data)`, `portalApiClient.uploads.create(formData)`, `portalApiClient.uploads.remove(id)`. These methods SHALL call BFF routes at `/api/portal/folders` (POST), `/api/portal/uploads` (POST), and `/api/portal/uploads/{id}` (DELETE) respectively. The BFF routes SHALL forward the `portal_token` cookie as `Authorization: Bearer {token}` to the backend and SHALL not trust any client-supplied scope. Server-side reads SHALL use typed `portalApi.folders.all()` (returning `PortalFolder[]`) and `portalApi.uploads.all({ folderId, page, pageSize })` (returning `PortalUploadPage`).

#### Scenario: Upload via portalApiClient
- **WHEN** a user uploads a file from the media library or picker
- **THEN** the frontend calls `portalApiClient.uploads.create(formData)` which POSTs multipart to `/api/portal/uploads` via the BFF

#### Scenario: Folder create via portalApiClient
- **WHEN** a user creates a folder from the media library
- **THEN** the frontend calls `portalApiClient.folders.create({ name, parent_id })` which POSTs to `/api/portal/folders` via the BFF

#### Scenario: Upload delete via portalApiClient
- **WHEN** a user confirms an upload deletion
- **THEN** the frontend calls `portalApiClient.uploads.remove(id)` which sends DELETE to `/api/portal/uploads/{id}` via the BFF

#### Scenario: BFF route forwards token for upload
- **WHEN** the BFF route `/api/portal/uploads` receives a POST request
- **THEN** it reads the request as `FormData`, forwards it to the backend `POST /api/portal/uploads` with the `portal_token` cookie as `Authorization: Bearer {token}`, and does not set `Content-Type` manually (so the multipart boundary is preserved)

#### Scenario: Server-side reads are typed
- **WHEN** the media page server shell calls `portalApi.folders.all()` and `portalApi.uploads.all({ folderId })`
- **THEN** the methods return `PortalFolder[]` and `PortalUploadPage` respectively (not `any`), and `uploads.all()` forwards `folder_id`/`page`/`page_size` as query parameters
