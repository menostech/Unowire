"""Scope validation: when assigning a user to a scoped role, validate scope_id exists.

To add a new scope type:
1. Add the scope_type value to VALID_SCOPE_TYPES in modules.py
2. Add a resolver function here that checks the target table for scope_id
3. Register it in SCOPE_RESOLVERS
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.equipment import EquipmentManufacturer
from app.models.manufacturer import Manufacturer


async def validate_manufacturer_exists(db: AsyncSession, scope_id: str) -> bool:
    result = await db.execute(
        select(Manufacturer.id).where(Manufacturer.id == scope_id)
    )
    return result.scalar_one_or_none() is not None


async def validate_equipment_manufacturer_exists(db: AsyncSession, scope_id: str) -> bool:
    result = await db.execute(
        select(EquipmentManufacturer.id).where(EquipmentManufacturer.id == scope_id)
    )
    return result.scalar_one_or_none() is not None


# scope_type → async validator function (returns True if scope_id is valid)
SCOPE_RESOLVERS = {
    "manufacturer": validate_manufacturer_exists,
    "equipment_manufacturer": validate_equipment_manufacturer_exists,
}


async def validate_scope_id(db: AsyncSession, scope_type: str | None, scope_id: str | None) -> bool:
    """Validate that scope_id is appropriate for the given scope_type.

    - scope_type=None: scope_id must be None (global role)
    - scope_type=<known>: scope_id must be a non-empty string that exists in the target table
    - scope_type=<unknown>: returns False (defensive)
    """
    if scope_type is None:
        return scope_id is None
    if scope_id is None or scope_id == "":
        return False
    resolver = SCOPE_RESOLVERS.get(scope_type)
    if resolver is None:
        return False
    return await resolver(db, scope_id)
