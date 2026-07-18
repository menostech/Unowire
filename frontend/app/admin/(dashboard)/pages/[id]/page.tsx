import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/adminApi';
import { PageForm } from '@/components/admin/pages/PageForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPagePage({ params }: PageProps) {
  const { id } = await params;
  const page = await adminApi.pages.getById(id);
  if (!page) notFound();
  return <PageForm initial={page} />;
}
