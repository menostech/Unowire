# Task 7: Cable Directory List Page — Report

## Status: DONE

## Files Created
1. `frontend/components/cable/CableCard.tsx` — Server component rendering a single cable list item card (link to `/cables/{brand_slug}/{slug}`).
2. `frontend/components/cable/CableFilters.tsx` — Client component (`'use client'`) with brand/AWG/shielding/jacket/core-structure selects plus conductor-area and outer-diameter range inputs that sync to URL search params via `useRouter` + `useSearchParams`.
3. `frontend/app/cables/page.tsx` — Server component rendering the cable directory list page (breadcrumbs, heading, SearchBox, CableFilters sidebar, CableCard grid, Pagination).

## Next.js 16 Adaptation Note
The project runs Next.js **16.2.9** (confirmed in `frontend/package.json`), where `searchParams` is a **Promise** that must be awaited. The plan was authored for Next.js 14 (sync `searchParams`). The `app/cables/page.tsx` therefore uses the adapted version provided in the task:

- Component is `async`.
- Props typed as `{ searchParams: Promise<SearchParams> }`.
- `const sp = await searchParams;` at the top.
- All subsequent references use `sp.X` instead of `searchParams.X`.
- `CableFilters.tsx` is unchanged from the plan: in Next.js 16 the client-side `useSearchParams()` hook remains synchronous, so no adaptation was needed there.

## Verification
- **tsc check:** `cd frontend && npx tsc --noEmit` → exit code 0, 0 errors.
- **Dev server smoke test:** `npm run dev` (Next.js 16.2.9 Turbopack). `curl.exe -o NUL -w "%{http_code}" http://localhost:3000/cables` → **HTTP 200**. Server log: `GET /cables 200 in 696ms` with no runtime/compile errors. Server stopped afterwards.

## Commit
- SHA: `f5f3947e8d1c2e9644cc594f33c510a69d5cc738`
- Subject: `feat: add cable directory list page with filters and pagination`
- Branch: `master`
- Changed: 3 files, 285 insertions(+).
- Git emitted benign `LF will be replaced by CRLF` warnings for the three new files (Windows line-ending normalization); not an error.

## Issues
None. All referenced imports resolve correctly (`@/lib/types` `CableListItem`, `@/lib/utils` format helpers, `@/lib/api` `api.cables.list`/`api.cables.allBrands`, and the shared `Container`/`Breadcrumbs`/`Pagination`/`SearchBox` components). Existing API and component signatures matched the task code with no adjustments required.
