# Proposal: Fix connectivity menu page_id

## Problem

After the terminal→connectivity rename, the admin sidebar no longer shows the Connectivity menu group, and manually adding a connectivity menu item via the admin UI fails with HTTP 422 "Unknown page_id".

Two layers were left unsynchronized:

1. **Backend `ALLOWED_PAGE_IDS` whitelist** (`backend/app/crud/menu.py:15-31`) was never updated — it still contains only the original 15 entries and rejects `connectivity`, `connectivity-mfrs`, `connectivity-cats` (and 10 other page_ids the frontend registry already knows about).

2. **DB-seeded `admin_menu_items` rows** (from migration `a7b8c9d0e1f2`) still carry the old `terminal-mfrs`, `terminal-cats`, `terminals` page_ids. The frontend `adminMenuRegistry.ts` was renamed to only know `connectivity-*`, so `PAGE_BY_ID[page_id]` returns undefined and the sidebar silently drops those items.

## Root Cause

Incomplete migration during the terminal→connectivity rename: the frontend registry, backend module registry, and RBAC aliases were updated, but the menu page_id whitelist and the seeded DB rows were missed.

## Fix Goal

1. Sync `ALLOWED_PAGE_IDS` with the frontend `ADMIN_PAGES` registry so all 28 page_ids are valid.
2. Add a migration to rename existing `admin_menu_items` rows from `terminal-*` to `connectivity-*` page_ids (and row ids + group label) so the seeded menu matches the frontend registry.
