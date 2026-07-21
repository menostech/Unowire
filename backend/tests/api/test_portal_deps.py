"""Tests for JWT type discrimination and new portal auth dependencies."""
import time

import jwt

from app.core.config import settings
from app.core.security import create_access_token, decode_access_token, decode_portal_token


def test_admin_token_has_type_admin():
    """Newly issued admin tokens include type='admin'."""
    token = create_access_token(1, "admin@unowire.com", "admin", token_type="admin")
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["type"] == "admin"


def test_portal_token_decoded_by_decode_portal_token():
    """Portal tokens are decoded by decode_portal_token, not decode_access_token."""
    token = create_access_token(99, "factory@test.com", "cable_manager_test", token_type="portal")
    assert decode_access_token(token) is None  # admin decoder rejects portal tokens
    payload = decode_portal_token(token)
    assert payload is not None
    assert payload["type"] == "portal"
    assert payload["sub"] == "99"


def test_legacy_admin_token_without_type_still_works():
    """Tokens issued without type field (legacy) are treated as admin by decode_access_token."""
    now = int(time.time())
    payload = {
        "sub": "1",
        "email": "admin@unowire.com",
        "role": "admin",
        "iat": now,
        "exp": now + 3600,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    decoded = decode_access_token(token)
    assert decoded is not None
    assert decoded.get("type", "admin") == "admin"


def test_member_token_rejected_by_both_decoders():
    """Member tokens are rejected by both admin and portal decoders."""
    from app.core.security import create_member_token
    token = create_member_token(1, "member@test.com")
    assert decode_access_token(token) is None
    assert decode_portal_token(token) is None
