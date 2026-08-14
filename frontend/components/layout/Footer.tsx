import Link from 'next/link';
import { Container } from './Container';
import { fetchSiteMenu } from '@/lib/api/siteMenu';

export async function Footer() {
  const tree = await fetchSiteMenu('footer');

  const groups: { title: string; links: { id: string; label: string; url: string }[] }[] = [];
  const standaloneLinks: { id: string; label: string; url: string }[] = [];

  for (const item of tree) {
    if (item.type === 'link' && item.url) {
      standaloneLinks.push({ id: item.id, label: item.label, url: item.url });
    } else if (item.type === 'group') {
      const children = item.children
        .filter(c => c.url)
        .map(c => ({ id: c.id, label: c.label, url: c.url! }));
      if (children.length > 0) {
        groups.push({ title: item.label, links: children });
      }
    }
  }

  if (groups.length === 0 && standaloneLinks.length > 0) {
    groups.push({ title: 'Links', links: standaloneLinks });
  }

  return (
    <footer className="mt-auto border-t border-border bg-foreground text-background">
      <Container className="py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Brand column */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center group">
              <span
                className="text-2xl font-bold tracking-tight"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                <span className="text-primary">uno</span><span className="text-background">wire</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm text-background/60 leading-relaxed">
              The engineering reference for cable, equipment, and connectivity specifications.
            </p>
            <div className="mt-6 mono-label text-background/40">
              EST. 2024 · GLOBAL
            </div>
          </div>

          {/* Link groups */}
          {groups.slice(0, 3).map((group) => (
            <div key={group.title}>
              <h3 className="mono-label mb-4 text-background/50">
                {group.title}
              </h3>
              <ul className="space-y-2.5">
                {group.links.map((l) => {
                  const external = l.url.startsWith('http');
                  return (
                    <li key={l.id}>
                      {external ? (
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-background/70 transition hover:text-primary"
                        >
                          {l.label}
                        </a>
                      ) : (
                        <Link
                          href={l.url}
                          className="text-sm text-background/70 transition hover:text-primary"
                        >
                          {l.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-background/10 pt-6 md:flex-row">
          <p className="font-mono text-[12px] text-background/50">
            © {new Date().getFullYear()} UNOWIRE · ALL RIGHTS RESERVED
          </p>
          <nav className="flex flex-wrap gap-4">
            {standaloneLinks.slice(0, 4).map((l) => {
              const external = l.url.startsWith('http');
              return external ? (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[12px] text-background/60 transition hover:text-primary"
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.id}
                  href={l.url}
                  className="font-mono text-[12px] text-background/60 transition hover:text-primary"
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </Container>
    </footer>
  );
}