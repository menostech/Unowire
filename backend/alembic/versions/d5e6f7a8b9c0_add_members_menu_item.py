"""add members menu item under settings group

Revision ID: d5e6f7a8b9c0
Revises: ed9b79c7e9b6
Create Date: 2026-07-09 00:00:00.000000

"""
from alembic import op


revision: str = 'd5e6f7a8b9c0'
down_revision: str | None = 'ed9b79c7e9b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'members' menu item under 'settings' group (idempotent)
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES ('menu-members', 'settings', 'page', 'members', NULL, 'Members', 'Users', 4, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)

    # Grant admin role access to members module
    op.execute("""
        INSERT INTO role_permissions (role_id, module)
        VALUES ('admin', 'members')
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM role_permissions WHERE module = 'members'")
    op.execute("DELETE FROM admin_menu_items WHERE id = 'menu-members'")
