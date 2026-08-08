import Link from 'next/link';
import type { Category } from '@/lib/types';
import { getCategoryUrl } from '@/lib/category-tree';

interface CategoryCardProps {
  category: Category;
  count?: number;
}

export function CategoryCard({ category, count }: CategoryCardProps) {
  return (
    <Link
      href={getCategoryUrl(category.id)}
      className="block border rounded-lg p-5 hover:shadow-md hover:border-accent-foreground/40 transition bg-white"
    >
      <h3 className="font-semibold text-gray-900 mb-1">{category.name}</h3>
      {count !== undefined && (
        <p className="text-sm text-gray-500">{count} cable{count !== 1 ? 's' : ''}</p>
      )}
    </Link>
  );
}
