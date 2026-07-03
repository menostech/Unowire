import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { CategoryForm } from '@/components/admin/form/CategoryForm';

interface PageProps {
  params: Promise<{ id: string[] | string }>;
}

export default async function EditCategoryPage({ params }: PageProps) {
  const { id } = await params;
  // Handle both forms: ["ind","cat"] (decoded) or ["ind%2Fcat"] (encoded)
  const segments = Array.isArray(id) ? id : [id];
  const compositeId = segments.map((s) => decodeURIComponent(s)).join('/');
  const category = await adminApi.taxonomy.categories.getById(compositeId);
  if (!category) notFound();

  const industries = await adminApi.taxonomy.industries.all();
  const industry = industries.find((i) => i.id === category.industry_id);

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/taxonomy/industries" className="hover:underline">
          Industries
        </Link>
        <span className="mx-2">/</span>
        {industry ? (
          <Link
            href={`/admin/taxonomy/categories?industry_id=${encodeURIComponent(industry.id)}`}
            className="hover:underline"
          >
            {industry.label}
          </Link>
        ) : (
          <span>{category.industry_id}</span>
        )}
        <span className="mx-2">/</span>
        <span className="text-gray-900">{category.label}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Category</h1>
      <CategoryForm
        initial={category}
        industries={industries.map((i) => ({ id: i.id, label: i.label }))}
      />
    </div>
  );
}