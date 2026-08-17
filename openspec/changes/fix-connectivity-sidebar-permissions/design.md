# Design: Fix connectivity sidebar permissions

## Approach

Two coordinated changes, both small and low-risk:

### 1. Data migration — canonicalize `role_permissions`

Add a new Alembic migration that renames the three legacy module ids in `role_permissions` to their canonical connectivity equivalents:

| Old module id        | New module id        |
|----------------------|----------------------|
| `terminal_mfrs`      | `connectivity_mfrs`  |
| `terminal_cats`      | `connectivity_cats`  |
| `terminal_list`      | `connectivity_list`  |

- Uses `UPDATE ... WHERE module = :old` per row.
- Idempotent: rows already on the new id are unaffected; uses `WHERE module IN (...)` so re-running is safe.
- `downgrade()` reverses the mapping for rollback symmetry.
- `ON CONFLICT DO NOTHING` is not needed because we rename in place (no id conflict — the old ids are unique per role+module and the new ids are not already present for the same role since the legacy seed only inserted terminal_*).
- Guard against duplicate-key insert: the migration first checks/uses `UPDATE` (not INSERT), so even if a role somehow has both old and new ids, the UPDATE is a no-op for rows already on the new id and only renames rows still on the old id. To be safe, the upgrade deletes any pre-existing duplicate `(role_id, new_module)` row before renaming, preserving the most recent permission.

### 2. `/me/permissions` endpoint — apply aliases

Update `backend/app/api/routes/auth.py:my_permissions` to map each raw module id through `MODULE_ID_ALIASES` before returning, so the frontend always sees canonical ids:

```python
from app.core.modules import MODULE_ID_ALIASES

allowed = {MODULE_ID_ALIASES.get(m, m) for m in getattr(user, "role_permissions", set())}
return {
    ...,
    "allowed_modules": sorted(allowed),
}
```

This is defense in depth: even if some role still has legacy `terminal_*` rows (e.g., a custom role created before the migration), the sidebar will render correctly.

## Why not a frontend-only fix?

The frontend `AdminSidebar` could be extended to also accept `terminal_*` as aliases for `connectivity_*`. Rejected because:

- The backend is the source of truth for module ids and already defines the alias map; duplicating it in the frontend invites drift.
- The data migration makes stored data canonical, which is cleaner than perpetually translating at the view layer.
- Keeping the endpoint fix is still worthwhile as a safety net for any stale data the migration might not catch (e.g., roles created mid-migration).

## Risk Assessment

- **Schema change**: none (only data in `role_permissions`).
- **Public API change**: the `/me/permissions` response shape is unchanged; only the values of `allowed_modules` may shift from `terminal_*` to `connectivity_*`, which is the intended canonical form the frontend already expects.
- **Backward compatibility**: backend route guards already apply aliases, so no endpoint loses access. The migration is reversible.
- **Scope**: 1 migration file + 1 endpoint edit + 1 regression test. Well within hotfix bounds.
