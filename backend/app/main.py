import logging
import mimetypes

from fastapi import FastAPI, HTTPException as FastAPIHTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError

from app.api.routes import auth, cable_import, cable_import_templates, cables, categories, equipment, equipment_categories, equipment_manufacturers, folders, health, industries, manufacturers, pages, product_types, taxonomy, uploads, site_menu, admin_menu, admin_roles, admin_users, member, admin_inquiries, admin_email, admin_members, admin_messages, portal_auth, page_views, portal_dashboard, portal_cables, portal_cable_import, portal_equipment, portal_inquiries, portal_media, portal_messages
from app.core.config import settings
from app.schemas.common import ValidationErrorDetail, ValidationErrorResponse

# Ensure modern image MIME types are recognized (some base images lack .webp)
mimetypes.add_type("image/webp", ".webp")

logger = logging.getLogger(__name__)

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
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"code": 500, "message": "Internal server error"},
    )


@app.exception_handler(FastAPIHTTPException)
async def http_exception_handler(request: Request, exc: FastAPIHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.detail if isinstance(exc.detail, dict) else {"code": exc.status_code, "message": str(exc.detail)},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    details = []
    for error in exc.errors():
        details.append(ValidationErrorDetail(
            loc=error.get("loc", []),
            msg=error.get("msg", ""),
            type=error.get("type", ""),
        ))
    return JSONResponse(
        status_code=422,
        content=ValidationErrorResponse(
            code=422,
            message="Validation error",
            details=details,
        ).model_dump(),
    )


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    logger.warning("Integrity constraint violation: %s", exc.orig)
    return JSONResponse(
        status_code=409,
        content={"code": 409, "message": "Resource already exists or violates a constraint"},
    )


# Register routers
app.include_router(auth.router)
app.include_router(health.router, prefix=settings.api_prefix, tags=["health"])
app.include_router(manufacturers.router, prefix=f"{settings.api_prefix}/manufacturers", tags=["manufacturers"])
app.include_router(industries.router, prefix=f"{settings.api_prefix}/industries", tags=["industries"])
app.include_router(categories.router, prefix=f"{settings.api_prefix}/industries/{{industry_id}}/categories", tags=["categories"])
app.include_router(product_types.router, prefix=f"{settings.api_prefix}/industries/{{industry_id}}/categories/{{category_id}}/product-types", tags=["product-types"])
app.include_router(cables.router, prefix=f"{settings.api_prefix}/cables", tags=["cables"])
app.include_router(equipment.router, prefix=f"{settings.api_prefix}/recommended-equipments", tags=["recommended-equipments"])
app.include_router(equipment_manufacturers.router, prefix=f"{settings.api_prefix}/equipment-manufacturers", tags=["equipment-manufacturers"])
app.include_router(equipment_categories.router, prefix=f"{settings.api_prefix}/equipment-categories", tags=["equipment-categories"])
app.include_router(admin_menu.router, prefix=f"{settings.api_prefix}/admin/menu", tags=["admin-menu"])
app.include_router(admin_roles.router, prefix=f"{settings.api_prefix}/admin/roles", tags=["admin-roles"])
app.include_router(admin_users.router, prefix=f"{settings.api_prefix}/admin/users", tags=["admin-users"])
app.include_router(taxonomy.router, prefix=f"{settings.api_prefix}/taxonomy", tags=["taxonomy"])
app.include_router(uploads.router, prefix=f"{settings.api_prefix}/uploads", tags=["uploads"])
app.include_router(folders.router, prefix=f"{settings.api_prefix}/admin/folders", tags=["folders"])
app.include_router(cable_import.router, prefix=f"{settings.api_prefix}/admin/cables/import", tags=["cable-import"])
app.include_router(cable_import_templates.router, prefix=f"{settings.api_prefix}/admin/cables/import", tags=["cable-import"])
app.include_router(member.router)
app.include_router(admin_inquiries.router)
app.include_router(admin_email.router)
app.include_router(admin_members.router)
app.include_router(admin_messages.router)
app.include_router(pages.router, prefix=f"{settings.api_prefix}/admin/pages", tags=["admin-pages"])
app.include_router(pages.public_router, prefix=f"{settings.api_prefix}/pages", tags=["public-pages"])
app.include_router(site_menu.admin_router, prefix=f"{settings.api_prefix}/admin/site-menu", tags=["admin-site-menu"])
app.include_router(site_menu.public_router, prefix=f"{settings.api_prefix}/site-menu", tags=["public-site-menu"])
app.include_router(portal_auth.router)
app.include_router(page_views.router)
app.include_router(portal_dashboard.router)
app.include_router(portal_cables.router)
app.include_router(portal_cable_import.router)
app.include_router(portal_equipment.router)
app.include_router(portal_inquiries.router)
app.include_router(portal_media.router)
app.include_router(portal_messages.router)

# Mount media directory for static file serving
media_dir = os.environ.get("MEDIA_DIR", "/app/media")
os.makedirs(os.path.join(media_dir, "uploads"), exist_ok=True)
app.mount("/media", StaticFiles(directory=media_dir), name="media")