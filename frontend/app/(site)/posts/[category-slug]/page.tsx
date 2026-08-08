import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Pagination } from '@/components/shared/Pagination';
import { CategorySidebar } from '@/components/posts/CategorySidebar';
import { RecommendationSidebar } from '@/components/posts/RecommendationSidebar';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;

interface PageProps {
  params: Promise<{ 'category-slug': string }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    [key: string]: string | undefined;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { 'category-slug': categorySlug } = await params;
  const categories = await api.postCategories.all();
  const category = categories.find((c) => c.slug === categorySlug);
  if (!category) return { title: 'Category Not Found' };
  return {
    title: `${category.label} | Unowire`,
  };
}

export default async function PostsByCategoryPage({ params, searchParams }: PageProps) {
  const { 'category-slug': categorySlug } = await params;
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;
  const q = sp.q ?? '';

  // Load categories list (sidebar nav) and paginated posts for this category in parallel.
  const [categories, postsResponse] = await Promise.all([
    api.postCategories.all(),
    api.posts.all({
      page,
      page_size: PAGE_SIZE,
      category_slug: categorySlug,
      q: q || undefined,
    }),
  ]);

  const currentCategory = categories.find((c) => c.slug === categorySlug);
  if (!currentCategory) notFound();

  // Recommendations: same-category latest, fallback to site-wide
  const sameCatRecs = await api.posts.all({ category_slug: categorySlug, page_size: 8 });
  const recommendations = sameCatRecs.items ?? [];
  if (recommendations.length < 8) {
    const siteWide = await api.posts.all({ page_size: 8 });
    const existingIds = new Set(recommendations.map((p) => p.id));
    for (const p of siteWide.items ?? []) {
      if (recommendations.length >= 8) break;
      if (!existingIds.has(p.id)) {
        recommendations.push(p);
        existingIds.add(p.id);
      }
    }
  }

  const items = postsResponse.items ?? [];
  const total = postsResponse.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Container className="py-12">
      <Breadcrumbs
        items={[
          { name: 'Home', url: '/' },
          { name: 'Posts', url: '/posts' },
          { name: currentCategory.label },
        ]}
      />

      {/* Editorial header */}
      <div className="mb-10 border-b border-border pb-6">
        <div className="mono-label text-primary mb-2">
          CATEGORY / {currentCategory.slug.toUpperCase()}
        </div>
        <h1
          className="text-4xl md:text-5xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {currentCategory.label}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        {/* Category navigation sidebar */}
        <div className="lg:col-span-1">
          <CategorySidebar categories={categories} activeSlug={categorySlug} />
        </div>

        {/* Main content: search + list */}
        <div className="lg:col-span-2">
          {/* Search box (keep the user in the current category) */}
          <form action={`/posts/${encodeURIComponent(currentCategory.slug)}`} method="get" className="mb-6">
            <div className="flex items-center gap-2">
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search posts…"
                className="w-full rounded-md border border-input bg-secondary/50 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary focus:bg-card transition"
              />
              <button
                type="submit"
                className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
              >
                Search
              </button>
            </div>
          </form>

          {/* List */}
          {items.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-12 text-center">
              <p className="text-muted-foreground">No posts found.</p>
              {q && (
                <Link
                  href={`/posts/${encodeURIComponent(currentCategory.slug)}`}
                  className="mt-3 inline-block font-mono text-[12px] text-primary hover:underline"
                >
                  Clear filters
                </Link>
              )}
            </div>
          ) : (
            <>
              <p className="mb-4 mono-label text-muted-foreground">
                {total} ENTR{total !== 1 ? 'IES' : 'Y'}
              </p>
              <div className="space-y-px bg-border">
                {items.map((post, i) => (
                  <Link
                    key={post.id}
                    href={`/${post.category?.slug ?? ''}/${encodeURIComponent(post.slug)}`}
                    className="group flex items-start gap-5 bg-card p-5 transition-colors hover:bg-secondary/30"
                  >
                    {post.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.cover_image_url}
                        alt={post.title}
                        className="h-20 w-20 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded bg-secondary font-mono text-[11px] text-muted-foreground/40">
                        {(i + 1).toString().padStart(3, '0')}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {post.category && (
                        <span className="mb-1.5 inline-block mono-label text-primary">
                          {post.category.label}
                        </span>
                      )}
                      <h3
                        className="text-lg font-semibold text-foreground transition group-hover:text-primary"
                        style={{ fontFamily: 'var(--font-heading)' }}
                      >
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="mt-2.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground/70">
                        {post.published_at && (
                          <>
                            <span>{new Date(post.published_at).toLocaleDateString()}</span>
                            <span className="text-muted-foreground/40">·</span>
                          </>
                        )}
                        <span>{Math.max(1, Math.ceil(post.content.length / 500))} MIN</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                basePath={`/posts/${encodeURIComponent(currentCategory.slug)}`}
                searchParams={{ q }}
              />
            </>
          )}
        </div>

        {/* Recommendation sidebar */}
        <div className="lg:col-span-1">
          <RecommendationSidebar posts={recommendations} />
        </div>
      </div>
    </Container>
  );
}
