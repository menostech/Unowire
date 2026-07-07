"""add rbac tables (roles, role_permissions) and migrate users.role to role_id

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f7
Create Date: 2026-07-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision: str = 'b3c4d5e6f7a8'
down_revision: str | None = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create roles table
    op.execute("""
        CREATE TABLE IF NOT EXISTS roles (
            id          VARCHAR(100) PRIMARY KEY,
            name        VARCHAR(100) NOT NULL,
            description TEXT,
            scope_type  VARCHAR(50),
            is_system   BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """)

    # 2. Create role_permissions table
    op.execute("""
        CREATE TABLE IF NOT EXISTS role_permissions (
            role_id VARCHAR(100) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            module  VARCHAR(100) NOT NULL,
            PRIMARY KEY (role_id, module)
        )
    """)

    # 3. Seed 4 preset roles (idempotent)
    op.execute("""
        INSERT INTO roles (id, name, description, scope_type, is_system, sort_order) VALUES
            ('admin',             'Admin',             'Full access to all modules',                             NULL,                     TRUE, 0),
            ('content_editor',    'Content Editor',    'Manage cables, brands, manufacturers, equipment, media', NULL,                     TRUE, 1),
            ('equipment_manager', 'Equipment Manager', 'Manage own equipment manufacturer data',                 'equipment_manufacturer', TRUE, 2),
            ('cable_manager',     'Cable Manager',     'Manage own manufacturer cables/brands',                  'manufacturer',          TRUE, 3)
        ON CONFLICT (id) DO NOTHING
    """)

    # 4. Seed default permissions (idempotent)
    op.execute("""
        INSERT INTO role_permissions (role_id, module) VALUES
            ('admin', 'dashboard'), ('admin', 'cables'), ('admin', 'brands'), ('admin', 'manufacturers'),
            ('admin', 'industries'), ('admin', 'equipment_mfrs'), ('admin', 'equipment_cats'),
            ('admin', 'equipment_list'), ('admin', 'media'), ('admin', 'menu_config'),
            ('admin', 'users'), ('admin', 'roles')
        ON CONFLICT (role_id, module) DO NOTHING
    """)
    op.execute("""
        INSERT INTO role_permissions (role_id, module) VALUES
            ('content_editor', 'dashboard'), ('content_editor', 'cables'), ('content_editor', 'brands'),
            ('content_editor', 'manufacturers'), ('content_editor', 'equipment_mfrs'),
            ('content_editor', 'equipment_list'), ('content_editor', 'media')
        ON CONFLICT (role_id, module) DO NOTHING
    """)
    op.execute("""
        INSERT INTO role_permissions (role_id, module) VALUES
            ('equipment_manager', 'dashboard'), ('equipment_manager', 'equipment_mfrs'),
            ('equipment_manager', 'equipment_list'), ('equipment_manager', 'media')
        ON CONFLICT (role_id, module) DO NOTHING
    """)
    op.execute("""
        INSERT INTO role_permissions (role_id, module) VALUES
            ('cable_manager', 'dashboard'), ('cable_manager', 'cables'), ('cable_manager', 'brands'),
            ('cable_manager', 'manufacturers'), ('cable_manager', 'media')
        ON CONFLICT (role_id, module) DO NOTHING
    """)

    # 5. Add role_id and scope_id columns to users (nullable initially for migration)
    op.add_column('users', sa.Column('role_id', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('scope_id', sa.String(100), nullable=True))

    # 6. Migrate existing users: role='admin' -> role_id='admin', role='editor' -> role_id='content_editor'
    op.execute("UPDATE users SET role_id = 'admin' WHERE role = 'admin'")
    op.execute("UPDATE users SET role_id = 'content_editor' WHERE role = 'editor'")

    # 7. Set role_id NOT NULL and add FK
    op.alter_column('users', 'role_id', nullable=False)
    op.create_foreign_key(
        'fk_users_role_id', 'users', 'roles', ['role_id'], ['id'], ondelete='RESTRICT'
    )

    # 8. Drop old role column and its CHECK constraint
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role")
    op.drop_column('users', 'role')

    # 9. Add 'roles' menu item under 'settings' group (idempotent)
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible)
        VALUES ('menu-roles', 'settings', 'page', 'roles', NULL, 'Roles', 'Shield', 1, TRUE)
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    # Remove roles menu item
    op.execute("DELETE FROM admin_menu_items WHERE id = 'menu-roles'")

    # Restore role column
    op.add_column('users', sa.Column('role', sa.String(20), nullable=False, server_default='admin'))
    op.execute("UPDATE users SET role = 'admin' WHERE role_id = 'admin'")
    op.execute("UPDATE users SET role = 'editor' WHERE role_id != 'admin'")
    op.execute("ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IN ('admin','editor'))")

    # Drop FK and columns
    op.drop_constraint('fk_users_role_id', 'users', type_='foreignkey')
    op.drop_column('users', 'scope_id')
    op.drop_column('users', 'role_id')

    # Drop role_permissions and roles tables
    op.execute("DROP TABLE IF EXISTS role_permissions")
    op.execute("DROP TABLE IF EXISTS roles")
