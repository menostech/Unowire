import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function MemberMessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('member_token')?.value;

  const res = await fetch(
    `${process.env.INTERNAL_API_BASE || 'http://backend:8000'}/api/member/messages/${id}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }
  );
  if (res.status === 404) notFound();
  if (!res.ok) {
    return (
      <div>
        <p className="text-sm text-red-600">Failed to load message.</p>
        <Link href="/member/messages" className="mt-4 inline-block text-sm text-accent-foreground hover:underline">
          ← Back to messages
        </Link>
      </div>
    );
  }
  const message = await res.json();

  return (
    <div>
      <Link
        href="/member/messages"
        className="mb-4 inline-block text-sm text-accent-foreground hover:underline"
      >
        ← Back to messages
      </Link>
      <h1 className="text-xl font-bold">{message.title}</h1>
      <p className="mt-1 text-xs text-gray-500">
        {new Date(message.created_at).toLocaleString()}
      </p>
      <div className="mt-6 whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-4 text-sm">
        {message.body}
      </div>
    </div>
  );
}
