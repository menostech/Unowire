import Link from 'next/link';
import { Container } from './Container';

export function Footer() {
  return (
    <footer className="border-t bg-gray-50 mt-auto">
      <Container className="py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
          <p>© {new Date().getFullYear()} Unowire. Cable specs database.</p>
          <nav className="flex gap-4">
            <Link href="/cables" className="hover:text-blue-600">Cables</Link>
            <Link href="/manufacturers" className="hover:text-blue-600">Manufacturers</Link>
            <Link href="/categories/automotive" className="hover:text-blue-600">Automotive</Link>
            <Link href="/categories/consumer-electronics" className="hover:text-blue-600">Consumer Electronics</Link>
          </nav>
        </div>
      </Container>
    </footer>
  );
}
