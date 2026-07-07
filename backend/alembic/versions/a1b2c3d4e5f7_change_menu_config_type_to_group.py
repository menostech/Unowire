"""add settings group and move menu-config under it

Revision ID: a1b2c3d4e5f7
Revises: f5a6b7c8d9e0
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = 'f5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # 1. Add a new top-level 'settings' group.
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES ('settings', NULL, 'group', NULL, NULL, 'Settings', 'Settings', 7, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)
    # 2. Repurpose menu-config as the 'Menus' page under Settings.
    op.execute("""
        UPDATE admin_menu_items
        SET type = 'page', page_id = 'menu-config', url = NULL,
            label = 'Menus', parent_id = 'settings', sort_order = 0,
            updated_at = NOW()
        WHERE id = 'menu-config'
    """)


def downgrade():
    # Revert: restore menu-config as top-level page, remove settings group.
    op.execute("""
        UPDATE admin_menu_items
        SET type = 'page', page_id = 'menu-config', url = NULL,
            label = 'Menu Config', parent_id = NULL, sort_order = 7,
            updated_at = NOW()
        WHERE id = 'menu-config'
    """)
    op.execute("""
        DELETE FROM admin_menu_items WHERE id = 'settings'
    """)
