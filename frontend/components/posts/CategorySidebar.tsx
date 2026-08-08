import Link from 'next/link';
import type { BackendPostCategory } from '@/lib/api';

interface CategorySidebarProps {
  categories: BackendPostCategory[];
  activeSlug?: string;
}

export function CategorySidebar({ categories, activeSlug }: CategorySidebarProps) {
  return (
    <aside className="sticky top-24">
      <div className="border-l-2 border-border pl-4">
        <div className="mono-label text-muted-foreground/50 mb-3">
          FILTER / CATEGORY
        </div>
        <nav className="space-y-0.5">
          <Link
            href="/posts"
            className={`block border-l-2 -ml-[1.125rem] pl-[2.625rem] py-1.5 text-sm transition ${
              !activeSlug
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            All Posts
          </Link>
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/posts/${encodeURIComponent(category.slug)}`}
              className={`block border-l-2 -ml-[1.125rem] pl-[2.625rem] py-1.5 text-sm transition ${
                activeSlug === category.slug
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {category.label}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
