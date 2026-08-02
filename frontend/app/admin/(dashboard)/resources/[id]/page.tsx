import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { ResourceForm } from '@/components/admin/form/ResourceForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditResourcePage({ params }: PageProps) {
  const { id } = await params;
  const resource = await adminApi.resources.getById(id);
  if (!resource) notFound();

  const categoryTree = await adminApi.resourceCategories.all();

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
        <Link href="/admin/resources" className="hover:underline">
          Resources
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{resource.title}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Resource</h1>
      <ResourceForm initial={resource} categories={categories} />
    </div>
  );
}
