# Tasks: Media Folder Tree Width Consistency

## Frontend

- [x] 1. Admin media page: change folder `aside` width from `w-64` to `w-72` in `frontend/app/admin/(dashboard)/media/page.tsx`
- [x] 2. Portal media library: switch folder sidebar + uploads wrapper from `lg:grid-cols-3` grid to flex layout (`w-72 shrink-0` sidebar + `flex-1 min-w-0` main) in `frontend/components/portal/media/MediaLibrary.tsx`
- [x] 3. Manual verification: confirm both `/admin/media` and `/portal/media` render the folder sidebar at the same 288px width, uploads grid fills the remaining space, and mobile still stacks vertically
