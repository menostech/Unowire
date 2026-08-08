import Link from 'next/link';

interface RecentInquiry {
  id: number;
  subject: string;
  created_at: string | null;
  is_read: boolean;
}

export function RecentInquiries({ inquiries }: { inquiries: RecentInquiry[] }) {
  if (inquiries.length === 0) {
    return (
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Recent Inquiries</h2>
        <p className="text-sm text-gray-500">No inquiries yet.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-gray-700">Recent Inquiries</h2>
      <ul className="divide-y divide-gray-100">
        {inquiries.map((inq) => (
          <li key={inq.id} className="py-3">
            <Link
              href={`/portal/inquiries/${inq.id}`}
              className="flex items-center justify-between hover:bg-gray-50"
            >
              <span className={`text-sm ${inq.is_read ? 'text-gray-600' : 'font-semibold text-gray-900'}`}>
                {inq.subject}
              </span>
              <span className="text-xs text-gray-400">
                {inq.created_at ? new Date(inq.created_at).toLocaleDateString() : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/portal/inquiries"
        className="mt-3 inline-block text-xs text-accent-foreground hover:underline"
      >
        View all →
      </Link>
    </div>
  );
}
