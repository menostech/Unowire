import type { PagePublicRead } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE
  || (typeof window === 'undefined' ? process.env.INTERNAL_API_BASE || 'http://backend:8000' : '');

/**
 * Fetch a published+visible page by slug. Returns null on 404 (page not found,
 * draft, or hidden). Throws on other errors.
 */
export async function fetchPageBySlug(slug: string): Promise<PagePublicRead | null> {
  const res = await fetch(`${API_BASE}/api/pages/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch page: ${res.status}`);
  return res.json();
}

/**
 * Fetch list of published+visible pages for sitemap generation.
 */
export async function fetchPagesForSitemap(): Promise<Array<{ slug: string; updated_at: string }>> {
  try {
    const res = await fetch(`${API_BASE}/api/pages/sitemap`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}
