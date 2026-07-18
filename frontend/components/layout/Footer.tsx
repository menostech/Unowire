import Link from 'next/link';
import { Container } from './Container';
import { fetchSiteMenu } from '@/lib/api/siteMenu';

export async function Footer() {
  const tree = await fetchSiteMenu('footer');

  // Flatten: for groups, render children inline (footer does not use dropdowns)
  const flatLinks: { id: string; label: string; url: string }[] = [];
  for (const item of tree) {
    if (item.type === 'link' && item.url) {
      flatLinks.push({ id: item.id, label: item.label, url: item.url });
    } else if (item.type === 'group') {
      for (const child of item.children) {
        if (child.url) {
          flatLinks.push({ id: child.id, label: child.label, url: child.url });
        }
      }
    }
  }

  return (
    <footer className="border-t bg-gray-50 mt-auto">
      <Container className="py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
          <p>© {new Date().getFullYear()} Unowire. Cable specs database.</p>
          <nav className="flex gap-4">
            {flatLinks.map((l) => {
              const external = l.url.startsWith('http');
              return external ? (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-600"
                >
                  {l.label}
                </a>
              ) : (
                <Link key={l.id} href={l.url} className="hover:text-blue-600">
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
