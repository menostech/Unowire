import { cookies } from 'next/headers';
import Link from 'next/link';

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
      {inquiries.length === 0 ? (
        <p className="text-gray-500 text-sm">No inquiries yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Subject</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Recipient</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Created</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inquiries.map((i: any) => (
                <tr key={i.id} className={!i.is_read ? 'bg-blue-50' : ''}>
                  <td className="px-4 py-3 text-gray-600">#{i.id}</td>
                  <td className="px-4 py-3">
                    {!i.is_read && <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2"></span>}
                    {i.subject}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{i.recipient_type}: {i.recipient_id}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${i.reply_body ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {i.reply_body ? 'Replied' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(i.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/inquiries/${i.id}`} className="text-blue-600 hover:underline text-sm">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
