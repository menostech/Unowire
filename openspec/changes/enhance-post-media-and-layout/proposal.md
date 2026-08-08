# Proposal: Enhance Post Media and Layout

## Why

The post management module (delivered by `add-post-management`) currently uses plain text inputs for cover images and OG images, provides no way to insert images into article body content from the media library, and renders the public list and detail pages in a narrow 3-column layout (1-col sidebar + 3-col main) that does not showcase articles well. This change adds media-library-backed image selection to the admin editor and redesigns the public post list and detail pages into a 4-column equal-width grid with a dedicated article recommendation sidebar.

## Goals

- **Admin cover image from media**: Replace the plain text `cover_image_url` and `og_image_url` inputs in `PostForm` with the existing `ImageFieldWithPicker` component so authors pick images from the media library (with upload support) instead of pasting URLs.
- **Admin inline image insertion**: Add an "Insert Image" button next to the Markdown content editor that opens the `MediaPickerModal`; selecting an image inserts `![alt](url)` Markdown syntax at the end of the current content (textarea append, no rich-text editor dependency).
- **Public 4-column list layout**: Redesign `/posts` and `/posts/{category-slug}` into a CSS Grid 4-equal-column layout — column 1 = category navigation sidebar, columns 2–3 = article list (left-image right-text cards), column 4 = article recommendation sidebar (8 items, thumbnail-above-title, 2-per-row grid).
- **Public 4-column detail layout**: Redesign the post detail page (`/{category-slug}/{post-slug}` via `[...slugs]` catch-all) into the same 4-column grid — column 1 = category sidebar, columns 2–3 = full article body (title, cover, Markdown content), column 4 = article recommendation sidebar.
- **Same-category recommendation**: The recommendation sidebar shows the 8 most recent published posts in the same category as the current article (excluding the current article), falling back to the 8 most recent published posts site-wide when the category has fewer than 9 published posts.

## Non-goals

- No rich-text / WYSIWYG editor — body editing stays a plain Markdown textarea with an insert-image helper.
- No new database schema changes — `cover_image_url`, `og_image_url`, and inline Markdown image syntax all use existing columns.
- No new backend endpoints — the existing `GET /api/posts` (public list) and `GET /api/posts/{category_slug}/{post_slug}` (detail) are reused; the recommendation list is fetched client/server-side via the existing list endpoint filtered by `category_slug`.
- No changes to admin list pages, category CRUD, or the catch-all route logic — only `PostForm`, `PostView`, and the public `posts` pages are touched.
- No pagination changes to the recommendation sidebar (fixed 8 items, no page control).
- No changes to other modules (cables, equipment, terminals, resources, pages).

## Scope boundaries

**Included:**
- `frontend/components/admin/form/PostForm.tsx` — cover image + OG image via `ImageFieldWithPicker`; content editor gains an "Insert Image" button wired to `MediaPickerModal`.
- `frontend/components/posts/PostView.tsx` — 4-column grid wrapper; recommendation sidebar.
- `frontend/app/(site)/posts/page.tsx` — 4-column list layout.
- `frontend/app/(site)/posts/[category-slug]/page.tsx` — 4-column category list layout.
- `frontend/app/(site)/[...slugs]/page.tsx` — detail page passes data to the 4-column `PostView`.
- A small shared recommendation component (thumbnail + title, 2-per-row, 8 items).

**Excluded:**
- Backend code, migrations, schemas, CRUD, routes.
- Admin list/edit/category pages beyond `PostForm`.
- The `PageView` component and non-post catch-all paths.
- Media library itself (uploads, folders, picker) — reused as-is.

## Key unknowns

- **Recommendation fallback threshold**: When the same category has fewer than 9 published posts (to fill 8 recommendation slots excluding the current article), the spec falls back to site-wide latest. This requires two list calls when the category is sparse — acceptable for MVP, may cache later.
- **Grid responsiveness on mobile**: 4 equal columns collapse to 1 column on small screens; the exact breakpoint follows the existing `lg:` Tailwind convention (`lg:grid-cols-4`, single column below `lg`).
- **Insert-image cursor position**: Appending `![alt](url)` to the end of the textarea is the simplest deterministic behavior; true cursor-position insertion requires refs and selection-range handling and is deferred.

## Draft acceptance scenarios

1. **Cover image from media**: Editor opens `PostForm`, clicks "Media" next to Cover Image, picks an image, the cover image URL field is filled and a preview shows.
2. **Inline image insert**: Editor clicks "Insert Image" beside the content textarea, picks a media image, `![image](url)` is appended to the Markdown content; the saved post renders the image inline on the public detail page.
3. **4-column list**: Visiting `/posts` shows 4 equal columns — category nav, article list cards (left image, right text), and a recommendation sidebar with 8 thumbnails.
4. **4-column detail**: Visiting `/{cat}/{slug}` shows the same 4-column layout with article body in columns 2–3 and recommendations in column 4.
5. **Same-category recommendation**: On a detail page, the recommendation sidebar shows only same-category articles when ≥9 exist; otherwise mixes in site-wide latest to fill 8 slots.
