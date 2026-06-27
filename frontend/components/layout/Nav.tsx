import Link from 'next/link';
import { Container } from './Container';

export function Nav() {
  const links = [
    { href: '/cables', label: 'Cables' },
    { href: '/equipments', label: 'Equipment' },
    { href: '/manufacturers', label: 'Manufacturers' },
    { href: '/match', label: 'Match Tool' },
  ];
  return (
    <header className="border-b bg-white sticky top-0 z-50">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="text-xl font-bold text-gray-900">
          Unowire
        </Link>
        <nav className="flex gap-6">
          {links.map(l => (
            <Link key={l.href} href={l.href} className="text-gray-600 hover:text-blue-600 transition">
              {l.label}
            </Link>
          ))}
        </nav>
      </Container>
    </header>
  );
}
