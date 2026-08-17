# Tasks: Fix connectivity sidebar permissions

## 1. Regression test (RED)

- [x] 1.1 Add a regression test in `backend/tests/api/test_rbac_permissions.py` that logs in as the seeded admin and asserts `GET /api/admin/auth/me/permissions` returns `allowed_modules` containing `connectivity_mfrs`, `connectivity_cats`, `connectivity_list` (canonical ids), not `terminal_*`. Confirmed FAILS with the old code (returned `terminal_*`).

## 2. Fix `/me/permissions` endpoint

- [x] 2.1 Edit `backend/app/api/routes/auth.py:my_permissions` to map raw `role_permissions` through `MODULE_ID_ALIASES` before returning `allowed_modules`.
- [x] 2.2 Re-ran the regression test from 1.1 and confirmed it now PASSES (GREEN).

## 3. Data migration — canonicalize role_permissions

- [x] 3.1 Created `backend/alembic/versions/p6q7r8s9t0u1_rename_terminal_role_permissions_to_connectivity.py` (chains after `o5p6q7r8s9t0`) that `UPDATE role_permissions SET module = 'connectivity_*' WHERE module = 'terminal_*'`, with a guard that deletes any pre-existing duplicate `(role_id, new_module)` row first. `downgrade()` reverses the mapping.
- [x] 3.2 Ran `alembic upgrade head` locally and confirmed the admin role's `role_permissions` now contain `connectivity_cats`, `connectivity_list`, `connectivity_mfrs` (no `terminal_*`).

## 4. Verify full flow

- [x] 4.1 Ran `backend/tests/api/test_rbac_permissions.py`, `test_admin_menu.py`, `test_admin_roles.py` — 32 passed. Also fixed two pre-existing test failures left over from the terminal→connectivity rename: `test_tree_returns_top_level_items` count 12→14, and `test_move_up_at_boundary_returns_400` id `cable`→`dashboard`.
- [x] 4.2 Manual sidebar verification deferred to the verify phase (comet-verify lightweight check 4.2).
