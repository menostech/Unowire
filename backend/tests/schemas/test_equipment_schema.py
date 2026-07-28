"""Unit tests for equipment Pydantic schemas (no DB, no HTTP)."""
from app.schemas.equipment import PortalEquipmentCreate


def test_portal_equipment_create_accepts_optional_applicable_specs():
    """PortalEquipmentCreate accepts an optional applicable_specs field.

    `applicable_specs` is a plain JSONB column on RecommendedEquipment, so it
    flows through EquipmentModel(**data) without explicit handling.
    """
    schema = PortalEquipmentCreate(
        category_id="cat-1",
        model="Spec Equipment",
        slug="spec-equipment",
        applicable_specs=[
            {"spec_key": "conductor_area", "min": 0.1, "max": 1.0},
        ],
    )
    assert schema.applicable_specs is not None
    assert len(schema.applicable_specs) == 1
    assert schema.applicable_specs[0]["spec_key"] == "conductor_area"
    assert schema.applicable_specs[0]["min"] == 0.1
    assert schema.applicable_specs[0]["max"] == 1.0


def test_portal_equipment_create_defaults_applicable_specs_to_none():
    """Omitting applicable_specs defaults it to None (preserves existing on PUT via exclude_unset)."""
    schema = PortalEquipmentCreate(
        category_id="cat-1",
        model="Plain Equipment",
        slug="plain-equipment",
    )
    assert schema.applicable_specs is None
