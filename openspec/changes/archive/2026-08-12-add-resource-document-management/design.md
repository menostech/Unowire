## Context

The platform currently has an image-only upload system (`uploads` table + PIL → WebP re-encoding at 400×400). This pipeline destroys non-image content, making it unsuitable for documents. There is no document/resource management, no public download page, and no way for portal users to share product manuals, spec sheets, or CAD files. This change adds a complete document management module at the `/resources` path, mirroring the Equipment/Terminal module pattern but with file upload instead of `applicable_specs`.

## Goals / Non-Goals

**Goals:**
- Document CRUD with original file preservation (no re-encoding)
- 2-level category tree for organizing resources
- Public browsing and download at `/resources`
- Admin full CRUD at `/admin/resources`
- Portal users can upload/manage their own resources (scope-isolated)
- Support office documents, CAD files, and archives up to 50 MB
- Download count tracking

**Non-Goals:**
- Document versioning (no revision history)
- OCR / full-text search
- Document preview/rendering (download only, no in-browser viewer)
- Document editing
- Virus scanning (MVP scope)

## Decisions

### D1: Separate tables, not a shared document table
**Decision:** Create `resource_categories` and `resources` as separate tables mirroring the Equipment schema.
**Rationale:** Consistent with Cable/Equipment/Terminal pattern. A shared polymorphic table would complicate scope validation and require refactoring existing modules. The Equipment module is the canonical simple-pattern template.

### D2: No separate resource_manufacturers table — reuse existing scope types
**Decision:** Resources do not have their own manufacturer table. Instead, the `resources` table has nullable `scope_type` and `scope_id` fields linking to existing manufacturers.
**Rationale:** Portal users already have a scope_type (`manufacturer`, `equipment_manufacturer`, `terminal_manufacturer`) and scope_id. Adding a 4th scope type would require a new manufacturer table, new scope resolver, and new container folder — all unnecessary. Instead, `resources` added to `_FACTORY_ALLOWED_BY_SCOPE` for all three existing scope types. Admin-uploaded resources have `scope_type=NULL` (global).

**Alternatives considered:**
- New `resource_manufacturer` scope type: rejected — would require manufacturers to register separately for resource uploads, creating friction.

### D3: Original file preservation (no PIL re-encoding)
**Decision:** Document files are stored as-is with their original `content_type`, `filename`, and `size_bytes`. No image processing pipeline.
**Rationale:** The existing PIL pipeline downscales to 400×400 WebP — fundamentally incompatible with PDFs, CAD files, and archives. Documents must be downloadable in their original format.

### D4: File storage at `/media/resources/` (separate from `/media/uploads/`)
**Decision:** Document files stored under `MEDIA_DIR/resources/{uuid}.{ext}`. The URL path is `/media/resources/{uuid}.{ext}`.
**Rationale:** Separation from image uploads (`/media/uploads/`) keeps the two systems decoupled. The existing image upload routes and media grid are untouched.

### D5: Allowed file types and 50 MB size limit
**Decision:** Allowed MIME types: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.*`, `application/vnd.ms-excel`, `application/vnd.ms-powerpoint`, `application/zip`, `application/x-rar-compressed`, `application/x-7z-compressed`, `application/octet-stream` (for DWG/DXF which browsers often don't recognize), `image/*` (for diagram images). Max size: 50 MB.
**Rationale:** 50 MB covers large CAD files and multi-page manuals. The existing 5 MB image limit is too small for documents. File extension whitelist validates `octet-stream` uploads (DWG/DXF).

### D6: Download endpoint with download_count tracking
**Decision:** `GET /api/resources/{id}/download` streams the file and atomically increments `download_count`. Public endpoint (no auth required).
**Rationale:** Download count provides usage analytics. Streaming (via `FileResponse`) avoids loading large files into memory. The increment uses `UPDATE ... SET download_count = download_count + 1` for atomicity.

### D7: Resource ID generation
**Decision:** Admin-created resources use client-supplied `id`. Portal-created resources use server-generated `{scope_id}-{slug}` with UUID fallback.
**Rationale:** Mirrors the Equipment/Terminal pattern exactly. Portal users cannot choose their own ID (scope enforcement).

## Risks / Trade-offs

- **[Large file uploads may timeout]** → Mitigation: Nginx `client_max_body_size 50m` already configured; FastAPI streams multipart via `UploadFile`. For future scaling, consider presigned S3 URLs.
- **[No virus scanning]** → Mitigation: MVP scope. File extension whitelist prevents obvious abuse. Add ClamAV integration post-MVP.
- **[Download count race conditions]** → Mitigation: Atomic SQL `UPDATE ... SET download_count = download_count + 1` avoids lost increments.
- **[Disk space growth]** → Mitigation: Admin can delete resources. No automatic cleanup in MVP.
- **[DWG/DXF MIME type ambiguity]** → Mitigation: Accept `application/octet-stream` but validate file extension against a whitelist (`.dwg`, `.dxf`).
