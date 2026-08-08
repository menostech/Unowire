import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchPageBySlug } from '@/lib/api/pages';
import { PageView } from '@/components/pages/PageView';
import { PostView } from '@/components/posts/PostView';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface CatchAllParams {
  params: Promise<{ slugs: string[] }>;
}

export async function generateMetadata({ params }: CatchAllParams): Promise<Metadata> {
  const { slugs } = await params;

  if (slugs.length === 1) {
    const page = await fetchPageBySlug(slugs[0]);
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

  if (slugs.length === 2) {
    const post = await api.posts.getByCategoryAndSlug(slugs[0], slugs[1]);
    if (!post) return {};
    return {
      title: post.meta_title || post.title,
      description: post.meta_description ?? undefined,
      openGraph: {
        title: post.meta_title || post.title,
        description: post.meta_description ?? undefined,
        images: post.og_image_url ? [{ url: post.og_image_url }] : undefined,
      },
    };
  }

  return {};
}

export default async function PublicCatchAllPage({ params }: CatchAllParams) {
  const { slugs } = await params;

  if (slugs.length === 1) {
    const page = await fetchPageBySlug(slugs[0]);
    if (!page) notFound();
    return <PageView page={page} />;
  }

  if (slugs.length === 2) {
    const post = await api.posts.getByCategoryAndSlug(slugs[0], slugs[1]);
    if (!post) notFound();
    const [categories, sameCatRecs] = await Promise.all([
      api.postCategories.all(),
      api.posts.all({ category_slug: slugs[0], page_size: 9 }),
    ]);
    // Exclude current post; fallback to site-wide if fewer than 8
    const recommendations = (sameCatRecs.items ?? []).filter((p) => p.id !== post.id);
    if (recommendations.length < 8) {
      const siteWide = await api.posts.all({ page_size: 8 });
      const existingIds = new Set(recommendations.map((p) => p.id));
      existingIds.add(post.id); // also exclude current post
      for (const p of siteWide.items ?? []) {
        if (recommendations.length >= 8) break;
        if (!existingIds.has(p.id)) {
          recommendations.push(p);
          existingIds.add(p.id);
        }
      }
    }
    return <PostView post={post} categories={categories} recommendations={recommendations} />;
  }

  notFound();
}
