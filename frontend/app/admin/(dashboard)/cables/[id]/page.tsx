import { adminApi } from '@/lib/adminApi';
import { api } from '@/lib/api';
import { CableForm } from '@/components/admin/form/CableForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCablePage({ params }: PageProps) {
  const { id } = await params;
  const cable = await adminApi.cables.getDetail(id);

  if (!cable) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Not found</h1>
        <p className="text-gray-500">
          The cable you are looking for does not exist.
        </p>
      </div>
    );
  }

  const mfrRes = await adminApi.manufacturers.all(1, 999);
  const manufacturers = mfrRes.items.map((m) => ({ id: m.id, name: m.name }));
  const taxonomy = await api.taxonomy.all();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Cable</h1>
      <CableForm initial={cable} manufacturers={manufacturers} taxonomy={taxonomy} />
    </div>
  );
}
