"""add pages menu item under settings group

Revision ID: i9e0f1a2b3c4
Revises: h8d9e0f1a2b3
Create Date: 2026-07-18 00:00:00.000000

"""
from alembic import op


revision: str = 'i9e0f1a2b3c4'
down_revision: str | None = 'h8d9e0f1a2b3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'pages' menu item under 'settings' group (idempotent).
    # The admin role's `pages` module permission was already seeded by
    # revision h8d9e0f1a2b3_seed_admin_pages_permission.
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES ('menu-pages', 'settings', 'page', 'pages', NULL, 'Pages', 'FileText', 5, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM admin_menu_items WHERE id = 'menu-pages'")
