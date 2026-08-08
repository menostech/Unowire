import { cookies } from 'next/headers';
import Link from 'next/link';
import { EmailConfigForm } from '@/components/admin/form/EmailConfigForm';

export default async function EmailConfigPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  const res = await fetch(`${process.env.INTERNAL_API_BASE || 'http://backend:8000'}/api/admin/email/templates`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const templates = res.ok ? await res.json() : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold mb-4">Email Configuration</h1>
        <EmailConfigForm />
      </div>
      <div>
        <h2 className="text-lg font-bold mb-4">Email Templates</h2>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map((t: any) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-mono text-gray-600">{t.id}</td>
                  <td className="px-4 py-3">{t.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/settings/email/templates/${t.id}`}
                      className="text-accent-foreground hover:underline text-sm"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
