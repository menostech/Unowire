"""seed admin resources menu and permissions

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-08-03 00:00:03.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd0e1f2a3b4c5'
down_revision: Union[str, None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Seed the "Resources" menu group + child pages (idempotent).
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES
            ('resources',      NULL,        'group', NULL,             NULL, 'Resources',   'FileText', 6, true, NOW(), NOW()),
            ('resources-list', 'resources', 'page',  'resources-list', NULL, 'Resources',   'FileText', 0, true, NOW(), NOW()),
            ('resources-cats', 'resources', 'page',  'resources-cats', NULL, 'Categories',  'FileText', 1, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)

    # Grant the admin role both new resource module permissions (idempotent).
    op.execute("""
        INSERT INTO role_permissions (role_id, module)
        VALUES
            ('admin', 'resource_cats'),
            ('admin', 'resource_list')
        ON CONFLICT (role_id, module) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM role_permissions
        WHERE role_id = 'admin' AND module IN ('resource_cats', 'resource_list')
    """)
    op.execute("""
        DELETE FROM admin_menu_items
        WHERE id IN ('resources-list', 'resources-cats', 'resources')
    """)
