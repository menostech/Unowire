import Link from 'next/link';
import { cookies } from 'next/headers';
import { Container } from './Container';
import { SearchBox } from '@/components/shared/SearchBox';
import { UnreadBadge } from '@/components/member/UnreadBadge';

export async function Nav() {
  const cookieStore = await cookies();
  const memberToken = cookieStore.get('member_token')?.value;

  const links = [
    { href: '/cables', label: 'Cables' },
    { href: '/manufacturers', label: 'Manufacturers' },
  ];

  return (
    <header className="border-b bg-white sticky top-0 z-50">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="text-xl font-bold text-gray-900 shrink-0">
          Unowire
        </Link>
        <nav className="flex gap-6">
          {links.map(l => (
            <Link key={l.href} href={l.href} className="text-gray-600 hover:text-blue-600 transition text-sm">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1 max-w-md">
          <SearchBox />
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {memberToken ? (
            <>
              <Link href="/member/inbox" className="relative text-gray-600 hover:text-blue-600 transition text-sm">
                Inbox
                <UnreadBadge />
              </Link>
              <Link href="/member/profile" className="text-gray-600 hover:text-blue-600 transition text-sm">
                My Account
              </Link>
              <form action="/api/member/auth/logout" method="POST">
                <button type="submit" className="text-gray-600 hover:text-blue-600 transition text-sm">
                  Logout
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/register" className="text-gray-600 hover:text-blue-600 transition text-sm">
                Register
              </Link>
              <Link href="/login" className="text-blue-600 hover:text-blue-800 transition text-sm font-medium">
                Login
              </Link>
            </>
          )}
        </div>
      </Container>
    </header>
  );
}
