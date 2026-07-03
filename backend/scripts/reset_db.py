"""Reset database schema for local dev."""
import asyncio
from sqlalchemy import text
from app.core.database import engine


async def run():
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE;"))
        await conn.execute(text("CREATE SCHEMA public;"))
    await engine.dispose()
    print("Schema reset done")


if __name__ == "__main__":
    asyncio.run(run())
