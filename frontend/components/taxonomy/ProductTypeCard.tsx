import Link from 'next/link';
import type { TaxonomyIndustry, TaxonomyCategory, ProductTypeConfig } from '@/lib/types';
import { formatSizeLabel } from '@/lib/utils';

interface ProductTypeCardProps {
  industry: TaxonomyIndustry;
  category: TaxonomyCategory;
  productType: ProductTypeConfig;
  cableCount: number;
}

export function ProductTypeCard({ industry, category, productType, cableCount }: ProductTypeCardProps) {
  const sizeBadge = productType.size_system !== "none" ? formatSizeLabel(productType.size_system) : null;
  return (
    <Link
      href={`/cables/${industry.slug}/${category.slug}/${productType.slug}`}
      className="block border rounded-lg p-4 hover:shadow-md transition bg-white"
    >
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-semibold text-gray-900">{productType.label}</h3>
        {sizeBadge && <span className="text-xs text-gray-500">{sizeBadge}</span>}
      </div>
      <p className="text-xs text-gray-500">{cableCount} cable{cableCount !== 1 ? 's' : ''}</p>
    </Link>
  );
}
