import base64
import hashlib

from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud.base import CRUDBase
from app.models.email_config import EmailConfig, EmailTemplate
from app.schemas.email_config import (
    EmailConfigUpdate,
    EmailTemplateRead,
    EmailTemplateUpdate,
)


def _fernet() -> Fernet:
    """Derive a Fernet key from JWT secret (SHA256, base64-urlsafe encoded)."""
    key = hashlib.sha256(settings.jwt_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_password(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_password(cipher: str) -> str:
    try:
        return _fernet().decrypt(cipher.encode()).decode()
    except Exception:
        return ""


class CRUDEmailConfig:
    async def get(self, db: AsyncSession) -> EmailConfig | None:
        return await db.get(EmailConfig, 1)

    async def get_or_create(self, db: AsyncSession) -> EmailConfig:
        config = await db.get(EmailConfig, 1)
        if config is None:
            config = EmailConfig(
                id=1,
                smtp_host="",
                smtp_port=587,
                smtp_user="",
                smtp_password="",
                from_name="Unowire",
                from_email="noreply@unowire.com",
                use_tls=True,
                is_enabled=False,
            )
            db.add(config)
            await db.commit()
            await db.refresh(config)
        return config

    async def update(
        self, db: AsyncSession, *, obj_in: EmailConfigUpdate, updated_by: int
    ) -> EmailConfig:
        config = await self.get_or_create(db)
        config.smtp_host = obj_in.smtp_host
        config.smtp_port = obj_in.smtp_port
        config.smtp_user = obj_in.smtp_user
        if obj_in.smtp_password:
            config.smtp_password = encrypt_password(obj_in.smtp_password)
        config.from_name = obj_in.from_name
        config.from_email = obj_in.from_email
        config.use_tls = obj_in.use_tls
        config.is_enabled = obj_in.is_enabled
        config.updated_by = updated_by
        db.add(config)
        await db.commit()
        await db.refresh(config)
        return config

    async def get_decrypted_password(self, db: AsyncSession) -> str:
        """Return the decrypted SMTP password, or empty string if unavailable."""
        config = await self.get(db)
        if config is None or not config.smtp_password:
            return ""
        return decrypt_password(config.smtp_password)


class CRUDEmailTemplate(CRUDBase[EmailTemplate, EmailTemplateRead, EmailTemplateUpdate]):
    async def get(self, db: AsyncSession, id: str) -> EmailTemplate | None:
        return await db.get(EmailTemplate, id)

    async def list_all(self, db: AsyncSession) -> list[EmailTemplate]:
        result = await db.execute(select(EmailTemplate).order_by(EmailTemplate.id))
        return list(result.scalars().all())


crud_email_config = CRUDEmailConfig()
crud_email_template = CRUDEmailTemplate(EmailTemplate)
