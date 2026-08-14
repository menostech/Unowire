"""Admin module registry — single source of truth for available admin modules.

When adding a new module:
1. Add an entry here (backend)
2. Mirror it in frontend/lib/adminModules.ts
3. Add the module to the seed role_permissions for the 'admin' role
4. (If scoped) Add a scope_type + resolver in scope_resolvers.py
"""

ADMIN_MODULES = [
    {"id": "dashboard",       "label": "Dashboard",       "scope_aware": False, "scope_type": None},
    {"id": "cables",          "label": "Cables",          "scope_aware": True,  "scope_type": "manufacturer"},
    {"id": "manufacturers",   "label": "Manufacturers",   "scope_aware": True,  "scope_type": "manufacturer"},
    {"id": "industries",      "label": "Industries",      "scope_aware": False, "scope_type": None},
    {"id": "equipment_mfrs",  "label": "Equipment Mfrs",  "scope_aware": True,  "scope_type": "equipment_manufacturer"},
    {"id": "equipment_cats",  "label": "Equipment Cats",  "scope_aware": False, "scope_type": None},
    {"id": "equipment_list",  "label": "Equipment List",  "scope_aware": True,  "scope_type": "equipment_manufacturer"},
    {"id": "connectivity_mfrs",   "label": "Connectivity Mfrs",   "scope_aware": True,  "scope_type": "connectivity_manufacturer"},
    {"id": "connectivity_cats",   "label": "Connectivity Cats",   "scope_aware": False, "scope_type": None},
    {"id": "connectivity_list",   "label": "Connectivity List",   "scope_aware": True,  "scope_type": "connectivity_manufacturer"},
    {"id": "media",           "label": "Media",           "scope_aware": True,  "scope_type": None},
    {"id": "menu_config",     "label": "Menu Config",     "scope_aware": False, "scope_type": None},
    {"id": "users",           "label": "Users",           "scope_aware": False, "scope_type": None},
    {"id": "roles",           "label": "Roles",           "scope_aware": False, "scope_type": None},
    {"id": "inquiries",       "label": "Inquiries",       "scope_aware": True,  "scope_type": None},
    {"id": "email_config",    "label": "Email Config",    "scope_aware": False, "scope_type": None},
    {"id": "members",         "label": "Members",         "scope_aware": False, "scope_type": None},
    {"id": "pages",          "label": "Pages",           "scope_aware": False, "scope_type": None},
    {"id": "messages",         "label": "Messages",         "scope_aware": False, "scope_type": None},
    {"id": "claims",         "label": "Claims",         "scope_aware": False, "scope_type": None},
    {"id": "resource_cats",  "label": "Resource Cats",  "scope_aware": False, "scope_type": None},
    {"id": "resource_list",  "label": "Resource List",  "scope_aware": True,  "scope_type": None},
    {"id": "post_cats",       "label": "Post Cats",       "scope_aware": False, "scope_type": None},
    {"id": "post_list",       "label": "Post List",       "scope_aware": False, "scope_type": None},
    {"id": "plans",          "label": "Plans",          "scope_aware": False, "scope_type": None},
    {"id": "subscriptions",  "label": "Subscriptions",  "scope_aware": False, "scope_type": None},
]

# Backward-compat aliases: old terminal module ids → new connectivity ids.
MODULE_ID_ALIASES = {
    "terminal_mfrs": "connectivity_mfrs",
    "terminal_cats": "connectivity_cats",
    "terminal_list": "connectivity_list",
}

MODULE_BY_ID = {m["id"]: m for m in ADMIN_MODULES}
# Allow old terminal module ids to resolve to their connectivity equivalents.
for _old_id, _new_id in MODULE_ID_ALIASES.items():
    if _new_id in MODULE_BY_ID:
        MODULE_BY_ID[_old_id] = MODULE_BY_ID[_new_id]

VALID_MODULE_IDS = {m["id"] for m in ADMIN_MODULES} | set(MODULE_ID_ALIASES.keys())

# Modules that the 'admin' role must always retain (lockout protection).
ADMIN_PROTECTED_MODULES = {"users", "menu_config", "roles"}

# Backward-compat alias: old terminal_manufacturer scope_type → new connectivity_manufacturer.
SCOPE_TYPE_ALIASES = {"terminal_manufacturer": "connectivity_manufacturer"}

# Valid scope_type values (null means global role, no scoping).
VALID_SCOPE_TYPES = (
    {None, "manufacturer", "equipment_manufacturer", "connectivity_manufacturer"}
    | set(SCOPE_TYPE_ALIASES.keys())
)
