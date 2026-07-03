import { adminApi } from '@/lib/adminApi';
import { BrandForm } from '@/components/admin/form/BrandForm';

export default async function NewBrandPage() {
  const mfrRes = await adminApi.manufacturers.all(1, 999);
  const manufacturers = mfrRes.items.map((m) => ({ id: m.id, name: m.name }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Brand</h1>
      <BrandForm manufacturers={manufacturers} />
    </div>
  );
}
