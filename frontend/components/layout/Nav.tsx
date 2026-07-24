import Link from 'next/link';
import { cookies } from 'next/headers';
import { Container } from './Container';
import { SearchBox } from '@/components/shared/SearchBox';
import { UnreadBadge } from '@/components/member/UnreadBadge';
import { fetchSiteMenu } from '@/lib/api/siteMenu';

export async function Nav() {
  const cookieStore = await cookies();
  const memberToken = cookieStore.get('member_token')?.value;

  const tree = await fetchSiteMenu('header');

  return (
    <header className="border-b bg-white sticky top-0 z-50">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="text-xl font-bold text-gray-900 shrink-0">
          Unowire
        </Link>
        <nav className="flex gap-6">
          {tree.map((item) => {
            if (item.type === 'group') {
              return (
                <div key={item.id} className="group relative">
                  <button
                    type="button"
                    className="text-gray-600 hover:text-blue-600 transition text-sm flex items-center gap-1"
                  >
                    {item.label}
                    <svg
                      className="size-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className="invisible absolute left-0 top-full z-50 min-w-[160px] rounded-md border border-gray-200 bg-white py-1 shadow-lg group-hover:visible">
                    {item.children.map((child) => {
                      if (!child.url) return null;
                      const external = child.url.startsWith('http');
                      return external ? (
                        <a
                          key={child.id}
                          href={child.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-blue-600"
                        >
                          {child.label}
                        </a>
                      ) : (
                        <Link
                          key={child.id}
                          href={child.url}
                          className="block px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-blue-600"
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }
            // type === 'link'
            if (!item.url) return null;
            const external = item.url.startsWith('http');
            return external ? (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-blue-600 transition text-sm"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.id}
                href={item.url}
                className="text-gray-600 hover:text-blue-600 transition text-sm"
              >
                {item.label}
              </Link>
            );
          })}
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
