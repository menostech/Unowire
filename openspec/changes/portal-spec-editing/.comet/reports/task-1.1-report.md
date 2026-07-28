# Task 1.1 Report — Extend `PortalCableCreate` with optional spec fields

**Status:** DONE_WITH_CONCERNS

## Summary

Extended `PortalCableCreate` in `backend/app/schemas/cable.py` with optional
`common_specs: list[SpecItemCreate] | None = None` and
`variants: list[CableVariantCreate] | None = None` fields, matching the plan's
exact code. Added a pure schema unit test file. TDD Red-Green cycle followed.

## RED — Failing Test

**Command:**
```bash
cd backend && .\venv\Scripts\python.exe -m pytest tests/schemas/test_cable_schema.py -v
```

**Test file created:** `backend/tests/schemas/test_cable_schema.py` (2 tests)

**Failure summary (both tests):**
```
AttributeError: 'PortalCableCreate' object has no attribute 'common_specs'
```

Pydantic v2's default `extra="ignore"` silently dropped the `common_specs` and
`variants` kwargs at instantiation; accessing the undefined attributes then
raised `AttributeError`. Failure was for the right reason (feature missing,
not a typo/import error).

## GREEN — Passing Test

**Change:** Replaced the `PortalCableCreate` class body in
`backend/app/schemas/cable.py` (lines 162–180) with the version from the plan:

- Updated docstring: removed "Excludes `common_specs` and `variants`" note;
  added explanation that specs are optional and persisted via the admin
  spec-persistence pattern.
- Added two fields before `model_config`:
  - `common_specs: list[SpecItemCreate] | None = None`
  - `variants: list[CableVariantCreate] | None = None`

`SpecItemCreate` (lines 104–112) and `CableVariantCreate` (lines 115–118) were
already defined in the same module and required no changes or new imports.

**Command:**
```bash
cd backend && .\venv\Scripts\python.exe -m pytest tests/schemas/test_cable_schema.py -v
```

**Pass summary:**
```
tests/schemas/test_cable_schema.py::test_portal_cable_create_accepts_optional_common_specs_and_variants PASSED [ 50%]
tests/schemas/test_cable_schema.py::test_portal_cable_create_defaults_spec_fields_to_none PASSED [100%]
======================== 2 passed, 2 warnings in 0.28s ========================
```

## Plan Verification Command

```bash
cd backend && .\venv\Scripts\python.exe -c "from app.schemas.cable import PortalCableCreate; print(PortalCableCreate.model_fields.keys())"
```

**Output (matches plan expected output exactly):**
```
dict_keys(['product_type_id', 'industry_id', 'category_id', 'model', 'slug', 'size_system', 'base_description', 'meta_title', 'meta_description', 'image_url', 'category_ids', 'common_specs', 'variants'])
```

## Commit

- **Hash:** `3c2d25d23a609361c1ec33ca03742380facac4a3`
- **Branch:** `feature/20260727/portal-spec-editing`
- **Message:** `feat(schema): add optional common_specs and variants to PortalCableCreate`
- **Stats:** 2 files changed, 73 insertions(+), 1 deletion(-)

## Changed Files

- `backend/app/schemas/cable.py` — modified `PortalCableCreate` class (lines 162–184): docstring + 2 new optional fields.
- `backend/tests/schemas/test_cable_schema.py` — new file with 2 schema unit tests.

## Risk Signal Self-Report

- **cross-module change:** No — only one schema file modified; no route/model/frontend changes.
- **security-sensitive:** No — adding optional input fields, no auth/authz changes.
- **concurrency:** No.
- **schema migration:** No — no DB migration, no new columns/tables. Only Pydantic schema.
- **public API change:** Yes (minor) — `PortalCableCreate` is part of the portal POST `/api/portal/cables` request schema. The new fields are optional with `None` defaults, so existing payloads without these fields still validate. However, see Concern #1 below — the existing POST route's `model_dump()` now leaks `None` values for the new relationship fields, breaking 2 existing API tests. This is a **transient regression** fixed by Task 2.1.
- **DONE_WITH_CONCERNS:** Yes — see Concern #1.
- **diff > 200 lines:** No — 73 insertions, 1 deletion.

## Concerns

### Concern #1 (transient, fixed by Task 2.1): Existing portal cable POST tests fail after this commit

**Symptom:** Running the existing API integration test suite:
```bash
cd backend && .\venv\Scripts\python.exe -m pytest tests/api/test_portal_cables.py -v
```

Results in 2 failures, 8 passes (was 10 passes before this commit):
- `test_portal_create_cable_success` — FAIL
- `test_portal_delete_cable_success` — FAIL (depends on POST to set up state)

**Root cause:** The existing `portal_create_cable` route at
`backend/app/api/routes/portal_cables.py:101` does:
```python
cable_data = obj_in.model_dump()
```
without `exclude=`. After this commit, `cable_data` now contains
`common_specs: None` and `variants: None`. The subsequent
`CableModel(**cable_data)` at line 105 raises:
```
TypeError: Incompatible collection type: None is not list-like
```
because `common_specs` and `variants` are SQLAlchemy **relationships** on
`CableModel` (not scalar columns) and cannot be assigned `None`.

**Why I could not fix it here:** The fix is in Task 2.1, which changes line 101
to `model_dump(exclude={"common_specs", "variants"})` and adds explicit
`SpecItem` / `CableVariant` persistence loops. Modifying
`backend/app/api/routes/portal_cables.py` is explicitly **prohibited** by this
task's File Scope ("Allowed to modify: `backend/app/schemas/cable.py`,
`backend/tests/`").

**Why I committed anyway:** The brief explicitly instructs to commit at step 6.
The plan's design intentionally splits the schema change (Task 1.1) and route
change (Task 2.1) into separate commits, so the regression window exists by
design between commit 1.1 and commit 2.1. Task 2.1 Step 2 explicitly states
"Expected: all existing tests pass" — that expectation only holds AFTER Task 2.1
is applied.

**Recommendation:** Dispatch Task 2.1 immediately to close the regression
window. After Task 2.1, all 10 existing tests + the 2 new schema tests should
pass.

### Concern #2 (minor): Test discovery — no `__init__.py` in new `tests/schemas/` dir

The new `backend/tests/schemas/` directory has no `__init__.py`. pytest still
discovers the test (the existing `backend/tests/api/` directory also has no
`__init__.py` and works fine; only `backend/tests/crud/` has one). No action
needed — noted for consistency with the existing convention.

## TDD Verification Checklist

- [x] Every new function/method has a test (the schema field additions are
  covered by 2 unit tests).
- [x] Watched each test fail before implementing (RED confirmed with
  `AttributeError`).
- [x] Each test failed for expected reason (feature missing, not typo).
- [x] Wrote minimal code to pass each test (only the 2 fields + docstring).
- [x] Schema unit tests pass (GREEN).
- [x] Output pristine for schema tests (only pre-existing deprecation warnings
  unrelated to this change).
- [x] Tests use real code (real `PortalCableCreate` instantiation, no mocks).
- [ ] **All tests pass** — FAILS. 2 existing API tests now fail (Concern #1).
  Cannot fix without modifying the route, which is out of file scope. Fixed by
  Task 2.1.
