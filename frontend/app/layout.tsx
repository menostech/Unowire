import type { Metadata } from 'next';
import { Sora, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-sora',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex-sans',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-plex-mono',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Unowire — Cable Specs Database',
    template: '%s | Unowire',
  },
  description: 'Query cable specifications online. Browse cables by manufacturer, category, and specs.',
  robots: { index: true, follow: true },
};

// Root layout — applies to ALL routes (site + admin + api).
// Nav/Footer live in the (site) route group layout so /admin/* renders
// without the public site chrome.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen flex flex-col bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
