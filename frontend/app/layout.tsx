import type { Metadata } from 'next';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Unowire — Cable Specs Database',
    template: '%s | Unowire',
  },
  description: 'Query cable specifications online. Browse cables by brand, category, and specs.',
  robots: { index: true, follow: true },
};

// Root layout — applies to ALL routes (site + admin + api).
// Nav/Footer live in the (site) route group layout so /admin/* renders
// without the public site chrome.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white text-gray-900">
        {children}
      </body>
    </html>
  );
}
