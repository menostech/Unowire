"""add claims menu item

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-07-30 00:00:02.000000
"""
from alembic import op


revision: str = 'q2r3s4t5u6v7'
down_revision: str | None = 'p1q2r3s4t5u6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'claims' menu item as top-level page (sort_order 8, after settings group at 7)
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES ('menu-claims', NULL, 'page', 'claims', NULL, 'Claims', 'Shield', 8, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM admin_menu_items WHERE id = 'menu-claims'")
