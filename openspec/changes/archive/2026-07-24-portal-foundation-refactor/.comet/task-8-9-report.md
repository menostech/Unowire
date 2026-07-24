# Task 8 + Task 9 Report

- **Status:** DONE_WITH_CONCERNS
- **Commits:**
  - `2aba46f` — feat(portal): redirect on expired token, handle dashboard errors, gate sidebar by permissions
- **Test summary:** `tsc --noEmit`: 0 errors
- **Concerns:**
  - The brief (Step 2) instructed `import { headers, redirect } from 'next/headers';`. With the installed Next.js 16.2.9, `redirect` is **not** exported from `next/headers` (verified against `node_modules/next/dist/server/request/headers.d.ts`, which only exports `headers()`). `redirect` is exported from `next/navigation` (verified via `node_modules/next/dist/client/components/navigation.d.ts`), which is the same module the brief's own Step 5 uses for `redirect` in `page.tsx`. To make tsc pass, the layout import was split into `import { headers } from 'next/headers';` and `import { redirect } from 'next/navigation';`. Runtime behavior of `redirect` is identical (both re-export the same server-side implementation). This is a deviation from the brief's literal text but preserves its intent and keeps the project compiling.
  - Git produced LF→CRLF warnings on commit (Windows line-ending normalization). Cosmetic only; the commit succeeded.
  - No automated tests run per global constraints (frontend MVP does not require tests; no new test files written).
- **Files changed:**
  - `frontend/middleware.ts` (modified — added `x-pathname` request header on the final `NextResponse.next()`)
  - `frontend/app/portal/layout.tsx` (modified — parallel `me()` + `permissions()` fetch, redirect on null user, pass `allowedModules` to sidebar)
  - `frontend/app/portal/page.tsx` (modified — try/catch around `dashboard.get()`, redirect on auth failure, error state on backend error)
  - `frontend/components/portal/PortalDashboardContent.tsx` (created — extracted presentational dashboard render)
  - `frontend/components/portal/PortalDashboardErrorState.tsx` (created — client component with Retry button)
  - `frontend/components/portal/layout/PortalSidebar.tsx` (modified — added `allowedModules: string[]` prop; nav filtered by `allowedModules.includes(item.module)`. JSX, useEffect, handleLogout unchanged.)
