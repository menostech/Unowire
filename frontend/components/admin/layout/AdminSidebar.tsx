'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Cable, Tag, Factory, ExternalLink, LogOut, FolderOpen, Image, Wrench } from 'lucide-react';

interface NavLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navLinks: NavLink[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/cables', label: 'Cables', icon: Cable },
  { href: '/admin/brands', label: 'Brands', icon: Tag },
  { href: '/admin/manufacturers', label: 'Manufacturers', icon: Factory },
  { href: '/admin/industries', label: 'Industries', icon: FolderOpen },
  { href: '/admin/equipment/manufacturers', label: 'Equipment Mfrs', icon: Wrench },
  { href: '/admin/equipment/categories', label: 'Equipment Cats', icon: Wrench },
  { href: '/admin/equipment', label: 'Equipment', icon: Wrench },
  { href: '/admin/media', label: 'Media', icon: Image },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch {
      // ignore — proceed to login regardless
    }
    router.push('/admin/login');
  }

  return (
    <aside className="sticky top-0 z-40 flex h-screen w-56 shrink-0 flex-col bg-gray-900 p-4 text-gray-100">
      <div className="mb-6 px-2 text-lg font-bold tracking-tight">
        Unowire <span className="text-gray-400">Admin</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                active ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
        >
          <ExternalLink className="size-4 shrink-0" />
          View Site
        </a>
      </nav>
      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
      >
        <LogOut className="size-4 shrink-0" />
        Logout
      </button>
    </aside>
  );
}
