import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchPageBySlug } from '@/lib/api/pages';
import { PageView } from '@/components/pages/PageView';

interface PageParams {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const page = await fetchPageBySlug(slug);
  if (!page) return {};
  return {
    title: page.meta_title || page.title,
    description: page.meta_description ?? undefined,
    openGraph: {
      title: page.meta_title || page.title,
      description: page.meta_description ?? undefined,
      images: page.og_image_url ? [{ url: page.og_image_url }] : undefined,
    },
  };
}

export default async function PublicPage({ params }: PageParams) {
  const { slug } = await params;
  const page = await fetchPageBySlug(slug);
  if (!page) notFound();
  return <PageView page={page} />;
}
