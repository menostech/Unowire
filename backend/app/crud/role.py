from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.modules import ADMIN_PROTECTED_MODULES, VALID_MODULE_IDS
from app.crud.base import CRUDBase
from app.models.role import Role, RolePermission
from app.schemas.role import RoleCreate, RoleUpdate


class CRUDRole(CRUDBase[Role, RoleCreate, RoleUpdate]):
    async def get_with_permissions(self, db: AsyncSession, id: str) -> Role | None:
        stmt = (
            select(Role)
            .where(Role.id == id)
            .options(selectinload(Role.permissions))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_with_permissions(self, db: AsyncSession) -> list[Role]:
        stmt = (
            select(Role)
            .order_by(Role.sort_order, Role.id)
            .options(selectinload(Role.permissions))
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def validate_permissions(self, modules: list[str]) -> None:
        """Validate all module IDs are in the allowed set. Raises HTTPException(422)."""
        for m in modules:
            if m not in VALID_MODULE_IDS:
                raise HTTPException(
                    status_code=422,
                    detail={"code": 422, "message": f"Unknown module: {m}"},
                )

    async def create_with_permissions(
        self, db: AsyncSession, *, obj_in: RoleCreate
    ) -> Role:
        await self.validate_permissions(obj_in.permissions)
        # Check ID uniqueness
        existing = await db.get(Role, obj_in.id)
        if existing:
            raise HTTPException(
                status_code=409,
                detail={"code": 409, "message": f"Role with id '{obj_in.id}' already exists"},
            )
        role = Role(
            id=obj_in.id,
            name=obj_in.name,
            description=obj_in.description,
            scope_type=obj_in.scope_type,
            is_system=False,  # Custom roles are never system roles
            sort_order=obj_in.sort_order,
        )
        db.add(role)
        await db.flush()
        for module in obj_in.permissions:
            db.add(RolePermission(role_id=role.id, module=module))
        await db.commit()
        await db.refresh(role)
        return role

    async def update_with_permissions(
        self, db: AsyncSession, *, db_obj: Role, obj_in: RoleUpdate
    ) -> Role:
        update_data = obj_in.model_dump(exclude_unset=True)
        new_permissions = update_data.pop("permissions", None)

        # Lockout protection: admin role must always keep ADMIN_PROTECTED_MODULES
        if db_obj.id == "admin" and new_permissions is not None:
            missing = ADMIN_PROTECTED_MODULES - set(new_permissions)
            if missing:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": 422,
                        "message": f"Cannot remove protected modules from admin role: {sorted(missing)}",
                    },
                )

        # Apply scalar field updates
        for field, value in update_data.items():
            setattr(db_obj, field, value)

        # Replace permissions if provided
        if new_permissions is not None:
            await self.validate_permissions(new_permissions)
            # Delete existing permissions
            existing_perms = await db.execute(
                select(RolePermission).where(RolePermission.role_id == db_obj.id)
            )
            for rp in existing_perms.scalars().all():
                await db.delete(rp)
            await db.flush()
            # Insert new permissions
            for module in new_permissions:
                db.add(RolePermission(role_id=db_obj.id, module=module))

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def remove(self, db: AsyncSession, *, id: str) -> Role | None:
        """Delete a role. System roles (is_system=true) cannot be deleted."""
        role = await db.get(Role, id)
        if role is None:
            return None
        if role.is_system:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete a system role"},
            )
        # Check no users are assigned to this role
        from app.models.user import User
        users_with_role = await db.execute(
            select(User.id).where(User.role_id == id).limit(1)
        )
        if users_with_role.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=409,
                detail={"code": 409, "message": "Cannot delete role: users are still assigned to it"},
            )
        await db.delete(role)
        await db.commit()
        return role


crud_role = CRUDRole(Role)
