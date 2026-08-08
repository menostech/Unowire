import { portalApi } from '@/lib/portalApi';
import { ResourceForm } from '@/components/portal/form/ResourceForm';
import type { BackendResourceCategory } from '@/lib/adminApi';

export default async function PortalResourceNewPage() {
  // Fetch resource categories (public endpoint, no auth needed).
  // On failure, pass an empty array — the form will show an empty dropdown.
  let categories: BackendResourceCategory[] = [];
  try {
    categories = await portalApi.resourceCategories.all();
  } catch {
    // categories fetch failure is non-fatal
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Resource</h1>
      <ResourceForm categories={categories} />
    </div>
  );
}
