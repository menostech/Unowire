import type { MetadataRoute } from 'next';
import { api, getCableUrl } from '@/lib/api';
import { fetchPagesForSitemap } from '@/lib/api/pages';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/cables`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/manufacturers`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
  ];

  let cables: Awaited<ReturnType<typeof api.cables.all>> = [];
  let taxonomy: Awaited<ReturnType<typeof api.taxonomy.all>> = {};
  let manufacturers: Awaited<ReturnType<typeof api.manufacturers.all>> = [];
  try {
    [cables, taxonomy, manufacturers] = await Promise.all([
      api.cables.all(),
      api.taxonomy.all(),
      api.manufacturers.all(),
    ]);
  } catch {
    // Backend unavailable (e.g., during Docker build) — return static pages only
    return staticPages;
  }

  // Taxonomy routes: product types only (flat, no intermediate pages)
  const taxonomyPages: MetadataRoute.Sitemap = [];
  for (const ind of Object.values(taxonomy)) {
    for (const cat of Object.values(ind.categories)) {
      for (const pt of Object.values(cat.product_types)) {
        taxonomyPages.push({
          url: `${SITE_URL}/cables/${ind.slug}/${cat.slug}/${pt.slug}`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        });
      }
    }
  }

  const cablePages: MetadataRoute.Sitemap = cables.map(cable => ({
    url: `${SITE_URL}${getCableUrl(cable)}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const manufacturerPages: MetadataRoute.Sitemap = manufacturers.map(m => ({
    url: `${SITE_URL}/manufacturers/${m.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  // CMS pages (published + visible only)
  let cmsPages: MetadataRoute.Sitemap = [];
  try {
    const pageList = await fetchPagesForSitemap();
    cmsPages = pageList.map((p) => ({
      url: `${SITE_URL}/${p.slug}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));
  } catch {
    // Backend unavailable — skip CMS pages
  }

  return [...staticPages, ...taxonomyPages, ...cablePages, ...manufacturerPages, ...cmsPages];
}
