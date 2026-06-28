# Task 3: Core Library Files — Report

## Files Created (5)

1. `d:\projects\unowire\frontend\lib\types.ts` (new) — TypeScript interfaces for Manufacturer, Cable, Equipment, MatchRule, MatchResponse, list responses, etc.
2. `d:\projects\unowire\frontend\lib\utils.ts` (overwrote existing shadcn `cn`) — simple `cn` plus URL/formatter helpers (`formatCableUrl`, `formatEquipmentUrl`, `formatManufacturerUrl`, `formatEquipmentType`, `formatCoreStructure`, `formatShielding`, `formatJacket`).
3. `d:\projects\unowire\frontend\lib\seo.ts` (new) — Next.js Metadata generators + JSON-LD builders for cables, equipment, manufacturers, breadcrumbs.
4. `d:\projects\unowire\frontend\lib\api.ts` (new) — mock API reading from `@/data/*.json`; the only file to replace when backend is ready.
5. `d:\projects\unowire\frontend\lib\mock-match.ts` (new) — client-side 3-phase mock matching engine (`runMatch`).

## tsconfig.json Verification

Read `d:\projects\unowire\frontend\tsconfig.json`. Both required settings were already present — **no modification needed**:

- `resolveJsonModule: true` — present (line 12). Required for `api.ts` JSON imports.
- `"paths": { "@/*": ["./*"] }` — present (lines 21–23). Required for `@/data/*` imports in `api.ts`.

Since tsconfig.json was unchanged, it was NOT staged in the commit (only `frontend/lib/` was committed).

## TypeScript Check Result

Command: `npx tsc --noEmit` (run from `d:\projects\unowire\frontend`).

**Result: FAIL** — 10 errors remain, all in pre-existing shadcn/base-ui UI components (NOT in the 5 created files).

### Error in a created file — FIXED
- `lib/mock-match.ts(102,44): error TS2552: Cannot find name 'equipment_type'. Did you mean 'equipmentType'?`
  - Cause: spec used shorthand `{ equipment_type }` while the function parameter is named `equipmentType`.
  - Fix applied (preserves intent — pass `equipmentType` to the API's `equipment_type` key):
    ```ts
    const candidates = api.equipments.list({ equipment_type: equipmentType, page_size: 1000 }).items
    ```
  - After fix, re-ran `tsc --noEmit`: this error is gone.

### Remaining 10 errors (NOT in created files — reported as concern)
All are `TS2345` in `components/ui/select.tsx` (9 errors) and `components/ui/separator.tsx` (1 error). Example:
```
components/ui/select.tsx(15,40): error TS2345: Argument of type 'string | ((state: SelectGroupState) => string | undefined) | undefined' is not assignable to parameter of type 'string | false | null | undefined'.
```

**Root cause:** The verbatim `utils.ts` spec replaces the original shadcn `cn` (which used `clsx` + `tailwind-merge` and accepted `ClassValue`, including state-render functions) with a narrower signature `cn(...classes: (string | undefined | false | null)[])`. The base-ui components pass `className` props typed as `string | ((state: T) => string | undefined) | undefined`, which the new `cn` rejects.

**Why not fixed:** Per task instructions, `utils.ts` must be transcribed verbatim ("Do not modify any types, function signatures, or logic"), and errors should be fixed "ONLY if they're real type errors in the files you created." The failing files (`components/ui/select.tsx`, `components/ui/separator.tsx`) are NOT among the 5 created files.

**Recommended resolution (for parent agent):** Either (a) widen `cn`'s signature to accept the base-ui className type (e.g. revert to `clsx`/`tailwind-merge`, or accept `any`/function types), or (b) replace the affected base-ui shadcn components with simpler ones that don't use state-function classNames. Option (a) is the smallest change.

## Commit

- SHA (full): `aaa2454c27f8926cb47e44cbc2a18586c927dbf8`
- SHA (short): `aaa2454`
- Subject: `feat: add core lib files (types, utils, seo, mock API, mock match engine)`
- Staged paths: `frontend/lib/` only (5 files: 4 new + 1 modified `utils.ts`). `tsconfig.json` was NOT modified so was NOT staged. `.superpowers/` was intentionally excluded.
- Stats: 5 files changed, 620 insertions(+), 4 deletions(-).

## Issues / Deviations

1. **mock-match.ts spec typo fixed:** The spec's `{ equipment_type }` shorthand referenced an undefined name (parameter is `equipmentType`). Fixed to `{ equipment_type: equipmentType }` — a minimal, intent-preserving correction sanctioned by the "fix real type errors in files you created" instruction.
2. **`utils.ts` `cn` breaks base-ui shadcn components:** 10 `tsc` errors in `components/ui/select.tsx` and `components/ui/separator.tsx` remain because the verbatim `cn` signature rejects base-ui's state-function className props. NOT fixed per verbatim/scope constraints — flagged for parent agent. Status: DONE_WITH_CONCERNS.
3. **CRLF warnings:** Git warned that LF will be normalized to CRLF on next checkout for the 4 new files. Cosmetic only; commit succeeded.
4. All other file contents transcribed verbatim from the spec.
