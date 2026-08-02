import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { ResourceForm } from '@/components/portal/form/ResourceForm';
import type { BackendResource, BackendResourceCategory } from '@/lib/adminApi';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PortalResourceEditPage({ params }: PageProps) {
  const { id } = await params;

  // Load resource and categories in parallel. The portal API returns 404
  // if the resource does not exist or is not owned by the current user's scope.
  let resource: BackendResource;
  let categories: BackendResourceCategory[] = [];
  try {
    [resource, categories] = await Promise.all([
      portalApi.resources.getById(id),
      portalApi.resourceCategories.all().catch(() => [] as BackendResourceCategory[]),
    ]);
  } catch {
    notFound();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{resource.title || 'Resource'}</h1>
      <ResourceForm initial={resource} categories={categories} />
    </div>
  );
}
