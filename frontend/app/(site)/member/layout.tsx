import Link from 'next/link';
import { cookies } from 'next/headers';
import { MessagesUnreadBadge } from '@/components/member/MessagesUnreadBadge';

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('member_token')?.value;

  let member: { name: string; email: string } | null = null;
  if (token) {
    const res = await fetch(`${process.env.INTERNAL_API_BASE || 'http://backend:8000'}/api/member/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      member = await res.json();
    }
  }

  return (
    <div className="max-w-6xl mx-auto py-8 flex gap-8">
      <aside className="w-56 shrink-0">
        <div className="mb-6">
          <p className="font-semibold text-gray-900">{member?.name || 'Member'}</p>
          <p className="text-xs text-gray-500">{member?.email || ''}</p>
        </div>
        <nav className="space-y-1">
          <Link href="/member/inbox" className="block px-3 py-2 rounded hover:bg-gray-100 text-sm">
            Inbox
          </Link>
          <Link href="/member/inquiries" className="block px-3 py-2 rounded hover:bg-gray-100 text-sm">
            My Inquiries
          </Link>
          <Link
            href="/member/messages"
            className="flex items-center px-3 py-2 rounded hover:bg-gray-100 text-sm"
          >
            <span>Messages</span>
            <MessagesUnreadBadge />
          </Link>
          <Link href="/member/profile" className="block px-3 py-2 rounded hover:bg-gray-100 text-sm">
            Profile
          </Link>
        </nav>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
