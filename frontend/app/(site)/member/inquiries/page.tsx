import { cookies } from 'next/headers';
import Link from 'next/link';

export default async function MyInquiriesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('member_token')?.value;

  const res = await fetch(`${process.env.INTERNAL_API_BASE || 'http://backend:8000'}/api/member/inquiries`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const inquiries = res.ok ? await res.json() : [];

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">My Inquiries</h1>
      {inquiries.length === 0 ? (
        <p className="text-gray-500 text-sm">You haven&apos;t sent any inquiries yet.</p>
      ) : (
        <div className="space-y-3">
          {inquiries.map((i: any) => (
            <Link
              key={i.id}
              href={`/member/inquiries/${i.id}`}
              className="block border border-gray-200 rounded p-4 hover:shadow-sm transition"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-sm">{i.subject}</p>
                  <p className="text-xs text-gray-500 mt-1">{i.body.slice(0, 80)}...</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-0.5 rounded ${i.reply_body ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {i.reply_body ? 'Replied' : 'Pending'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
