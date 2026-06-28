# Task 11: Equipment Detail Page

## Status
DONE

## Commit
- SHA: `10ed85008bd430c4cd4af5fb81b84bc235a012e3`
- Subject: `feat: add equipment detail page with ISR, SEO, structured data`

## Summary
Added the equipment detail page (`frontend/app/equipments/[brand_slug]/[slug]/page.tsx`) and its spec table component (`frontend/components/equipment/EquipmentSpecTable.tsx`), with Next.js 16 Promise-`params` adaptation applied and the missing `formatEquipmentType` import included.

## Files Created
1. `frontend/components/equipment/EquipmentSpecTable.tsx` — presentational spec table (brand, model, type, automation, conductor area / OD / cut length ranges, supported shieldings/jackets/cores).
2. `frontend/app/equipments/[brand_slug]/[slug]/page.tsx` — server component with:
   - `revalidate = 3600` (ISR).
   - `generateStaticParams` from `api.equipments.sitemap()`.
   - `generateMetadata` (awaited Promise params) via `generateEquipmentMetadata`.
   - JSON-LD structured data (`buildEquipmentJsonLd` + `buildBreadcrumbJsonLd`).
   - Breadcrumbs, two-column layout (specs + description/spec PDF/manufacturer card), and a "Similar Equipment" section by equipment type.

## Verification
- `npx tsc --noEmit` from `frontend/`: **0 errors** (exit code 0).
- Dependency check confirmed all imports resolve against existing code:
  - `lib/types.ts` → `Equipment` interface has every field used.
  - `lib/utils.ts` → `formatEquipmentType`, `formatShielding`, `formatJacket`, `formatCoreStructure` all exported.
  - `lib/api.ts` → `equipments.sitemap`, `equipments.getBySlug`, `equipments.list`, `manufacturers.list` exist with matching signatures.
  - `lib/seo.ts` → `generateEquipmentMetadata`, `buildEquipmentJsonLd`, `buildBreadcrumbJsonLd` exported.
  - `components/layout/Container`, `components/layout/Breadcrumbs`, `components/seo/JsonLd` exist (same usage as the cable detail page).
- The Next.js 16 Promise-`params` pattern matches the existing `app/cables/[brand_slug]/[slug]/page.tsx`.

## Notes
- Git emitted harmless `LF will be replaced by CRLF` warnings during `git add` (line-ending normalization); no impact.
- Only the two intended files were staged and committed; the untracked `.superpowers/` directory was deliberately left out.
