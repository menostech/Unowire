// Mirrors backend RESERVED_SLUGS in app/crud/page.py
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const RESERVED_SLUGS = new Set<string>([
  "admin", "api", "cables", "cable", "categories",
  "manufacturers", "member", "login", "register", "verify",
  "sitemap",
]);

/**
 * Validate a page slug. Returns an error message string if invalid, null if valid.
 */
export function validateSlug(slug: string): string | null {
  if (!slug) return "Slug is required";
  if (slug.length > 100) return "Slug must be 100 characters or less";
  if (!SLUG_REGEX.test(slug)) {
    return "Slug must be lowercase letters, digits, and single hyphens (e.g. about-us)";
  }
  if (RESERVED_SLUGS.has(slug)) {
    return `Slug '${slug}' is reserved`;
  }
  return null;
}

/**
 * Generate a slug from a title: lowercase, spaces -> hyphens, strip non-alphanumeric.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
