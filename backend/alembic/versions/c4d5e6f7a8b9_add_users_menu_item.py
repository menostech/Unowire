"""add users menu item under settings group

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-07-08 00:00:00.000000

"""
from alembic import op


revision: str = 'c4d5e6f7a8b9'
down_revision: str | None = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'users' menu item under 'settings' group (idempotent)
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible)
        VALUES ('menu-users', 'settings', 'page', 'users', NULL, 'Users', 'Users', 2, TRUE)
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM admin_menu_items WHERE id = 'menu-users'")
