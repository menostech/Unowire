import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { PostCategoryForm } from '@/components/admin/form/PostCategoryForm';

interface PageProps {
  params: Promise<{ id: string[] | string }>;
}

export default async function EditPostCategoryPage({ params }: PageProps) {
  const { id } = await params;
  // Handle both forms: ["a","b"] (decoded) or ["a%2Fb"] (encoded)
  const segments = Array.isArray(id) ? id : [id];
  const compositeId = segments.map((s) => decodeURIComponent(s)).join('/');
  const category = await adminApi.postCategories.getById(compositeId);
  if (!category) notFound();

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/posts/categories" className="hover:underline">
          Post Categories
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{category.label}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Post Category</h1>
      <PostCategoryForm initial={category} />
    </div>
  );
}
