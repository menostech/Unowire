import { Nav } from '@/components/layout/Nav';
import { Footer } from '@/components/layout/Footer';

// Layout for user-facing site routes. Nav/Footer live here (not in root layout)
// so that /admin/* routes render without the public site chrome.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
