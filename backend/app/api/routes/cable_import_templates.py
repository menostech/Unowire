import json
from io import StringIO

import csv
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_admin

router = APIRouter()


CSV_TEMPLATE_HEADERS = [
    "id", "model", "slug", "brand_id", "industry_id",
    "category_id", "product_type_id", "size_system",
    "base_description", "meta_title", "meta_description", "category_ids",
]

CSV_TEMPLATE_EXAMPLE = {
    "id": "consumer_electronics_premium_hdmi_cable",
    "model": "Premium HDMI Cable 4K",
    "slug": "premium-hdmi-cable-4k",
    "brand_id": "sony",
    "industry_id": "consumer_electronics",
    "category_id": "consumer_electronics/internal_wiring",
    "product_type_id": "consumer_electronics/internal_wiring/electronic_wire",
    "size_system": "none",
    "base_description": "High-speed HDMI cable with Ethernet",
    "meta_title": "Premium HDMI Cable 4K - Sony",
    "meta_description": "High-speed HDMI cable supporting 4K resolution",
    "category_ids": '["consumer_electronics/internal_wiring"]',
}


@router.get("/csv-template")
async def download_csv_template(_: dict = Depends(get_current_admin)):
    """Return CSV template file (header + 1 example row)."""
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_TEMPLATE_HEADERS)
    writer.writeheader()
    writer.writerow(CSV_TEMPLATE_EXAMPLE)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=cable-import-template.csv"},
    )


@router.get("/json-example")
async def download_json_example(_: dict = Depends(get_current_admin)):
    """Return JSON example file (1 complete cable object with nested specs/variants)."""
    example = [
        {
            "id": "consumer_electronics_premium_hdmi",
            "model": "Premium HDMI Cable 4K",
            "slug": "premium-hdmi-cable-4k",
            "brand_id": "sony",
            "industry_id": "consumer_electronics",
            "category_id": "consumer_electronics/internal_wiring",
            "product_type_id": "consumer_electronics/internal_wiring/electronic_wire",
            "size_system": "none",
            "base_description": "High-speed HDMI cable with Ethernet",
            "meta_title": "Premium HDMI Cable 4K - Sony",
            "meta_description": "High-speed HDMI cable supporting 4K resolution",
            "category_ids": ["consumer_electronics/internal_wiring"],
            "common_specs": [
                {
                    "spec_key": "length",
                    "label": "Length",
                    "value_string": "2m",
                    "value_number": None,
                    "unit": "m",
                    "spec_type": "string",
                    "filterable": False,
                    "sort_order": 0,
                }
            ],
            "variants": [
                {
                    "slug": "2m",
                    "sort_order": 0,
                    "specs": [
                        {
                            "spec_key": "color",
                            "label": "Color",
                            "value_string": "Black",
                            "value_number": None,
                            "unit": None,
                            "spec_type": "string",
                            "filterable": False,
                            "sort_order": 0,
                        }
                    ],
                }
            ],
        }
    ]

    content = json.dumps(example, indent=2)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=cable-import-example.json"},
    )
