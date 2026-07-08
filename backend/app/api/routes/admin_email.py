from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_module
from app.core.database import get_db
from app.core.email import render_and_send, _invalidate_cache
from app.crud.email_config import crud_email_config, crud_email_template
from app.models.user import User
from app.schemas.email_config import (
    EmailConfigRead,
    EmailConfigUpdate,
    EmailTemplateRead,
    EmailTemplateUpdate,
)

router = APIRouter(prefix="/api/admin/email", tags=["admin-email"])


@router.get("/config", response_model=EmailConfigRead)
async def get_config(
    user: User = Depends(require_module("email_config")),
    db: AsyncSession = Depends(get_db),
):
    config = await crud_email_config.get_or_create(db)
    # Mask password in response
    data = EmailConfigRead.model_validate(config).model_dump()
    data["smtp_password"] = "" if not config.smtp_password else "********"
    return data


@router.put("/config", response_model=EmailConfigRead)
async def update_config(
    body: EmailConfigUpdate,
    user: User = Depends(require_module("email_config")),
    db: AsyncSession = Depends(get_db),
):
    config = await crud_email_config.update(db, obj_in=body, updated_by=user.id)
    _invalidate_cache()
    data = EmailConfigRead.model_validate(config).model_dump()
    data["smtp_password"] = "********"
    return data


@router.post("/test")
async def send_test_email(
    user: User = Depends(require_module("email_config")),
    db: AsyncSession = Depends(get_db),
):
    config = await crud_email_config.get(db)
    if config is None or not config.is_enabled:
        raise HTTPException(status_code=400, detail={"code": 400, "message": "Email not configured or disabled"})
    await render_and_send(
        user.email,
        "verify_email",  # reuse a template for testing; or create a dedicated test template
        {"name": user.email.split("@")[0], "verify_url": "(test email - no action needed)", "from_name": config.from_name},
    )
    return {"message": f"Test email sent to {user.email}"}


@router.get("/templates", response_model=list[EmailTemplateRead])
async def list_templates(
    user: User = Depends(require_module("email_config")),
    db: AsyncSession = Depends(get_db),
):
    return await crud_email_template.list_all(db)


@router.get("/templates/{template_id}", response_model=EmailTemplateRead)
async def get_template(
    template_id: str,
    user: User = Depends(require_module("email_config")),
    db: AsyncSession = Depends(get_db),
):
    template = await crud_email_template.get(db, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Template not found"})
    return template


@router.put("/templates/{template_id}", response_model=EmailTemplateRead)
async def update_template(
    template_id: str,
    body: EmailTemplateUpdate,
    user: User = Depends(require_module("email_config")),
    db: AsyncSession = Depends(get_db),
):
    template = await crud_email_template.get(db, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Template not found"})
    updated = await crud_email_template.update(db, db_obj=template, obj_in=body)
    return updated
