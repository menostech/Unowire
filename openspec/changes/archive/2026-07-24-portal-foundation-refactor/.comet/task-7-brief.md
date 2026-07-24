# Task 7: Loading States & Consistent Empty States

**Files:**
- Create: `frontend/app/portal/loading.tsx`
- Create: `frontend/app/portal/cables/loading.tsx`
- Create: `frontend/app/portal/equipment/loading.tsx`
- Create: `frontend/app/portal/inquiries/loading.tsx`
- Create: `frontend/app/portal/media/loading.tsx`
- Modify: `frontend/app/portal/cables/page.tsx`, `equipment/page.tsx`, `inquiries/page.tsx`, `media/page.tsx` (add `empty-state` class)

**Interfaces:**
- Consumes: nothing (pure presentational skeletons).
- Produces: Next.js streaming skeletons for every portal route segment; consistent empty-state styling.

## Step 1: Create `frontend/app/portal/loading.tsx` (dashboard skeleton)

```tsx
export default function PortalDashboardLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-4 w-40 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-white shadow-sm" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-lg bg-white shadow-sm" />
        <div className="h-64 animate-pulse rounded-lg bg-white shadow-sm" />
      </div>
    </div>
  );
}
```

## Step 2: Create `frontend/app/portal/cables/loading.tsx` (table skeleton)

```tsx
export default function PortalCablesLoading() {
  return (
    <div>
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-gray-200" />
      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="border-b bg-gray-50 px-4 py-3">
          <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="border-b border-gray-100 px-4 py-3">
            <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Step 3: Create `frontend/app/portal/equipment/loading.tsx`

Reuse the same skeleton markup as Step 2 (table with 5 placeholder rows). Use `PortalEquipmentLoading` as the function name.

## Step 4: Create `frontend/app/portal/inquiries/loading.tsx` (card list skeleton)

```tsx
export default function PortalInquiriesLoading() {
  return (
    <div>
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-gray-200" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-white shadow-sm" />
        ))}
      </div>
    </div>
  );
}
```

## Step 5: Create `frontend/app/portal/media/loading.tsx` (grid skeleton)

```tsx
export default function PortalMediaLoading() {
  return (
    <div>
      <div className="mb-6 h-8 w-40 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-48 animate-pulse rounded-lg bg-white shadow-sm" />
        <div className="lg:col-span-2 h-48 animate-pulse rounded-lg bg-white shadow-sm" />
      </div>
    </div>
  );
}
```

## Step 6: Standardize empty-state styling across list pages

The four list pages already render a `<p className="text-sm text-gray-500">No X yet.</p>` empty state (media uses `text-xs`). Make the styling consistent by adding a shared `empty-state` class to each empty-state `<p>`:

- `cables/page.tsx` line 15: `<p className="empty-state text-sm text-gray-500">No cables in your scope yet.</p>`
- `equipment/page.tsx` line 15: `<p className="empty-state text-sm text-gray-500">No equipment in your scope yet.</p>`
- `inquiries/page.tsx` line 15: `<p className="empty-state text-sm text-gray-500">No inquiries yet.</p>`
- `media/page.tsx` line 21: `<p className="empty-state text-xs text-gray-500">No folders.</p>`
- `media/page.tsx` line 37: `<p className="empty-state text-xs text-gray-500">No uploads.</p>`

Do NOT introduce a new `EmptyState` component — the existing `<p>` pattern is already consistent in structure; this step only adds the shared className.

## Step 7: Verify frontend compiles

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

## Step 8: Commit

```bash
git add frontend/app/portal/loading.tsx frontend/app/portal/cables/loading.tsx frontend/app/portal/equipment/loading.tsx frontend/app/portal/inquiries/loading.tsx frontend/app/portal/media/loading.tsx frontend/app/portal/cables/page.tsx frontend/app/portal/equipment/page.tsx frontend/app/portal/inquiries/page.tsx frontend/app/portal/media/page.tsx
git commit -m "feat(portal): add loading skeletons and consistent empty states"
```

**Acceptance criteria:** `portal-error-resilience/spec.md` Requirement "Portal pages SHALL display loading states"; scenarios "Cables list loading", "Dashboard loading". Requirement "Portal pages SHALL display consistent empty states"; scenarios "No cables in scope", "No inquiries".

## Global Constraints
- Frontend MVP does NOT require automated tests — do NOT write new frontend test files.
- All code and comments in English.
- No new npm packages.
