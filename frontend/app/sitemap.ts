import type { MetadataRoute } from 'next';
import { api, getCableUrl } from '@/lib/api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const cables = await api.cables.all();
  const taxonomy = await api.taxonomy.all();
  const manufacturers = await api.manufacturers.all();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/cables`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/manufacturers`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
  ];

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

  return [...staticPages, ...taxonomyPages, ...cablePages, ...manufacturerPages];
}
