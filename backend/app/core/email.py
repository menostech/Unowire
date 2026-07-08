"""Email sending module: reads SMTP config from DB, renders templates, sends async."""

import asyncio
import logging
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import aiosmtplib

from app.core.database import async_session
from app.crud.email_config import crud_email_config, decrypt_password
from app.models.email_config import EmailConfig, EmailTemplate

logger = logging.getLogger(__name__)

# In-memory cache of the EmailConfig singleton (TTL 5 minutes).
_config_cache: dict[str, Any] = {"data": None, "ts": 0.0}
_CACHE_TTL = 300  # seconds


class SafeDict(dict):
    """dict subclass that returns "" for missing keys.

    Used with ``str.format_map`` so missing placeholders render as an empty
    string instead of raising ``KeyError``. This avoids Jinja2 entirely,
    preventing server-side template injection (SSTI).
    """

    def __missing__(self, key):
        return ""


async def _get_config() -> EmailConfig | None:
    """Return the cached EmailConfig singleton, refreshing from DB on TTL expiry."""
    now = time.time()
    if _config_cache["data"] is not None and now - _config_cache["ts"] < _CACHE_TTL:
        return _config_cache["data"]
    async with async_session() as db:
        config = await crud_email_config.get(db)
    _config_cache["data"] = config
    _config_cache["ts"] = now
    return config


def _invalidate_cache() -> None:
    """Clear the config cache. Call after EmailConfig is updated."""
    _config_cache["data"] = None
    _config_cache["ts"] = 0.0


def render_template(template: EmailTemplate, context: dict[str, str]) -> tuple[str, str]:
    """Render ``template.subject`` and ``template.body`` with ``context``.

    Uses :class:`SafeDict` + ``str.format_map`` (no Jinja2) so missing keys
    render as an empty string. Returns ``(subject, body)``.
    """
    safe_ctx = SafeDict(context or {})
    subject = template.subject.format_map(safe_ctx)
    body = template.body.format_map(safe_ctx)
    return subject, body


async def send_email(to_email: str, subject: str, body: str) -> None:
    """Send a plain-text email via the configured SMTP server.

    If email is disabled or no config exists, logs and returns silently.
    Raises on SMTP failure so the caller can decide how to handle it; use
    :func:`send_email_background` for best-effort fire-and-forget delivery.
    """
    config = await _get_config()
    if config is None or not config.is_enabled:
        logger.info("Email disabled, skipping send to %s", to_email)
        return

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
    logger.info("Email sent to %s: %s", to_email, subject)


def send_email_background(to_email: str, subject: str, body: str) -> asyncio.Task:
    """Fire-and-forget email send. Best-effort: logs errors, never blocks caller.

    Returns the :class:`asyncio.Task`; callers may ignore it.
    """

    async def _send() -> None:
        try:
            await send_email(to_email, subject, body)
        except Exception as e:
            logger.error("Background email send to %s failed: %s", to_email, e)

    return asyncio.create_task(_send())
