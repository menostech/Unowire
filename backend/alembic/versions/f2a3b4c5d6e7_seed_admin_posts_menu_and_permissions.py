"""seed admin posts menu and permissions

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-08-03 00:00:05.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Seed the "Posts" menu group + child pages (idempotent).
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES
            ('posts',      NULL,    'group', NULL,         NULL, 'Posts',      'FileText', 7, true, NOW(), NOW()),
            ('posts-list', 'posts', 'page',  'posts-list', NULL, 'Posts',      'FileText', 0, true, NOW(), NOW()),
            ('posts-cats', 'posts', 'page',  'posts-cats', NULL, 'Categories', 'FileText', 1, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)

    # Grant the admin role both new post module permissions (idempotent).
    op.execute("""
        INSERT INTO role_permissions (role_id, module)
        VALUES
            ('admin', 'post_cats'),
            ('admin', 'post_list')
        ON CONFLICT (role_id, module) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM role_permissions
        WHERE role_id = 'admin' AND module IN ('post_cats', 'post_list')
    """)
    op.execute("""
        DELETE FROM admin_menu_items
        WHERE id IN ('posts-list', 'posts-cats', 'posts')
    """)
