import time

import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int, email: str, role: str) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "iat": now,
        "exp": now + settings.jwt_expiry_hours * 3600,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") == "member":
            return None  # member tokens cannot be used for admin/staff auth
        return payload
    except Exception:
        return None


def create_member_token(member_id: int, email: str) -> str:
    """JWT for public members. Includes type='member' to distinguish from staff tokens."""
    now = int(time.time())
    payload = {
        "sub": str(member_id),
        "email": email,
        "type": "member",
        "iat": now,
        "exp": now + settings.jwt_expiry_hours * 3600,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_member_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except Exception:
        return None
    if payload.get("type") != "member":
        return None
    return payload
