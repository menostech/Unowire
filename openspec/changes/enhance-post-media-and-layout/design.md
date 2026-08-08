# Design: Enhance Post Media and Layout

## D1: Cover image and OG image via existing `ImageFieldWithPicker`

**Decision:** Replace the plain `<input type="text">` for `cover_image_url` and `og_image_url` in `PostForm` with the existing `ImageFieldWithPicker` component from `frontend/components/admin/form/ImageFieldWithPicker.tsx`.

**Rationale:** `ImageFieldWithPicker` already wraps a text input + "Media" button + `MediaPickerModal` (with folder tree, upload, and grid selection) and is used across Resource/Category/Terminal/Equipment forms. It exposes a simple `{ label, value, onChange }` API that maps 1:1 to the existing `coverImageUrl`/`ogImageUrl` state in `PostForm`. Zero new dependencies, zero backend changes.

**Consequence:** The form's `cover_image_url`/`og_image_url` state continues to hold a URL string (possibly `/media/...` path); the submit payload is unchanged.

## D2: Inline image insertion — textarea append via `MediaPickerModal`

**Decision:** Add an "Insert Image" button beside the Content (Markdown) `<textarea>` label. Clicking it opens `MediaPickerModal` directly (state-managed `pickerOpen` boolean in `PostForm`). On select, append `\n\n![image](url)\n` to the `content` state via `setContent(content + '\n\n![image](' + url + ')\n')`.

**Rationale:**
- Keeps the editor a plain Markdown textarea (no WYSIWYG dependency, consistent with `PageForm`).
- `MediaPickerModal` is already importable and returns a `urlPath` string via `onSelect`.
- Appending (not cursor-position insertion) is deterministic and avoids fragile `textarea.selectionStart`/`setSelectionRange` ref handling. For MVP this is acceptable; the user can move the image within the textarea afterwards.

**Consequence:** The `PostForm` component gains one extra `useState` (`pickerOpen`) and imports `MediaPickerModal`. No new backend field — inline images are standard Markdown `![](url)` already rendered by `ReactMarkdown` in `PostView`.

## D3: Recommendation sidebar — same-category latest with site-wide fallback

**Decision:** The recommendation sidebar shows **8** published posts. Logic (server-side in the public page components):
1. Fetch same-category latest published posts (excluding the current article on detail pages) via `api.posts.all({ category_slug, page_size: 9 })` — request 9 so after excluding the current article we still have ≥8.
2. If the returned same-category items (after excluding current) are fewer than 8, fetch site-wide latest published posts via `api.posts.all({ page_size: 8 })` and append items not already present until 8 slots are filled.
3. On list pages (no current article), skip the exclusion and just fetch same-context (or site-wide for `/posts`) latest published, 8 items.

**Rationale:**
- Reuses the existing `GET /api/posts` endpoint with `category_slug` and `page_size` query params — no new backend route.
- "Same category" is the most relevant signal for an article site without a tagging/taxonomy system; the site-wide fallback prevents an empty/sparse sidebar.
- 8 items at 2-per-row = 4 rows, matching the user's "8 篇" requirement.

**Consequence:** Detail and list pages make 1–2 extra `api.posts.all` calls. For MVP this is acceptable (pages are already `force-dynamic`); caching is a non-goal.

## D4: 4-column equal-width grid via `lg:grid-cols-4`

**Decision:** Both list and detail pages use `grid grid-cols-1 lg:grid-cols-4 gap-6` (4 equal columns at `lg` and above; single column stacked on mobile). Column assignments:
- Column 1 (`lg:col-span-1`): category navigation sidebar (shared component).
- Columns 2–3 (`lg:col-span-2`): main content — article list cards (list pages) or article body (detail page).
- Column 4 (`lg:col-span-1`): recommendation sidebar (shared component).

**Rationale:**
- `lg:grid-cols-4` with span `1 / 2 / 1` produces the user-requested "4 equal columns" visual while giving the main content area (columns 2–3 merged) enough width for readable article cards and body text.
- Strict 25/25/25/25 with 4 separate columns would make the article list/body too narrow; merging columns 2–3 into a 2-span region is the standard interpretation of "4 栏，第2,3栏文章列表/正文".
- `grid-cols-1` below `lg` keeps mobile readable.

**Consequence:** The existing `lg:grid-cols-4` with `lg:col-span-1` + `lg:col-span-3` split in `posts/page.tsx` becomes `lg:col-span-1` + `lg:col-span-2` + `lg:col-span-1`.

## D5: Shared sidebar components

**Decision:** Extract two small presentational components to avoid duplicating sidebar markup across list and detail pages:
- `frontend/components/posts/CategorySidebar.tsx` — renders the category nav (All Posts link + per-category links, active state). Props: `{ categories: BackendPostCategory[]; activeSlug?: string }`.
- `frontend/components/posts/RecommendationSidebar.tsx` — renders up to 8 recommended posts as a 2-per-row grid of thumbnail-above-title cards. Props: `{ posts: BackendPost[] }`.

**Rationale:** Both list (`/posts`, `/posts/{cat}`) and detail (`/{cat}/{slug}`) pages need identical sidebars; extraction keeps layout consistent and the page files focused on data loading.

**Consequence:** Two new files; `PostView` and the list pages import them.

## D6: List card layout — left image, right text

**Decision:** Each article card in the list uses `flex` (horizontal): cover image on the left (`w-24 h-24 object-cover` when present), title+excerpt+meta on the right (`flex-1`). Matches the existing card in `posts/page.tsx` but is retained (not redesigned) since the user specified "左图右文".

**Rationale:** The current card already does left-image-right-text; only the outer grid container changes from 1+3 to 1+2+1. Keeping the card design stable reduces churn.

## D7: `PostView` becomes a 4-column layout wrapper

**Decision:** `PostView` currently renders a standalone `<article>` with breadcrumbs + title + cover + Markdown body. It will be restructured to render the full 4-column grid: `<CategorySidebar />` + `<article>...</article>` (columns 2–3) + `<RecommendationSidebar />`. The detail page (`[...slugs]/page.tsx`) passes `{ post, categories, recommendations }` to `PostView`.

**Rationale:** The user explicitly requires the detail page to share the 4-column layout with the list page. Encapsulating the full layout inside `PostView` keeps the catch-all page thin (data loading only) and `PostView` the single source of truth for detail rendering.

**Consequence:** `PostView` props change from `{ post: BackendPost }` to `{ post: BackendPost; categories: BackendPostCategory[]; recommendations: BackendPost[] }`. The catch-all page fetches categories + recommendations and passes them down.
