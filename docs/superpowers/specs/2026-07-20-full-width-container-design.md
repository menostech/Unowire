# Full-Width Container With Responsive Padding Design Spec

> **Branch:** `feat/media-picker-modal`
> **Date:** 2026-07-20
> **Status:** Approved by user (2026-07-20)
> **Supersedes:** Container width decision in `2026-07-20-container-width-increase-design.md` (which set `max-w-screen-2xl` / 1536px — user reported still too narrow)

## Goal

Remove the `max-w-*` cap on the shared `Container` layout wrapper so content fills the full viewport width on any monitor size, while keeping comfortable horizontal padding via a responsive `px-8 md:px-12` (32px / 48px). Apply the same change to `HeroSearch`'s internal width wrapper so the hero stays aligned with the content sections below it.

## Scope

### In Scope
- Modify `frontend/components/layout/Container.tsx` — remove `max-w-screen-2xl mx-auto`, bump `px-6` → `px-8 md:px-12`
- Modify `frontend/components/home/HeroSearch.tsx` — same class swap on the inner content wrapper (line 53), keep `py-20 text-center`

### Out of Scope
- Backend changes (none)
- Component-local widths (`max-w-2xl`, `max-w-3xl`, `max-w-xl`) — these constrain forms, articles, and the search input for readability and must NOT change
- New components, new pages, new tests
- i18n, SEO, accessibility changes

## Architecture

`Container` is the shared layout wrapper used across the site (homepage, cables, equipment, admin, login, member). Removing its max-width cap makes every page using it full-bleed. Horizontal padding is preserved (and slightly increased) so content doesn't touch the viewport edge on any screen size.

`HeroSearch` is rendered OUTSIDE `<Container>` in `app/(site)/page.tsx` (full-bleed background image) but contains its own internal width wrapper that mirrors `Container`'s classes to center hero content. That wrapper MUST stay in sync with Container — otherwise hero content will be visually misaligned with the stats/grid sections below it on any viewport.

### Class comparison

| Component | Before | After |
|---|---|---|
| `Container.tsx` | `mx-auto w-full max-w-screen-2xl px-6` | `w-full px-8 md:px-12` |
| `HeroSearch.tsx` inner wrapper | `mx-auto w-full max-w-screen-2xl px-6 py-20 text-center` | `w-full px-8 md:px-12 py-20 text-center` |

`mx-auto` is removed because it has no effect once `max-w-*` is gone — removing it keeps the className string clean and signals the intent (no centering, full-bleed).

### Padding behavior by viewport

| Viewport | Padding each side | Content width |
|---|---|---|
| 375px (mobile) | 32px (`px-8`) | 311px |
| 768px (tablet, `md:` kicks in) | 48px (`md:px-12`) | 672px |
| 1280px (desktop) | 48px | 1184px |
| 1536px (previous cap) | 48px | 1440px (no longer capped) |
| 1920px (full HD) | 48px | 1824px |
| 2560px (ultrawide) | 48px | 2464px |

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
<div className={cn('mx-auto w-full max-w-screen-2xl px-6', className)}>
```

**After:**
```tsx
<div className={cn('w-full px-8 md:px-12', className)}>
```

### 2. `frontend/components/home/HeroSearch.tsx`

**Before:**
```tsx
<div className="mx-auto w-full max-w-screen-2xl px-6 py-20 text-center">
```

**After:**
```tsx
<div className="w-full px-8 md:px-12 py-20 text-center">
```

## Impact Assessment

### Pages affected (all use `<Container>`)
- `/` (homepage — HeroSearch is outside Container but has its own matching wrapper)
- `/cables`, `/cables?q=`, `/cables?industry=...`, `/cables/[industry]/[category]/[product-type]`
- `/equipment`, `/equipment?q=`, `/equipment/[slug]`, `/equipment/manufacturers/[slug]`
- `/cable/[brand_slug]/[slug]` (cable detail)
- `/manufacturers`, `/manufacturers/[slug]`
- `/admin/*` (all admin pages)
- `/login`, `/register`, `/verify`, `/member/*`
- `/[slug]` (CMS public pages)

### Pages NOT affected by width change
- Article body in `PageView.tsx` uses `max-w-3xl` (intentional for long-form readability) — unchanged
- All admin forms use `max-w-2xl` — unchanged
- HeroSearch's inner search input uses `max-w-xl` — unchanged

### Risk
- On ultrawide monitors (>1920px), text lines get long, hurting readability. User explicitly accepted this trade-off ("full width, but leave some padding on both left and right").
- Cable/Equipment list grids use `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` patterns. With wider Container, on `xl`/`2xl` viewports these grids will be wider. Verified safe — grids gracefully scale because they're column-count-based, not fixed-width.
- Admin dashboard uses Container — will be wider. No breakage expected (admin uses card layouts with `gap-*`).

## Verification

1. `docker compose --env-file .env.docker build frontend` succeeds
2. tsc: 0 new errors (8 pre-existing baseline in `.next/dev/types/validator.ts`)
3. HTTP smoke test on key pages:
   - `/` → 200
   - `/cables` → 200
   - `/equipment` → 200
   - `/login` → 200
4. Manual browser check (user):
   - On a 1920px viewport: content fills width with 48px padding on each side
   - Hero content aligned with stats/grid sections below
   - No horizontal scrollbar on homepage

## Acceptance Criteria

1. ✅ `Container.tsx` uses `w-full px-8 md:px-12` (no `max-w-*`, no `mx-auto`)
2. ✅ `HeroSearch.tsx` inner wrapper uses `w-full px-8 md:px-12 py-20 text-center`
3. ✅ No other `max-w-*` classes changed
4. ✅ Docker frontend build succeeds
5. ✅ 0 new tsc errors
6. ✅ HTTP smoke test passes on `/`, `/cables`, `/equipment`, `/login`

## Rollback

Single commit revert. No migrations, no data changes.
