import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/cables`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/equipments`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/manufacturers`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    // /match is excluded — noindex tool page
  ];

  const cablePages: MetadataRoute.Sitemap = api.cables.sitemap().map(c => ({
    url: `${SITE_URL}/cables/${c.brand_slug}/${c.slug}`,
    lastModified: new Date(c.updated_at),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const equipmentPages: MetadataRoute.Sitemap = api.equipments.sitemap().map(e => ({
    url: `${SITE_URL}/equipments/${e.brand_slug}/${e.slug}`,
    lastModified: new Date(e.updated_at),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const manufacturerPages: MetadataRoute.Sitemap = api.manufacturers.list().map(m => ({
    url: `${SITE_URL}/manufacturers/${m.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...cablePages, ...equipmentPages, ...manufacturerPages];
}
