import Link from 'next/link';
import { Container } from './Container';
import { SearchBox } from '@/components/shared/SearchBox';

export function Nav() {
  const links = [
    { href: '/cables', label: 'Cables' },
    { href: '/manufacturers', label: 'Manufacturers' },
    { href: '/categories/automotive', label: 'Automotive' },
    { href: '/categories/consumer-electronics', label: 'Consumer Electronics' },
    { href: '/categories/industrial', label: 'Industrial' },
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
      </Container>
    </header>
  );
}
