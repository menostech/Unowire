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

  const brandRes = await adminApi.brands.all(1, 999);
  const brands = brandRes.items.map((b) => ({ id: b.id, name: b.name }));
  const taxonomy = await api.taxonomy.all();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Cable</h1>
      <CableForm initial={cable} brands={brands} taxonomy={taxonomy} />
    </div>
  );
}
