import Link from 'next/link';
import type { TaxonomyIndustry } from '@/lib/types';

interface IndustryCardProps {
  industry: TaxonomyIndustry;
  categoryCount: number;
  cableCount: number;
}

export function IndustryCard({ industry, categoryCount, cableCount }: IndustryCardProps) {
  return (
    <Link
      href={`/cables/${industry.slug}`}
      className="block border rounded-lg p-4 hover:shadow-md transition bg-white"
    >
      <h3 className="font-semibold text-gray-900 mb-1">{industry.label}</h3>
      <p className="text-xs text-gray-600 mb-3 line-clamp-2">{industry.description}</p>
      <div className="flex gap-3 text-xs text-gray-500">
        <span>{categoryCount} categor{categoryCount !== 1 ? 'ies' : 'y'}</span>
        <span>·</span>
        <span>{cableCount} cable{cableCount !== 1 ? 's' : ''}</span>
      </div>
    </Link>
  );
}
