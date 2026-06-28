# Task 1 Report: Delete old feature modules

## Status: DONE_WITH_CONCERNS

## What was implemented

### Step 1: Deleted directories and files

**Directories removed (entire):**
- `frontend/app/equipments/` (incl. `[brand_slug]/[slug]/page.tsx`, `page.tsx`)
- `frontend/app/manufacturers/` (incl. `[slug]/page.tsx`, `page.tsx`)
- `frontend/app/match/` (incl. `page.tsx`)
- `frontend/components/equipment/` (incl. `EquipmentCard.tsx`, `EquipmentSpecTable.tsx`)
- `frontend/components/manufacturer/` (incl. `ManufacturerCard.tsx`)
- `frontend/components/match/` (incl. `MatchForm.tsx`, `MatchResultCard.tsx`, `RuleBadge.tsx`)

**Individual files removed:**
- `frontend/components/shared/ScoreBar.tsx`
- `frontend/lib/mock-match.ts`
- `frontend/data/equipments.json`
- `frontend/data/match-rules.json`

Also removed the stale `frontend/.next/` build cache directory because its auto-generated `.next/types/validator.ts` still referenced the deleted routes (`app/equipments`, `app/manufacturers`, `app/match`) and caused TS2307 module-not-found errors during `tsc --noEmit`. The `.next` folder is a build artifact and is regenerated on the next `next dev`/`next build`.

### Step 2: Replaced lib/types.ts and lib/api.ts with minimal placeholders

Per the brief verbatim:
- `frontend/lib/types.ts` → minimal placeholder (`Cable { id: string }`, `Manufacturer { id: string }`)
- `frontend/lib/api.ts` → minimal placeholder (`export const api = {};`)

### Step 3: Replaced page/route files with stubs

Per the brief verbatim:
- `frontend/app/page.tsx` → `<div>Unowire</div>`
- `frontend/app/cables/page.tsx` → `<div>Cables</div>`
- `frontend/app/cables/[brand_slug]/[slug]/page.tsx` → `<div>Cable Detail</div>`
- `frontend/app/layout.tsx` → minimal RootLayout importing `./globals.css`
- `frontend/app/sitemap.ts` → single-entry sitemap
- `frontend/app/robots.ts` → minimal robots
- `frontend/app/not-found.tsx` → minimal 404 with Link to `/`

### Additional stubs required to make `tsc --noEmit` pass (beyond the brief's explicit list)

The brief's stated acceptance criterion is "0 errors (all temp files do not depend on deleted modules)". The brief only explicitly lists page files + `lib/types.ts` + `lib/api.ts` for stubbing, but three other files still referenced the now-stubbed `Cable`/`Manufacturer` types (and the deleted `Equipment` type / `CableListItem` export) and therefore blocked compilation. Per the task's overall instruction ("you must temporarily stub out files that referenced the deleted modules so the project still compiles"), these were also reduced to minimal placeholders so the project compiles cleanly. They will be rewritten in later tasks:

- `frontend/components/cable/CableCard.tsx` → minimal stub returning `null` (was importing removed `CableListItem`)
- `frontend/components/cable/CableSpecTable.tsx` → minimal stub returning `null` (was reading many removed `Cable` fields)
- `frontend/lib/seo.ts` → empty placeholder (was importing removed `Equipment` type and reading many removed `Cable`/`Manufacturer` fields)

## TypeScript compilation result

Command: `npx tsc --noEmit` (run from `d:\projects\unowire\frontend`)

Result: **exit code 0, no output** — 0 errors.

(Before stubbing the three extra files and clearing `.next/`, the first run reported ~45 errors concentrated in `.next/types/validator.ts`, `components/cable/CableCard.tsx`, `components/cable/CableSpecTable.tsx`, and `lib/seo.ts`. All resolved by the additional stubs and cache clearing above.)

## Files changed

**Deleted (git tracks as deleted):**
- frontend/app/equipments/[brand_slug]/[slug]/page.tsx
- frontend/app/equipments/page.tsx
- frontend/app/manufacturers/[slug]/page.tsx
- frontend/app/manufacturers/page.tsx
- frontend/app/match/page.tsx
- frontend/components/equipment/EquipmentCard.tsx
- frontend/components/equipment/EquipmentSpecTable.tsx
- frontend/components/manufacturer/ManufacturerCard.tsx
- frontend/components/match/MatchForm.tsx
- frontend/components/match/MatchResultCard.tsx
- frontend/components/match/RuleBadge.tsx
- frontend/components/shared/ScoreBar.tsx
- frontend/data/equipments.json
- frontend/data/match-rules.json
- frontend/lib/mock-match.ts

**Modified (replaced with stubs/placeholders):**
- frontend/app/cables/[brand_slug]/[slug]/page.tsx
- frontend/app/cables/page.tsx
- frontend/app/layout.tsx
- frontend/app/not-found.tsx
- frontend/app/page.tsx
- frontend/app/robots.ts
- frontend/app/sitemap.ts
- frontend/components/cable/CableCard.tsx
- frontend/components/cable/CableSpecTable.tsx
- frontend/lib/api.ts
- frontend/lib/seo.ts
- frontend/lib/types.ts

**Added (untracked, included in commit):**
- .superpowers/sdd/ (task brief + this report)

## Issues / concerns

1. **Three files stubbed beyond the brief's explicit list.** The brief only names `lib/types.ts`, `lib/api.ts`, and 7 page/route files for stubbing, but `components/cable/CableCard.tsx`, `components/cable/CableSpecTable.tsx`, and `lib/seo.ts` also referenced the deleted types/exports and had to be stubbed to reach 0 TypeScript errors. These are now minimal placeholders (`return null` / empty file) that later tasks must rewrite. The brief author may want to confirm these are covered by Tasks 6–30 (the cable detail page that used `CableSpecTable` and `lib/seo.ts` is itself a stub now, so the stubs are not exercised at runtime).

2. **`frontend/.next/` build cache was deleted.** This is a standard Next.js build artifact (gitignored, not tracked) and is regenerated on the next `next dev` / `next build`. It was necessary to remove it because its auto-generated `types/validator.ts` still referenced the deleted `equipments`/`manufacturers`/`match` routes and caused TS2307 errors. No source code was affected.

3. **`.superpowers/` directory is now tracked.** The brief's `git add -A` includes the untracked `.superpowers/` planning folder (task briefs + this report). This appears intentional (the plan files were committed in prior commits on `master`), but flagging it in case the SDD working files were meant to stay local-only.
