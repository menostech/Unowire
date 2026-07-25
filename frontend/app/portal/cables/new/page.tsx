import { CableCreateForm } from '@/components/portal/form/CableCreateForm';
import type { TaxonomyIndustry } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function NewCablePage() {
  // Fetch taxonomy tree (public endpoint, no auth needed). On failure, fall
  // back to an empty array — the form will show empty dropdowns, which is an
  // acceptable degradation.
  let taxonomy: TaxonomyIndustry[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/taxonomy`, { cache: 'no-store' });
    if (res.ok) taxonomy = await res.json();
  } catch {
    // taxonomy fetch failure is non-fatal — form will show empty dropdowns
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Cable</h1>
      <CableCreateForm taxonomy={taxonomy} />
    </div>
  );
}
