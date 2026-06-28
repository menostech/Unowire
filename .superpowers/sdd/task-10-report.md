# Task 10: Cable Detail Page

## Status: DONE

## Summary
Created the cable detail page (with ISR, SEO metadata, JSON-LD, and related-cables sections) and its spec table component for the Unowire frontend. Applied the Next.js 16 async `params` adaptation in both `generateMetadata` and the page component.

## Files Created
1. `frontend/components/cable/CableSpecTable.tsx` — Presentational component rendering a 12-row specifications table (brand, model, spec, AWG, conductor area, OD, insulation, shielding, jacket, core structure, rated voltage, temperature rating) using the `formatShielding`/`formatJacket`/`formatCoreStructure` helpers.
2. `frontend/app/cables/[brand_slug]/[slug]/page.tsx` — Server component implementing the cable detail route. Uses `generateStaticParams` (from `api.cables.sitemap()`), `export const revalidate = 3600` for ISR, `generateMetadata` (via `generateCableMetadata`), emits `Product` + `BreadcrumbList` JSON-LD, shows breadcrumbs, spec table, description, a "Match Equipment" CTA linking to `/match?cable_id=...`, and two related-cables sections (same brand, same AWG). `notFound()` is called when the cable does not exist.

## Next.js 16 Adaptation
- `generateMetadata`: `params: Promise<{ brand_slug: string; slug: string }>` + `const { brand_slug, slug } = await params;`
- Page component: declared `async` with `params: Promise<{ brand_slug: string; slug: string }>` + `const { brand_slug, slug } = await params;`
- This is consistent with the existing `frontend/app/cables/page.tsx` which already uses `searchParams: Promise<SearchParams>` with `await` (project runs Next.js 16.2.9).

## Verification
- `npx tsc --noEmit` run from `frontend/`: exited 0 (no type errors).
- All referenced dependencies verified to exist with matching signatures:
  - `Cable` type in `frontend/lib/types.ts` exposes every field used (`manufacturer_id`, `brand_slug`, `awg`, `conductor_area`, `slug`, `spec`, `brand`, `id`, `description`, etc.).
  - `api.cables.sitemap()`, `api.cables.getBySlug()`, `api.cables.list({ brand|awg, page_size })`, `api.manufacturers.list()` in `frontend/lib/api.ts`.
  - `generateCableMetadata`, `buildCableJsonLd`, `buildBreadcrumbJsonLd` in `frontend/lib/seo.ts`.
  - `formatShielding`, `formatJacket`, `formatCoreStructure` in `frontend/lib/utils.ts`.
  - `Container`, `Breadcrumbs`, `JsonLd` components accept the props passed.
- Dev-server smoke test: skipped (optional per task spec); tsc clean plus verified dependency signatures provide high confidence.

## Commit
- SHA: `ee9f43a`
- Subject: `feat: add cable detail page with ISR, SEO metadata, JSON-LD, related cables`
- Files: 2 files changed, 175 insertions(+)
- Staged exactly the two target paths (`frontend/app/cables/`, `frontend/components/cable/CableSpecTable.tsx`); the untracked `.superpowers/` directory was left unstaged.

## Notes
- PowerShell rejected the bash heredoc form (`$(cat <<'EOF' ...)`) for the commit message; committed with a plain single-line `-m` message instead (identical content). Verbatim transcription from the task spec was followed for both source files.
- Git emitted benign LF→CRLF warnings on Windows (line-ending normalization only, no content impact).
