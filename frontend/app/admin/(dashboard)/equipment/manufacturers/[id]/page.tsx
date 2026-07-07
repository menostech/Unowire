import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { EquipmentManufacturerForm } from '@/components/admin/form/EquipmentManufacturerForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditEquipmentManufacturerPage({ params }: PageProps) {
  const { id } = await params;
  const manufacturer = await adminApi.equipmentManufacturers.getById(id);
  if (!manufacturer) notFound();

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/equipment/manufacturers" className="hover:underline">
          Equipment Manufacturers
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{manufacturer.name}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Equipment Manufacturer</h1>
      <EquipmentManufacturerForm initial={manufacturer} />
    </div>
  );
}
