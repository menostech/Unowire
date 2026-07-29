# Task 1.2 Report — Extend `PortalEquipmentCreate` with optional `applicable_specs`

**Status:** BLOCKED

## Summary

Task 1.2's plan-faithful schema change was implemented (RED → GREEN achieved for the
new schema unit tests). However, running the existing portal equipment API tests to
confirm "no regression" (subagent brief step 5) produced **2 failing tests**. The
regression is caused by a flaw in the plan's assumption that `None` would flow through
`EquipmentModel(**data)` without error. Per the TDD skill ("Other tests fail? Fix now")
and the task's gating step 5 ("All existing tests should still pass"), **I did NOT commit**.
The fix requires modifying a file outside my allowed scope (`portal_equipment.py` route,
or the `RecommendedEquipmentRead` response schema). The plan-faithful change is left in
the working tree (uncommitted) for the parent agent to inspect or build on.

## RED — Failing test (before implementation)

**Command:**
```bash
cd backend && venv\Scripts\python.exe -m pytest tests/schemas/test_equipment_schema.py -v
```

**Result:** 2 failed.
```
FAILED tests/schemas/test_equipment_schema.py::test_portal_equipment_create_accepts_optional_applicable_specs
FAILED tests/schemas/test_equipment_schema.py::test_portal_equipment_create_defaults_applicable_specs_to_none
```
**Failure reason (expected):** `AttributeError: 'PortalEquipmentCreate' object has no attribute 'applicable_specs'` — the field did not yet exist on the schema. This is the correct RED state: the test fails because the feature is missing, not because of a typo.

## GREEN — Passing test (after implementation)

**Command:**
```bash
cd backend && venv\Scripts\python.exe -m pytest tests/schemas/test_equipment_schema.py -v
```

**Result:** 2 passed.
```
tests/schemas/test_equipment_schema.py::test_portal_equipment_create_accepts_optional_applicable_specs PASSED
tests/schemas/test_equipment_schema.py::test_portal_equipment_create_defaults_applicable_specs_to_none PASSED
======================== 2 passed, 2 warnings in 1.75s ========================
```

**Verification command (plan Step 2):**
```bash
cd backend && venv\Scripts\python.exe -c "from app.schemas.equipment import PortalEquipmentCreate; print(PortalEquipmentCreate.model_fields.keys())"
```
**Output (matches plan exactly):**
```
dict_keys(['category_id', 'model', 'slug', 'applicable_specs', 'description', 'image_url', 'external_url', 'sort_order'])
```

## Regression — Existing portal equipment tests fail

**Command (subagent brief step 5):**
```bash
cd backend && venv\Scripts\python.exe -m pytest tests/api/test_portal_equipment.py -v
```

**Result:** 2 failed, 7 passed.
```
FAILED tests/api/test_portal_equipment.py::test_portal_create_equipment_success
FAILED tests/api/test_portal_equipment.py::test_portal_delete_equipment_success
```
Both fail with the same error during response serialization:
```
fastapi.exceptions.ResponseValidationError: 1 validation errors:
  {'type': 'list_type', 'loc': ('response', 'applicable_specs'),
   'msg': 'Input should be a valid list', 'input': None}
```

### Root cause

1. The DB column is **not** a "nullable JSONB column" as the subagent brief asserted.
   In `backend/app/models/equipment.py:72`:
   ```python
   applicable_specs: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
   ```
   It is `nullable=False` with a **server-side default of `[]`** (empty JSON array).

2. The route `portal_create_equipment` (`backend/app/api/routes/portal_equipment.py:89,93`)
   does:
   ```python
   equipment_data = obj_in.model_dump()          # includes applicable_specs
   equipment = EquipmentModel(**equipment_data)   # passes it explicitly
   ```

3. **Before this task:** `PortalEquipmentCreate` had no `applicable_specs` field, so
   `model_dump()` omitted it, `EquipmentModel(**data)` did not set it, and the INSERT
   omitted the column → Postgres applied `server_default="[]"` → DB stored `[]` →
   response schema `RecommendedEquipmentRead.applicable_specs: list[dict] = []`
   validated fine. Tests passed.

4. **After this task:** `PortalEquipmentCreate.applicable_specs` defaults to `None`
   (per plan). `model_dump()` now includes `applicable_specs: None`.
   `EquipmentModel(**data)` sets the attribute to `None` **explicitly on the Python
   instance**, which causes SQLAlchemy to send `NULL` in the INSERT — overriding the
   `server_default="[]"`. The DB stores `NULL`. The re-read returns `None`.
   `RecommendedEquipmentRead.applicable_specs: list[dict] = []` (non-optional, default
   `[]`) rejects `None` → `ResponseValidationError`.

   This is the **same class of regression** that Task 1.1 hit on the cable side, but the
   plan explicitly told me equipment would NOT regress because "applicable_specs is a
   plain JSONB column" and "None is a valid value for a nullable JSONB column." Both
   premises are false: the column is `nullable=False`, and the response schema requires
   a list.

### Why it cannot be fixed within my file scope

My allowed files: `backend/app/schemas/equipment.py`, `backend/tests/`.
Prohibited: routes, frontend, other schemas, cable.py.

Candidate fixes (all out of scope or plan-deviating):
- **(A) Modify `portal_equipment.py` POST route** to use
  `model_dump(exclude={"applicable_specs"})` when the value is `None`, or to coerce
  `None → []` before `EquipmentModel(**data)`. — **PROHIBITED** (route file).
- **(B) Modify `RecommendedEquipmentRead.applicable_specs`** in `equipment.py` to
  `list[dict] | None = None` so the response accepts `None`. — Same file as
  `PortalEquipmentCreate` (in scope by file), but it is a **different schema class**
  consumed by all equipment endpoints (admin + portal + list + detail). Changing its
  response shape is a **public API change** (clients may receive `null` instead of
  `[]`) and the plan did not ask for it. Too risky; not doing it unilaterally.
- **(C) Default `PortalEquipmentCreate.applicable_specs` to `[]` instead of `None`.**
  — **Deviates from the plan's literal code** (`list[dict] | None = None`) and from the
  plan's Global Constraint #5 ("Optional spec fields default to `None` (backend)").
  Also inconsistent with `RecommendedEquipmentUpdate.applicable_specs: list[dict] | None`
  (`equipment.py:147`).
- **(D) Add a `@model_validator` on `PortalEquipmentCreate`** that coerces `None → []`
  after instantiation. — Deviates from the plan's literal "exact replacement code" and
  adds behavior the plan does not specify.

None of (A)–(D) are both in-scope and plan-faithful. The plan is internally inconsistent:
it specifies a `None` default, asserts "no route change needed" (Task 2.3), and asserts
"all existing tests pass" — these three cannot all hold simultaneously given the actual
DB column definition and route implementation.

## Commit

**Not committed.** HEAD remains at the Task 1.1 commit:
```
3c2d25d23a609361c1ec33ca03742380facac4a3  feat(schema): add optional common_specs and variants to PortalCableCreate
```
The plan-faithful change is left in the working tree (uncommitted) so the parent agent
can inspect it via `git diff backend/app/schemas/equipment.py` and decide how to proceed.

## Changed files

Uncommitted (working tree):
- `backend/app/schemas/equipment.py` — extended `PortalEquipmentCreate` with
  `applicable_specs: list[dict] | None = None` and updated docstring (plan-faithful,
  +3/-1 lines). Diff:
  ```diff
  -    """Portal-specific equipment create schema.
  -
  -    Omits `id` (server-generated) and `manufacturer_id` (server-forced to scope_id).
  -    Excludes `applicable_specs` (complex rule editor; deferred).
  -    """
  +    """Portal-specific equipment create schema.
  +
  +    Omits `id` (server-generated) and `manufacturer_id` (server-forced to scope_id).
  +    Optional `applicable_specs` field allows portal users to enter spec data
  +    via a raw-JSON textarea. Persisted directly to the JSONB column.
  +    """
       category_id: str
       model: str
       slug: str
  +    applicable_specs: list[dict] | None = None
       description: str | None = None
       image_url: str | None = None
       external_url: str | None = None
       sort_order: int = 0
  ```
- `backend/tests/schemas/test_equipment_schema.py` — **new file**, 2 unit tests
  (mirrors the Task 1.1 `test_cable_schema.py` pattern):
  - `test_portal_equipment_create_accepts_optional_applicable_specs`
  - `test_portal_equipment_create_defaults_applicable_specs_to_none`

## Risk signal self-report

- **cross-module change:** No (only `equipment.py` schema + new test file).
- **security-sensitive:** No.
- **concurrency:** No.
- **schema migration:** No (no DB migration; this is a Pydantic schema change only).
  However, the change interacts with an existing DB column's `server_default` in a way
  the plan did not anticipate — see Regression section above.
- **public API change:** **Yes (concern).** Adding a field to a request schema is
  additive, but the resulting `None` propagates through `model_dump()` into the ORM
  INSERT and changes the stored value of a NOT-NULL column from `[]` to `NULL`,
  which then breaks the response serialization. The user-facing impact is that
  `POST /api/portal/equipment` (without `applicable_specs`) now returns a 500-style
  `ResponseValidationError` instead of 201.
- **DONE_WITH_CONCERNS:** N/A (status is BLOCKED).
- **diff > 200 lines:** No (4 lines in `equipment.py`, ~40 lines in the new test file).

**Risk signals hit:** public API change (the regression manifests as a response-shape
breakage on the portal equipment POST endpoint). All others: None.

## Concerns / What remains

1. **The plan's Task 2.3 premise is incorrect.** Task 2.3 ("Verify portal equipment
   POST/PUT accept `applicable_specs`", "Modify: none (verification only)") asserts
   "No code change needed" and "Expected: all existing tests pass." This is false.
   The POST route (`portal_equipment.py:89`) needs a code change to handle the `None`
   case (either `exclude={"applicable_specs"}` from `model_dump`, or coerce `None → []`,
   or default the schema field to `[]`).

2. **Recommended resolution (pick one):**
   - **(Preferred) Expand Task 1.2 / Task 2.3 scope** to modify
     `backend/app/api/routes/portal_equipment.py` `portal_create_equipment` to use
     `obj_in.model_dump(exclude={"applicable_specs"})` for the column-default path,
     then conditionally set `equipment.applicable_specs = obj_in.applicable_specs`
     when it is not `None`. This mirrors the cable route's
     `model_dump(exclude={"common_specs", "variants"})` pattern from Task 2.1.
   - **(Alternative) Revise the plan** so `PortalEquipmentCreate.applicable_specs`
     defaults to `[]` (not `None`), and update Global Constraint #5 and the frontend
     `null`-handling note accordingly. This keeps Task 2.3 as "no route change" but
     deviates from the original `None`-default intent.
   - **(Not recommended) Widen `RecommendedEquipmentRead.applicable_specs` to
     `list[dict] | None`** — public API shape change affecting all equipment
     endpoints; would require frontend audit.

3. **Task 1.2 schema change itself is correct and plan-faithful.** The new unit tests
   pass. Once the route (or the default) is fixed, this change can be committed as-is
   with the commit message specified in the plan:
   `feat(schema): add optional applicable_specs to PortalEquipmentCreate`.

4. **Baseline confirmed.** `git log` shows HEAD = `3c2d25d` (Task 1.1). Before my
   change the tree was clean (only parent-agent tracking files `tasks.md` /
   `subagent-progress.md` were modified). The 2 failing equipment tests therefore
   regressed solely due to my schema change — verified by root-cause analysis above.
