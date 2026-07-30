# Proposal: Media Folder Tree Width Consistency

## Motivation

The folder-tree sidebar on the two media management pages renders at inconsistent widths:

- `/admin/media` — folder sidebar uses a fixed `w-64` (256px) `aside` with a flex layout. On wide admin content areas this feels too narrow.
- `/portal/media` — folder sidebar is the first column of a `lg:grid-cols-3` grid, so it consumes ~1/3 of the container (roughly 400px on a typical portal width). This feels too wide.

The mismatch is visually jarring when switching between the two media pages and wastes / starves space for the uploads grid on one of the two sides.

## Goals

- Unify the folder-tree sidebar width across `/admin/media` and `/portal/media` so both pages share the same layout structure and sidebar width.
- Pick a balanced width that is wider than the current admin 256px (addresses "too narrow") and narrower than the current portal ~400px (addresses "too wide").

## Scope

**In scope:**

- `frontend/app/admin/(dashboard)/media/page.tsx` — adjust folder `aside` width.
- `frontend/components/portal/media/MediaLibrary.tsx` — switch folder sidebar from grid column to a fixed-width flex sidebar matching admin.

**Out of scope:**

- Folder tree component internals (`FolderTree.tsx`, folder list rendering).
- Media grid / uploader behavior.
- Mobile/responsive breakpoint changes beyond adopting the shared sidebar width.
- Backend, API, or database changes.

## Proposed Width

Standardize both pages on `w-72` (288px) for the folder sidebar, using a flex layout (`w-72 shrink-0` sidebar + `flex-1 min-w-0` main content). 288px is a comfortable middle ground: +32px over the current admin width and ~-110px vs. the current portal width.
