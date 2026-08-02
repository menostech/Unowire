'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Cable, Wrench, Mail, Image as ImageIcon, Megaphone,
  Settings, LogOut, ExternalLink, type LucideIcon,
} from 'lucide-react';
import type { PortalUser } from '@/lib/types/portal';
import { PortalMessagesUnreadBadge } from '@/components/portal/PortalMessagesUnreadBadge';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  module: string;
}

const MANUFACTURER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/portal', icon: LayoutDashboard, module: 'dashboard' },
  { label: 'Cables', href: '/portal/cables', icon: Cable, module: 'cables' },
  { label: 'Inquiries', href: '/portal/inquiries', icon: Mail, module: 'inquiries' },
  { label: 'Messages', href: '/portal/messages', icon: Megaphone, module: 'messages' },
  { label: 'Media', href: '/portal/media', icon: ImageIcon, module: 'media' },
  { label: 'Settings', href: '/portal/settings', icon: Settings, module: 'me' },
];

const EQUIPMENT_MANUFACTURER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/portal', icon: LayoutDashboard, module: 'dashboard' },
  { label: 'Equipment', href: '/portal/equipment', icon: Wrench, module: 'equipment' },
  { label: 'Inquiries', href: '/portal/inquiries', icon: Mail, module: 'inquiries' },
  { label: 'Messages', href: '/portal/messages', icon: Megaphone, module: 'messages' },
  { label: 'Media', href: '/portal/media', icon: ImageIcon, module: 'media' },
  { label: 'Settings', href: '/portal/settings', icon: Settings, module: 'me' },
];

const TERMINAL_MANUFACTURER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/portal', icon: LayoutDashboard, module: 'dashboard' },
  { label: 'Terminals', href: '/portal/terminals', icon: Wrench, module: 'terminals' },
  { label: 'Inquiries', href: '/portal/inquiries', icon: Mail, module: 'inquiries' },
  { label: 'Messages', href: '/portal/messages', icon: Megaphone, module: 'messages' },
  { label: 'Media', href: '/portal/media', icon: ImageIcon, module: 'media' },
  { label: 'Settings', href: '/portal/settings', icon: Settings, module: 'me' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/portal') return pathname === '/portal';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PortalSidebar({
  user,
  allowedModules,
}: {
  user: PortalUser | null;
  allowedModules: string[];
}) {
  const pathname = usePathname();
  const [unread, setUnread] = useState<number | null>(null);

  const scopeType = user?.scope_type ?? null;
  const baseNav =
    scopeType === 'equipment_manufacturer'
      ? EQUIPMENT_MANUFACTURER_NAV
      : scopeType === 'terminal_manufacturer'
        ? TERMINAL_MANUFACTURER_NAV
        : MANUFACTURER_NAV;
  const nav = baseNav.filter((item) => allowedModules.includes(item.module));

  useEffect(() => {
    let cancelled = false;
    async function fetchUnread() {
      try {
        const res = await fetch('/api/portal/inquiries/unread-count');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.count === 'number') setUnread(data.count);
      } catch {
        // best-effort
      }
    }
    fetchUnread();
    return () => { cancelled = true; };
  }, [pathname]);

  async function handleLogout() {
    try {
      await fetch('/api/portal/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    // Full page reload ensures server-side layout re-evaluates auth state,
    // preventing the sidebar from persisting on the login page.
    window.location.href = '/portal/login';
  }

  return (
    <aside className="sticky top-0 z-40 flex h-screen w-[268px] shrink-0 flex-col bg-blue-900 p-4 text-blue-100">
      <div className="mb-6 px-2 text-lg font-bold tracking-tight">
        Unowire <span className="text-blue-300">Portal</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                active
                  ? 'bg-blue-800 text-white'
                  : 'text-blue-100 hover:bg-blue-800 hover:text-white'
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.module === 'inquiries' && unread !== null && unread > 0 && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                  {unread}
                </span>
              )}
              {item.module === 'messages' && <PortalMessagesUnreadBadge />}
            </Link>
          );
        })}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-blue-100 transition hover:bg-blue-800 hover:text-white"
        >
          <ExternalLink className="size-4 shrink-0" />
          View Site
        </a>
      </nav>
      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-blue-100 transition hover:bg-blue-800 hover:text-white"
      >
        <LogOut className="size-4 shrink-0" />
        Logout
      </button>
    </aside>
  );
}
