"""Seed portal test users for local development.

Creates cable_manager@test.com and equip_manager@test.com with password
test123456, idempotent. Run inside the backend container:
    docker exec unowire-backend-1 python scripts/seed_portal_users.py
"""
import asyncio

from sqlalchemy import text

from app.core.database import engine
from app.core.security import hash_password
from app.crud.folder import crud_folder


async def _seed() -> None:
    async with engine.begin() as conn:
        # cable_manager@test.com (manufacturer scope)
        await conn.execute(
            text(
                "INSERT INTO roles (id, name, scope_type, is_system) "
                "VALUES ('cable_manager_test', 'Cable Manager Test', 'manufacturer', false) "
                "ON CONFLICT (id) DO NOTHING"
            )
        )
        for mod in ("media", "manufacturers"):
            await conn.execute(
                text(
                    "INSERT INTO role_permissions (role_id, module) "
                    "VALUES ('cable_manager_test', :mod) ON CONFLICT DO NOTHING"
                ),
                {"mod": mod},
            )
        await conn.execute(
            text(
                "INSERT INTO users (email, password_hash, role_id, scope_id, is_active, created_at, updated_at) "
                "VALUES ('cable_manager@test.com', :ph, 'cable_manager_test', 'mfr-1', true, NOW(), NOW()) "
                "ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash"
            ),
            {"ph": hash_password("test123456")},
        )

        # equip_manager@test.com (equipment_manufacturer scope)
        await conn.execute(
            text(
                "INSERT INTO roles (id, name, scope_type, is_system) "
                "VALUES ('equip_manager_test', 'Equipment Manager Test', 'equipment_manufacturer', false) "
                "ON CONFLICT (id) DO NOTHING"
            )
        )
        for mod in ("media", "equipment_mfrs"):
            await conn.execute(
                text(
                    "INSERT INTO role_permissions (role_id, module) "
                    "VALUES ('equip_manager_test', :mod) ON CONFLICT DO NOTHING"
                ),
                {"mod": mod},
            )
        await conn.execute(
            text(
                "INSERT INTO users (email, password_hash, role_id, scope_id, is_active, created_at, updated_at) "
                "VALUES ('equip_manager@test.com', :ph, 'equip_manager_test', 'em-1', true, NOW(), NOW()) "
                "ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash"
            ),
            {"ph": hash_password("test123456")},
        )

    # Ensure media folders exist for both scopes (idempotent)
    from app.core.database import async_session

    async with async_session() as s:
        await crud_folder.ensure_default(s, scope_type="manufacturer", scope_id="mfr-1")
        await crud_folder.ensure_default(s, scope_type="equipment_manufacturer", scope_id="em-1")
        await s.commit()

    print("Portal test users seeded successfully:")
    print("  cable_manager@test.com / test123456 (manufacturer scope, mfr-1)")
    print("  equip_manager@test.com / test123456 (equipment_manufacturer scope, em-1)")


if __name__ == "__main__":
    asyncio.run(_seed())
