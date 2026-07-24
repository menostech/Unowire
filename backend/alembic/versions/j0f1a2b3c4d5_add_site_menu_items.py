"""add_site_menu_items

Revision ID: j0f1a2b3c4d5
Revises: i9e0f1a2b3c4
Create Date: 2026-07-18 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'j0f1a2b3c4d5'
down_revision: Union[str, None] = 'i9e0f1a2b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'site_menu_items',
        sa.Column('id', sa.String(length=100), nullable=False),
        sa.Column('location', sa.String(length=20), nullable=False),
        sa.Column('parent_id', sa.String(length=100), nullable=True),
        sa.Column('type', sa.String(length=20), nullable=False),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('url', sa.String(length=500), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_visible', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['parent_id'], ['site_menu_items.id'], ondelete='CASCADE'),
        sa.CheckConstraint("location IN ('header', 'footer')", name='ck_site_menu_items_location'),
        sa.CheckConstraint("type IN ('link', 'group')", name='ck_site_menu_items_type'),
    )
    op.create_index('idx_site_menu_items_location', 'site_menu_items', ['location'])
    op.create_index('idx_site_menu_items_parent', 'site_menu_items', ['parent_id'])

    # Seed 6 items migrated from the current hardcoded Nav.tsx + Footer.tsx.
    op.execute("""
        INSERT INTO site_menu_items (id, location, parent_id, type, label, url, sort_order, is_visible, created_at, updated_at)
        VALUES
            ('header-cables', 'header', NULL, 'link', 'Cables', '/cables', 0, true, NOW(), NOW()),
            ('header-manufacturers', 'header', NULL, 'link', 'Manufacturers', '/manufacturers', 1, true, NOW(), NOW()),
            ('footer-cables', 'footer', NULL, 'link', 'Cables', '/cables', 0, true, NOW(), NOW()),
            ('footer-manufacturers', 'footer', NULL, 'link', 'Manufacturers', '/manufacturers', 1, true, NOW(), NOW()),
            ('footer-automotive', 'footer', NULL, 'link', 'Automotive', '/categories/automotive', 2, true, NOW(), NOW()),
            ('footer-consumer-electronics', 'footer', NULL, 'link', 'Consumer Electronics', '/categories/consumer-electronics', 3, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_index('idx_site_menu_items_parent', table_name='site_menu_items')
    op.drop_index('idx_site_menu_items_location', table_name='site_menu_items')
    op.drop_table('site_menu_items')
