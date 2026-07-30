# Design: Media Folder Tree Width Consistency

## Approach

Both media pages currently diverge in layout structure:

- **Admin** (`app/admin/(dashboard)/media/page.tsx`): flex layout, folder `aside` is `w-64 shrink-0`, media grid is `flex-1 min-w-0`. Only the width needs adjusting.
- **Portal** (`components/portal/media/MediaLibrary.tsx`): `grid grid-cols-1 gap-6 lg:grid-cols-3` with folder = 1 col and uploads = `lg:col-span-2`. Needs to switch to the same flex pattern as admin.

## Changes

### Admin media page

`frontend/app/admin/(dashboard)/media/page.tsx`

- Folder `aside`: change `w-64` → `w-72`. Keep `shrink-0`, padding, max-height, and scroll behavior unchanged.

### Portal media library

`frontend/components/portal/media/MediaLibrary.tsx`

- Replace the outer `grid grid-cols-1 gap-6 lg:grid-cols-3` wrapper with `flex flex-col gap-6 lg:flex-row gap-6` (flex on large screens, stacked on mobile).
- Folder sidebar wrapper: change from grid column to `w-72 shrink-0 rounded-lg bg-white p-4 shadow-sm` (add `shrink-0`).
- Uploads wrapper: change from `lg:col-span-2` to `flex-1 min-w-0`.

## Width Rationale

`w-72` (288px):

- Admin: +32px over `w-64` (256px) — relieves the "too narrow" feeling while staying a standard sidebar size.
- Portal: ~-110px vs. the 1/3 grid column (~400px on a 1200px container) — reclaiming space for the uploads grid.
- Same value on both pages → visual consistency when switching contexts.

## Non-Goals

- No change to nested folder indentation, row heights, or icons.
- No change to the mobile stacked behavior (portal keeps `flex-col` on small screens).
- No shared component extraction — the two folder trees remain independent components; only their container widths are aligned.
