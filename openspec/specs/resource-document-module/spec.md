# resource-document-module Specification

## Purpose
TBD - created by archiving change add-resource-document-management. Update Purpose after archive.
## Requirements
### Requirement: Resource category tree management
The system SHALL provide a 2-level self-referential category tree for organizing resources, mirroring the `equipment_categories` pattern. Categories SHALL have a unique `(parent_id, slug)` constraint. Root categories have `parent_id = NULL`; child categories reference a root category. Maximum depth SHALL be 2 levels. Category deletion SHALL be rejected when the category has children or when resources are assigned to it.

#### Scenario: Admin creates a root category
- **WHEN** admin submits a new category with `parent_id = NULL`, a unique `slug`, and a `label`
- **THEN** the system creates the category and returns `201` with the created category payload

#### Scenario: Admin creates a child category under a root
- **WHEN** admin submits a new category with `parent_id` pointing to an existing root category
- **THEN** the system creates the child category (depth = 2) and returns `201`

#### Scenario: Admin rejects a 3rd-level category
- **WHEN** admin submits a category with `parent_id` pointing to a category whose own `parent_id` is not NULL
- **THEN** the system rejects the request with `422` and message "Maximum depth is 2 levels"

#### Scenario: Admin rejects duplicate slug under same parent
- **WHEN** admin submits a category with a `(parent_id, slug)` pair that already exists
- **THEN** the system rejects with `409` and message indicating a slug conflict

#### Scenario: Admin rejects deleting a category with children
- **WHEN** admin attempts to delete a category that has one or more child categories
- **THEN** the system rejects with `409` and message "Cannot delete category with children"

#### Scenario: Admin rejects deleting a category with assigned resources
- **WHEN** admin attempts to delete a category that has one or more resources assigned
- **THEN** the system rejects with `409` and message indicating the category is in use

#### Scenario: Public fetches the category tree
- **WHEN** an anonymous visitor requests the category tree endpoint
- **THEN** the system returns the 2-level tree with root categories and their `children` arrays, ordered by `sort_order`

### Requirement: Resource data model with scope isolation
The system SHALL store resources in a `resources` table with the following fields: `id` (string PK), `category_id` (FK → `resource_categories.id`, `ondelete=RESTRICT`, NOT NULL), `title`, `slug` (unique), `description`, `file_filename`, `file_content_type`, `file_size_bytes`, `file_url_path`, `external_url`, `thumbnail_url`, `scope_type` (nullable — NULL means global/admin-created), `scope_id` (nullable — references the existing manufacturer record), `download_count` (integer, default 0), `sort_order`, `is_published` (boolean, default true), `created_at`, `updated_at`. Resources SHALL NOT have a separate `resource_manufacturers` table; instead `scope_type` reuses the existing values `manufacturer`, `equipment_manufacturer`, or `terminal_manufacturer`.

#### Scenario: Admin creates a global resource
- **WHEN** admin creates a resource without specifying `scope_type` or `scope_id`
- **THEN** the system stores the resource with `scope_type = NULL` and `scope_id = NULL` (global visibility)

#### Scenario: Portal user creates a scoped resource
- **WHEN** a portal user with `scope_type = "equipment_manufacturer"` and `scope_id = "abc123"` creates a resource
- **THEN** the system forces `scope_type = "equipment_manufacturer"` and `scope_id = "abc123"` regardless of the request body

#### Scenario: Portal user ID is server-generated
- **WHEN** a portal user creates a resource
- **THEN** the system generates the resource `id` as `{scope_id}-{slug}` and falls back to a UUID suffix on collision

#### Scenario: Admin resource ID is client-supplied
- **WHEN** admin creates a resource
- **THEN** the system uses the client-supplied `id` value

### Requirement: Document file upload with original preservation
The system SHALL provide a file upload endpoint that accepts office documents (PDF, Word `.doc`/`.docx`, Excel `.xls`/`.xlsx`, PowerPoint `.ppt`/`.pptx`), CAD/engineering files (`.dwg`, `.dxf`), archives (`.zip`, `.rar`, `.7z`), and image files used as diagrams. Files SHALL be stored as-is with their original `content_type`, `filename`, and `size_bytes` — no PIL re-encoding, no thumbnailing of documents. Maximum file size SHALL be 50 MB. Files SHALL be stored under `{MEDIA_DIR}/resources/{uuid}.{ext}` and served from `/media/resources/{uuid}.{ext}`.

#### Scenario: Successful PDF upload
- **WHEN** admin submits a 5 MB PDF file with `content_type = "application/pdf"`
- **THEN** the system stores the file under `/media/resources/{uuid}.pdf` and records the original filename, content type, and size

#### Scenario: Successful DWG upload with octet-stream MIME
- **WHEN** admin submits a `.dwg` file with `content_type = "application/octet-stream"`
- **THEN** the system validates the file extension against the whitelist and stores the file as `{uuid}.dwg`

#### Scenario: Reject file exceeding 50 MB
- **WHEN** admin submits a file larger than 50 MB
- **THEN** the system rejects with `413` and message "File too large (max 50 MB)"

#### Scenario: Reject unsupported file type
- **WHEN** admin submits an `.exe` file
- **THEN** the system rejects with `415` and message "Unsupported file type"

#### Scenario: Reject image upload larger than 50 MB
- **WHEN** admin submits a 60 MB PNG image
- **THEN** the system rejects with `413` because the document upload limit (50 MB) overrides the legacy 5 MB image limit only for the resources endpoint

### Requirement: Public resource browsing and download
The system SHALL provide public endpoints for listing published resources (with optional `category_id` and `q` search filters, paginated), fetching a single resource by `slug`, and downloading the resource file. Download SHALL stream the file via `FileResponse` and atomically increment `download_count`. Public endpoints SHALL NOT require authentication.

#### Scenario: Anonymous visitor lists resources
- **WHEN** an anonymous visitor requests `GET /api/resources?page=1&page_size=20`
- **THEN** the system returns a paginated list of published resources (`is_published = true`)

#### Scenario: Anonymous visitor filters by category
- **WHEN** an anonymous visitor requests `GET /api/resources?category_id=cat-123`
- **THEN** the system returns only resources whose `category_id = "cat-123"` (or whose category's parent is `cat-123`)

#### Scenario: Anonymous visitor searches by keyword
- **WHEN** an anonymous visitor requests `GET /api/resources?q=installation+guide`
- **THEN** the system returns resources whose `title` or `description` matches the keyword case-insensitively

#### Scenario: Anonymous visitor downloads a file
- **WHEN** an anonymous visitor requests `GET /api/resources/{id}/download`
- **THEN** the system streams the file with the original `content_type` and `filename` (via `Content-Disposition`), and atomically increments `download_count` by 1

#### Scenario: Download of a resource with external_url only
- **WHEN** an anonymous visitor requests download of a resource that has `external_url` but no stored file
- **THEN** the system returns `404` for the download endpoint (the resource detail page exposes the `external_url` as a link instead)

### Requirement: Admin resource and category management
The system SHALL provide admin CRUD endpoints for resources and categories protected by `require_operator`. Admin endpoints SHALL be gated by the `resource_list` (resources) and `resource_cats` (categories) RBAC modules. Scoped admin users (e.g. `equipment_manufacturer` role) SHALL only manage resources where `scope_type` matches their role's `scope_type` and `scope_id` matches their `scope_id`.

#### Scenario: Admin lists all resources
- **WHEN** an admin user with `resource_list` permission requests `GET /api/resources/admin?page=1`
- **THEN** the system returns all resources regardless of scope

#### Scenario: Scoped admin can only see their own resources
- **WHEN** an admin user with `scope_type = "equipment_manufacturer"` and `scope_id = "mfr-1"` requests the admin list
- **THEN** the system returns only resources where `scope_type = "equipment_manufacturer"` and `scope_id = "mfr-1"`

#### Scenario: Admin uploads a new resource with file
- **WHEN** an admin user submits a multipart form with `title`, `slug`, `category_id`, and a `file` part
- **THEN** the system stores the file, creates the resource record with file metadata, and returns `201`

#### Scenario: Admin updates a resource without replacing the file
- **WHEN** an admin user submits an update without a new `file` part
- **THEN** the system preserves the existing `file_filename`, `file_content_type`, `file_size_bytes`, and `file_url_path`

#### Scenario: Admin deletes a resource
- **WHEN** an admin user deletes a resource
- **THEN** the system deletes the database record AND removes the stored file from disk

#### Scenario: Scoped admin rejects creating resource for another scope
- **WHEN** an admin user with `scope_type = "equipment_manufacturer"` and `scope_id = "mfr-1"` attempts to create a resource with `scope_id = "mfr-2"`
- **THEN** the system rejects with `403` and message "Cannot create resource outside your scope"

### Requirement: Portal self-service resource upload with scope isolation
The system SHALL provide portal endpoints at `/api/portal/resources` that allow factory users to manage their own resources. Access SHALL be gated by `require_factory_module("resources")`. The `resources` module SHALL be added to `_FACTORY_ALLOWED_BY_SCOPE` for all three existing scope types (`manufacturer`, `equipment_manufacturer`, `terminal_manufacturer`). Portal endpoints SHALL force `scope_type` and `scope_id` from the authenticated user and SHALL never accept them from the request body. Portal users SHALL NOT see or modify resources belonging to other scopes.

#### Scenario: Equipment manufacturer uploads a resource
- **WHEN** a portal user with `scope_type = "equipment_manufacturer"` and `scope_id = "mfr-1"` submits a new resource
- **THEN** the system forces `scope_type = "equipment_manufacturer"` and `scope_id = "mfr-1"`, generates the ID, stores the file, and returns `201`

#### Scenario: Cable manufacturer uploads a resource
- **WHEN** a portal user with `scope_type = "manufacturer"` and `scope_id = "cable-mfr-9"` submits a new resource
- **THEN** the system forces `scope_type = "manufacturer"` and `scope_id = "cable-mfr-9"` and stores the resource

#### Scenario: Portal user lists only their own resources
- **WHEN** a portal user with `scope_id = "mfr-1"` requests the portal list endpoint
- **THEN** the system returns only resources where `scope_id = "mfr-1"`

#### Scenario: Portal user attempts to access another scope's resource
- **WHEN** a portal user with `scope_id = "mfr-1"` requests `GET /api/portal/resources/{id}` for a resource with `scope_id = "mfr-2"`
- **THEN** the system returns `404` (not `403`, to avoid leaking existence)

#### Scenario: Portal user updates their own resource
- **WHEN** a portal user updates a resource they own
- **THEN** the system allows the update and preserves `scope_type`/`scope_id` (cannot be changed)

#### Scenario: Portal user deletes their own resource
- **WHEN** a portal user deletes a resource they own
- **THEN** the system deletes the record and the stored file, returning `204`

#### Scenario: Portal user cannot set is_published to false to hide from public
- **WHEN** a portal user submits `is_published = false` in a create/update
- **THEN** the system rejects with `422` and message "Portal users cannot unpublish resources" (only admins can toggle publish state)

### Requirement: Admin module registration and menu
The system SHALL register two new admin modules in `app/core/modules.py`: `resource_cats` (global, not scope-aware) and `resource_list` (scope-aware, reuses existing scope types — `scope_type` is set per-role, not fixed). The admin menu SHALL include a "Resources" group with child pages for Resources and Categories. The migration SHALL seed `role_permissions` for the `admin` role with both new module IDs.

#### Scenario: Admin role has resource module permissions after migration
- **WHEN** the database migration runs
- **THEN** the `admin` role has `role_permissions` entries for `resource_cats` and `resource_list`

#### Scenario: Admin sees the Resources menu group
- **WHEN** an admin user loads the admin sidebar
- **THEN** the sidebar shows a "Resources" group with "Resources" and "Categories" child links

#### Scenario: Non-permitted admin cannot access resources
- **WHEN** an admin user without `resource_list` permission attempts to access `/api/resources/admin`
- **THEN** the system rejects with `403`

### Requirement: Public resources page at /resources
The system SHALL provide a public page at `/resources` that lists published resources with category navigation and search. A detail page at `/resources/[slug]` SHALL show the resource metadata and a download link (or external URL link when no file is stored). The page SHALL be accessible without authentication.

#### Scenario: Visitor browses the resources page
- **WHEN** a visitor navigates to `/resources`
- **THEN** the page displays the category navigation sidebar and a paginated list of published resources

#### Scenario: Visitor filters by category
- **WHEN** a visitor clicks a category in the navigation
- **THEN** the page updates to show only resources in that category (or its children)

#### Scenario: Visitor searches resources
- **WHEN** a visitor enters a keyword in the search box
- **THEN** the page filters resources by title/description match

#### Scenario: Visitor opens a resource detail page
- **WHEN** a visitor navigates to `/resources/{slug}`
- **THEN** the page shows the resource title, description, file size, file type, download count, and a download button

#### Scenario: Visitor downloads from the detail page
- **WHEN** a visitor clicks the download button
- **THEN** the browser triggers a file download with the original filename

### Requirement: Admin resources page at /admin/resources
The system SHALL provide admin pages at `/admin/resources` (list, new, edit) and `/admin/resources/categories` (tree management). The list page SHALL support filtering by category, keyword, and scope. The new/edit form SHALL support file upload, category selection, and all metadata fields.

#### Scenario: Admin opens the resources list
- **WHEN** an admin navigates to `/admin/resources`
- **THEN** the page shows a filterable, paginated table of resources with columns for title, category, scope, file size, and download count

#### Scenario: Admin creates a new resource
- **WHEN** an admin navigates to `/admin/resources/new` and submits the form with a file
- **THEN** the system creates the resource and redirects to the edit page

#### Scenario: Admin edits a resource
- **WHEN** an admin navigates to `/admin/resources/{id}` and updates the title
- **THEN** the system updates the resource without replacing the file (unless a new file is provided)

#### Scenario: Admin manages categories
- **WHEN** an admin navigates to `/admin/resources/categories`
- **THEN** the page shows the 2-level category tree with create/edit/delete actions

### Requirement: Portal resources page at /portal/resources
The system SHALL provide portal pages at `/portal/resources` (list, new, edit) for manufacturer users to manage their own resources. The portal sidebar SHALL include a "Resources" nav item for all three manufacturer scope types. Portal pages SHALL NOT show resources belonging to other scopes.

#### Scenario: Portal user opens their resources list
- **WHEN** a portal user navigates to `/portal/resources`
- **THEN** the page shows only resources owned by the user's scope

#### Scenario: Portal user uploads a new resource
- **WHEN** a portal user navigates to `/portal/resources/new` and submits the form
- **THEN** the system creates a scoped resource and redirects to the edit page

#### Scenario: Portal user edits their own resource
- **WHEN** a portal user navigates to `/portal/resources/{id}` for a resource they own
- **THEN** the page shows the edit form pre-filled with the resource data

#### Scenario: Portal user cannot edit another scope's resource
- **WHEN** a portal user navigates to `/portal/resources/{id}` for a resource they do not own
- **THEN** the page returns a `404` not found

#### Scenario: Portal sidebar shows Resources nav for all manufacturer types
- **WHEN** any of the three manufacturer scope types logs into the portal
- **THEN** the portal sidebar includes a "Resources" link pointing to `/portal/resources`

### Requirement: File storage separation from image uploads
The system SHALL store resource files under `{MEDIA_DIR}/resources/` separately from image uploads at `{MEDIA_DIR}/uploads/`. The resources directory SHALL be created automatically if it does not exist. The existing image upload pipeline (PIL → WebP, 5 MB limit) SHALL remain untouched and SHALL NOT be used for resource files.

#### Scenario: Resources directory auto-creation
- **WHEN** the application starts and the `resources` directory does not exist under `MEDIA_DIR`
- **THEN** the system creates the directory

#### Scenario: Image upload pipeline is unaffected
- **WHEN** a user uploads an image via the existing `/api/uploads` endpoint
- **THEN** the image is processed through the PIL → WebP pipeline at 5 MB limit, unchanged by the new resources module

