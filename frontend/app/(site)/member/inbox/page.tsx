import { cookies } from 'next/headers';
import Link from 'next/link';

export default async function InboxPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('member_token')?.value;

  const res = await fetch(`${process.env.INTERNAL_API_BASE || 'http://backend:8000'}/api/member/inquiries`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const inquiries = res.ok ? await res.json() : [];
  const repliedInquiries = inquiries.filter((i: any) => i.reply_body);

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Inbox</h1>
      {repliedInquiries.length === 0 ? (
        <p className="text-gray-500 text-sm">No replies yet.</p>
      ) : (
        <div className="space-y-3">
          {repliedInquiries.map((i: any) => (
            <Link
              key={i.id}
              href={`/member/inquiries/${i.id}`}
              className={`block border rounded p-4 hover:shadow-sm transition ${!i.is_member_read ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-sm">{i.subject}</p>
                  <p className="text-xs text-gray-500 mt-1">Reply: {i.reply_body.slice(0, 80)}...</p>
                </div>
                {!i.is_member_read && (
                  <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">New</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
