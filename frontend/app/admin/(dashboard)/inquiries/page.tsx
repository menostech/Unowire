import { cookies } from 'next/headers';
import { InquiriesTable } from '@/components/admin/InquiriesTable';

export default async function AdminInquiriesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  const res = await fetch(`${process.env.INTERNAL_API_BASE || 'http://backend:8000'}/api/admin/inquiries`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const inquiries = res.ok ? await res.json() : [];

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Inquiries</h1>
      <InquiriesTable inquiries={inquiries} />
    </div>
  );
}