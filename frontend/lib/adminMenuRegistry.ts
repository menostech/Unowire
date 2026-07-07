export interface PageRegistryEntry {
  pageId: string;
  href: string;
  defaultLabel: string;
  defaultIcon: string;
}

export const ADMIN_PAGES: PageRegistryEntry[] = [
  { pageId: "dashboard",      href: "/admin",                              defaultLabel: "Dashboard",       defaultIcon: "LayoutDashboard" },
  { pageId: "cables",         href: "/admin/cables",                       defaultLabel: "Cables",           defaultIcon: "Cable" },
  { pageId: "brands",         href: "/admin/brands",                       defaultLabel: "Brands",           defaultIcon: "Tag" },
  { pageId: "manufacturers",  href: "/admin/manufacturers",                defaultLabel: "Manufacturers",    defaultIcon: "Factory" },
  { pageId: "industries",     href: "/admin/industries",                   defaultLabel: "Industries",       defaultIcon: "FolderOpen" },
  { pageId: "equipment-mfrs", href: "/admin/equipment/manufacturers",      defaultLabel: "Equipment Mfrs",   defaultIcon: "Wrench" },
  { pageId: "equipment-cats", href: "/admin/equipment/categories",         defaultLabel: "Equipment Cats",   defaultIcon: "Wrench" },
  { pageId: "equipment-list", href: "/admin/equipment",                    defaultLabel: "Equipment",        defaultIcon: "Wrench" },
  { pageId: "media",          href: "/admin/media",                        defaultLabel: "Media",            defaultIcon: "Image" },
  { pageId: "menu-config",    href: "/admin/menu",                         defaultLabel: "Menu Config",      defaultIcon: "Settings" },
];

export const PAGE_BY_ID: Record<string, PageRegistryEntry> = Object.fromEntries(
  ADMIN_PAGES.map((p) => [p.pageId, p])
);
