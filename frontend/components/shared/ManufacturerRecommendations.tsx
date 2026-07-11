import Link from 'next/link';
import type { Manufacturer } from '@/lib/types';

interface Props {
  manufacturers: Manufacturer[];
}

export function ManufacturerRecommendations({ manufacturers }: Props) {
  const featuredImage = manufacturers
    .filter(m => m.featured_image)
    .sort((a, b) => a.featured_image_sort - b.featured_image_sort)
    .slice(0, 6);

  const featuredText = manufacturers
    .filter(m => m.featured_text)
    .sort((a, b) => a.featured_text_sort - b.featured_text_sort)
    .slice(0, 10);

  if (featuredImage.length === 0 && featuredText.length === 0) return null;

  return (
    <>
      {featuredImage.length > 0 && (
        <div className="border rounded-lg p-4 bg-white">
          <h3 className="text-base font-bold mb-4 text-gray-800">Featured Manufacturers</h3>
          <div className="grid grid-cols-3 gap-3">
            {featuredImage.map(m => (
              <Link
                key={m.id}
                href={`/manufacturers/${m.slug}`}
                className="flex items-center justify-center aspect-square bg-gray-100 rounded overflow-hidden hover:shadow-md transition"
              >
                {m.image_url ? (
                  <img
                    src={m.image_url}
                    alt={m.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-gray-400 text-lg font-bold">
                    {m.name.charAt(0)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {featuredText.length > 0 && (
        <div className="border rounded-lg p-4 bg-white">
          <h3 className="text-base font-bold mb-4 text-gray-800">Recommended Manufacturers</h3>
          <ul className="space-y-2">
            {featuredText.map(m => (
              <li key={m.id}>
                <Link
                  href={`/manufacturers/${m.slug}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {m.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <Link
          href="/manufacturers"
          className="text-sm text-blue-600 hover:underline font-medium"
        >
          All Manufacturers →
        </Link>
      </div>
    </>
  );
}
