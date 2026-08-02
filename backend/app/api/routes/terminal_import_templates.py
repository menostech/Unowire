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
    "id": "tm-1-compression-lug-100",
    "model": "Compression Lug 100",
    "slug": "compression-lug-100",
    "manufacturer_id": "tm-1",
    "category_id": "lugs/compression-lugs",
    "description": "Copper compression lug for 100mm² cable",
    "image_url": "",
    "external_url": "",
    "sort_order": "0",
    "applicable_specs": '[{"spec_key":"cross_section","label":"Cross Section","allowed_values":["100mm²"]}]',
}


@router.get("/csv-template")
async def download_csv_template(user: User = Depends(require_operator("terminal_list"))):
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_TEMPLATE_HEADERS)
    writer.writeheader()
    writer.writerow(CSV_TEMPLATE_EXAMPLE)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=terminal-import-template.csv"},
    )


@router.get("/json-example")
async def download_json_example(user: User = Depends(require_operator("terminal_list"))):
    example = [
        {
            "id": "tm-1-compression-lug-100",
            "model": "Compression Lug 100",
            "slug": "compression-lug-100",
            "manufacturer_id": "tm-1",
            "category_id": "lugs/compression-lugs",
            "description": "Copper compression lug for 100mm² cable",
            "image_url": None,
            "external_url": None,
            "sort_order": 0,
            "applicable_specs": [
                {"spec_key": "cross_section", "label": "Cross Section", "allowed_values": ["100mm²"]}
            ],
        }
    ]
    content = json.dumps(example, indent=2)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=terminal-import-example.json"},
    )
