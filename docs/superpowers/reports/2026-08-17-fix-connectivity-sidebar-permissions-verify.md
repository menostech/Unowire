# Verification Report: fix-connectivity-sidebar-permissions

**Date:** 2026-08-17
**Change:** fix-connectivity-sidebar-permissions
**Workflow:** hotfix
**Verify mode:** light (overridden from full — hotfix with no design doc)
**Reviewer:** automated (review_mode: off)

## Summary

The Connectivity menu was missing from the admin sidebar because `role_permissions` rows still held legacy `terminal_*` module ids while the frontend sidebar maps Connectivity page ids to canonical `connectivity_*` module ids. The `/me/permissions` endpoint returned the raw legacy ids without applying `MODULE_ID_ALIASES`, so every Connectivity menu item was filtered out.

## Changes verified

| File | Change |
|------|--------|
| `backend/app/api/routes/auth.py` | `/me/permissions` now maps raw `role_permissions` through `MODULE_ID_ALIASES` before returning `allowed_modules` |
| `backend/alembic/versions/p6q7r8s9t0u1_rename_terminal_role_permissions_to_connectivity.py` | Data migration: `UPDATE role_permissions SET module='connectivity_*' WHERE module='terminal_*'` with duplicate-guard and reversible downgrade |
| `backend/tests/api/test_rbac_permissions.py` | Regression test asserting `/me/permissions` returns `connectivity_mfrs/cats/list`, never `terminal_*` |
| `backend/tests/api/test_admin_menu.py` | Fixed two pre-existing assertions left over from the terminal→connectivity rename (top-level count 12→14, boundary-sort id `cable`→`dashboard`) |

## Lightweight verification checks

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | tasks.md all tasks `[x]` | PASS | All 7 tasks in `openspec/changes/fix-connectivity-sidebar-permissions/tasks.md` marked complete |
| 2 | Changed files match tasks.md | PASS | `git diff --stat ad2735d...HEAD` shows 4 implementation files matching the 4 task groups + 5 workflow artifacts |
| 3 | Build passes | PASS | `docker compose --env-file .env.docker exec -T backend python -m pytest tests/api/test_rbac_permissions.py tests/api/test_admin_menu.py tests/api/test_admin_roles.py` → 32 passed |
| 4 | Related tests pass | PASS | 32 passed, 0 failed (includes new regression test `test_me_permissions_returns_canonical_connectivity_modules`) |
| 5 | No obvious security issues | PASS | Diff imports only the existing read-only `MODULE_ID_ALIASES` mapping; no hardcoded secrets, no SQL string interpolation from user input, migration uses parameterized `op.execute` with static literals |
| 6 | Code review | SKIP | `review_mode: off` for this hotfix |

## Manual endpoint verification

- `POST /api/auth/login` as `admin@unowire.com` → 200 with token
- `GET /api/auth/me/permissions` → `allowed_modules` contains `connectivity_cats`, `connectivity_list`, `connectivity_mfrs`; no `terminal_*` ids present
- Database `role_permissions` table for `admin` role contains only canonical `connectivity_*` rows (migration applied)

## Root cause recap

`MODULE_ID_ALIASES` was already defined in `backend/app/core/modules.py` to remap `terminal_*` → `connectivity_*`, but two surfaces still held stale data:
1. The `/me/permissions` endpoint returned raw `role_permissions` without applying the alias map.
2. The `role_permissions` table itself still held `terminal_*` rows for pre-existing roles.

Both are now fixed: the endpoint applies the alias map (defensive layer for any future stale rows), and the migration canonicalizes existing rows.

## Result

**PASS** — all 6 lightweight checks satisfied. No CRITICAL or IMPORTANT issues. Ready to archive.
