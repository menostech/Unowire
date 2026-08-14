'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Cable, Tag, Factory, FolderOpen, Image,
  Wrench, Settings, ExternalLink, LogOut, Circle,
  ChevronDown, ChevronRight, Users, Shield, Menu,
  Mail, FileText, List, Megaphone,
  type LucideIcon,
} from 'lucide-react';
import { ADMIN_PAGES, PAGE_BY_ID } from '@/lib/adminMenuRegistry';
import type { MenuItemTree } from '@/lib/types';

// Fallback icon mapping for sidebar rendering.
const FALLBACK_ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Cable, Tag, Factory, FolderOpen, Image, Wrench, Settings,
  Users, Shield, Menu, Mail, FileText, List, Megaphone,
};

function getIcon(name: string | null): LucideIcon {
  if (!name) return Circle;
  // Try the fallback map first (covers all seed icons).
  if (FALLBACK_ICONS[name]) return FALLBACK_ICONS[name];
  // For other lucide icons, we'd need a dynamic import. For MVP, fall back.
  return Circle;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Map a menu item's page_id (kebab-case, e.g. 'equipment-mfrs') to the
// RBAC module ID (snake_case, e.g. 'equipment_mfrs') used by allowed_modules.
const PAGE_ID_TO_MODULE_ID: Record<string, string> = {
  dashboard: 'dashboard',
  cables: 'cables',
  manufacturers: 'manufacturers',
  industries: 'industries',
  'connectivity-mfrs': 'connectivity_mfrs',
  'connectivity-cats': 'connectivity_cats',
  'connectivity': 'connectivity_list',
  'equipment-mfrs': 'equipment_mfrs',
  'equipment-cats': 'equipment_cats',
  'equipment-list': 'equipment_list',
  media: 'media',
  'menu-config': 'menu_config',
  users: 'users',
  roles: 'roles',
  pages: 'pages',
  'site-menu': 'menu_config',
  claims: 'claims',
  'resources-list': 'resource_list',
  'resources-cats': 'resource_cats',
  'posts-list': 'post_list',
  'posts-cats': 'post_cats',
  plans: 'plans',
  subscriptions: 'subscriptions',
};

function filterTreeByPermissions(
  tree: MenuItemTree[],
  allowed: Set<string>
): MenuItemTree[] {
  const result: MenuItemTree[] = [];
  for (const item of tree) {
    if (item.type === 'group') {
      // Keep a group only if at least one of its children is allowed.
      const allowedChildren = (item.children ?? []).filter((child) => {
        if (child.type === 'page' && child.page_id) {
          const moduleId = PAGE_ID_TO_MODULE_ID[child.page_id] ?? child.page_id;
          return allowed.has(moduleId);
        }
        // Links and sub-groups without page_id are always shown.
        return true;
      });
      if (allowedChildren.length > 0) {
        result.push({ ...item, children: allowedChildren });
      }
    } else if (item.type === 'page' && item.page_id) {
      const moduleId = PAGE_ID_TO_MODULE_ID[item.page_id] ?? item.page_id;
      if (allowed.has(moduleId)) {
        result.push(item);
      }
    } else {
      // Links and other types: always show.
      result.push(item);
    }
  }
  return result;
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [tree, setTree] = useState<MenuItemTree[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function fetchTree() {
      try {
        const [treeRes, permsRes] = await Promise.all([
          fetch('/api/admin/menu/tree'),
          fetch('/api/admin/auth/me/permissions'),
        ]);
        if (!treeRes.ok) throw new Error('tree fetch failed');
        const data: MenuItemTree[] = await treeRes.json();
        // Permissions fetch is best-effort: if it fails, fall back to showing
        // all menu items (the backend will still enforce auth on each route).
        let allowedModules: Set<string> | null = null;
        if (permsRes.ok) {
          const perms = await permsRes.json();
          if (Array.isArray(perms?.allowed_modules)) {
            allowedModules = new Set(perms.allowed_modules);
          }
        }
        if (cancelled) return;
        const filtered = allowedModules
          ? filterTreeByPermissions(data, allowedModules)
          : data;
        setTree(filtered);
        // Auto-expand groups whose children match the current path.
        const initialOpen = new Set<string>();
        for (const item of filtered) {
          if (item.type === 'group' && item.children) {
            for (const child of item.children) {
              if (child.type === 'page' && child.page_id) {
                const href = PAGE_BY_ID[child.page_id]?.href;
                if (href && isActive(pathname, href)) {
                  initialOpen.add(item.id);
                  break;
                }
              }
            }
          }
        }
        setOpenGroups(initialOpen);
      } catch {
        // Fallback: build a minimal tree from ADMIN_PAGES constant.
        if (cancelled) return;
        const fallback: MenuItemTree[] = ADMIN_PAGES.map((p, idx) => ({
          id: p.pageId,
          parent_id: null,
          type: 'page' as const,
          page_id: p.pageId,
          url: null,
          label: p.defaultLabel,
          icon: p.defaultIcon,
          sort_order: idx,
          is_visible: true,
          created_at: '',
          updated_at: '',
          children: [],
        }));
        setTree(fallback);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTree();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function handleLogout() {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch {
      // ignore — proceed to login regardless
    }
    router.push('/admin/login');
  }

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function renderItem(item: MenuItemTree) {
    const Icon = getIcon(item.icon);

    if (item.type === 'group') {
      const isOpen = openGroups.has(item.id);
      const childActive = (item.children ?? []).some((c) => {
        if (c.type === 'page' && c.page_id) {
          const href = PAGE_BY_ID[c.page_id]?.href;
          return href ? isActive(pathname, href) : false;
        }
        return false;
      });
      return (
        <div key={item.id}>
          <button
            type="button"
            onClick={() => toggleGroup(item.id)}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
              childActive
                ? 'bg-gray-800 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            {isOpen ? (
              <ChevronDown className="size-3 shrink-0" />
            ) : (
              <ChevronRight className="size-3 shrink-0" />
            )}
          </button>
          {isOpen && (item.children ?? []).length > 0 && (
            <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-gray-700 pl-2">
              {item.children.map((child) => renderItem(child as MenuItemTree))}
            </div>
          )}
        </div>
      );
    }

    // page or link
    let href: string | null = null;
    let external = false;
    if (item.type === 'page' && item.page_id) {
      href = PAGE_BY_ID[item.page_id]?.href ?? null;
    } else if (item.type === 'link' && item.url) {
      href = item.url;
      external = href.startsWith('http');
    }

    if (!href) return null;

    const active = !external && isActive(pathname, href);

    if (external) {
      return (
        <a
          key={item.id}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
        >
          <Icon className="size-4 shrink-0" />
          {item.label}
          <ExternalLink className="ml-auto size-3 shrink-0 text-gray-500" />
        </a>
      );
    }

    return (
      <Link
        key={item.id}
        href={href}
        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
          active
            ? 'bg-gray-800 text-white'
            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
        }`}
      >
        <Icon className="size-4 shrink-0" />
        {item.label}
      </Link>
    );
  }

  return (
    <aside className="sticky top-0 z-40 flex h-screen w-[268px] shrink-0 flex-col bg-gray-900 p-4 text-gray-100">
      <div className="mb-6 px-2 text-lg font-bold tracking-tight">
        <span className="text-red-600">uno</span><span className="text-gray-100">wire</span> <span className="text-gray-400">Admin</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {loading ? (
          <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>
        ) : (
          (tree ?? []).map((item) => renderItem(item))
        )}
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
