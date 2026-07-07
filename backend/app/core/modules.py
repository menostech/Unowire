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
    {"id": "brands",          "label": "Brands",          "scope_aware": True,  "scope_type": "manufacturer"},
    {"id": "manufacturers",   "label": "Manufacturers",   "scope_aware": True,  "scope_type": "manufacturer"},
    {"id": "industries",      "label": "Industries",      "scope_aware": False, "scope_type": None},
    {"id": "equipment_mfrs",  "label": "Equipment Mfrs",  "scope_aware": True,  "scope_type": "equipment_manufacturer"},
    {"id": "equipment_cats",  "label": "Equipment Cats",  "scope_aware": False, "scope_type": None},
    {"id": "equipment_list",  "label": "Equipment List",  "scope_aware": True,  "scope_type": "equipment_manufacturer"},
    {"id": "media",           "label": "Media",           "scope_aware": False, "scope_type": None},
    {"id": "menu_config",     "label": "Menu Config",     "scope_aware": False, "scope_type": None},
    {"id": "users",           "label": "Users",           "scope_aware": False, "scope_type": None},
    {"id": "roles",           "label": "Roles",           "scope_aware": False, "scope_type": None},
]

MODULE_BY_ID = {m["id"]: m for m in ADMIN_MODULES}

VALID_MODULE_IDS = {m["id"] for m in ADMIN_MODULES}

# Modules that the 'admin' role must always retain (lockout protection).
ADMIN_PROTECTED_MODULES = {"users", "menu_config", "roles"}

# Valid scope_type values (null means global role, no scoping).
VALID_SCOPE_TYPES = {None, "manufacturer", "equipment_manufacturer"}
