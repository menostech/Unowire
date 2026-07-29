"""Admin claim routes: list, approve, and reject manufacturer claim requests."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.core.database import get_db
from app.crud.claim import get_claims_with_manufacturer, get_claim, update_claim_status
from app.models.user import User
from app.schemas.claim import ClaimRequestRead, ClaimRequestWithManufacturer

router = APIRouter(prefix="/api/admin/claims", tags=["admin-claims"])


@router.get("", response_model=list[ClaimRequestWithManufacturer])
async def list_claims(
    status: str | None = None,
    user: User = Depends(require_operator("claims")),
    db: AsyncSession = Depends(get_db),
):
    claims_with_names = await get_claims_with_manufacturer(db, status=status)
    result = []
    for claim, manufacturer_name in claims_with_names:
        # Validate against the base schema first (ORM has no manufacturer_name),
        # then construct the WithManufacturer variant with the resolved name.
        base = ClaimRequestRead.model_validate(claim)
        item = ClaimRequestWithManufacturer(
            **base.model_dump(), manufacturer_name=manufacturer_name
        )
        result.append(item)
    return result


@router.post("/{claim_id}/approve", response_model=ClaimRequestRead)
async def approve_claim(
    claim_id: uuid.UUID,
    user: User = Depends(require_operator("claims")),
    db: AsyncSession = Depends(get_db),
):
    claim = await get_claim(db, claim_id)
    if claim is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Claim not found"})
    if claim.status != "pending":
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Claim already processed"})
    updated = await update_claim_status(db, claim_id, status="approved", reviewed_by=str(user.id))
    return updated


@router.post("/{claim_id}/reject", response_model=ClaimRequestRead)
async def reject_claim(
    claim_id: uuid.UUID,
    user: User = Depends(require_operator("claims")),
    db: AsyncSession = Depends(get_db),
):
    claim = await get_claim(db, claim_id)
    if claim is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Claim not found"})
    if claim.status != "pending":
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Claim already processed"})
    updated = await update_claim_status(db, claim_id, status="rejected", reviewed_by=str(user.id))
    return updated
