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


def downgrade():
    op.drop_table('terminals')
    op.drop_table('terminal_categories')
    op.drop_table('terminal_manufacturers')
