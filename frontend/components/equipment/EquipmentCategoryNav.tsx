import Link from 'next/link';
import type { EquipmentCategory } from '@/lib/types';

export function EquipmentCategoryNav({
  categories,
  activeCategoryId,
}: {
  categories: EquipmentCategory[];
  activeCategoryId?: string;
}) {
  // Extract only sub-categories (those with parent_id !== null)
  const subCategories: EquipmentCategory[] = [];
  for (const top of categories) {
    for (const child of top.children ?? []) {
      subCategories.push(child);
    }
  }

  if (subCategories.length === 0) return null;

  return (
    <div className="mb-6 flex gap-3 overflow-x-auto pb-2">
      {subCategories.map((cat) => {
        const isActive = activeCategoryId === cat.id;
        return (
          <Link
            key={cat.id}
            href={`/equipment?category=${encodeURIComponent(cat.id)}#equipment-list`}
            className={`flex w-32 shrink-0 flex-col overflow-hidden rounded-lg border transition ${
              isActive
                ? 'border-accent-foreground ring-2 ring-accent-foreground/30'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="h-20 w-full overflow-hidden bg-gray-100">
              {cat.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cat.image_url}
                  alt={cat.label}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                  No image
                </div>
              )}
            </div>
            <div className="p-2 text-center text-xs font-medium text-gray-700">
              {cat.label}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
