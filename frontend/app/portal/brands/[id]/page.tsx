import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { BrandEditForm } from '@/components/portal/form/BrandEditForm';

export default async function PortalBrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let brand: any;
  try {
    brand = await portalApi.brands.getById(id);
  } catch {
    notFound();
  }
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{brand.name || 'Brand'}</h1>
      <BrandEditForm brand={brand} />
    </div>
  );
}
