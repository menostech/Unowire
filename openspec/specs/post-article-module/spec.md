# post-article-module Specification

## Purpose
TBD - created by archiving change add-post-management. Update Purpose after archive.
## Requirements
### Requirement: Post category management
The system SHALL provide a flat, single-level category system for organizing posts. Categories SHALL have a globally unique `slug` (used in URLs), a `label`, optional `description`, and `sort_order`. Category deletion SHALL be rejected when posts are assigned to it. Categories SHALL NOT support parent-child hierarchy (single-level only).

#### Scenario: Admin creates a category
- **WHEN** admin submits a new category with a unique `slug` and `label`
- **THEN** the system creates the category and returns `201` with the created category payload

#### Scenario: Admin rejects duplicate slug
- **WHEN** admin submits a category with a `slug` that already exists
- **THEN** the system rejects with `409` and message "Slug already exists"

#### Scenario: Admin rejects deleting a category with posts
- **WHEN** admin attempts to delete a category that has one or more posts assigned
- **THEN** the system rejects with `409` and message "Category is in use"

#### Scenario: Public fetches all categories
- **WHEN** an anonymous visitor requests the category list endpoint
- **THEN** the system returns all categories ordered by `sort_order`

### Requirement: Post data model with draft/publish workflow
The system SHALL store posts in a `posts` table with the following fields: `id` (string PK), `category_id` (FK → `post_categories.id`, `ondelete=RESTRICT`, NOT NULL), `title`, `slug` (unique within category — `UNIQUE(category_id, slug)` constraint), `content` (Text, Markdown), `excerpt` (Text, nullable — for list display and SEO), `cover_image_url` (String, nullable), `status` (String, default `draft`, values: `draft`|`published`), `is_visible` (Boolean, default true), `sort_order` (Integer, default 0), `published_at` (DateTime, nullable), `meta_title` (String, nullable), `meta_description` (String, nullable), `og_image_url` (String, nullable), `created_at`, `updated_at`. Posts SHALL NOT have `scope_type` or `scope_id` fields (admin-only, no portal scope).

#### Scenario: Admin creates a draft post
- **WHEN** admin creates a post with `status = draft`
- **THEN** the system stores the post with `published_at = NULL` and the post is not visible on public endpoints

#### Scenario: Admin publishes a post
- **WHEN** admin updates a post's `status` to `published`
- **THEN** the system sets `published_at` to the current timestamp (if not already set) and the post becomes visible on public endpoints

#### Scenario: Slug unique within category
- **WHEN** admin creates a post with a `(category_id, slug)` pair that already exists
- **THEN** the system rejects with `409` and message "Slug already exists in this category"

#### Scenario: Same slug allowed in different categories
- **WHEN** admin creates a post with slug `overview` in category `news`, and another post with slug `overview` in category `tutorials`
- **THEN** both posts are created successfully (slug is unique per category, not globally)

### Requirement: Public post browsing with SEO-friendly URLs
The system SHALL provide public endpoints for listing published posts (paginated, with optional `category_slug` and `q` search filters), and fetching a single post by the composite key `(category_slug, post_slug)`. Public endpoints SHALL NOT require authentication. Only posts with `status = published` and `is_visible = true` SHALL be returned.

#### Scenario: Anonymous visitor lists published posts
- **WHEN** an anonymous visitor requests `GET /api/posts?page=1&page_size=20`
- **THEN** the system returns a paginated list of published, visible posts ordered by `published_at` descending

#### Scenario: Anonymous visitor filters by category
- **WHEN** an anonymous visitor requests `GET /api/posts?category_slug=news`
- **THEN** the system returns only published posts in the `news` category

#### Scenario: Anonymous visitor searches by keyword
- **WHEN** an anonymous visitor requests `GET /api/posts?q=cable+installation`
- **THEN** the system returns published posts whose `title` or `excerpt` matches the keyword case-insensitively

#### Scenario: Anonymous visitor fetches a post by category and slug
- **WHEN** an anonymous visitor requests `GET /api/posts/{category_slug}/{post_slug}`
- **THEN** the system returns the published post matching both the category slug and post slug

#### Scenario: Fetch unpublished post returns 404
- **WHEN** an anonymous visitor requests a post that has `status = draft`
- **THEN** the system returns `404` (draft posts are invisible to public)

#### Scenario: Fetch non-existent category-slug combination returns 404
- **WHEN** an anonymous visitor requests `GET /api/posts/nonexistent-cat/nonexistent-post`
- **THEN** the system returns `404`

### Requirement: Admin post and category management
The system SHALL provide admin CRUD endpoints for posts and categories protected by `require_operator`. Post endpoints SHALL be gated by the `post_list` RBAC module. Category endpoints SHALL be gated by the `post_cats` RBAC module.

#### Scenario: Admin lists all posts including drafts
- **WHEN** an admin user with `post_list` permission requests `GET /api/posts/admin?page=1`
- **THEN** the system returns all posts regardless of status (including drafts)

#### Scenario: Admin creates a post
- **WHEN** an admin user submits a new post with `title`, `slug`, `category_id`, `content`, and optional fields
- **THEN** the system creates the post and returns `201`

#### Scenario: Admin updates a post
- **WHEN** an admin user updates a post's title or content
- **THEN** the system updates the post and returns the updated payload

#### Scenario: Admin deletes a post
- **WHEN** an admin user deletes a post
- **THEN** the system deletes the database record and returns `204`

#### Scenario: Non-permitted admin cannot access posts
- **WHEN** an admin user without `post_list` permission attempts to access `/api/posts/admin`
- **THEN** the system rejects with `403`

### Requirement: Admin module registration and menu
The system SHALL register two new admin modules in `app/core/modules.py`: `post_cats` (global, not scope-aware) and `post_list` (not scope-aware — admin-only, no portal). The admin menu SHALL include a "Posts" group with child pages for Posts and Categories. The migration SHALL seed `role_permissions` for the `admin` role with both new module IDs.

#### Scenario: Admin role has post module permissions after migration
- **WHEN** the database migration runs
- **THEN** the `admin` role has `role_permissions` entries for `post_cats` and `post_list`

#### Scenario: Admin sees the Posts menu group
- **WHEN** an admin user loads the admin sidebar
- **THEN** the sidebar shows a "Posts" group with "Posts" and "Categories" child links

### Requirement: Public posts page at /posts
The system SHALL provide a public page at `/posts` that lists all published posts with pagination and search. A category-filtered list page at `/posts/{category-slug}` SHALL show posts in the specified category. An article detail page at `/{category-slug}/{post-slug}` SHALL render the post content as Markdown with SEO metadata. Pages SHALL be accessible without authentication.

#### Scenario: Visitor browses the posts list
- **WHEN** a visitor navigates to `/posts`
- **THEN** the page displays a paginated list of published posts with title, excerpt, cover image, and publish date

#### Scenario: Visitor filters by category
- **WHEN** a visitor navigates to `/posts/news`
- **THEN** the page displays only posts in the `news` category

#### Scenario: Visitor opens an article detail page
- **WHEN** a visitor navigates to `/{category-slug}/{post-slug}`
- **THEN** the page renders the post title, cover image, Markdown content (via ReactMarkdown), excerpt, and SEO metadata

#### Scenario: Visitor opens a non-existent article
- **WHEN** a visitor navigates to a `/{category-slug}/{post-slug}` that does not exist or is unpublished
- **THEN** the page returns `404`

#### Scenario: Article detail page has SEO metadata
- **WHEN** a visitor opens an article detail page
- **THEN** the page's `<title>` and meta tags use the post's `meta_title` (or title fallback) and `meta_description` (or excerpt fallback)

### Requirement: Admin posts page at /admin/posts
The system SHALL provide admin pages at `/admin/posts` (list, new, edit) and `/admin/posts/categories` (category CRUD). The list page SHALL support filtering by category, keyword, and status. The new/edit form SHALL support category selection, title, slug, Markdown content textarea, excerpt, cover image URL, SEO fields, and status toggle.

#### Scenario: Admin opens the posts list
- **WHEN** an admin navigates to `/admin/posts`
- **THEN** the page shows a filterable, paginated table of posts with columns for title, category, status, and publish date

#### Scenario: Admin creates a new post
- **WHEN** an admin navigates to `/admin/posts/new` and submits the form
- **THEN** the system creates the post and redirects to the edit page

#### Scenario: Admin edits a post
- **WHEN** an admin navigates to `/admin/posts/{id}` and updates the content
- **THEN** the system updates the post without requiring all fields to be re-entered

#### Scenario: Admin manages categories
- **WHEN** an admin navigates to `/admin/posts/categories`
- **THEN** the page shows the category list with create/edit/delete actions

