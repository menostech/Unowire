"""Create dev users for local debugging (admin + cable_manager + equipment_manager)."""
import asyncio
from app.core.database import async_session
from app.core.security import hash_password
from app.models.user import User

USERS = [
    {
        "email": "admin@unowire.com",
        "password": "admin123456",
        "role_id": "admin",
        "scope_id": None,
    },
    {
        "email": "cable_manager@test.com",
        "password": "test123456",
        "role_id": "cable_manager",
        "scope_id": "mfr-1",
    },
    {
        "email": "equip_manager@test.com",
        "password": "test123456",
        "role_id": "equipment_manager",
        "scope_id": "equip-mfr-1",
    },
]


async def main():
    async with async_session() as db:
        for u in USERS:
            from sqlalchemy import select

            existing = await db.execute(select(User).where(User.email == u["email"]))
            if existing.scalar_one_or_none() is not None:
                print(f"  = {u['email']} already exists, skipping")
                continue
            obj = User(
                email=u["email"],
                password_hash=hash_password(u["password"]),
                role_id=u["role_id"],
                scope_id=u["scope_id"],
                is_active=True,
            )
            db.add(obj)
            print(f"  + {u['email']} (role={u['role_id']}, scope={u['scope_id']})")
        await db.commit()
        print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
