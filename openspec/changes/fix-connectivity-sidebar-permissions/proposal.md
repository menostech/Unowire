# Proposal: Fix connectivity sidebar permissions

## Problem

After the terminal→connectivity rename, the admin left sidebar no longer shows the Connectivity menu group (parent) or its children (Manufacturers, Categories, Terminals), even though the Menu Config management page lists them correctly with the renamed `connectivity-*` page_ids.

## Root Cause

The previous rename migration `o5p6q7r8s9t0` successfully renamed `admin_menu_items` rows from `terminal-*` to `connectivity-*`, and the frontend `AdminSidebar.tsx` `PAGE_ID_TO_MODULE_ID` map was updated to translate the new page_ids to module ids `connectivity_mfrs`, `connectivity_cats`, `connectivity_list`.

However, the admin role's `role_permissions` rows (seeded by migration `b8c9d0e1f2a3`) still carry the **old** module ids `terminal_mfrs`, `terminal_cats`, `terminal_list`. Two code paths diverge on whether to apply the `MODULE_ID_ALIASES` (old→new) remap defined in `backend/app/core/modules.py:40-44`:

1. **Backend route guards** (`backend/app/api/deps.py:69,72,87,95`) **do** apply `MODULE_ID_ALIASES` to both the requested module and the user's allowed set — so API calls to connectivity endpoints succeed.
2. **The `/api/admin/auth/me/permissions` endpoint** (`backend/app/api/routes/auth.py:99-110`) returns `user.role_permissions` **raw**, without applying the alias — so the frontend sidebar receives `terminal_*` module ids.
3. **The frontend `AdminSidebar.filterTreeByPermissions`** (`frontend/components/admin/layout/AdminSidebar.tsx:63-93`) maps connectivity page_ids to `connectivity_*` module ids and checks membership in `allowed_modules`. Since `allowed_modules` contains `terminal_*` (not `connectivity_*`), every connectivity child is filtered out, and the parent group is dropped because it has no allowed children.

Net effect: menus exist in the DB and are editable in Menu Config, but the sidebar silently drops them.

## Fix Goal

Ensure the admin sidebar renders the Connectivity menu group and its children by aligning the permission module ids seen by the frontend with the canonical `connectivity_*` ids:

1. **Data canonicalization**: migrate `role_permissions` rows from `terminal_*` to `connectivity_*` so stored data matches the canonical module registry.
2. **Defense in depth**: apply `MODULE_ID_ALIASES` in the `/me/permissions` endpoint so any stale `terminal_*` rows (or other alias sources) are returned as their canonical equivalents, keeping the sidebar robust against legacy data.
