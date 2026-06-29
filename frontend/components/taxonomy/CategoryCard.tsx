import Link from 'next/link';
import type { TaxonomyIndustry, TaxonomyCategory } from '@/lib/types';

interface CategoryCardProps {
  industry: TaxonomyIndustry;
  category: TaxonomyCategory;
  productTypeCount: number;
  cableCount: number;
}

export function CategoryCard({ industry, category, productTypeCount, cableCount }: CategoryCardProps) {
  return (
    <Link
      href={`/cables/${industry.slug}/${category.slug}`}
      className="block border rounded-lg p-4 hover:shadow-md transition bg-white"
    >
      <h3 className="font-semibold text-gray-900 mb-1">{category.label}</h3>
      <div className="flex gap-3 text-xs text-gray-500">
        <span>{productTypeCount} product type{productTypeCount !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>{cableCount} cable{cableCount !== 1 ? 's' : ''}</span>
      </div>
    </Link>
  );
}
