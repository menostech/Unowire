"""Unit tests for cable Pydantic schemas (no DB, no HTTP)."""
from app.schemas.cable import PortalCableCreate


def test_portal_cable_create_accepts_optional_common_specs_and_variants():
    """PortalCableCreate accepts optional common_specs and variants fields.

    These fields are persisted via the admin spec-persistence pattern
    (explicit SpecItem / CableVariant creation), not via model_dump.
    """
    schema = PortalCableCreate(
        product_type_id="pt-1",
        industry_id="ind-1",
        category_id="cat-1",
        model="Spec Cable",
        slug="spec-cable",
        size_system="awg",
        common_specs=[
            {
                "spec_key": "voltage_rating",
                "label": "Voltage Rating",
                "value_string": "600V",
                "spec_type": "string",
                "filterable": True,
                "sort_order": 0,
            },
        ],
        variants=[
            {
                "slug": "red",
                "sort_order": 0,
                "specs": [
                    {
                        "spec_key": "color",
                        "label": "Color",
                        "value_string": "Red",
                        "spec_type": "string",
                        "sort_order": 0,
                    },
                ],
            },
        ],
    )
    # common_specs accepted and coerced to SpecItemCreate instances
    assert schema.common_specs is not None
    assert len(schema.common_specs) == 1
    assert schema.common_specs[0].spec_key == "voltage_rating"
    assert schema.common_specs[0].value_string == "600V"
    # variants accepted and coerced to CableVariantCreate instances
    assert schema.variants is not None
    assert len(schema.variants) == 1
    assert schema.variants[0].slug == "red"
    assert len(schema.variants[0].specs) == 1
    assert schema.variants[0].specs[0].spec_key == "color"


def test_portal_cable_create_defaults_spec_fields_to_none():
    """Omitting common_specs and variants defaults both to None."""
    schema = PortalCableCreate(
        product_type_id="pt-1",
        industry_id="ind-1",
        category_id="cat-1",
        model="Plain Cable",
        slug="plain-cable",
        size_system="awg",
    )
    assert schema.common_specs is None
    assert schema.variants is None
