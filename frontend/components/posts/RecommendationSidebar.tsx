import Link from 'next/link';
import type { BackendPost } from '@/lib/api';

interface RecommendationSidebarProps {
  posts: BackendPost[];
}

export function RecommendationSidebar({ posts }: RecommendationSidebarProps) {
  if (!posts || posts.length === 0) {
    return (
      <aside className="sticky top-24">
        <div className="border-l-2 border-border pl-4">
          <div className="mono-label text-muted-foreground/50 mb-3">
            RELATED / 00
          </div>
          <p className="font-mono text-[12px] text-muted-foreground/60">— None available</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sticky top-24">
      <div className="border-l-2 border-border pl-4">
        <div className="mono-label text-muted-foreground/50 mb-4">
          RELATED / {posts.length.toString().padStart(2, '0')}
        </div>
        <div className="space-y-4">
          {posts.slice(0, 8).map((post, i) => {
            const href = `/${post.category?.slug ?? ''}/${encodeURIComponent(post.slug)}`;
            return (
              <Link key={post.id} href={href} className="group block">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-[11px] text-muted-foreground/40 group-hover:text-primary transition">
                    {(i + 1).toString().padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-sm font-medium text-muted-foreground transition group-hover:text-primary">
                      {post.title}
                    </h3>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
