from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.scope_resolvers import validate_scope_id
from app.core.security import hash_password
from app.crud.base import CRUDBase
from app.models.role import Role
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


class CRUDUser(CRUDBase[User, UserCreate, UserUpdate]):
    async def get_with_role(self, db: AsyncSession, id: int) -> User | None:
        stmt = (
            select(User)
            .where(User.id == id)
            .options(selectinload(User.role))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_with_roles(self, db: AsyncSession) -> list[User]:
        stmt = (
            select(User)
            .order_by(User.id)
            .options(selectinload(User.role))
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_email(self, db: AsyncSession, email: str) -> User | None:
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def create(self, db: AsyncSession, *, obj_in: UserCreate) -> User:
        # Validate role exists
        role = await db.get(Role, obj_in.role_id)
        if role is None:
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": f"Role not found: {obj_in.role_id}"},
            )
        # Validate email uniqueness
        existing = await self.get_by_email(db, obj_in.email)
        if existing:
            raise HTTPException(
                status_code=409,
                detail={"code": 409, "message": "Email already registered"},
            )
        # Validate scope_id matches role.scope_type
        if not await validate_scope_id(db, role.scope_type, obj_in.scope_id):
            if role.scope_type is None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": "This role does not allow a scope_id"},
                )
            raise HTTPException(
                status_code=422,
                detail={"code": 422, "message": f"Invalid scope_id for scope_type '{role.scope_type}'"},
            )
        user = User(
            email=obj_in.email,
            password_hash=hash_password(obj_in.password),
            role_id=obj_in.role_id,
            scope_id=obj_in.scope_id,
            is_active=obj_in.is_active,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    async def update(self, db: AsyncSession, *, db_obj: User, obj_in: UserUpdate) -> User:
        update_data = obj_in.model_dump(exclude_unset=True)

        # If role_id is changing, validate the new role
        new_role_id = update_data.get("role_id")
        if new_role_id is not None and new_role_id != db_obj.role_id:
            new_role = await db.get(Role, new_role_id)
            if new_role is None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": f"Role not found: {new_role_id}"},
                )
            effective_scope_type = new_role.scope_type
        else:
            # Load the current role to get its scope_type
            if db_obj.role is None:
                await db.refresh(db_obj, attribute_names=["role"])
            effective_scope_type = db_obj.role.scope_type if db_obj.role else None

        # If scope_id is being updated (or role changed), validate scope
        new_scope_id = update_data.get("scope_id", db_obj.scope_id)
        if "scope_id" in update_data or "role_id" in update_data:
            if not await validate_scope_id(db, effective_scope_type, new_scope_id):
                if effective_scope_type is None:
                    raise HTTPException(
                        status_code=422,
                        detail={"code": 422, "message": "This role does not allow a scope_id"},
                    )
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": f"Invalid scope_id for scope_type '{effective_scope_type}'"},
                )

        # If email is changing, validate uniqueness
        new_email = update_data.get("email")
        if new_email is not None and new_email != db_obj.email:
            existing = await self.get_by_email(db, new_email)
            if existing and existing.id != db_obj.id:
                raise HTTPException(
                    status_code=409,
                    detail={"code": 409, "message": "Email already registered"},
                )

        # Hash password if provided
        if update_data.get("password"):
            update_data["password_hash"] = hash_password(update_data.pop("password"))
        else:
            update_data.pop("password", None)

        for field, value in update_data.items():
            setattr(db_obj, field, value)

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj


crud_user = CRUDUser(User)
