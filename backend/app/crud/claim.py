import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.claim_request import ClaimRequest
from app.models.equipment import EquipmentManufacturer
from app.models.manufacturer import Manufacturer
from app.schemas.claim import ClaimRequestCreate


async def create_claim_request(db: AsyncSession, data: ClaimRequestCreate) -> ClaimRequest:
    """Create a new claim request with status='pending'."""
    obj = ClaimRequest(**data.model_dump(), status="pending")
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def get_claim(db: AsyncSession, claim_id: uuid.UUID) -> ClaimRequest | None:
    """Get a single claim by id."""
    return await db.get(ClaimRequest, claim_id)


async def get_claims(
    db: AsyncSession,
    status: str | None = None,
) -> list[ClaimRequest]:
    """List all claims ordered by created_at desc. Optional status filter."""
    stmt = select(ClaimRequest).order_by(ClaimRequest.created_at.desc())
    if status is not None:
        stmt = stmt.where(ClaimRequest.status == status)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_claims_with_manufacturer(
    db: AsyncSession,
    status: str | None = None,
) -> list[tuple[ClaimRequest, str]]:
    """List claims with the related manufacturer name resolved.

    Returns a list of (claim, manufacturer_name) tuples ordered by
    created_at desc. Manufacturer name is resolved via a batch lookup per
    manufacturer_type: 'cable' -> manufacturers table, 'equipment' ->
    equipment_manufacturers table. If the referenced manufacturer has been
    deleted, manufacturer_name falls back to an empty string.
    """
    claims = await get_claims(db, status=status)

    cable_ids = {c.manufacturer_id for c in claims if c.manufacturer_type == "cable"}
    equipment_ids = {
        c.manufacturer_id for c in claims if c.manufacturer_type == "equipment"
    }

    names: dict[tuple[str, str], str] = {}
    if cable_ids:
        result = await db.execute(
            select(Manufacturer.id, Manufacturer.name).where(
                Manufacturer.id.in_(cable_ids)
            )
        )
        for row in result.all():
            names[("cable", row[0])] = row[1]
    if equipment_ids:
        result = await db.execute(
            select(EquipmentManufacturer.id, EquipmentManufacturer.name).where(
                EquipmentManufacturer.id.in_(equipment_ids)
            )
        )
        for row in result.all():
            names[("equipment", row[0])] = row[1]

    return [
        (claim, names.get((claim.manufacturer_type, claim.manufacturer_id), ""))
        for claim in claims
    ]


async def update_claim_status(
    db: AsyncSession,
    claim_id: uuid.UUID,
    status: str,
    reviewed_by: str,
) -> ClaimRequest | None:
    """Update claim status and set reviewed_by + reviewed_at = datetime.now(timezone.utc).
    Returns the updated claim, or None if not found.
    """
    claim = await db.get(ClaimRequest, claim_id)
    if claim is None:
        return None
    claim.status = status
    claim.reviewed_by = reviewed_by
    claim.reviewed_at = datetime.now(timezone.utc)
    db.add(claim)
    await db.commit()
    await db.refresh(claim)
    return claim
