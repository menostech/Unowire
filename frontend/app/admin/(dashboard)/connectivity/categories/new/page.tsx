import { TerminalCategoryForm } from '@/components/admin/form/TerminalCategoryForm';
import { adminApi } from '@/lib/adminApi';

export default async function NewTerminalCategoryPage() {
  const tree = await adminApi.terminalCategories.all();
  const topCategories = tree.map((c) => ({ id: c.id, label: c.label }));
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Connectivity Category</h1>
      <TerminalCategoryForm topCategories={topCategories} />
    </div>
  );
}

