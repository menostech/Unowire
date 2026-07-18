"""add_pages_table

Revision ID: g7c8d9e0f1a2
Revises: f6b7c8d9e0f1
Create Date: 2026-07-18 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'g7c8d9e0f1a2'
down_revision: Union[str, None] = 'f6b7c8d9e0f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pages',
        sa.Column('id', sa.String(length=100), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('content', sa.Text(), nullable=False, server_default=''),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='draft'),
        sa.Column('is_visible', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('published_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('meta_title', sa.String(length=200), nullable=True),
        sa.Column('meta_description', sa.String(length=500), nullable=True),
        sa.Column('og_image_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug', name='uq_pages_slug'),
    )
    op.create_index('idx_pages_status_visible', 'pages', ['status', 'is_visible'])


def downgrade() -> None:
    op.drop_index('idx_pages_status_visible', table_name='pages')
    op.drop_table('pages')
