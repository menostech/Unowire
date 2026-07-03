import { adminApi } from '@/lib/adminApi';
import { BrandForm } from '@/components/admin/form/BrandForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditBrandPage({ params }: PageProps) {
  const { id } = await params;
  const brand = await adminApi.brands.getById(id);

  if (!brand) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Not found</h1>
        <p className="text-gray-500">
          The brand you are looking for does not exist.
        </p>
      </div>
    );
  }

  const mfrRes = await adminApi.manufacturers.all(1, 999);
  const manufacturers = mfrRes.items.map((m) => ({ id: m.id, name: m.name }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Brand</h1>
      <BrandForm initial={brand} manufacturers={manufacturers} />
    </div>
  );
}
