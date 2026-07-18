"""add site-menu admin menu item under settings group

Revision ID: k1a2b3c4d5e6
Revises: j0f1a2b3c4d5
Create Date: 2026-07-18 00:00:00.000000

Adds 'Site Menu' item under the settings group. Reuses the existing
`menu_config` module permission (already granted to admin role) so no
role_permissions seed is needed.
"""
from alembic import op


revision: str = 'k1a2b3c4d5e6'
down_revision: str | None = 'j0f1a2b3c4d5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES ('menu-site-menu', 'settings', 'page', 'site-menu', NULL, 'Site Menu', 'Menu', 6, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM admin_menu_items WHERE id = 'menu-site-menu'")
