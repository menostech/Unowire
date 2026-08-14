---
archived-with: 2026-08-12-enhance-post-media-and-layout
status: final
---
# Enhance Post Media and Layout — Design Spec

> **Date:** 2026-08-03
> **Branch:** `feat/enhance-post-media-and-layout`
> **Status:** Approved
> **Scope:** Frontend-only enhancement (no backend or schema changes)

## Goal

Enhance the post authoring and reading experience across the site: give editors a rich media picker for cover/OG images and inline image insertion from within `PostForm`, and unify the public post pages (`/posts`, `/posts/{category}`, `/{cat}/{slug}`) under a consistent 4-column CSS Grid layout with a shared `RecommendationSidebar` showing up to 8 same-category posts.

## Architecture & Scope

**Approach:** Frontend-only changes. Reuse the existing `MediaPickerModal` and `ImageFieldWithPicker` primitives already in the admin form layer to wire media selection into `PostForm`, and extract a shared `RecommendationSidebar` component for the three public post pages. No backend endpoints, database tables, or type definitions change — the post list/detail endpoints already return the fields consumed here.

**No changes to:**
- Backend routes, services, or migrations.
- Post / post-category schema.
- `Post` type definition.

### PostForm media enhancements

| Concern | Change |
|---|---|
| Cover image & OG image | Replace plain text URL inputs with `ImageFieldWithPicker`, opening `MediaPickerModal` to select from the media library. Selected URL is stored on the same `cover_image` / `og_image` fields. |
| Inline image insert | Add an "Insert Image" button to the body editor toolbar that opens `MediaPickerModal` and inserts the chosen image URL into the post body at the cursor position. |

### Public layout — 4-column CSS Grid

All three public post pages switch their outer wrapper to a 4-column CSS Grid:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
  <div className="lg:col-span-3 space-y-8">{/* main content */}</div>
  <aside className="lg:col-span-1 space-y-6">{/* sidebar */}</aside>
</div>
```

On viewports below `lg`, the grid collapses to a single column (main content followed by the sidebar).

### RecommendationSidebar

A shared, presentational component rendering up to 8 related posts in the sidebar:

- **Primary source:** posts in the **same category** as the current post/list, excluding the current post on detail pages.
- **Fallback:** if the same-category result set has fewer than 8 items, fill remaining slots with site-wide latest posts (excluding duplicates and the current post).
- **Rendering:** compact list of post links (title + optional thumbnail) and an "All Posts" link to `/posts`.

## Components Touched

| File | Change |
|---|---|
| `frontend/components/admin/form/PostForm.tsx` | Swap cover/OG image inputs to `ImageFieldWithPicker`; add "Insert Image" toolbar button backed by `MediaPickerModal`. |
| `frontend/components/posts/PostView.tsx` | Render body with inserted images; align with the new 4-column wrapper context. |
| `frontend/app/(site)/posts/page.tsx` | Adopt 4-column grid; render `<RecommendationSidebar>` (latest-posts source). |
| `frontend/app/(site)/posts/[category-slug]/page.tsx` | Adopt 4-column grid; render `<RecommendationSidebar>` (same-category source with fallback). |
| `frontend/app/(site)/[...slugs]/page.tsx` | Adopt 4-column grid for post detail rendering; render `<RecommendationSidebar>` (same-category source excluding current post, with site-wide fallback). |
| `frontend/components/posts/RecommendationSidebar.tsx` (NEW) | Shared sidebar component: `posts: Post[]` prop, renders up to 8 links + "All Posts" link. |

## Data Flow

```
PostForm (admin, client)
  → ImageFieldWithPicker → MediaPickerModal → cover_image / og_image URL
  → "Insert Image" → MediaPickerModal → insert image markdown/HTML into body

/posts (server)
  → api.posts.list() → posts
  → <RecommendationSidebar posts={latest} />

/posts/[category-slug] (server)
  → api.posts.byCategory(slug) → posts
  → api.posts.latest() → fallback fill to 8
  → <RecommendationSidebar posts={[...sameCategory, ...latestFill]} />

/[...slugs] post detail (server)
  → api.posts.get(slug) → post
  → api.posts.byCategory(post.category, exclude=slug) → related
  → api.posts.latest() → fallback fill to 8
  → <RecommendationSidebar posts={[...related, ...latestFill]} />
```

## Edge Cases

| Case | Handling |
|---|---|
| No same-category posts | Sidebar shows 8 site-wide latest posts; "All Posts" link still rendered. |
| Fewer than 8 same-category posts | Fill remaining slots with site-wide latest, de-duplicated. |
| Current post appears in fallback list | Excluded by slug/id before fill. |
| Empty media library | `MediaPickerModal` opens with empty state; picker returns no-op on cancel. |
| Mobile viewport | Grid collapses to `grid-cols-1`; sidebar renders below main content. |

## Testing Strategy

No frontend automated tests (per MVP constraint). Coverage via manual smoke test:

- Admin: open PostForm, pick cover/OG image via picker, use "Insert Image" in body, save, confirm URLs persist.
- `/posts`, `/posts/{category}`, `/{cat}/{slug}` each render a 4-column grid with sidebar on desktop and a single column on mobile.
- Sidebar shows up to 8 items; same-category fallback to latest is exercised on a category with <8 posts.
- `npx tsc --noEmit` confirms no new type errors against the existing baseline.
