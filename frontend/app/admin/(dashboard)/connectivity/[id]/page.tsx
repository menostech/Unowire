import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { TerminalForm } from '@/components/admin/form/TerminalForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTerminalPage({ params }: PageProps) {
  const { id } = await params;
  const terminal = await adminApi.terminals.getById(id);
  if (!terminal) notFound();

  const [manufacturersResult, categoryTree] = await Promise.all([
    adminApi.terminalManufacturers.all(1, 999),
    adminApi.terminalCategories.all(),
  ]);

  const manufacturers = manufacturersResult.items.map((m) => ({ id: m.id, name: m.name }));

  // Flatten categories two levels: top-level (parent_id: null) + children (with parent_label).
  const categories = categoryTree.flatMap((parent) => {
    const self = {
      id: parent.id,
      label: parent.label,
      parent_id: null as string | null,
      parent_label: null as string | null,
    };
    const children = (parent.children ?? []).map((child) => ({
      id: child.id,
      label: child.label,
      parent_id: parent.id,
      parent_label: parent.label,
    }));
    return [self, ...children];
  });

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/connectivity" className="hover:underline">
          Terminals
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{terminal.model}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Connectivity Product</h1>
      <TerminalForm initial={terminal} manufacturers={manufacturers} categories={categories} />
    </div>
  );
}

