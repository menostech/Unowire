# Task 8 + Task 9: Token-Expiry Redirect, Dashboard Error Handling, and Permissions-Based Sidebar Gating

These two tasks are coupled: Task 8 Step 2 (layout) passes `allowedModules` to `PortalSidebar`, which Task 9 Step 1 updates to accept. They must be implemented together to keep tsc green.

## Files
- Modify: `frontend/middleware.ts` (add `x-pathname` header)
- Modify: `frontend/app/portal/layout.tsx` (parallel fetch + redirect + permissions prop)
- Create: `frontend/components/portal/PortalDashboardContent.tsx` (extracted from page.tsx)
- Create: `frontend/components/portal/PortalDashboardErrorState.tsx` (client component)
- Modify: `frontend/app/portal/page.tsx` (try/catch + redirect + error state)
- Modify: `frontend/components/portal/layout/PortalSidebar.tsx` (add `allowedModules` prop + filter nav)

## Step 1: Add `x-pathname` request header in `frontend/middleware.ts`

The existing middleware returns `NextResponse.next()` at the end (line 55) and `NextResponse.redirect(...)` in the no-cookie branches. Modify ONLY the final `return NextResponse.next();` (line 55) to set the `x-pathname` header on the forwarded request. Replace it with:

```typescript
const requestHeaders = new Headers(request.headers);
requestHeaders.set('x-pathname', pathname);
return NextResponse.next({
  request: { headers: requestHeaders },
});
```

Do NOT change the existing redirect branches — they return early as before. `pathname` is already in scope (from `request.nextUrl` on line 5).

## Step 2: Refactor `frontend/app/portal/layout.tsx` — parallel fetch + redirect + permissions prop

Replace the entire file with:

```tsx
import { headers, redirect } from 'next/headers';
import { portalApi } from '@/lib/portalApi';
import { PortalSidebar } from '@/components/portal/layout/PortalSidebar';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [user, perms] = await Promise.all([
    portalApi.auth.me(),
    portalApi.auth.permissions(),
  ]);
  const pathname = (await headers()).get('x-pathname') || '';

  if (!user && pathname !== '/portal/login') {
    redirect(`/portal/login?from=${encodeURIComponent(pathname)}`);
  }
  if (!user) {
    return <>{children}</>; // login page renders without sidebar
  }

  return (
    <div className="portal-shell flex min-h-screen">
      <PortalSidebar
        user={user}
        allowedModules={perms?.allowed_modules ?? []}
      />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}
```

Notes: `user` is now `PortalUser | null`; pass it directly to the sidebar (no spread/type-cast needed — `PortalUser.scope_type` is already `PortalScopeType | null`). `perms` is `PortalPermissions | null`.

## Step 3: Create `frontend/components/portal/PortalDashboardContent.tsx`

Extract the existing dashboard render from `frontend/app/portal/page.tsx` into a presentational component:

```tsx
import type { PortalDashboard } from '@/lib/types/portal';
import { DashboardStats } from '@/components/portal/DashboardStats';
import { InquiryTrendChart } from '@/components/portal/InquiryTrendChart';
import { ViewsTrendChart } from '@/components/portal/ViewsTrendChart';
import { RecentInquiries } from '@/components/portal/RecentInquiries';

export function PortalDashboardContent({ data }: { data: PortalDashboard }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{data.factory_name}</h1>
        <p className="text-sm text-gray-500">Factory Portal Dashboard</p>
      </div>
      <DashboardStats stats={data.stats} scopeType={data.scope_type} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InquiryTrendChart data={data.inquiry_trend} />
        <ViewsTrendChart data={data.views_trend} />
      </div>
      <RecentInquiries inquiries={data.recent_inquiries} />
    </div>
  );
}
```

## Step 4: Create `frontend/components/portal/PortalDashboardErrorState.tsx`

Small client component with a Retry button that calls `router.refresh()`:

```tsx
'use client';

import { useRouter } from 'next/navigation';

export function PortalDashboardErrorState() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      </div>
      <div className="rounded-lg bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-gray-600">Failed to load dashboard data</p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
```

## Step 5: Refactor `frontend/app/portal/page.tsx` — try/catch + redirect + error state

Replace the entire file with:

```tsx
import { redirect } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import type { PortalDashboard } from '@/lib/types/portal';
import { PortalDashboardContent } from '@/components/portal/PortalDashboardContent';
import { PortalDashboardErrorState } from '@/components/portal/PortalDashboardErrorState';

export default async function PortalDashboardPage() {
  let data: PortalDashboard;
  try {
    data = await portalApi.dashboard.get();
  } catch {
    const user = await portalApi.auth.me();
    if (!user) redirect('/portal/login?from=/portal');
    return <PortalDashboardErrorState />;
  }
  return <PortalDashboardContent data={data} />;
}
```

## Step 6: Update `frontend/components/portal/layout/PortalSidebar.tsx` — add `allowedModules` prop + filter nav

The current sidebar already imports `PortalUser` from `@/lib/types/portal` (good). You need to:
1. Add `allowedModules: string[]` to the component props
2. Filter the nav list by `allowedModules.includes(item.module)`

Change the function signature from:
```tsx
export function PortalSidebar({ user }: { user: PortalUser | null }) {
```
to:
```tsx
export function PortalSidebar({
  user,
  allowedModules,
}: {
  user: PortalUser | null;
  allowedModules: string[];
}) {
```

Change the nav computation from:
```tsx
const nav = user?.scope_type === 'equipment_manufacturer' ? EQUIPMENT_MANUFACTURER_NAV : MANUFACTURER_NAV;
```
to:
```tsx
const scopeType = user?.scope_type ?? null;
const baseNav = scopeType === 'equipment_manufacturer' ? EQUIPMENT_MANUFACTURER_NAV : MANUFACTURER_NAV;
const nav = baseNav.filter((item) => allowedModules.includes(item.module));
```

Keep ALL existing JSX, useEffect (fetchUnread), handleLogout, and the nav map exactly as-is. Only the prop signature and the `nav` computation change.

## Step 7: Verify frontend compiles

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

## Step 8: Commit

```bash
git add frontend/middleware.ts frontend/app/portal/layout.tsx frontend/app/portal/page.tsx frontend/components/portal/PortalDashboardContent.tsx frontend/components/portal/PortalDashboardErrorState.tsx frontend/components/portal/layout/PortalSidebar.tsx
git commit -m "feat(portal): redirect on expired token, handle dashboard errors, gate sidebar by permissions"
```

**Acceptance criteria:**
- `portal-error-resilience/spec.md` Requirement "Portal pages SHALL handle expired tokens gracefully" (expired token on dashboard → redirect to login; login page does not redirect).
- `portal-error-resilience/spec.md` Requirement "Portal dashboard SHALL not crash on backend errors" (dashboard backend returns 500 → error UI with Retry).
- `portal-error-resilience/spec.md` Requirement "Portal sidebar SHALL use permissions API for nav gating" (nav filtered by `allowed_modules`).

## Global Constraints
- Frontend MVP does NOT require automated tests — do NOT write new frontend test files.
- All code and comments in English.
- No new npm packages.
- Use the Write tool for new files and Edit tool for modifications. Read each file before editing.
