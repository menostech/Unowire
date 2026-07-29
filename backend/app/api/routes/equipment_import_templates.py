import csv
import json
from io import StringIO

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import require_operator
from app.models.user import User

router = APIRouter()

CSV_TEMPLATE_HEADERS = [
    "id", "model", "slug", "manufacturer_id", "category_id",
    "description", "image_url", "external_url", "sort_order", "applicable_specs",
]

CSV_TEMPLATE_EXAMPLE = {
    "id": "em-1-transformer-100",
    "model": "Transformer 100",
    "slug": "transformer-100",
    "manufacturer_id": "em-1",
    "category_id": "power/transformers",
    "description": "100kVA distribution transformer",
    "image_url": "",
    "external_url": "",
    "sort_order": "0",
    "applicable_specs": '[{"spec_key":"power","label":"Power","allowed_values":["100kVA"]}]',
}


@router.get("/csv-template")
async def download_csv_template(user: User = Depends(require_operator("equipment_list"))):
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_TEMPLATE_HEADERS)
    writer.writeheader()
    writer.writerow(CSV_TEMPLATE_EXAMPLE)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=equipment-import-template.csv"},
    )


@router.get("/json-example")
async def download_json_example(user: User = Depends(require_operator("equipment_list"))):
    example = [
        {
            "id": "em-1-transformer-100",
            "model": "Transformer 100",
            "slug": "transformer-100",
            "manufacturer_id": "em-1",
            "category_id": "power/transformers",
            "description": "100kVA distribution transformer",
            "image_url": None,
            "external_url": None,
            "sort_order": 0,
            "applicable_specs": [
                {"spec_key": "power", "label": "Power", "allowed_values": ["100kVA"]}
            ],
        }
    ]
    content = json.dumps(example, indent=2)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=equipment-import-example.json"},
    )
