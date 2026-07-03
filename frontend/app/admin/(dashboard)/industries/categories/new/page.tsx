import { CategoryForm } from '@/components/admin/form/CategoryForm';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  searchParams: Promise<{ industry_id?: string }>;
}

export default async function NewCategoryPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const industries = await adminApi.taxonomy.industries.all();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Category</h1>
      <CategoryForm
        industries={industries.map((i) => ({ id: i.id, label: i.label }))}
        preselectIndustryId={sp.industry_id}
      />
    </div>
  );
}
