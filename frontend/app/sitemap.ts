import type { MetadataRoute } from 'next';
import { api, getCableUrl } from '@/lib/api';
import { getCategoryUrl } from '@/lib/category-tree';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const cables = api.cables.all();
  const categories = api.categories.all();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/cables`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
  ];

  const cablePages: MetadataRoute.Sitemap = cables.map(cable => ({
    url: `${SITE_URL}${getCableUrl(cable)}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const categoryPages: MetadataRoute.Sitemap = categories.map(category => ({
    url: `${SITE_URL}${getCategoryUrl(category.id)}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [...staticPages, ...cablePages, ...categoryPages];
}
