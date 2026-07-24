import type { SiteMenuLocation, SiteMenuTreeNode } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE
  || (typeof window === 'undefined' ? process.env.INTERNAL_API_BASE || 'http://backend:8000' : '');

/**
 * Fetch the public site menu tree for a given location.
 * Returns [] on error — header/footer rendering must never crash the page.
 */
export async function fetchSiteMenu(
  location: SiteMenuLocation
): Promise<SiteMenuTreeNode[]> {
  try {
    const res = await fetch(`${API_BASE}/api/site-menu/${location}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return (await res.json()) as SiteMenuTreeNode[];
  } catch {
    return [];
  }
}
