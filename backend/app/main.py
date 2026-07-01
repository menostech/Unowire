from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import brands, cables, categories, equipment, health, industries, manufacturers, product_types, taxonomy
from app.core.config import settings

app = FastAPI(
    title="Unowire API",
    docs_url=f"{settings.api_prefix}/docs",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

# CORS for local dev only (production uses same-origin via Nginx)
if settings.debug:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:3001"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# Custom error handler for standardized error format
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"code": 500, "message": "Internal server error"},
    )


# Register routers
app.include_router(health.router, prefix=settings.api_prefix, tags=["health"])
app.include_router(manufacturers.router, prefix=f"{settings.api_prefix}/manufacturers", tags=["manufacturers"])
app.include_router(brands.router, prefix=f"{settings.api_prefix}/brands", tags=["brands"])
app.include_router(industries.router, prefix=f"{settings.api_prefix}/industries", tags=["industries"])
app.include_router(categories.router, prefix=f"{settings.api_prefix}/industries/{{industry_id}}/categories", tags=["categories"])
app.include_router(product_types.router, prefix=f"{settings.api_prefix}/industries/{{industry_id}}/categories/{{category_id}}/product-types", tags=["product-types"])
app.include_router(cables.router, prefix=f"{settings.api_prefix}/cables", tags=["cables"])
app.include_router(equipment.router, prefix=f"{settings.api_prefix}/recommended-equipments", tags=["recommended-equipments"])
app.include_router(taxonomy.router, prefix=f"{settings.api_prefix}/taxonomy", tags=["taxonomy"])
