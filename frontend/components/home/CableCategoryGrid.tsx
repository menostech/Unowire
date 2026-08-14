import Link from 'next/link';
import type { Taxonomy, TaxonomyIndustry, TaxonomyCategory, ProductTypeConfig } from '@/lib/types';

interface CableCategoryGridProps {
  taxonomy: Taxonomy;
}

export function CableCategoryGrid({ taxonomy }: CableCategoryGridProps) {
  const industries = Object.values(taxonomy);

  return (
    <section className="py-16">
      <div className="mb-8 flex items-end justify-between border-b border-border pb-4">
        <div>
          <div className="mono-label text-primary mb-2">
            SECTION / 01
          </div>
          <h2
            className="text-3xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Cables by industry
          </h2>
        </div>
        <Link
          href="/cables"
          className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          View all
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      </div>

      {industries.length === 0 ? (
        <p className="text-muted-foreground">Categories unavailable.</p>
      ) : (
        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
          {industries.map((industry, i) => (
            <IndustryCard key={industry.slug} industry={industry} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function IndustryCard({ industry, index }: { industry: TaxonomyIndustry; index: number }) {
  const categories = Object.values(industry.categories);
  const industryHref = `/cables?industry=${encodeURIComponent(industry.slug)}`;

  return (
    <div className="group relative bg-card p-6 transition-colors hover:bg-secondary/30">
      {/* Index number — top right, mono */}
      <span className="absolute right-6 top-6 font-mono text-[11px] text-muted-foreground/40">
        {(index + 1).toString().padStart(2, '0')}
      </span>

      <h3 className="mb-4 pr-8">
        <Link
          href={industryHref}
          className="text-lg font-semibold text-foreground transition hover:text-primary"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {industry.label}
        </Link>
      </h3>

      {categories.length === 0 ? (
        <p className="font-mono text-[12px] text-muted-foreground/60">— No categories yet</p>
      ) : (
        <ul className="space-y-2">
          {categories.map(category => (
            <CategoryListItem
              key={category.slug}
              industrySlug={industry.slug}
              category={category}
            />
          ))}
        </ul>
      )}

      {categories.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <span className="mono-label text-muted-foreground/50">
            {categories.length} CATEGORIES
          </span>
        </div>
      )}
    </div>
  );
}

function CategoryListItem({
  industrySlug,
  category,
}: {
  industrySlug: string;
  category: TaxonomyCategory;
}) {
  const productTypes = Object.values(category.product_types);
  const categoryHref = `/cables?industry=${encodeURIComponent(industrySlug)}&category=${encodeURIComponent(category.slug)}`;

  return (
    <li>
      <Link
        href={categoryHref}
        className="group/cat flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <span className="font-mono text-[10px] text-muted-foreground/40 group-hover/cat:text-primary">
          ▸
        </span>
        {category.label}
      </Link>
      {productTypes.length > 0 && (
        <ul className="ml-5 mt-1 space-y-1 border-l border-border/60 pl-3">
          {productTypes.map(pt => (
            <ProductTypeListItem
              key={pt.slug}
              industrySlug={industrySlug}
              categorySlug={category.slug}
              productType={pt}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ProductTypeListItem({
  industrySlug,
  categorySlug,
  productType,
}: {
  industrySlug: string;
  categorySlug: string;
  productType: ProductTypeConfig;
}) {
  const ptHref = `/cables?industry=${encodeURIComponent(industrySlug)}&category=${encodeURIComponent(categorySlug)}&type=${encodeURIComponent(productType.slug)}`;

  return (
    <li>
      <Link
        href={ptHref}
        className="font-mono text-[12px] text-muted-foreground/70 transition hover:text-primary"
      >
        {productType.label}
      </Link>
    </li>
  );
}
