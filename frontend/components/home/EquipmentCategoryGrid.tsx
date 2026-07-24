import Link from 'next/link';
import type { EquipmentCategory } from '@/lib/types';

interface EquipmentCategoryGridProps {
  tree: EquipmentCategory[];
}

export function EquipmentCategoryGrid({ tree }: EquipmentCategoryGridProps) {
  return (
    <section className="border-t bg-gray-50 py-12">
      <h2 className="mb-6 inline-block border-b-2 border-blue-600 pb-1 text-xl font-bold text-gray-900">
        Browse Equipment by Category
      </h2>

      {tree.length === 0 ? (
        <p className="text-gray-500">Equipment categories coming soon.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tree.map(topLevel => (
            <TopLevelCard key={topLevel.id} category={topLevel} />
          ))}
        </div>
      )}
    </section>
  );
}

function TopLevelCard({ category }: { category: EquipmentCategory }) {
  const children = category.children ?? [];
  const categoryHref = `/equipment?category=${encodeURIComponent(category.id)}`;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-2 border-b border-gray-200 pb-2">
        <Link href={categoryHref} className="font-bold text-blue-600 hover:underline">
          {category.label}
        </Link>
      </h3>

      {children.length === 0 ? (
        <p className="text-xs italic text-gray-400">(No sub-categories yet)</p>
      ) : (
        <ul className="space-y-1">
          {children.map(child => (
            <li key={child.id}>
              <Link
                href={`/equipment?category=${encodeURIComponent(child.id)}`}
                className="text-sm text-gray-700 hover:text-blue-600 hover:underline"
              >
                ▸ {child.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
