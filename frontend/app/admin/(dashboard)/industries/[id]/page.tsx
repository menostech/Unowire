import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { IndustryForm } from '@/components/admin/form/IndustryForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditIndustryPage({ params }: PageProps) {
  const { id } = await params;
  const industry = await adminApi.taxonomy.industries.getById(id);
  if (!industry) notFound();

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/industries" className="hover:underline">
          Industries
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{industry.label}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Industry</h1>
      <IndustryForm initial={industry} />
    </div>
  );
}
