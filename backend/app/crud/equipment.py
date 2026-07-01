from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.cable import Cable, SpecItem
from app.models.equipment import RecommendedEquipment
from app.schemas.equipment import RecommendedEquipmentCreate, RecommendedEquipmentUpdate


class CRUDEquipment(CRUDBase[RecommendedEquipment, RecommendedEquipmentCreate, RecommendedEquipmentUpdate]):
    async def get_matching_cable(self, db: AsyncSession, cable_id: str) -> list[RecommendedEquipment]:
        """Run rules engine: find equipment whose applicable_specs match cable's specs."""
        # Get cable's variant specs
        spec_stmt = select(SpecItem).where(
            SpecItem.cable_id == cable_id,
            SpecItem.variant_id.isnot(None),
        )
        spec_result = await db.execute(spec_stmt)
        specs = list(spec_result.scalars().all())

        # Build a lookup: spec_key -> list of values
        spec_values: dict[str, list[float | str]] = {}
        for s in specs:
            if s.spec_key not in spec_values:
                spec_values[s.spec_key] = []
            if s.value_number is not None:
                spec_values[s.spec_key].append(s.value_number)
            if s.value_string is not None:
                spec_values[s.spec_key].append(s.value_string)

        # Check each equipment
        eq_stmt = select(RecommendedEquipment)
        eq_result = await db.execute(eq_stmt)
        all_equipment = list(eq_result.scalars().all())

        matched = []
        for eq in all_equipment:
            rules = eq.applicable_specs if isinstance(eq.applicable_specs, list) else []
            if not rules:
                continue
            all_match = True
            for rule in rules:
                key = rule.get("spec_key")
                if key not in spec_values:
                    all_match = False
                    break
                vals = spec_values[key]
                if "min" in rule or "max" in rule:
                    numeric_vals = [v for v in vals if isinstance(v, (int, float))]
                    if not numeric_vals:
                        all_match = False
                        break
                    if "min" in rule and not any(v >= rule["min"] for v in numeric_vals):
                        all_match = False
                        break
                    if "max" in rule and not any(v <= rule["max"] for v in numeric_vals):
                        all_match = False
                        break
                if "allowed_values" in rule:
                    if not any(str(v) in rule["allowed_values"] for v in vals):
                        all_match = False
                        break
            if all_match:
                matched.append(eq)

        return matched


crud_equipment = CRUDEquipment(RecommendedEquipment)
