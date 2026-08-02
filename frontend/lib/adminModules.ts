// Mirrors backend/app/core/modules.py ADMIN_MODULES.
// Keep in sync when adding new modules.

export interface AdminModule {
  id: string;
  label: string;
  scopeAware: boolean;
  scopeType: string | null;
}

export const ADMIN_MODULES: AdminModule[] = [
  { id: "dashboard",       label: "Dashboard",       scopeAware: false, scopeType: null },
  { id: "cables",          label: "Cables",          scopeAware: true,  scopeType: "manufacturer" },
  { id: "manufacturers",   label: "Manufacturers",   scopeAware: true,  scopeType: "manufacturer" },
  { id: "industries",      label: "Industries",      scopeAware: false, scopeType: null },
  { id: "equipment_mfrs",  label: "Equipment Mfrs",  scopeAware: true,  scopeType: "equipment_manufacturer" },
  { id: "equipment_cats",  label: "Equipment Cats",  scopeAware: false, scopeType: null },
  { id: "equipment_list",  label: "Equipment List",  scopeAware: true,  scopeType: "equipment_manufacturer" },
  { id: "terminal_mfrs",   label: "Terminal Mfrs",   scopeAware: true,  scopeType: "terminal_manufacturer" },
  { id: "terminal_cats",   label: "Terminal Cats",   scopeAware: false, scopeType: null },
  { id: "terminal_list",   label: "Terminal List",   scopeAware: true,  scopeType: "terminal_manufacturer" },
  { id: "media",           label: "Media",           scopeAware: false, scopeType: null },
  { id: "menu_config",     label: "Menu Config",     scopeAware: false, scopeType: null },
  { id: "users",           label: "Users",           scopeAware: false, scopeType: null },
  { id: "roles",           label: "Roles",           scopeAware: false, scopeType: null },
  { id: "inquiries",    label: "Inquiries",   scopeAware: true,  scopeType: null },
  { id: "email_config", label: "Email Config", scopeAware: false, scopeType: null },
  { id: "members",      label: "Members",      scopeAware: false, scopeType: null },
  { id: "pages",        label: "Pages",        scopeAware: false, scopeType: null },
  { id: "messages",     label: "Messages",      scopeAware: false, scopeType: null },
  { id: "resource_cats", label: "Resource Cats", scopeAware: false, scopeType: null },
  { id: "resource_list", label: "Resource List", scopeAware: true,  scopeType: null },
];

export const MODULE_BY_ID: Record<string, AdminModule> = Object.fromEntries(
  ADMIN_MODULES.map((m) => [m.id, m])
);

export const SCOPE_TYPE_LABELS: Record<string, string> = {
  manufacturer: "Cable Manufacturer",
  equipment_manufacturer: "Equipment Manufacturer",
  terminal_manufacturer: "Terminal Manufacturer",
};
