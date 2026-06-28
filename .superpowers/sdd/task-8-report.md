# Task 8: Equipment Directory List Page — Report

## Status: DONE

## Summary
Implemented the equipment directory list page (`/equipments`) with a quick type filter, search box, and pagination, plus a reusable `EquipmentCard` component. Next.js 16 adaptation applied (`searchParams` as `Promise`, awaited before use).

## Files Created
1. `frontend/components/equipment/EquipmentCard.tsx` — Card component rendering brand/model, formatted equipment type, automation level, and conductor area range. Links to the equipment detail URL via `formatEquipmentUrl`.
2. `frontend/app/equipments/page.tsx` — Server component for the directory. Awaits `searchParams` (Next.js 16), queries `api.equipments.list` with `q`/`brand`/`equipment_type`/`page` filters, renders breadcrumbs, search box, quick type-filter chips (All / Semi-Auto Stripping / Fully-Auto Cutting & Stripping), grid of `EquipmentCard`s, and `Pagination`. Also computes a brand list (currently unused in the UI but available for future filter expansion).

## Next.js 16 Adaptation
- Signature: `{ searchParams }: { searchParams: Promise<SearchParams> }`
- `const sp = await searchParams;` before any access.
- Mirrors the existing `frontend/app/cables/page.tsx` pattern already in the repo.

## Verification
- `npx tsc --noEmit` (run from `frontend/`) → exit code 0, no type errors.
- Imports verified against existing modules: `@/lib/types` (`EquipmentListItem`), `@/lib/utils` (`formatEquipmentUrl`, `formatEquipmentType`), `@/lib/api` (`api.equipments.list`, `api.manufacturers.getBySlug`), `@/components/layout/{Container,Breadcrumbs}`, `@/components/shared/{Pagination,SearchBox}`.

## Commit
- SHA: `bf7c724a94c51aaf3c5784dbca0d6b8672516541`
- Subject: `feat: add equipment directory list page with type filter`
- Files staged: `frontend/app/equipments/page.tsx`, `frontend/components/equipment/EquipmentCard.tsx`
- 2 files changed, 110 insertions(+).

## Notes
- The `brands` array is computed but not rendered in the current UI (only the quick type filter is shown, per the task spec). It is left in place to match the supplied spec verbatim and to support a future brand filter without re-querying.
- Git emitted LF→CRLF warnings on commit (Windows line-ending normalization); this is a benign autocrlf warning, not an error.
