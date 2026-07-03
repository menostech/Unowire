import { ProductTypeForm } from '@/components/admin/form/ProductTypeForm';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  searchParams: Promise<{ category_id?: string }>;
}

export default async function NewProductTypePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const industries = await adminApi.taxonomy.industries.all();

  // Map to the shape expected by ProductTypeForm
  const industryOptions = industries.map((i) => ({
    id: i.id,
    label: i.label,
    categories: (i.categories ?? []).map((c) => ({ id: c.id, label: c.label })),
  }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Product Type</h1>
      <ProductTypeForm
        industries={industryOptions}
        preselectCategoryId={sp.category_id}
      />
    </div>
  );
}
