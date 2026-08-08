import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { TerminalManufacturerForm } from '@/components/admin/form/TerminalManufacturerForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTerminalManufacturerPage({ params }: PageProps) {
  const { id } = await params;
  const manufacturer = await adminApi.terminalManufacturers.getById(id);
  if (!manufacturer) notFound();

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/terminals/manufacturers" className="hover:underline">
          Terminal Manufacturers
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{manufacturer.name}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Terminal Manufacturer</h1>
      <TerminalManufacturerForm initial={manufacturer} />
    </div>
  );
}
