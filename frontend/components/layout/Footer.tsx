import Link from 'next/link';
import { Container } from './Container';

export function Footer() {
  return (
    <footer className="border-t bg-gray-50 mt-12">
      <Container className="py-8">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="font-semibold mb-2">Unowire</h3>
            <p className="text-sm text-gray-600">Wire Harness Industry Directory</p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Directory</h3>
            <ul className="space-y-1 text-sm">
              <li><Link href="/cables" className="text-gray-600 hover:text-blue-600">Cables</Link></li>
              <li><Link href="/equipments" className="text-gray-600 hover:text-blue-600">Equipment</Link></li>
              <li><Link href="/manufacturers" className="text-gray-600 hover:text-blue-600">Manufacturers</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Tools</h3>
            <ul className="space-y-1 text-sm">
              <li><Link href="/match" className="text-gray-600 hover:text-blue-600">Equipment Match Tool</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t pt-4 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Unowire. Wire Harness Industry Directory.
        </div>
      </Container>
    </footer>
  );
}
