# Admin: Rename "Taxonomy" to "Industries" — Design

## Goal

Rename the admin sidebar menu item from "Taxonomy" to "Industries" and reorganize the URL routes from `/admin/taxonomy/*` to `/admin/industries/*` so that the menu label, URL path, and landing content all align on a single concrete entity name — consistent with the other admin menu items (Cables, Brands, Manufacturers).

## Motivation

The current admin sidebar uses the abstract term "Taxonomy" while every other menu item is a concrete plural noun (Cables, Brands, Manufacturers). Clicking "Taxonomy" lands on the industries list page, so the label does not describe what it opens. "Industries" is the concrete entity users manage and matches the page they see. Restructuring the URLs under `/admin/industries/*` also reflects the real data hierarchy: industries contain categories, categories contain product types.

## Scope

**In scope:**
- Sidebar menu label and `href` change
- Frontend route folder move from `app/admin/(dashboard)/taxonomy/` to `app/admin/(dashboard)/industries/`
- 12 cross-navigation links inside the taxonomy pages updated to the new path
- Permanent redirects from old `/admin/taxonomy/*` URLs to new `/admin/industries/*` URLs (so existing bookmarks and deep links do not break)

**Out of scope:**
- Backend API paths (`/api/admin/industries`, `/api/admin/categories`, `/api/admin/product-types`) — unchanged
- `adminApi.ts` — unchanged
- Database schema — unchanged
- Public-facing site routes (`/cables`, `/cable/*`) — unchanged
- Admin sidebar icons — `FolderOpen` stays (still represents a directory of classifications)

## Design

### 1. Sidebar menu change

`frontend/components/admin/layout/AdminSidebar.tsx` line 18:

```tsx
// Before
{ href: '/admin/taxonomy/industries', label: 'Taxonomy', icon: FolderOpen },
// After
{ href: '/admin/industries', label: 'Industries', icon: FolderOpen },
```

### 2. Route folder restructure

Move the entire `taxonomy/` directory to `industries/`. The three sub-trees (industries, categories, product-types) move under it. The `industries/` sub-folder collapses into the parent because the parent path is already `industries`.

**Before:**
```
app/admin/(dashboard)/taxonomy/
├── industries/
│   ├── [id]/page.tsx
│   ├── new/page.tsx
│   └── page.tsx
├── categories/
│   ├── [...id]/page.tsx
│   ├── new/page.tsx
│   └── page.tsx
└── product-types/
    ├── [...id]/page.tsx
    ├── new/page.tsx
    └── page.tsx
```

**After:**
```
app/admin/(dashboard)/industries/
├── [id]/page.tsx          # was taxonomy/industries/[id]
├── new/page.tsx           # was taxonomy/industries/new
├── page.tsx               # was taxonomy/industries
├── categories/
│   ├── [...id]/page.tsx
│   ├── new/page.tsx
│   └── page.tsx
└── product-types/
    ├── [...id]/page.tsx
    ├── new/page.tsx
    └── page.tsx
```

### 3. URL mapping

| Old path | New path |
|---|---|
| `/admin/taxonomy/industries` | `/admin/industries` |
| `/admin/taxonomy/industries/new` | `/admin/industries/new` |
| `/admin/taxonomy/industries/[id]` | `/admin/industries/[id]` |
| `/admin/taxonomy/categories` | `/admin/industries/categories` |
| `/admin/taxonomy/categories/new` | `/admin/industries/categories/new` |
| `/admin/taxonomy/categories/[...id]` | `/admin/industries/categories/[...id]` |
| `/admin/taxonomy/product-types` | `/admin/industries/product-types` |
| `/admin/taxonomy/product-types/new` | `/admin/industries/product-types/new` |
| `/admin/taxonomy/product-types/[...id]` | `/admin/industries/product-types/[...id]` |

### 4. Cross-navigation link updates

12 hardcoded `/admin/taxonomy/...` links inside the moved pages must be rewritten to the new paths. The mapping is mechanical string replacement:

- `/admin/taxonomy/industries` → `/admin/industries`
- `/admin/taxonomy/industries/new` → `/admin/industries/new`
- `/admin/taxonomy/industries/${id}` → `/admin/industries/${id}`
- `/admin/taxonomy/categories` → `/admin/industries/categories`
- `/admin/taxonomy/categories/new` → `/admin/industries/categories/new`
- `/admin/taxonomy/categories/${id}` → `/admin/industries/categories/${id}`
- `/admin/taxonomy/product-types` → `/admin/industries/product-types`
- `/admin/taxonomy/product-types/new` → `/admin/industries/product-types/new`
- `/admin/taxonomy/product-types/${id}` → `/admin/industries/product-types/${id}`

Files affected (after the move):
- `industries/page.tsx` (3 links: new, edit, categories filter)
- `industries/[id]/page.tsx` (1 link: back to industries)
- `industries/new/page.tsx` (no links — only form)
- `industries/categories/page.tsx` (3 links: edit, product-types filter, new)
- `industries/categories/[...id]/page.tsx` (2 links: back to industries, categories filter)
- `industries/product-types/page.tsx` (1 link: edit)
- `industries/product-types/[...id]/page.tsx` (3 links: back to industries, categories filter, product-types filter)

### 5. Redirects for old paths

Add permanent (308) redirects in `frontend/next.config.js` so that any bookmarked or cached `/admin/taxonomy/*` URL redirects to its new location. Next.js `redirects()` runs at the edge before route matching, so these work for all HTTP methods.

The current `next.config.js` has no `redirects()` function — add one:

```js
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  async redirects() {
    return [
      { source: '/admin/taxonomy/industries', destination: '/admin/industries', permanent: true },
      { source: '/admin/taxonomy/industries/:path*', destination: '/admin/industries/:path*', permanent: true },
      { source: '/admin/taxonomy/categories', destination: '/admin/industries/categories', permanent: true },
      { source: '/admin/taxonomy/categories/:path*', destination: '/admin/industries/categories/:path*', permanent: true },
      { source: '/admin/taxonomy/product-types', destination: '/admin/industries/product-types', permanent: true },
      { source: '/admin/taxonomy/product-types/:path*', destination: '/admin/industries/product-types/:path*', permanent: true },
    ];
  },
};

module.exports = nextConfig;
```

Using `permanent: true` (HTTP 308) preserves the method and is appropriate for a stable rename — search engines and browsers will cache the redirect.

### 6. What does NOT change

- Backend API routes (`/api/admin/industries`, `/api/admin/categories`, `/api/admin/product-types`) — unchanged
- `frontend/lib/adminApi.ts` — unchanged (it talks to the backend, not to Next.js routes)
- Database schema, models, migrations — unchanged
- Public site routes (`/cables`, `/cable/*`, `/categories/*`) — unchanged
- Admin sidebar icon (`FolderOpen`) — unchanged
- Admin auth flow, JWT, middleware — unchanged

## Testing

After implementation:

1. Sidebar click "Industries" → lands on `/admin/industries` showing the industries list (HTTP 200)
2. Create new industry → `/admin/industries/new` works, form submits, redirects back to list
3. Edit existing industry → `/admin/industries/consumer_electronics` works (no `imageUrl is not defined` error)
4. Cross-navigation: from industry row, click "Categories" → lands on `/admin/industries/categories?industry_id=...`
5. Cross-navigation: from category row, click "Product Types" → lands on `/admin/industries/product-types?category_id=...`
6. Old URL redirect: visit `/admin/taxonomy/industries` → 308 redirect to `/admin/industries`
7. Old URL redirect: visit `/admin/taxonomy/categories` → 308 redirect to `/admin/industries/categories`
8. Other admin pages (Cables, Brands, Manufacturers, Media) unaffected
