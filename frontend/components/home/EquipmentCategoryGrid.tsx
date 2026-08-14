import Link from 'next/link';
import type { EquipmentCategory } from '@/lib/types';

interface EquipmentCategoryGridProps {
  tree: EquipmentCategory[];
}

export function EquipmentCategoryGrid({ tree }: EquipmentCategoryGridProps) {
  return (
    <section className="border-t border-border bg-secondary/30 py-16">
      <div className="mb-8 flex items-end justify-between border-b border-border pb-4">
        <div>
          <div className="mono-label text-primary mb-2">
            SECTION / 02
          </div>
          <h2
            className="text-3xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Equipment by category
          </h2>
        </div>
        <Link
          href="/equipment"
          className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          View all
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      </div>

      {tree.length === 0 ? (
        <p className="text-muted-foreground">Equipment categories coming soon.</p>
      ) : (
        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
          {tree.map((topLevel, i) => (
            <TopLevelCard key={topLevel.id} category={topLevel} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function TopLevelCard({ category, index }: { category: EquipmentCategory; index: number }) {
  const children = category.children ?? [];
  const categoryHref = `/equipment?category=${encodeURIComponent(category.id)}`;

  return (
    <div className="group relative bg-card p-6 transition-colors hover:bg-secondary/30">
      <span className="absolute right-6 top-6 font-mono text-[11px] text-muted-foreground/40">
        {(index + 1).toString().padStart(2, '0')}
      </span>

      <h3 className="mb-4 pr-8">
        <Link
          href={categoryHref}
          className="text-lg font-semibold text-foreground transition hover:text-primary"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {category.label}
        </Link>
      </h3>

      {children.length === 0 ? (
        <p className="font-mono text-[12px] text-muted-foreground/60">— No sub-categories yet</p>
      ) : (
        <ul className="space-y-2">
          {children.map(child => (
            <li key={child.id}>
              <Link
                href={`/equipment?category=${encodeURIComponent(child.id)}`}
                className="group/sub flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
              >
                <span className="font-mono text-[10px] text-muted-foreground/40 group-hover/sub:text-primary">
                  ▸
                </span>
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {children.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <span className="mono-label text-muted-foreground/50">
            {children.length} TYPES
          </span>
        </div>
      )}
    </div>
  );
}
