import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { TerminalCategoryForm } from '@/components/admin/form/TerminalCategoryForm';

interface PageProps {
  params: Promise<{ id: string[] | string }>;
}

export default async function EditTerminalCategoryPage({ params }: PageProps) {
  const { id } = await params;
  // Handle both forms: ["parent","child"] (decoded) or ["parent%2Fchild"] (encoded)
  const segments = Array.isArray(id) ? id : [id];
  const compositeId = segments.map((s) => decodeURIComponent(s)).join('/');
  const category = await adminApi.terminalCategories.getById(compositeId);
  if (!category) notFound();

  const tree = await adminApi.terminalCategories.all();
  // Exclude the current category from the parent dropdown (can't be its own parent).
  const topCategories = tree
    .filter((c) => c.id !== compositeId)
    .map((c) => ({ id: c.id, label: c.label }));

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/connectivity/categories" className="hover:underline">
          Terminal Categories
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{category.label}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Connectivity Category</h1>
      <TerminalCategoryForm initial={category} topCategories={topCategories} />
    </div>
  );
}

