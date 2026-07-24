import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/adminApi';
import { SiteLinkForm } from '@/components/admin/site-menu/SiteLinkForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSiteMenuItemPage({ params }: PageProps) {
  const { id } = await params;
  const item = await adminApi.siteMenu.getById(id);
  if (!item) notFound();
  return <SiteLinkForm initial={item} />;
}
