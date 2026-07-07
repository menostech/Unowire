"""add admin_menu_items table

Revision ID: f5a6b7c8d9e0
Revises: e3f4a5b6c7d8
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        'admin_menu_items',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column(
            'parent_id',
            sa.String(length=100),
            sa.ForeignKey('admin_menu_items.id', ondelete='CASCADE'),
            nullable=True,
        ),
        sa.Column('type', sa.String(length=20), nullable=False),
        sa.Column('page_id', sa.String(length=100), nullable=True),
        sa.Column('url', sa.String(length=500), nullable=True),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('icon', sa.String(length=50), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_visible', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("type IN ('page', 'link', 'group')", name='ck_admin_menu_items_type'),
    )

    op.create_index(
        'ix_admin_menu_items_parent_id',
        'admin_menu_items',
        ['parent_id'],
    )
    op.create_index(
        'ix_admin_menu_items_parent_id_sort_order',
        'admin_menu_items',
        ['parent_id', 'sort_order'],
    )

    # Seed: 11 items matching current hardcoded sidebar + new menu-config.
    # Idempotent via ON CONFLICT (id) DO NOTHING.
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES
            ('dashboard',       NULL,        'page',  'dashboard',       NULL, 'Dashboard',      'LayoutDashboard', 0, true, NOW(), NOW()),
            ('cables',          NULL,        'page',  'cables',          NULL, 'Cables',         'Cable',           1, true, NOW(), NOW()),
            ('brands',          NULL,        'page',  'brands',          NULL, 'Brands',         'Tag',             2, true, NOW(), NOW()),
            ('manufacturers',   NULL,        'page',  'manufacturers',   NULL, 'Manufacturers',  'Factory',         3, true, NOW(), NOW()),
            ('industries',      NULL,        'page',  'industries',      NULL, 'Industries',     'FolderOpen',      4, true, NOW(), NOW()),
            ('equipment',       NULL,        'group', NULL,              NULL, 'Equipment',      'Wrench',          5, true, NOW(), NOW()),
            ('equipment-mfrs',  'equipment', 'page',  'equipment-mfrs',  NULL, 'Equipment Mfrs', 'Wrench',          0, true, NOW(), NOW()),
            ('equipment-cats',  'equipment', 'page',  'equipment-cats',  NULL, 'Equipment Cats', 'Wrench',          1, true, NOW(), NOW()),
            ('equipment-list',  'equipment', 'page',  'equipment-list',  NULL, 'Equipment',      'Wrench',          2, true, NOW(), NOW()),
            ('media',           NULL,        'page',  'media',           NULL, 'Media',          'Image',           6, true, NOW(), NOW()),
            ('menu-config',     NULL,        'page',  'menu-config',     NULL, 'Menu Config',    'Settings',        7, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade():
    op.drop_index('ix_admin_menu_items_parent_id_sort_order', table_name='admin_menu_items')
    op.drop_index('ix_admin_menu_items_parent_id', table_name='admin_menu_items')
    op.drop_table('admin_menu_items')
