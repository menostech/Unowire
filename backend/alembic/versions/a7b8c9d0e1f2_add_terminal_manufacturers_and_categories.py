"""add terminal_manufacturers and terminal_categories tables

Revision ID: a7b8c9d0e1f2
Revises: q2r3s4t5u6v7
Create Date: 2026-08-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'q2r3s4t5u6v7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # 1. Create terminal_manufacturers
    op.create_table(
        'terminal_manufacturers',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column('name', sa.String(length=200), nullable=False, unique=True),
        sa.Column('slug', sa.String(length=200), nullable=False, unique=True),
        sa.Column('country', sa.String(length=100)),
        sa.Column('website', sa.String(length=500)),
        sa.Column('image_url', sa.String(length=500)),
        sa.Column('description', sa.Text()),
        sa.Column('founded_year', sa.Integer()),
        sa.Column('address', sa.String(length=500)),
        sa.Column('phone', sa.String(length=100)),
        sa.Column('email', sa.String(length=200)),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # 2. Create terminal_categories with self-reference
    op.create_table(
        'terminal_categories',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column('parent_id', sa.String(length=100),
                  sa.ForeignKey('terminal_categories.id', ondelete='CASCADE'), nullable=True),
        sa.Column('label', sa.String(length=200), nullable=False),
        sa.Column('slug', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('image_url', sa.String(length=500)),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('parent_id', 'slug', name='uq_terminal_categories_parent_slug'),
    )

    # 3. Create terminals with FKs to manufacturers and categories (RESTRICT)
    op.create_table(
        'terminals',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column('manufacturer_id', sa.String(length=100),
                  sa.ForeignKey('terminal_manufacturers.id', ondelete='RESTRICT'),
                  nullable=False),
        sa.Column('category_id', sa.String(length=100),
                  sa.ForeignKey('terminal_categories.id', ondelete='RESTRICT'),
                  nullable=False),
        sa.Column('model', sa.String(length=200), nullable=False),
        sa.Column('slug', sa.String(length=200), nullable=False, unique=True),
        sa.Column('applicable_specs', postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default=sa.text("'[]'")),
        sa.Column('description', sa.Text()),
        sa.Column('image_url', sa.String(length=500)),
        sa.Column('external_url', sa.String(length=500)),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # 4. Seed admin menu: "Terminal & Connector" group + 3 child pages.
    # Mirrors the equipment menu seed in revision f5a6b7c8d9e0.
    # Top-level sort_order 9 avoids collision with equipment (5) and claims (8).
    # Idempotent via ON CONFLICT (id) DO NOTHING.
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES
            ('terminal-connector', NULL,                 'group', NULL,            NULL, 'Terminal & Connector', 'Plug',    9, true, NOW(), NOW()),
            ('terminal-mfrs',      'terminal-connector', 'page',  'terminal-mfrs', NULL, 'Manufacturers',        'Factory', 0, true, NOW(), NOW()),
            ('terminal-cats',      'terminal-connector', 'page',  'terminal-cats', NULL, 'Categories',           'FolderOpen', 1, true, NOW(), NOW()),
            ('terminals',          'terminal-connector', 'page',  'terminals',     NULL, 'Terminals',            'Cable',   2, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)

    # 5. Seed the global container folder for terminal manufacturers.
    # Mirrors the container-folder seeds in revision f6b7c8d9e0f1.
    # CRUDFolder.provision_for_manufacturer uses scalar_one() to look up this row,
    # so it must exist before any terminal-manufacturer media operation runs.
    op.execute(
        sa.text("INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at) "
                "VALUES ('Terminal Manufacturers', NULL, NULL, NULL, NOW())")
    )


def downgrade():
    # Remove the terminal-manufacturers container folder seed first.
    op.execute(
        sa.text("DELETE FROM media_folders WHERE name = 'Terminal Manufacturers' AND scope_type IS NULL")
    )

    # Remove seeded admin menu rows (children first, then group) before dropping tables.
    op.execute("""
        DELETE FROM admin_menu_items
        WHERE id IN ('terminals', 'terminal-cats', 'terminal-mfrs', 'terminal-connector')
    """)

    op.drop_table('terminals')
    op.drop_table('terminal_categories')
    op.drop_table('terminal_manufacturers')
