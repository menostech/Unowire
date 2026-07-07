import os
import sys
from pathlib import Path

# Add backend to path so tests can import app
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# asyncpg + SQLAlchemy's AsyncAdaptedQueuePool + Starlette TestClient are
# incompatible: pooled asyncpg connections end up in a stuck protocol state
# between in-process requests ("cannot perform operation: another operation is
# in progress"). Switching the test engine to NullPool (no connection reuse)
# eliminates the stale-connection problem without touching production code.
# `get_db` resolves `async_session` as a module global at call time, so
# reassigning it here is picked up by every route that depends on get_db.
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.core.database as _db_module
from app.core.config import settings

_test_engine = create_async_engine(settings.database_url, poolclass=NullPool)
_db_module.engine = _test_engine
_db_module.async_session = async_sessionmaker(
    _test_engine, class_=AsyncSession, expire_on_commit=False
)

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_headers(client):
    """Login as admin and return auth headers."""
    res = client.post(
        "/api/auth/login",
        json={"email": "admin@unowire.com", "password": "admin123456"},
    )
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}
