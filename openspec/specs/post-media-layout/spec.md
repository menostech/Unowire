# post-media-layout Specification

## Purpose
TBD - created by archiving change enhance-post-media-and-layout. Update Purpose after archive.
## Requirements
### Requirement: Cover image and OG image selected from media library

The admin `PostForm` SHALL use the existing `ImageFieldWithPicker` component for the `cover_image_url` and `og_image_url` fields instead of a plain text input, so authors pick images from the media library (with upload support) rather than pasting raw URLs.

#### Scenario: Editor picks a cover image from media
- **GIVEN** the editor is on the post create or edit page
- **WHEN** they click the "Media" button next to the Cover Image field
- **THEN** the `MediaPickerModal` opens showing folders and the media grid
- **AND** when they select an image, the Cover Image URL field is populated with the image path and a preview thumbnail is shown

#### Scenario: Editor picks an OG image from media
- **GIVEN** the editor is on the post create or edit page
- **WHEN** they click the "Media" button next to the OG Image URL field in the SEO Settings section
- **THEN** the `MediaPickerModal` opens and selecting an image fills the OG Image URL field

#### Scenario: Existing URL preserved on edit
- **GIVEN** a post exists with a `cover_image_url` value
- **WHEN** the editor opens the edit form
- **THEN** the `ImageFieldWithPicker` shows the existing URL and its preview thumbnail

### Requirement: Inline image insertion into Markdown content

The admin `PostForm` SHALL provide an "Insert Image" button beside the Content (Markdown) textarea that opens the `MediaPickerModal`; selecting an image appends `![image](url)` Markdown syntax to the end of the content.

#### Scenario: Insert an inline image
- **GIVEN** the editor has written some Markdown content in the Content textarea
- **WHEN** they click the "Insert Image" button
- **THEN** the `MediaPickerModal` opens
- **AND** when they select an image, `\n\n![image](url)\n` is appended to the content state
- **AND** the textarea reflects the new Markdown

#### Scenario: Inserted image renders on the public detail page
- **GIVEN** a published post whose content contains `![image](url)` Markdown
- **WHEN** a visitor opens the post detail page
- **THEN** the inline image is rendered by `ReactMarkdown` within the article body

### Requirement: 4-column equal-width grid on public post list pages

The public pages `/posts` and `/posts/{category-slug}` SHALL render a 4-column equal-width CSS grid (`lg:grid-cols-4`) with: column 1 = category navigation sidebar, columns 2–3 (`lg:col-span-2`) = article list cards (left-image right-text), column 4 = recommendation sidebar.

#### Scenario: All-posts list shows 4 columns
- **GIVEN** published posts exist
- **WHEN** a visitor opens `/posts`
- **THEN** the page renders a 4-column grid on large screens
- **AND** column 1 shows the category navigation with "All Posts" active
- **AND** columns 2–3 show article cards each with cover image on the left and title/excerpt/meta on the right
- **AND** column 4 shows up to 8 recommended posts in a 2-per-row thumbnail-above-title grid

#### Scenario: Category-filtered list shows 4 columns
- **GIVEN** a category "news" with published posts exists
- **WHEN** a visitor opens `/posts/news`
- **THEN** the same 4-column grid renders
- **AND** the "news" category is highlighted in column 1
- **AND** columns 2–3 list only posts in the "news" category
- **AND** column 4 shows up to 8 recommended posts

#### Scenario: Mobile collapses to single column
- **GIVEN** a visitor on a small viewport (below `lg`)
- **WHEN** they open `/posts`
- **THEN** the grid collapses to a single stacked column (category nav, then list, then recommendations)

### Requirement: 4-column equal-width grid on public post detail page

The public post detail page (`/{category-slug}/{post-slug}`) SHALL render the same 4-column grid: column 1 = category sidebar, columns 2–3 = article body (title, cover image, Markdown content), column 4 = recommendation sidebar.

#### Scenario: Detail page shows 4 columns
- **GIVEN** a published post exists at `/news/hello-world`
- **WHEN** a visitor opens that URL
- **THEN** the page renders a 4-column grid on large screens
- **AND** column 1 shows the category navigation with "news" highlighted
- **AND** columns 2–3 show the article title, cover image, and rendered Markdown body
- **AND** column 4 shows up to 8 recommended posts

### Requirement: Same-category recommendation with site-wide fallback

The recommendation sidebar SHALL display 8 published posts, preferring the same category as the current context (list category or detail article's category), falling back to site-wide latest when the same category has fewer than 8 eligible posts.

#### Scenario: Enough same-category posts
- **GIVEN** the current article's category has 10 published posts (9 others besides the current)
- **WHEN** the recommendation sidebar renders on the detail page
- **THEN** it shows 8 same-category posts (excluding the current article)

#### Scenario: Sparse same-category with fallback
- **GIVEN** the current article's category has only 3 other published posts
- **WHEN** the recommendation sidebar renders
- **THEN** it shows the 3 same-category posts plus 5 site-wide latest posts (excluding duplicates and the current article) to fill 8 slots

#### Scenario: List page recommendation
- **GIVEN** a visitor is on `/posts` (no current article)
- **WHEN** the recommendation sidebar renders
- **THEN** it shows 8 site-wide latest published posts

#### Scenario: Recommendation card layout
- **GIVEN** the recommendation sidebar renders with 8 posts
- **WHEN** displayed
- **THEN** cards are arranged 2 per row (4 rows)
- **AND** each card shows a thumbnail image above the post title
- **AND** each card links to the post's detail URL `/{category-slug}/{post-slug}`

