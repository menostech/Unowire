"""Portal public claim routes: manufacturer search and claim request submission.

These endpoints are public (no auth) so prospective manufacturers can search
for their brand and submit a claim request without logging in.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.claim import create_claim_request
from app.models.equipment import EquipmentManufacturer
from app.models.manufacturer import Manufacturer
from app.schemas.claim import ClaimRequestCreate

router = APIRouter(prefix="/api/portal/claim", tags=["portal-claim"])


@router.get("/search")
async def search_manufacturers(
    q: str = "",
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Public manufacturer search across cable and equipment manufacturers.

    Returns up to 10 matches per type (cable/equipment) for a combined max
    of 20 results. An empty query returns an empty list.
    """
    query = q.strip()
    if not query:
        return []

    pattern = f"%{query}%"

    cable_results = await db.execute(
        select(Manufacturer.id, Manufacturer.name, Manufacturer.slug)
        .where(Manufacturer.name.ilike(pattern))
        .limit(10)
    )
    equipment_results = await db.execute(
        select(EquipmentManufacturer.id, EquipmentManufacturer.name, EquipmentManufacturer.slug)
        .where(EquipmentManufacturer.name.ilike(pattern))
        .limit(10)
    )

    results: list[dict] = []
    for row in cable_results.all():
        results.append({"id": row[0], "name": row[1], "slug": row[2], "type": "cable"})
    for row in equipment_results.all():
        results.append({"id": row[0], "name": row[1], "slug": row[2], "type": "equipment"})
    return results


@router.post("", status_code=201)
async def create_claim(
    data: ClaimRequestCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public endpoint to submit a claim request for a manufacturer.

    Validates that the referenced manufacturer exists in the appropriate
    table (cable or equipment) before persisting the claim.
    """
    if data.manufacturer_type == "cable":
        result = await db.execute(
            select(Manufacturer.id).where(Manufacturer.id == data.manufacturer_id)
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=404,
                detail={"code": 404, "message": "Manufacturer not found"},
            )
    else:  # equipment
        result = await db.execute(
            select(EquipmentManufacturer.id).where(
                EquipmentManufacturer.id == data.manufacturer_id
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=404,
                detail={"code": 404, "message": "Manufacturer not found"},
            )

    claim = await create_claim_request(db, data)
    return {"id": str(claim.id)}
