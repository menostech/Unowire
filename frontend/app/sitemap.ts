import type { MetadataRoute } from 'next';
import { api, getCableUrl } from '@/lib/api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const cables = api.cables.all();
  const taxonomy = api.taxonomy.all();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/cables`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
  ];

  // Taxonomy routes: industries, categories, product types
  const taxonomyPages: MetadataRoute.Sitemap = [];
  for (const ind of Object.values(taxonomy)) {
    taxonomyPages.push({
      url: `${SITE_URL}/cables/${ind.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    });
    for (const cat of Object.values(ind.categories)) {
      taxonomyPages.push({
        url: `${SITE_URL}/cables/${ind.slug}/${cat.slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      });
      for (const pt of Object.values(cat.product_types)) {
        taxonomyPages.push({
          url: `${SITE_URL}/cables/${ind.slug}/${cat.slug}/${pt.slug}`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.6,
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

  return [...staticPages, ...taxonomyPages, ...cablePages];
}
