import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

export default async function PostCategoriesPage() {
  const categories = await adminApi.postCategories.all();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Post Categories</h1>
        <Link
          href="/admin/posts/categories/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          New
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Sort</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-gray-900">{cat.label}</td>
                <td className="px-4 py-3 text-gray-600 font-mono text-xs">{cat.slug}</td>
                <td className="px-4 py-3 text-gray-600">{cat.sort_order}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/posts/categories/${encodeURIComponent(cat.id)}`}
                    className="text-accent-foreground hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No post categories found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
