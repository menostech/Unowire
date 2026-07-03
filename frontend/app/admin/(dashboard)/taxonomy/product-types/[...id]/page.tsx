import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { ProductTypeForm } from '@/components/admin/form/ProductTypeForm';

interface PageProps {
  params: Promise<{ id: string[] | string }>;
}

export default async function EditProductTypePage({ params }: PageProps) {
  const { id } = await params;
  // Handle both forms: ["ind","cat","pt"] (decoded) or ["ind%2Fcat%2Fpt"] (encoded)
  const segments = Array.isArray(id) ? id : [id];
  const compositeId = segments.map((s) => decodeURIComponent(s)).join('/');
  const productType = await adminApi.taxonomy.productTypes.getById(compositeId);
  if (!productType) notFound();

  const industries = await adminApi.taxonomy.industries.all();

  // Resolve industry & category labels for the breadcrumb
  const industryId = productType.category_id?.split('/')[0] ?? '';
  const industry = industries.find((i) => i.id === industryId);
  const category = industries
    .flatMap((i) => i.categories ?? [])
    .find((c) => c.id === productType.category_id);

  // Map to the shape expected by ProductTypeForm
  const industryOptions = industries.map((i) => ({
    id: i.id,
    label: i.label,
    categories: (i.categories ?? []).map((c) => ({ id: c.id, label: c.label })),
  }));

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/taxonomy/industries" className="hover:underline">
          Industries
        </Link>
        <span className="mx-2">/</span>
        {industry ? (
          <Link
            href={`/admin/taxonomy/categories?industry_id=${encodeURIComponent(industry.id)}`}
            className="hover:underline"
          >
            {industry.label}
          </Link>
        ) : (
          <span>{industryId}</span>
        )}
        <span className="mx-2">/</span>
        {category ? (
          <Link
            href={`/admin/taxonomy/product-types?category_id=${encodeURIComponent(category.id)}`}
            className="hover:underline"
          >
            {category.label}
          </Link>
        ) : (
          <span>{productType.category_id}</span>
        )}
        <span className="mx-2">/</span>
        <span className="text-gray-900">{productType.label}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Product Type</h1>
      <ProductTypeForm initial={productType} industries={industryOptions} />
    </div>
  );
}
