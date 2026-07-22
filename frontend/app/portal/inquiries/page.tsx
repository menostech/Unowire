import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';

export default async function PortalInquiriesPage() {
  let inquiries: any[] = [];
  try {
    inquiries = await portalApi.inquiries.all();
  } catch {
    // empty state
  }
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Inquiries</h1>
      {inquiries.length === 0 ? (
        <p className="text-sm text-gray-500">No inquiries yet.</p>
      ) : (
        <div className="space-y-3">
          {inquiries.map((inq) => (
            <Link
              key={inq.id}
              href={`/portal/inquiries/${inq.id}`}
              className="block rounded-lg bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm ${inq.is_read ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                  {inq.subject}
                </span>
                <span className="text-xs text-gray-400">
                  {inq.created_at ? new Date(inq.created_at).toLocaleDateString() : ''}
                </span>
              </div>
              {inq.body && (
                <p className="mt-1 truncate text-xs text-gray-500">{inq.body}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
