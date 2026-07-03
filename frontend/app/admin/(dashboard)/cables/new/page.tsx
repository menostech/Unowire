import { adminApi } from '@/lib/adminApi';
import { api } from '@/lib/api';
import { CableForm } from '@/components/admin/form/CableForm';

export default async function NewCablePage() {
  const brandRes = await adminApi.brands.all(1, 999);
  const brands = brandRes.items.map((b) => ({ id: b.id, name: b.name }));
  const taxonomy = await api.taxonomy.all();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Cable</h1>
      <CableForm brands={brands} taxonomy={taxonomy} />
    </div>
  );
}
