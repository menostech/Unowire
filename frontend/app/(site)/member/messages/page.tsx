import { cookies } from 'next/headers';
import Link from 'next/link';

export default async function MemberMessagesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('member_token')?.value;

  const res = await fetch(
    `${process.env.INTERNAL_API_BASE || 'http://backend:8000'}/api/member/messages`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }
  );
  const data = res.ok ? await res.json() : { items: [] };

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">Messages</h1>
      {data.items.length === 0 ? (
        <p className="text-sm text-gray-500">No messages.</p>
      ) : (
        <div className="space-y-3">
          {data.items.map((m: any) => (
            <Link
              key={m.id}
              href={`/member/messages/${m.id}`}
              className={`block rounded border p-4 transition hover:shadow-sm ${
                !m.is_read
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className={`text-sm ${!m.is_read ? 'font-bold' : 'font-medium'}`}>
                    {m.title}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
                {!m.is_read && (
                  <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">
                    New
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
