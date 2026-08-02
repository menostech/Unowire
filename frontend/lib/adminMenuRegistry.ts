export interface PageRegistryEntry {
  pageId: string;
  href: string;
  defaultLabel: string;
  defaultIcon: string;
}

export const ADMIN_PAGES: PageRegistryEntry[] = [
  { pageId: "dashboard",      href: "/admin",                              defaultLabel: "Dashboard",       defaultIcon: "LayoutDashboard" },
  { pageId: "cables",         href: "/admin/cables",                       defaultLabel: "Cables",           defaultIcon: "Cable" },
  { pageId: "manufacturers",  href: "/admin/manufacturers",                defaultLabel: "Manufacturers",    defaultIcon: "Factory" },
  { pageId: "industries",     href: "/admin/industries",                   defaultLabel: "Industries",       defaultIcon: "FolderOpen" },
  { pageId: "equipment-mfrs", href: "/admin/equipment/manufacturers",      defaultLabel: "Equipment Mfrs",   defaultIcon: "Wrench" },
  { pageId: "equipment-cats", href: "/admin/equipment/categories",         defaultLabel: "Equipment Cats",   defaultIcon: "Wrench" },
  { pageId: "equipment-list", href: "/admin/equipment",                    defaultLabel: "Equipment",        defaultIcon: "Wrench" },
  { pageId: "terminal-mfrs", href: "/admin/terminals/manufacturers",       defaultLabel: "Terminal Manufacturers", defaultIcon: "Wrench" },
  { pageId: "terminal-cats", href: "/admin/terminals/categories",          defaultLabel: "Terminal Categories",   defaultIcon: "Wrench" },
  { pageId: "terminals",     href: "/admin/terminals",                     defaultLabel: "Terminals",             defaultIcon: "Wrench" },
  { pageId: "media",          href: "/admin/media",                        defaultLabel: "Media",            defaultIcon: "Image" },
  { pageId: "menu-config",    href: "/admin/menu",                         defaultLabel: "Menu Config",      defaultIcon: "Settings" },
  { pageId: "users",          href: "/admin/users",                        defaultLabel: "Users",            defaultIcon: "Users" },
  { pageId: "roles",          href: "/admin/roles",                        defaultLabel: "Roles",            defaultIcon: "Shield" },
  { pageId: "inquiries",   href: "/admin/inquiries",                       defaultLabel: "Inquiries",    defaultIcon: "Mail" },
  { pageId: "email_config", href: "/admin/settings/email",                 defaultLabel: "Email Config", defaultIcon: "Mail" },
  { pageId: "members",      href: "/admin/members",                        defaultLabel: "Members",      defaultIcon: "Users" },
  { pageId: "pages",        href: "/admin/pages",                          defaultLabel: "Pages",        defaultIcon: "FileText" },
  { pageId: "site-menu",    href: "/admin/site-menu",                      defaultLabel: "Site Menu",    defaultIcon: "Menu" },
  { pageId: "messages",   href: "/admin/messages",                      defaultLabel: "Messages",      defaultIcon: "Megaphone" },
  { pageId: "claims",         href: "/admin/claims",                        defaultLabel: "Claims",           defaultIcon: "Shield" },
];

export const PAGE_BY_ID: Record<string, PageRegistryEntry> = Object.fromEntries(
  ADMIN_PAGES.map((p) => [p.pageId, p])
);
