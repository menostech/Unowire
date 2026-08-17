# Design: Fix connectivity menu page_id

## Approach

### Change 1: Sync backend whitelist

Update `ALLOWED_PAGE_IDS` in `backend/app/crud/menu.py` to include all 28 page_ids from `frontend/lib/adminMenuRegistry.ts ADMIN_PAGES`.

Added entries (13 new):
- `connectivity`, `connectivity-mfrs`, `connectivity-cats`
- `pages`, `site-menu`, `claims`
- `resources-list`, `resources-cats`
- `posts-list`, `posts-cats`
- `plans`, `subscriptions`

This fixes the "Unknown page_id" 422 error when manually adding any of these page_ids via the admin menu form.

### Change 2: Migration to rename terminal→connectivity menu rows

New Alembic migration that UPDATEs `admin_menu_items`:
- `id='terminal-mfrs'` → `id='connectivity-mfrs'`, `page_id='connectivity-mfrs'`
- `id='terminal-cats'` → `id='connectivity-cats'`, `page_id='connectivity-cats'`
- `id='terminals'` → `id='connectivity'`, `page_id='connectivity'`
- Parent group `id='terminal-connector'` → `id='connectivity-group'`, `label='Connectivity'`

This fixes the missing connectivity menu in the sidebar — after migration, the seeded rows have page_ids that the frontend registry can resolve to hrefs.

## Files Changed

1. `backend/app/crud/menu.py` — add 13 entries to `ALLOWED_PAGE_IDS`
2. `backend/alembic/versions/<new>_rename_terminal_menu_to_connectivity.py` — data migration

## No Spec Change

The existing spec `openspec/specs/connectivity-route-redirects/spec.md` documents the rename but the "Admin module_id backward alias" section only covers permission aliasing, not menu page_id. This fix completes the rename; no acceptance scenario modification needed.
