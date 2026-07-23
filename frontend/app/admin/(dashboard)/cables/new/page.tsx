import { adminApi } from '@/lib/adminApi';
import { api } from '@/lib/api';
import { CableForm } from '@/components/admin/form/CableForm';

export default async function NewCablePage() {
  const mfrRes = await adminApi.manufacturers.all(1, 999);
  const manufacturers = mfrRes.items.map((m) => ({ id: m.id, name: m.name }));
  const taxonomy = await api.taxonomy.all();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Cable</h1>
      <CableForm manufacturers={manufacturers} taxonomy={taxonomy} />
    </div>
  );
}
