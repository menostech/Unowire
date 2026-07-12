"""Tests for admin email config endpoints."""
import asyncio

import pytest

from app.core.database import async_session
from app.models.email_config import EmailConfig


@pytest.fixture(scope="module", autouse=True)
def _reset_email_config():
    """Reset email config to default state before tests (ensures test_get_config_default passes)."""
    async def _reset():
        async with async_session() as db:
            config = await db.get(EmailConfig, 1)
            if config:
                await db.delete(config)
                await db.commit()
    asyncio.run(_reset())


def test_get_config_default(client, admin_headers):
    res = client.get("/api/admin/email/config", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "smtp_host" in data
    assert data["smtp_password"] == ""  # empty by default


def test_update_config(client, admin_headers):
    res = client.put(
        "/api/admin/email/config",
        json={
            "smtp_host": "smtp.test.com",
            "smtp_port": 587,
            "smtp_user": "user@test.com",
            "smtp_password": "secret123",
            "from_name": "Test",
            "from_email": "noreply@test.com",
            "use_tls": True,
            "is_enabled": False,
        },
        headers=admin_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["smtp_host"] == "smtp.test.com"
    assert data["smtp_password"] == "********"  # masked


def test_list_templates(client, admin_headers):
    res = client.get("/api/admin/email/templates", headers=admin_headers)
    assert res.status_code == 200
    ids = {t["id"] for t in res.json()}
    assert "verify_email" in ids
    assert "inquiry_received" in ids
    assert "inquiry_replied" in ids


def test_update_template(client, admin_headers):
    res = client.put(
        "/api/admin/email/templates/verify_email",
        json={"subject": "Custom Verify Subject - {from_name}"},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["subject"] == "Custom Verify Subject - {from_name}"
    # Restore
    client.put(
        "/api/admin/email/templates/verify_email",
        json={"subject": "Verify Your Email - {from_name}"},
        headers=admin_headers,
    )


def test_get_template_not_found(client, admin_headers):
    res = client.get("/api/admin/email/templates/nonexistent", headers=admin_headers)
    assert res.status_code == 404


def test_email_config_requires_auth(client):
    res = client.get("/api/admin/email/config")
    assert res.status_code == 401
