# Container Width Increase Design Spec

> **Branch:** `feat/media-picker-modal`
> **Date:** 2026-07-20
> **Status:** Approved by user (2026-07-20)
> **Supersedes:** Container width decision in `2026-07-19-homepage-redesign-design.md`

## Goal

Increase the page-wide container width from 1280px (`max-w-7xl`) to 1536px (`max-w-screen-2xl`) to give content more horizontal room, resolving the user's complaint that "页面的宽度不够" (page width is not enough) after the homepage redesign shipped with `max-w-7xl`.

## Scope

### In Scope
- Modify `frontend/components/layout/Container.tsx` — bump `max-w-7xl` → `max-w-screen-2xl`
- Modify `frontend/components/home/HeroSearch.tsx` — bump internal `max-w-7xl` → `max-w-screen-2xl` so hero content stays aligned with Container below

### Out of Scope
- Backend changes (none)
- Component-local widths (`max-w-2xl`, `max-w-3xl`, `max-w-xl`) — these constrain forms, articles, and the search input for readability and must NOT change
- New components, new pages, new tests
- i18n, SEO, accessibility changes

## Architecture

`Container` is the shared layout wrapper used across the site (homepage, cables, equipment, admin, login). Increasing its max-width affects every page that uses it. The change is a single Tailwind class swap.

`HeroSearch` is rendered OUTSIDE `<Container>` in `app/(site)/page.tsx` (full-bleed background image) but contains its own internal `max-w-7xl mx-auto px-6` wrapper to center hero content. That internal width MUST match Container's width, otherwise hero content will be misaligned with the stats/grid sections below it.

### Width comparison

| Breakpoint | Tailwind class | Max width | Pixels |
|---|---|---|---|
| Current | `max-w-7xl` | 80rem | 1280px |
| New | `max-w-screen-2xl` | 96rem | 1536px |

+256px of usable content width. On monitors wider than 1536px, content stays centered with whitespace on sides (intentional — keeps text lines readable).

## Files

### Modified
- `frontend/components/layout/Container.tsx` (line 5)
- `frontend/components/home/HeroSearch.tsx` (line 53)

### New
- None

### Deleted
- None

## Change Details

### 1. `frontend/components/layout/Container.tsx`

**Before:**
```tsx
<div className={cn('mx-auto w-full max-w-7xl px-6', className)}>
```

**After:**
```tsx
<div className={cn('mx-auto w-full max-w-screen-2xl px-6', className)}>
```

### 2. `frontend/components/home/HeroSearch.tsx`

**Before:**
```tsx
<div className="mx-auto w-full max-w-7xl px-6 py-20 text-center">
```

**After:**
```tsx
<div className="mx-auto w-full max-w-screen-2xl px-6 py-20 text-center">
```

## Impact Assessment

### Pages affected (all use `<Container>`)
- `/` (homepage — HeroSearch is outside Container but has its own matching width)
- `/cables`, `/cables?q=`, `/cables?industry=...`
- `/equipment`, `/equipment?q=`
- `/cable/[brand_slug]/[slug]` (cable detail)
- `/admin/*` (all admin pages)
- `/login`, `/member/*`

### Pages NOT affected by width change
- Article body in `PageView.tsx` uses `max-w-3xl` (intentional for long-form readability) — unchanged
- All admin forms use `max-w-2xl` — unchanged
- HeroSearch's inner search input uses `max-w-xl` — unchanged

### Risk
- Cable/Equipment list grids currently use responsive columns inside Container. With +256px width, on `lg` breakpoint (1024px) the grid will be unchanged (Container caps at viewport). On `xl`/`2xl` viewports, grids will be wider — more whitespace, possibly more columns visible. Verified safe: all grids use `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` patterns that gracefully scale.
- Admin dashboard layout uses Container — will be wider. No breakage expected (admin uses card layouts with `gap-*`).

## Verification

1. `docker compose --env-file .env.docker build frontend` succeeds
2. tsc: 0 new errors (8 pre-existing baseline in `.next/dev/types/validator.ts`)
3. Manual smoke test (browser):
   - `/` — hero content aligned with stats/grid below; wider layout on desktop
   - `/cables` — list page renders wider, no horizontal scroll
   - `/equipment` — same as above
   - `/login` — form stays centered, no breakage
   - `/admin/dashboard` — wider, no breakage
4. Test on a 1920px viewport: content centered with ~192px whitespace on each side (expected)

## Acceptance Criteria

1. ✅ `Container.tsx` uses `max-w-screen-2xl` (1536px)
2. ✅ `HeroSearch.tsx` internal wrapper uses `max-w-screen-2xl` (matches Container)
3. ✅ No other `max-w-*` classes changed
4. ✅ Docker frontend build succeeds
5. ✅ 0 new tsc errors
6. ✅ Manual smoke test passes on `/`, `/cables`, `/equipment`, `/login`

## Rollback

Single commit revert. No migrations, no data changes.
