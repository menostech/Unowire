from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.taxonomy import crud_industry
from app.schemas.taxonomy import IndustryRead

router = APIRouter()


@router.get("", response_model=list[IndustryRead])
async def get_taxonomy_tree(db: AsyncSession = Depends(get_db)):
    return await crud_industry.get_all_with_children(db)
