"""Email sending module: reads SMTP config from DB, renders templates, sends async."""

import asyncio
import logging
from typing import Any

import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.crud.email_config import crud_email_config, decrypt_password
from app.core.database import async_session

logger = logging.getLogger(__name__)

# In-memory cache of EmailConfig (TTL 5 minutes)
_config_cache: dict[str, Any] = {"data": None, "ts": 0.0}
_CACHE_TTL = 300  # seconds


class SafeDict(dict):
    """dict subclass that returns '{key}' for missing keys (no KeyError in str.format_map)."""
    def __missing__(self, key):
        return "{" + key + "}"


async def _get_config():
    """Fetch EmailConfig from cache or DB."""
    import time
    now = time.time()
    if _config_cache["data"] is not None and now - _config_cache["ts"] < _CACHE_TTL:
        return _config_cache["data"]
    async with async_session() as db:
        config = await crud_email_config.get(db)
    _config_cache["data"] = config
    _config_cache["ts"] = now
    return config


def _invalidate_cache():
    _config_cache["data"] = None
    _config_cache["ts"] = 0.0


async def render_and_send(
    to_email: str,
    template_id: str,
    context: dict[str, str],
) -> None:
    """Fetch template, render placeholders, send email. Best-effort: logs errors, never raises."""
    try:
        from app.crud.email_config import crud_email_template
        async with async_session() as db:
            config = await _get_config()
            if config is None or not config.is_enabled:
                logger.info("Email disabled, skipping %s to %s", template_id, to_email)
                return
            template = await crud_email_template.get(db, template_id)
            if template is None or not template.is_active:
                logger.warning("Template %s not found or inactive, skipping", template_id)
                return

        safe_ctx = SafeDict(context)
        subject = template.subject.format_map(safe_ctx)
        body = template.body.format_map(safe_ctx)

        msg = MIMEMultipart("alternative")
        msg["From"] = f"{config.from_name} <{config.from_email}>"
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain", "utf-8"))

        password = decrypt_password(config.smtp_password)
        await aiosmtplib.send(
            msg,
            hostname=config.smtp_host,
            port=config.smtp_port,
            username=config.smtp_user,
            password=password,
            start_tls=config.use_tls,
        )
        logger.info("Email sent: %s to %s", template_id, to_email)
    except Exception as e:
        logger.error("Failed to send email %s to %s: %s", template_id, to_email, e)


def send_email_background(
    to_email: str,
    template_id: str,
    context: dict[str, str],
) -> asyncio.Task:
    """Fire-and-forget email send. Returns the task (caller can ignore)."""
    return asyncio.create_task(render_and_send(to_email, template_id, context))
