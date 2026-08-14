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
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      {/* Top utility strip — mono technical annotation */}
      <div className="border-b border-border bg-foreground text-background">
        <Container className="flex h-7 items-center justify-between text-[11px]">
          <span className="mono-label opacity-70">
            SPECS DATABASE · v3.0
          </span>
          <span className="mono-label hidden sm:block opacity-70">
            ENGINEERING REFERENCE
          </span>
        </Container>
      </div>

      <Container className="flex h-16 items-center justify-between gap-6">
        {/* Logo — wordmark: uno (red) + wire (black) */}
        <Link href="/" className="flex items-center shrink-0 group">
          <span className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
            <span className="text-primary">uno</span><span className="text-foreground">wire</span>
          </span>
        </Link>

        {/* Primary nav */}
        <nav className="hidden lg:flex items-center gap-0.5">
          {tree.map((item) => {
            if (item.type === 'group') {
              return (
                <div key={item.id} className="group relative">
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  >
                    {item.label}
                    <svg className="size-3.5 opacity-50 transition group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className="invisible absolute left-0 top-full z-50 min-w-[220px] rounded-lg border border-border bg-popover p-1.5 shadow-lg opacity-0 translate-y-1 transition-all group-hover:visible group-hover:opacity-100 group-hover:translate-y-0">
                    <div className="mono-label px-2 py-1.5 text-muted-foreground/60">
                      {item.label}
                    </div>
                    {item.children.map((child) => {
                      if (!child.url) return null;
                      const external = child.url.startsWith('http');
                      return external ? (
                        <a
                          key={child.id}
                          href={child.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-md px-2.5 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                        >
                          {child.label}
                        </a>
                      ) : (
                        <Link
                          key={child.id}
                          href={child.url}
                          className="block rounded-md px-2.5 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }
            if (!item.url) return null;
            const external = item.url.startsWith('http');
            return external ? (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.id}
                href={item.url}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Search */}
        <div className="hidden md:block flex-1 max-w-xl">
          <SearchBox />
        </div>

        {/* Auth actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {memberToken ? (
            <>
              <Link
                href="/member/inbox"
                className="relative rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                Inbox
                <UnreadBadge />
              </Link>
              <Link
                href="/member/profile"
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                Account
              </Link>
              <form action="/api/member/auth/logout" method="POST">
                <button
                  type="submit"
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  Logout
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/pricing"
                className="hidden sm:block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                Pricing
              </Link>
              <Link
                href="/register"
                className="hidden sm:block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                Register
              </Link>
              <Link
                href="/login"
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </Container>
    </header>
  );
}
