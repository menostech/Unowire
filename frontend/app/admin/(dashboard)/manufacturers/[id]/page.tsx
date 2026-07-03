import { adminApi } from '@/lib/adminApi';
import { ManufacturerForm } from '@/components/admin/form/ManufacturerForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditManufacturerPage({ params }: PageProps) {
  const { id } = await params;
  const manufacturer = await adminApi.manufacturers.getById(id);

  if (!manufacturer) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Not found</h1>
        <p className="text-gray-500">
          The manufacturer you are looking for does not exist.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Manufacturer</h1>
      <ManufacturerForm initial={manufacturer} />
    </div>
  );
}
