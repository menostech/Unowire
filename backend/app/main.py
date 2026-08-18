import logging
import asyncio
from contextlib import asynccontextmanager
import mimetypes

from fastapi import FastAPI, HTTPException as FastAPIHTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError
import httpx
import stripe

from app.api.routes import auth, cable_import, cable_import_templates, cables, categories, equipment, equipment_categories, equipment_import, equipment_import_templates, equipment_manufacturers, terminals, terminal_categories, terminal_import, terminal_import_templates, terminal_manufacturers, folders, health, industries, manufacturers, pages, post, post_categories, plans, payments, product_types, taxonomy, uploads, site_menu, admin_menu, admin_orders, admin_roles, admin_users, member, member_subscription, admin_inquiries, admin_email, admin_members, admin_claims, admin_messages, resource, resource_categories, portal_auth, page_views, portal_dashboard, portal_cables, portal_cable_import, portal_claim, portal_equipment, portal_equipment_import, portal_terminals, portal_terminal_import, portal_inquiries, portal_media, portal_messages, portal_resource
from app.core.config import settings
from app.schemas.common import ValidationErrorDetail, ValidationErrorResponse
from app.services.payment import PaymentConfigError

# Ensure modern image MIME types are recognized (some base images lack .webp)
mimetypes.add_type("image/webp", ".webp")

logger = logging.getLogger(__name__)


async def _trial_expiry_loop():
    """Hourly bulk expiry of trialing/cancelled subscriptions past their end time.
    The primary mechanism is lazy expiry in resolve_effective_plan; this is a backup."""
    from app.core.database import async_session
    from app.services.subscription import SubscriptionService
    while True:
        try:
            async with async_session() as s:
                await SubscriptionService(s).expire_trials_batch()
        except Exception:
            logging.getLogger(__name__).exception("trial expiry loop failed")
        await asyncio.sleep(3600)


async def _renewal_loop():
    """Hourly reconciliation of paid subscriptions and grace-window expiry.

    The gateways (Stripe, PayPal) auto-renew; this loop reconciles local
    state with the gateway to catch missed webhooks and to downgrade
    past_due subscriptions whose grace has elapsed.
    """
    from app.core.database import async_session
    from app.services.subscription_renewal import reconcile_paid_subscriptions
    while True:
        try:
            async with async_session() as s:
                await reconcile_paid_subscriptions(s)
        except Exception:
            logging.getLogger(__name__).exception("renewal loop failed")
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure baseline seed (3 subscription plans) are present for all dev/prod runs.
    # Membership tests rely on this; a missing plan would break every page and flow.
    try:
        from sqlalchemy import text
        from app.core.database import async_session
        async with async_session() as s:
            await s.execute(text("""
                INSERT INTO subscription_plans (name, tier_level, price_monthly, price_yearly, currency,
                    search_limit_daily, detail_view_limit_daily, download_limit_monthly,
                    is_sales_led, is_active, features, sort_order, trial_days, created_at, updated_at)
                VALUES
                    ('Freemium', 'freemium', 0, 0, 'USD', 10, 20, 0, false, true, '[]'::jsonb, 0, 0, NOW(), NOW()),
                    ('Personal', 'personal', 15.00, 149.00, 'USD', NULL, NULL, NULL, false, true, '[]'::jsonb, 1, 14, NOW(), NOW()),
                    ('Enterprise', 'enterprise', 0, 0, 'USD', NULL, NULL, NULL, true, true, '[]'::jsonb, 2, 0, NOW(), NOW())
                ON CONFLICT (tier_level) DO NOTHING
            """))
            await s.commit()
    except Exception:
        logging.getLogger(__name__).exception("seed subscription_plans failed")
    logger.info(f"PAYMENT_MODE={settings.payment_mode}")
    task = asyncio.create_task(_trial_expiry_loop())

    # Register webhook handlers for paid subscription lifecycle
    try:
        from app.services.payment_webhooks import register_all as register_payment_webhooks
        register_payment_webhooks()
        logger.info("payment webhook handlers registered")
    except Exception:
        logging.getLogger(__name__).exception("payment webhook registration failed")

    renewal_task = asyncio.create_task(_renewal_loop())
    try:
        yield
    finally:
        task.cancel()
        renewal_task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        try:
            await renewal_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="Unowire API",
    docs_url=f"{settings.api_prefix}/docs",
    openapi_url=f"{settings.api_prefix}/openapi.json",
    lifespan=lifespan,
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
        headers=exc.headers,
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


@app.exception_handler(PaymentConfigError)
async def payment_config_error_handler(request: Request, exc: PaymentConfigError):
    logger.warning("Payment gateway not configured: %s", exc)
    return JSONResponse(
        status_code=503,
        content={"code": 503, "message": "Payment gateway is not configured. Please contact support."},
    )


@app.exception_handler(stripe.error.StripeError)
async def stripe_error_handler(request: Request, exc: stripe.error.StripeError):
    logger.warning("Stripe gateway error: %s", exc)
    return JSONResponse(
        status_code=502,
        content={"code": 502, "message": "Payment gateway error. Please try again later."},
    )


@app.exception_handler(httpx.HTTPError)
async def httpx_error_handler(request: Request, exc: httpx.HTTPError):
    logger.warning("HTTP gateway error: %s", exc)
    return JSONResponse(
        status_code=502,
        content={"code": 502, "message": "Payment gateway error. Please try again later."},
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
app.include_router(equipment_import.router, prefix=f"{settings.api_prefix}/admin/equipment/import", tags=["equipment-import"])
app.include_router(equipment_import_templates.router, prefix=f"{settings.api_prefix}/admin/equipment/import", tags=["equipment-import"])
app.include_router(terminals.router, prefix=f"{settings.api_prefix}/connectivity", tags=["connectivity"])
app.include_router(terminals.legacy_router)
app.include_router(terminal_manufacturers.router, prefix=f"{settings.api_prefix}/connectivity-manufacturers", tags=["connectivity-manufacturers"])
app.include_router(terminal_manufacturers.legacy_router)
app.include_router(terminal_categories.router, prefix=f"{settings.api_prefix}/connectivity-categories", tags=["connectivity-categories"])
app.include_router(terminal_categories.legacy_router)
app.include_router(terminal_import.router, prefix=f"{settings.api_prefix}/admin/connectivity/import", tags=["connectivity-import"])
app.include_router(terminal_import.legacy_router)
app.include_router(terminal_import_templates.router, prefix=f"{settings.api_prefix}/admin/connectivity/import", tags=["connectivity-import"])
app.include_router(terminal_import_templates.legacy_router)
app.include_router(admin_menu.router, prefix=f"{settings.api_prefix}/admin/menu", tags=["admin-menu"])
app.include_router(admin_roles.router, prefix=f"{settings.api_prefix}/admin/roles", tags=["admin-roles"])
app.include_router(admin_users.router, prefix=f"{settings.api_prefix}/admin/users", tags=["admin-users"])
app.include_router(taxonomy.router, prefix=f"{settings.api_prefix}/taxonomy", tags=["taxonomy"])
app.include_router(uploads.router, prefix=f"{settings.api_prefix}/uploads", tags=["uploads"])
app.include_router(folders.router, prefix=f"{settings.api_prefix}/admin/folders", tags=["folders"])
app.include_router(cable_import.router, prefix=f"{settings.api_prefix}/admin/cables/import", tags=["cable-import"])
app.include_router(cable_import_templates.router, prefix=f"{settings.api_prefix}/admin/cables/import", tags=["cable-import"])
app.include_router(member.router)
app.include_router(member_subscription.router)
app.include_router(member_subscription.enterprise_router)
app.include_router(admin_inquiries.router)
app.include_router(admin_email.router)
app.include_router(admin_members.router)
app.include_router(admin_claims.router)
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
app.include_router(portal_equipment_import.router)
app.include_router(portal_terminals.router)
app.include_router(portal_terminals.legacy_router)
app.include_router(portal_terminal_import.router)
app.include_router(portal_terminal_import.legacy_router)
app.include_router(portal_inquiries.router)
app.include_router(portal_media.router)
app.include_router(portal_messages.router)
app.include_router(portal_claim.router)
app.include_router(resource.router, prefix=f"{settings.api_prefix}/resources", tags=["resources"])
app.include_router(resource_categories.router, prefix=f"{settings.api_prefix}/resource-categories", tags=["resource-categories"])
app.include_router(portal_resource.router)  # prefix baked in router
app.include_router(post.router, prefix=f"{settings.api_prefix}/posts", tags=["posts"])
app.include_router(post_categories.router, prefix=f"{settings.api_prefix}/post-categories", tags=["post-categories"])
app.include_router(plans.router)
app.include_router(payments.router)
app.include_router(admin_orders.router)

# Mount media directory for static file serving
media_dir = os.environ.get("MEDIA_DIR", "/app/media")
os.makedirs(os.path.join(media_dir, "uploads"), exist_ok=True)
os.makedirs(os.path.join(media_dir, "resources"), exist_ok=True)
app.mount("/media", StaticFiles(directory=media_dir), name="media")