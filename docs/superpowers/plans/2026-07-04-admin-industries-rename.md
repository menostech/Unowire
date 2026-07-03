# Admin: Rename "Taxonomy" to "Industries" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the admin sidebar menu item from "Taxonomy" to "Industries", reorganize the URL routes from `/admin/taxonomy/*` to `/admin/industries/*`, and add 308 redirects so existing bookmarks do not break.

**Architecture:** Pure frontend change. Move the `app/admin/(dashboard)/taxonomy/` folder to `app/admin/(dashboard)/industries/` (collapsing the nested `industries/` sub-folder into the parent), update all hardcoded `/admin/taxonomy/...` links across 13 files, and add `redirects()` to `next.config.js` for old URL compatibility. Backend API paths (`/api/admin/industries`, `/api/admin/categories`, `/api/admin/product-types`), `adminApi.ts`, database schema, and public site routes are untouched.

**Tech Stack:** Next.js 15 (App Router, route groups, `redirects()` config), TypeScript, Tailwind CSS, Docker Compose for local dev (frontend at http://localhost:8080).

**Reference spec:** `docs/superpowers/specs/2026-07-04-admin-industries-rename-design.md`

**Project constraints (from project memory):**
- Frontend MVP does not require automated tests — verification is manual smoke testing
- All code, comments, and commit messages in English

---

## File Structure

### Files to move (folder restructure)

| Old path | New path |
|---|---|
| `frontend/app/admin/(dashboard)/taxonomy/industries/page.tsx` | `frontend/app/admin/(dashboard)/industries/page.tsx` |
| `frontend/app/admin/(dashboard)/taxonomy/industries/new/page.tsx` | `frontend/app/admin/(dashboard)/industries/new/page.tsx` |
| `frontend/app/admin/(dashboard)/taxonomy/industries/[id]/page.tsx` | `frontend/app/admin/(dashboard)/industries/[id]/page.tsx` |
| `frontend/app/admin/(dashboard)/taxonomy/categories/page.tsx` | `frontend/app/admin/(dashboard)/industries/categories/page.tsx` |
| `frontend/app/admin/(dashboard)/taxonomy/categories/new/page.tsx` | `frontend/app/admin/(dashboard)/industries/categories/new/page.tsx` |
| `frontend/app/admin/(dashboard)/taxonomy/categories/[...id]/page.tsx` | `frontend/app/admin/(dashboard)/industries/categories/[...id]/page.tsx` |
| `frontend/app/admin/(dashboard)/taxonomy/product-types/page.tsx` | `frontend/app/admin/(dashboard)/industries/product-types/page.tsx` |
| `frontend/app/admin/(dashboard)/taxonomy/product-types/new/page.tsx` | `frontend/app/admin/(dashboard)/industries/product-types/new/page.tsx` |
| `frontend/app/admin/(dashboard)/taxonomy/product-types/[...id]/page.tsx` | `frontend/app/admin/(dashboard)/industries/product-types/[...id]/page.tsx` |

### Files to modify (link updates)

1. `frontend/components/admin/layout/AdminSidebar.tsx` — sidebar label + href
2. `frontend/next.config.js` — add `redirects()` function
3. `frontend/app/admin/(dashboard)/industries/page.tsx` — 3 links (after move)
4. `frontend/app/admin/(dashboard)/industries/[id]/page.tsx` — 1 link (after move)
5. `frontend/app/admin/(dashboard)/industries/categories/page.tsx` — 3 links (after move)
6. `frontend/app/admin/(dashboard)/industries/categories/[...id]/page.tsx` — 2 links (after move)
7. `frontend/app/admin/(dashboard)/industries/product-types/page.tsx` — 1 link (after move)
8. `frontend/app/admin/(dashboard)/industries/product-types/[...id]/page.tsx` — 3 links (after move)
9. `frontend/components/admin/form/IndustryForm.tsx` — 3 links (spec gap, added)
10. `frontend/components/admin/form/CategoryForm.tsx` — 3 links (spec gap, added)
11. `frontend/components/admin/form/ProductTypeForm.tsx` — 3 links (spec gap, added)
12. `frontend/components/admin/list/IndustryFilterSelect.tsx` — 2 links (spec gap, added)
13. `frontend/components/admin/list/CategoryFilterSelect.tsx` — 2 links (spec gap, added)

### Files NOT changed

- `frontend/lib/adminApi.ts` — talks to backend, not Next.js routes
- Backend API routes (`/api/admin/industries`, `/api/admin/categories`, `/api/admin/product-types`)
- Database schema, models, migrations
- Public site routes (`/cables`, `/cable/*`, `/categories/*`)
- Admin sidebar icon (`FolderOpen` stays)
- Admin auth flow, JWT, middleware

---

## Task 1: Update AdminSidebar menu label and href

**Files:**
- Modify: `frontend/components/admin/layout/AdminSidebar.tsx:18`

**Why first:** Foundational change. Once the sidebar points to `/admin/industries`, the new route must exist before users click it. We'll create the new route in Task 2 before verifying this task.

- [ ] **Step 1: Update the sidebar entry**

In `frontend/components/admin/layout/AdminSidebar.tsx`, change line 18 from:

```tsx
  { href: '/admin/taxonomy/industries', label: 'Taxonomy', icon: FolderOpen },
```

to:

```tsx
  { href: '/admin/industries', label: 'Industries', icon: FolderOpen },
```

Use the Edit tool with:
- `old_string`: `  { href: '/admin/taxonomy/industries', label: 'Taxonomy', icon: FolderOpen },`
- `new_string`: `  { href: '/admin/industries', label: 'Industries', icon: FolderOpen },`

- [ ] **Step 2: Do NOT commit yet**

The sidebar now points to `/admin/industries` which does not exist yet. We'll commit after Task 2 creates the route. Hold the commit.

---

## Task 2: Move route folders from `taxonomy/` to `industries/`

**Files:**
- Move: 9 `page.tsx` files (see File Structure table above)

**Why now:** Creates the new `/admin/industries/*` routes that Task 1's sidebar link points to. Uses `git mv` to preserve file history. The move is mechanical — no content changes in this task.

**Important:** On Windows, use `git mv` (not PowerShell `Move-Item`) so git tracks the rename. The folder `app/admin/(dashboard)/` has parentheses — quote the path.

- [ ] **Step 1: Create the new `industries/` parent folder and move the three sub-trees**

Run from the repo root (`d:\projects\unowire`):

```bash
git mv "frontend/app/admin/(dashboard)/taxonomy/industries" "frontend/app/admin/(dashboard)/industries"
git mv "frontend/app/admin/(dashboard)/taxonomy/categories" "frontend/app/admin/(dashboard)/industries/categories"
git mv "frontend/app/admin/(dashboard)/taxonomy/product-types" "frontend/app/admin/(dashboard)/industries/product-types"
```

**Note:** The first command renames `taxonomy/industries/` → `industries/` (collapsing the nested folder into the parent). The next two move `categories/` and `product-types/` under the new `industries/`.

- [ ] **Step 2: Verify the old `taxonomy/` folder is gone**

Run:

```bash
git status
```

Expected: 9 `renamed:` lines (old `taxonomy/...` → new `industries/...`), and the `taxonomy/` folder no longer exists on disk. If PowerShell complains the source path does not exist for any command, that command already succeeded — re-run only the failed ones.

- [ ] **Step 3: Verify the new folder structure on disk**

The folder layout must match:

```
frontend/app/admin/(dashboard)/industries/
├── [id]/page.tsx
├── new/page.tsx
├── page.tsx
├── categories/
│   ├── [...id]/page.tsx
│   ├── new/page.tsx
│   └── page.tsx
└── product-types/
    ├── [...id]/page.tsx
    ├── new/page.tsx
    └── page.tsx
```

Use the LS tool on `frontend/app/admin/(dashboard)/industries` to confirm. There must be NO `frontend/app/admin/(dashboard)/taxonomy/` directory remaining.

- [ ] **Step 4: Commit the move**

```bash
git add "frontend/app/admin/(dashboard)/"
git commit -m "refactor(frontend): move taxonomy routes to industries path"
```

---

## Task 3: Add 308 redirects in `next.config.js`

**Files:**
- Modify: `frontend/next.config.js`

**Why now:** Adds backwards-compatibility for any bookmarked `/admin/taxonomy/*` URLs. Independent of the link updates in Tasks 4–6, so it can land before or after them — placing it here means the redirect safety net is in place before we touch any links.

- [ ] **Step 1: Replace the entire `next.config.js` content**

Current content of `frontend/next.config.js`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

module.exports = nextConfig;
```

Replace it with:

```js
/** @type {import('next').NextConfig} */
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

Use the Write tool (the whole file is being replaced). The `permanent: true` flag emits HTTP 308, which preserves the request method and is cached by browsers/search engines — appropriate for a stable rename.

- [ ] **Step 2: Commit**

```bash
git add frontend/next.config.js
git commit -m "feat(frontend): add 308 redirects from /admin/taxonomy to /admin/industries"
```

---

## Task 4: Update links in `industries/page.tsx` (industries list)

**Files:**
- Modify: `frontend/app/admin/(dashboard)/industries/page.tsx`

**Links to update (3 total):**
- Line 12: `href="/admin/taxonomy/industries/new"` → `href="/admin/industries/new"`
- Line 47: `href={`/admin/taxonomy/industries/${encodeURIComponent(ind.id)}`}` → `href={`/admin/industries/${encodeURIComponent(ind.id)}`}`
- Line 53: `href={`/admin/taxonomy/categories?industry_id=${encodeURIComponent(ind.id)}`}` → `href={`/admin/industries/categories?industry_id=${encodeURIComponent(ind.id)}`}`

- [ ] **Step 1: Update the "New" button link**

Edit `frontend/app/admin/(dashboard)/industries/page.tsx`:

- `old_string`:
```tsx
          href="/admin/taxonomy/industries/new"
```
- `new_string`:
```tsx
          href="/admin/industries/new"
```

- [ ] **Step 2: Update the "Edit" row link**

- `old_string`:
```tsx
                    href={`/admin/taxonomy/industries/${encodeURIComponent(ind.id)}`}
```
- `new_string`:
```tsx
                    href={`/admin/industries/${encodeURIComponent(ind.id)}`}
```

- [ ] **Step 3: Update the "View Categories" row link**

- `old_string`:
```tsx
                    href={`/admin/taxonomy/categories?industry_id=${encodeURIComponent(ind.id)}`}
```
- `new_string`:
```tsx
                    href={`/admin/industries/categories?industry_id=${encodeURIComponent(ind.id)}`}
```

- [ ] **Step 4: Verify no `/admin/taxonomy` references remain**

Use Grep on `frontend/app/admin/(dashboard)/industries/page.tsx` with pattern `/admin/taxonomy`. Expected: no matches.

- [ ] **Step 5: Do NOT commit yet**

We'll batch-commit all link updates at the end of Task 9.

---

## Task 5: Update links in `industries/[id]/page.tsx` (edit industry)

**Files:**
- Modify: `frontend/app/admin/(dashboard)/industries/[id]/page.tsx`

**Links to update (1 total):**
- Line 18: `href="/admin/taxonomy/industries"` → `href="/admin/industries"`

- [ ] **Step 1: Update the breadcrumb link**

Edit `frontend/app/admin/(dashboard)/industries/[id]/page.tsx`:

- `old_string`:
```tsx
        <Link href="/admin/taxonomy/industries" className="hover:underline">
```
- `new_string`:
```tsx
        <Link href="/admin/industries" className="hover:underline">
```

- [ ] **Step 2: Verify with Grep**

Pattern `/admin/taxonomy` on the file. Expected: no matches.

- [ ] **Step 3: Do NOT commit yet**

---

## Task 6: Update links in `industries/categories/page.tsx` (categories list)

**Files:**
- Modify: `frontend/app/admin/(dashboard)/industries/categories/page.tsx`

**Links to update (3 total):**
- Lines 33–34: ternary with `/admin/taxonomy/categories/new?industry_id=...` and `/admin/taxonomy/categories/new`
- Line 83: `href={`/admin/taxonomy/categories/${encodeURIComponent(cat.id)}`}`
- Line 89: `href={`/admin/taxonomy/product-types?category_id=${encodeURIComponent(cat.id)}`}`

- [ ] **Step 1: Update the "New" button ternary**

Edit `frontend/app/admin/(dashboard)/industries/categories/page.tsx`:

- `old_string`:
```tsx
          href={industryFilter
            ? `/admin/taxonomy/categories/new?industry_id=${encodeURIComponent(industryFilter)}`
            : '/admin/taxonomy/categories/new'}
```
- `new_string`:
```tsx
          href={industryFilter
            ? `/admin/industries/categories/new?industry_id=${encodeURIComponent(industryFilter)}`
            : '/admin/industries/categories/new'}
```

- [ ] **Step 2: Update the "Edit" row link**

- `old_string`:
```tsx
                      href={`/admin/taxonomy/categories/${encodeURIComponent(cat.id)}`}
```
- `new_string`:
```tsx
                      href={`/admin/industries/categories/${encodeURIComponent(cat.id)}`}
```

- [ ] **Step 3: Update the "View Product Types" row link**

- `old_string`:
```tsx
                      href={`/admin/taxonomy/product-types?category_id=${encodeURIComponent(cat.id)}`}
```
- `new_string`:
```tsx
                      href={`/admin/industries/product-types?category_id=${encodeURIComponent(cat.id)}`}
```

- [ ] **Step 4: Verify with Grep**

Pattern `/admin/taxonomy` on the file. Expected: no matches.

- [ ] **Step 5: Do NOT commit yet**

---

## Task 7: Update links in `industries/categories/[...id]/page.tsx` (edit category)

**Files:**
- Modify: `frontend/app/admin/(dashboard)/industries/categories/[...id]/page.tsx`

**Links to update (2 total):**
- Line 24: `href="/admin/taxonomy/industries"` → `href="/admin/industries"`
- Line 30: `href={`/admin/taxonomy/categories?industry_id=${encodeURIComponent(industry.id)}`}` → `href={`/admin/industries/categories?industry_id=${encodeURIComponent(industry.id)}`}`

- [ ] **Step 1: Update the "Industries" breadcrumb link**

Edit `frontend/app/admin/(dashboard)/industries/categories/[...id]/page.tsx`:

- `old_string`:
```tsx
        <Link href="/admin/taxonomy/industries" className="hover:underline">
```
- `new_string`:
```tsx
        <Link href="/admin/industries" className="hover:underline">
```

- [ ] **Step 2: Update the industry breadcrumb link**

- `old_string`:
```tsx
            href={`/admin/taxonomy/categories?industry_id=${encodeURIComponent(industry.id)}`}
```
- `new_string`:
```tsx
            href={`/admin/industries/categories?industry_id=${encodeURIComponent(industry.id)}`}
```

- [ ] **Step 3: Verify with Grep**

Pattern `/admin/taxonomy` on the file. Expected: no matches.

- [ ] **Step 4: Do NOT commit yet**

---

## Task 8: Update links in `industries/product-types/page.tsx` (product types list)

**Files:**
- Modify: `frontend/app/admin/(dashboard)/industries/product-types/page.tsx`

**Links to update (1 total):**
- Lines 38–40: ternary with `/admin/taxonomy/product-types/new?category_id=...` and `/admin/taxonomy/product-types/new`

- [ ] **Step 1: Update the "New" button ternary**

Edit `frontend/app/admin/(dashboard)/industries/product-types/page.tsx`:

- `old_string`:
```tsx
          href={categoryFilter
            ? `/admin/taxonomy/product-types/new?category_id=${encodeURIComponent(categoryFilter)}`
            : '/admin/taxonomy/product-types/new'}
```
- `new_string`:
```tsx
          href={categoryFilter
            ? `/admin/industries/product-types/new?category_id=${encodeURIComponent(categoryFilter)}`
            : '/admin/industries/product-types/new'}
```

- [ ] **Step 2: Update the "Edit" row link**

There is also a "Edit" link on line 86:

- `old_string`:
```tsx
                      href={`/admin/taxonomy/product-types/${encodeURIComponent(pt.id)}`}
```
- `new_string`:
```tsx
                      href={`/admin/industries/product-types/${encodeURIComponent(pt.id)}`}
```

- [ ] **Step 3: Verify with Grep**

Pattern `/admin/taxonomy` on the file. Expected: no matches. (Note: the spec said this file has 1 link, but the code actually has 2 — the ternary counts as one logical link with two string literals, plus the Edit link. Both are updated above.)

- [ ] **Step 4: Do NOT commit yet**

---

## Task 9: Update links in `industries/product-types/[...id]/page.tsx` (edit product type)

**Files:**
- Modify: `frontend/app/admin/(dashboard)/industries/product-types/[...id]/page.tsx`

**Links to update (3 total):**
- Line 37: `href="/admin/taxonomy/industries"` → `href="/admin/industries"`
- Line 43: `href={`/admin/taxonomy/categories?industry_id=${encodeURIComponent(industry.id)}`}` → `href={`/admin/industries/categories?industry_id=${encodeURIComponent(industry.id)}`}`
- Line 54: `href={`/admin/taxonomy/product-types?category_id=${encodeURIComponent(category.id)}`}` → `href={`/admin/industries/product-types?category_id=${encodeURIComponent(category.id)}`}`

- [ ] **Step 1: Update the "Industries" breadcrumb link**

Edit `frontend/app/admin/(dashboard)/industries/product-types/[...id]/page.tsx`:

- `old_string`:
```tsx
        <Link href="/admin/taxonomy/industries" className="hover:underline">
```
- `new_string`:
```tsx
        <Link href="/admin/industries" className="hover:underline">
```

- [ ] **Step 2: Update the industry breadcrumb link**

- `old_string`:
```tsx
            href={`/admin/taxonomy/categories?industry_id=${encodeURIComponent(industry.id)}`}
```
- `new_string`:
```tsx
            href={`/admin/industries/categories?industry_id=${encodeURIComponent(industry.id)}`}
```

- [ ] **Step 3: Update the category breadcrumb link**

- `old_string`:
```tsx
            href={`/admin/taxonomy/product-types?category_id=${encodeURIComponent(category.id)}`}
```
- `new_string`:
```tsx
            href={`/admin/industries/product-types?category_id=${encodeURIComponent(category.id)}`}
```

- [ ] **Step 4: Verify with Grep**

Pattern `/admin/taxonomy` on the file. Expected: no matches.

- [ ] **Step 5: Commit all page.tsx link updates (Tasks 4–9)**

Now batch-commit the page.tsx link updates:

```bash
git add "frontend/app/admin/(dashboard)/industries/"
git commit -m "refactor(frontend): update /admin/taxonomy links to /admin/industries in pages"
```

---

## Task 10: Update links in `IndustryForm.tsx`

**Files:**
- Modify: `frontend/components/admin/form/IndustryForm.tsx`

**Note:** This file was NOT listed in the design spec's section 4 ("Files affected"), but the grep confirmed it has 3 hardcoded `/admin/taxonomy/industries` references. This task closes that spec gap.

**Links to update (3 total):**
- Line 51: `router.push('/admin/taxonomy/industries')` → `router.push('/admin/industries')`
- Line 71: `router.push('/admin/taxonomy/industries')` → `router.push('/admin/industries')`
- Line 183: `href="/admin/taxonomy/industries"` → `href="/admin/industries"`

- [ ] **Step 1: Update the post-save redirect (line 51)**

Edit `frontend/components/admin/form/IndustryForm.tsx`:

- `old_string` (the first `router.push` inside `handleSubmit`):
```tsx
      if (res.ok) {
        router.push('/admin/taxonomy/industries');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Save failed (status ${res.status})`);
```
- `new_string`:
```tsx
      if (res.ok) {
        router.push('/admin/industries');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Save failed (status ${res.status})`);
```

- [ ] **Step 2: Update the post-delete redirect (line 71)**

- `old_string` (the `router.push` inside `handleDelete`):
```tsx
      if (res.ok || res.status === 204) {
        router.push('/admin/taxonomy/industries');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Delete failed (status ${res.status})`);
```
- `new_string`:
```tsx
      if (res.ok || res.status === 204) {
        router.push('/admin/industries');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Delete failed (status ${res.status})`);
```

- [ ] **Step 3: Update the Cancel button link (line 183)**

- `old_string`:
```tsx
        <Link
          href="/admin/taxonomy/industries"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Cancel
        </Link>
```
- `new_string`:
```tsx
        <Link
          href="/admin/industries"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Cancel
        </Link>
```

- [ ] **Step 4: Verify with Grep**

Pattern `/admin/taxonomy` on `frontend/components/admin/form/IndustryForm.tsx`. Expected: no matches.

- [ ] **Step 5: Do NOT commit yet**

---

## Task 11: Update links in `CategoryForm.tsx`

**Files:**
- Modify: `frontend/components/admin/form/CategoryForm.tsx`

**Note:** Spec gap — not in design spec section 4. Has 3 hardcoded `/admin/taxonomy/categories` references.

**Links to update (3 total):**
- Line 64: `router.push('/admin/taxonomy/categories')` → `router.push('/admin/industries/categories')`
- Line 84: `router.push('/admin/taxonomy/categories')` → `router.push('/admin/industries/categories')`
- Line 216: `href="/admin/taxonomy/categories"` → `href="/admin/industries/categories"`

- [ ] **Step 1: Update the post-save redirect (line 64)**

Edit `frontend/components/admin/form/CategoryForm.tsx`:

- `old_string`:
```tsx
      if (res.ok) {
        router.push('/admin/taxonomy/categories');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Save failed (status ${res.status})`);
```
- `new_string`:
```tsx
      if (res.ok) {
        router.push('/admin/industries/categories');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Save failed (status ${res.status})`);
```

- [ ] **Step 2: Update the post-delete redirect (line 84)**

- `old_string`:
```tsx
      if (res.ok || res.status === 204) {
        router.push('/admin/taxonomy/categories');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Delete failed (status ${res.status})`);
```
- `new_string`:
```tsx
      if (res.ok || res.status === 204) {
        router.push('/admin/industries/categories');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Delete failed (status ${res.status})`);
```

- [ ] **Step 3: Update the Cancel button link (line 216)**

- `old_string`:
```tsx
        <Link
          href="/admin/taxonomy/categories"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Cancel
        </Link>
```
- `new_string`:
```tsx
        <Link
          href="/admin/industries/categories"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Cancel
        </Link>
```

- [ ] **Step 4: Verify with Grep**

Pattern `/admin/taxonomy` on `frontend/components/admin/form/CategoryForm.tsx`. Expected: no matches.

- [ ] **Step 5: Do NOT commit yet**

---

## Task 12: Update links in `ProductTypeForm.tsx`

**Files:**
- Modify: `frontend/components/admin/form/ProductTypeForm.tsx`

**Note:** Spec gap — not in design spec section 4. Has 3 hardcoded `/admin/taxonomy/product-types` references.

**Links to update (3 total):**
- Line 108: `router.push('/admin/taxonomy/product-types')` → `router.push('/admin/industries/product-types')`
- Line 128: `router.push('/admin/taxonomy/product-types')` → `router.push('/admin/industries/product-types')`
- Line 315: `href="/admin/taxonomy/product-types"` → `href="/admin/industries/product-types"`

- [ ] **Step 1: Update the post-save redirect (line 108)**

Edit `frontend/components/admin/form/ProductTypeForm.tsx`:

- `old_string`:
```tsx
      if (res.ok) {
        router.push('/admin/taxonomy/product-types');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Save failed (status ${res.status})`);
```
- `new_string`:
```tsx
      if (res.ok) {
        router.push('/admin/industries/product-types');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Save failed (status ${res.status})`);
```

- [ ] **Step 2: Update the post-delete redirect (line 128)**

- `old_string`:
```tsx
      if (res.ok || res.status === 204) {
        router.push('/admin/taxonomy/product-types');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Delete failed (status ${res.status})`);
```
- `new_string`:
```tsx
      if (res.ok || res.status === 204) {
        router.push('/admin/industries/product-types');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Delete failed (status ${res.status})`);
```

- [ ] **Step 3: Update the Cancel button link (line 315)**

- `old_string`:
```tsx
        <Link
          href="/admin/taxonomy/product-types"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Cancel
        </Link>
```
- `new_string`:
```tsx
        <Link
          href="/admin/industries/product-types"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Cancel
        </Link>
```

- [ ] **Step 4: Verify with Grep**

Pattern `/admin/taxonomy` on `frontend/components/admin/form/ProductTypeForm.tsx`. Expected: no matches.

- [ ] **Step 5: Commit form component updates (Tasks 10–12)**

```bash
git add frontend/components/admin/form/
git commit -m "refactor(frontend): update /admin/taxonomy links to /admin/industries in forms"
```

---

## Task 13: Update links in `IndustryFilterSelect.tsx`

**Files:**
- Modify: `frontend/components/admin/list/IndustryFilterSelect.tsx`

**Note:** Spec gap — not in design spec section 4. Has 2 hardcoded `/admin/taxonomy/categories` references inside the `onChange` handler.

**Links to update (2 total):**
- Line 15: `/admin/taxonomy/categories?industry_id=${encodeURIComponent(val)}` → `/admin/industries/categories?industry_id=${encodeURIComponent(val)}`
- Line 16: `'/admin/taxonomy/categories'` → `'/admin/industries/categories'`

- [ ] **Step 1: Update the onChange handler**

Edit `frontend/components/admin/list/IndustryFilterSelect.tsx`:

- `old_string`:
```tsx
        window.location.href = val
          ? `/admin/taxonomy/categories?industry_id=${encodeURIComponent(val)}`
          : '/admin/taxonomy/categories';
```
- `new_string`:
```tsx
        window.location.href = val
          ? `/admin/industries/categories?industry_id=${encodeURIComponent(val)}`
          : '/admin/industries/categories';
```

- [ ] **Step 2: Verify with Grep**

Pattern `/admin/taxonomy` on `frontend/components/admin/list/IndustryFilterSelect.tsx`. Expected: no matches.

- [ ] **Step 3: Do NOT commit yet**

---

## Task 14: Update links in `CategoryFilterSelect.tsx`

**Files:**
- Modify: `frontend/components/admin/list/CategoryFilterSelect.tsx`

**Note:** Spec gap — not in design spec section 4. Has 2 hardcoded `/admin/taxonomy/product-types` references inside the `onChange` handler.

**Links to update (2 total):**
- Line 15: `/admin/taxonomy/product-types?category_id=${encodeURIComponent(val)}` → `/admin/industries/product-types?category_id=${encodeURIComponent(val)}`
- Line 16: `'/admin/taxonomy/product-types'` → `'/admin/industries/product-types'`

- [ ] **Step 1: Update the onChange handler**

Edit `frontend/components/admin/list/CategoryFilterSelect.tsx`:

- `old_string`:
```tsx
        window.location.href = val
          ? `/admin/taxonomy/product-types?category_id=${encodeURIComponent(val)}`
          : '/admin/taxonomy/product-types';
```
- `new_string`:
```tsx
        window.location.href = val
          ? `/admin/industries/product-types?category_id=${encodeURIComponent(val)}`
          : '/admin/industries/product-types';
```

- [ ] **Step 2: Verify with Grep**

Pattern `/admin/taxonomy` on `frontend/components/admin/list/CategoryFilterSelect.tsx`. Expected: no matches.

- [ ] **Step 3: Commit filter component updates (Tasks 13–14)**

```bash
git add frontend/components/admin/list/
git commit -m "refactor(frontend): update /admin/taxonomy links to /admin/industries in filters"
```

---

## Task 15: Final grep sweep and commit Task 1

**Files:**
- Modify: `frontend/components/admin/layout/AdminSidebar.tsx` (already edited in Task 1, not yet committed)

**Why:** Verify that NO `/admin/taxonomy` references remain anywhere in the frontend, then commit the sidebar change that we held back in Task 1.

- [ ] **Step 1: Run a project-wide grep**

Use Grep on `d:\projects\unowire\frontend` with pattern `/admin/taxonomy`. Expected results: **zero matches**. If any match appears, that file was missed — go back and update it before continuing.

Exception: matches inside `frontend/.next/` (build cache) are fine and will be cleared on next build. If matches appear only in `.next/`, proceed.

- [ ] **Step 2: Commit the sidebar change**

```bash
git add frontend/components/admin/layout/AdminSidebar.tsx
git commit -m "feat(frontend): rename admin sidebar 'Taxonomy' to 'Industries'"
```

- [ ] **Step 3: Verify git log shows all rename commits**

```bash
git log --oneline -5
```

Expected: see the 5 commits from Tasks 2, 3, 9, 12, 14, and 15:
1. `feat(frontend): rename admin sidebar 'Taxonomy' to 'Industries'`
2. `refactor(frontend): update /admin/taxonomy links to /admin/industries in filters`
3. `refactor(frontend): update /admin/taxonomy links to /admin/industries in forms`
4. `refactor(frontend): update /admin/taxonomy links to /admin/industries in pages`
5. `feat(frontend): add 308 redirects from /admin/taxonomy to /admin/industries`
6. `refactor(frontend): move taxonomy routes to industries path`

---

## Task 16: Restart frontend container and clear Next.js cache

**Files:** none (runtime operation)

**Why:** The previous session hit a bug where Turbopack served a stale client bundle even after code edits. We must clear `.next/cache` and restart the frontend container so the new routes and links take effect.

- [ ] **Step 1: Restart the frontend container**

If running Docker Compose from `d:\projects\unowire`:

```bash
docker compose restart frontend
```

If that does not pick up the route changes (Next.js caches route manifests in `.next/`), do a harder reset:

```bash
docker compose down frontend
docker compose up -d frontend
```

- [ ] **Step 2: If the harder reset still serves old routes, clear the .next cache inside the container**

```bash
docker compose exec frontend rm -rf .next
docker compose restart frontend
```

The frontend Dockerfile / Compose mount must expose `.next/` for this to work. If `docker compose exec frontend rm -rf .next` fails with "no such container" or "permission denied", fall back to: stop the container, delete `frontend/.next/` on the host with the DeleteFile tool (it's a build artifact, safe to delete), then `docker compose up -d frontend`.

- [ ] **Step 3: Wait for the dev server to be ready**

Watch the logs:

```bash
docker compose logs -f frontend
```

Wait for a line like `✓ Ready in 1200ms` or `✓ Compiled /admin/industries`. Ctrl+C to stop following logs once ready.

---

## Task 17: Manual smoke test

**Files:** none (browser verification)

**Why:** The design spec section "Testing" lists 8 manual checks. Project memory says "Frontend MVP does not require automated tests", so verification is manual. All URLs are accessed at http://localhost:8080 (the Docker Compose frontend port).

Perform each check in order. If any check fails, stop and report which step failed before continuing.

- [ ] **Step 1: Sidebar label and landing page**

1. Open http://localhost:8080/admin/login, sign in.
2. On the admin dashboard, look at the left sidebar.
3. **Expected:** The menu item reads "Industries" (not "Taxonomy"), with the `FolderOpen` icon.
4. Click "Industries".
5. **Expected:** URL changes to http://localhost:8080/admin/industries and the industries list table renders (HTTP 200, no 404, no error toast).

- [ ] **Step 2: Create new industry**

1. On `/admin/industries`, click "New".
2. **Expected:** URL is http://localhost:8080/admin/industries/new and the New Industry form renders.
3. Fill in Label, Slug, Sort Order, optionally an Image URL.
4. Click "Save".
5. **Expected:** Browser redirects to `/admin/industries` and the new industry appears in the table.

- [ ] **Step 3: Edit existing industry (regression check for `imageUrl is not defined`)**

1. On `/admin/industries`, click "Edit" on any industry row (e.g., `consumer_electronics`).
2. **Expected:** URL is http://localhost:8080/admin/industries/consumer_electronics and the Edit Industry form renders with all fields pre-filled.
3. **Critical:** Open browser DevTools Console. There must be NO `imageUrl is not defined` error (this was the bug from the previous session — the `useState` declaration on line 24 of IndustryForm.tsx must still be present).
4. Click "Cancel".
5. **Expected:** Browser returns to `/admin/industries`.

- [ ] **Step 4: Cross-navigation: industry → categories**

1. On `/admin/industries`, click "View Categories →" on any industry row.
2. **Expected:** URL is http://localhost:8080/admin/industries/categories?industry_id=<id> and the categories table is filtered to that industry.

- [ ] **Step 5: Cross-navigation: category → product types**

1. On `/admin/industries/categories`, click "View Product Types →" on any category row.
2. **Expected:** URL is http://localhost:8080/admin/industries/product-types?category_id=<id> and the product types table is filtered to that category.

- [ ] **Step 6: Filter dropdowns navigate to new URLs**

1. On `/admin/industries/categories`, use the "Filter by industry" dropdown to pick a different industry.
2. **Expected:** Browser navigates to `/admin/industries/categories?industry_id=<new_id>`.
3. On `/admin/industries/product-types`, use the "Filter by category" dropdown to pick a different category.
4. **Expected:** Browser navigates to `/admin/industries/product-types?category_id=<new_id>`.

- [ ] **Step 7: Edit category breadcrumb**

1. On `/admin/industries/categories`, click "Edit" on any category row.
2. **Expected:** URL is http://localhost:8080/admin/industries/categories/<id> and the breadcrumb at the top reads `Industries / <Industry Label> / <Category Label>`.
3. Click the "Industries" part of the breadcrumb.
4. **Expected:** Browser navigates to `/admin/industries`.
5. Go back, click the industry label part of the breadcrumb.
6. **Expected:** Browser navigates to `/admin/industries/categories?industry_id=<id>`.

- [ ] **Step 8: Edit product type breadcrumb**

1. On `/admin/industries/product-types`, click "Edit" on any product type row.
2. **Expected:** URL is http://localhost:8080/admin/industries/product-types/<id> and the breadcrumb reads `Industries / <Industry> / <Category> / <Product Type>`.
3. Click each breadcrumb segment and confirm each navigates to the correct `/admin/industries/...` URL.

- [ ] **Step 9: Form Cancel buttons**

1. On `/admin/industries/new`, click "Cancel".
2. **Expected:** Browser navigates to `/admin/industries`.
3. Repeat for `/admin/industries/categories/new` Cancel → `/admin/industries/categories`.
4. Repeat for `/admin/industries/product-types/new` Cancel → `/admin/industries/product-types`.

- [ ] **Step 10: Old URL redirects (308)**

1. Open browser DevTools Network tab.
2. Visit http://localhost:8080/admin/taxonomy/industries.
3. **Expected:** Browser ends up on http://localhost:8080/admin/industries. The Network tab shows a `308 Permanent Redirect` for the original URL, followed by a `200` for the destination.
4. Visit http://localhost:8080/admin/taxonomy/categories.
5. **Expected:** Redirects to http://localhost:8080/admin/industries/categories (308 then 200).
6. Visit http://localhost:8080/admin/taxonomy/product-types.
7. **Expected:** Redirects to http://localhost:8080/admin/industries/product-types (308 then 200).
8. Visit http://localhost:8080/admin/taxonomy/industries/consumer_electronics.
9. **Expected:** Redirects to http://localhost:8080/admin/industries/consumer_electronics (308 then 200), and the edit form renders.

- [ ] **Step 11: Other admin pages unaffected**

1. Visit each of these URLs and confirm they still work (HTTP 200, no redirect, no error):
   - http://localhost:8080/admin/cables
   - http://localhost:8080/admin/brands
   - http://localhost:8080/admin/manufacturers
   - http://localhost:8080/admin/media
2. **Expected:** Each renders its list page normally. The sidebar still highlights the correct active item.

- [ ] **Step 12: Public site unaffected**

1. Visit http://localhost:8080/ (home page).
2. **Expected:** Renders normally with the industries section showing all 6 industries from the database.
3. Visit http://localhost:8080/cables.
4. **Expected:** Renders the cables list page normally.

- [ ] **Step 13: Final report**

If all 12 steps above pass, the rename is complete. Report success to the user. If any step fails, report:
- Which step failed
- The exact URL tested
- The observed vs expected behavior
- The relevant file/line to investigate

---

## Summary

| # | Task | Files | Commit? |
|---|---|---|---|
| 1 | Update AdminSidebar label + href | 1 | Held |
| 2 | Move taxonomy/ → industries/ folders | 9 (moved) | Yes |
| 3 | Add 308 redirects in next.config.js | 1 | Yes |
| 4 | Update links in industries/page.tsx | 1 | Held |
| 5 | Update links in industries/[id]/page.tsx | 1 | Held |
| 6 | Update links in industries/categories/page.tsx | 1 | Held |
| 7 | Update links in industries/categories/[...id]/page.tsx | 1 | Held |
| 8 | Update links in industries/product-types/page.tsx | 1 | Held |
| 9 | Update links in industries/product-types/[...id]/page.tsx | 1 | Yes (Tasks 4–9 batched) |
| 10 | Update links in IndustryForm.tsx | 1 | Held |
| 11 | Update links in CategoryForm.tsx | 1 | Held |
| 12 | Update links in ProductTypeForm.tsx | 1 | Yes (Tasks 10–12 batched) |
| 13 | Update links in IndustryFilterSelect.tsx | 1 | Held |
| 14 | Update links in CategoryFilterSelect.tsx | 1 | Yes (Tasks 13–14 batched) |
| 15 | Final grep sweep + commit sidebar | 0 (verify) + commit Task 1 | Yes |
| 16 | Restart frontend container | 0 (runtime) | No |
| 17 | Manual smoke test (12 checks) | 0 (browser) | No |

**Total files touched:** 13 (1 sidebar + 1 next.config + 6 page.tsx + 3 forms + 2 filters) + 9 folder moves.

**Total commits:** 6 (Tasks 2, 3, 9, 12, 14, 15).

**Spec gap closed:** Tasks 10–14 cover 5 files (3 forms + 2 filters) with 13 additional `/admin/taxonomy` links that were not listed in design spec section 4 but were found via grep.
