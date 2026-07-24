import Link from 'next/link';
import type { Taxonomy, TaxonomyIndustry, TaxonomyCategory, ProductTypeConfig } from '@/lib/types';

interface CableCategoryGridProps {
  taxonomy: Taxonomy;
}

export function CableCategoryGrid({ taxonomy }: CableCategoryGridProps) {
  const industries = Object.values(taxonomy);

  return (
    <section className="py-12">
      <h2 className="mb-6 inline-block border-b-2 border-blue-600 pb-1 text-xl font-bold text-gray-900">
        Browse Cables by Industry
      </h2>

      {industries.length === 0 ? (
        <p className="text-gray-500">Categories unavailable.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {industries.map(industry => (
            <IndustryCard key={industry.slug} industry={industry} />
          ))}
        </div>
      )}
    </section>
  );
}

function IndustryCard({ industry }: { industry: TaxonomyIndustry }) {
  const categories = Object.values(industry.categories);
  const industryHref = `/cables?industry=${encodeURIComponent(industry.slug)}`;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h3 className="mb-2 border-b border-gray-200 pb-2">
        <Link href={industryHref} className="font-bold text-blue-600 hover:underline">
          {industry.label}
        </Link>
      </h3>

      {categories.length === 0 ? (
        <p className="text-xs italic text-gray-400">(No categories yet)</p>
      ) : (
        <ul className="space-y-1">
          {categories.map(category => (
            <CategoryListItem
              key={category.slug}
              industrySlug={industry.slug}
              category={category}
            />
          ))}
        </ul>
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
        className="text-sm text-gray-700 hover:text-blue-600 hover:underline"
      >
        ▸ {category.label}
      </Link>
      {productTypes.length > 0 && (
        <ul className="ml-4 mt-0.5 space-y-0.5">
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
        className="text-xs text-gray-500 hover:text-blue-600 hover:underline"
      >
        {productType.label}
      </Link>
    </li>
  );
}
