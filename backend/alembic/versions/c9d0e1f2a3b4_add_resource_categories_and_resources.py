"""add resource_categories and resources tables

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-08-03 00:00:02.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # 1. Create resource_categories with self-reference
    op.create_table(
        'resource_categories',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column('parent_id', sa.String(length=100),
                  sa.ForeignKey('resource_categories.id', ondelete='CASCADE'), nullable=True),
        sa.Column('label', sa.String(length=200), nullable=False),
        sa.Column('slug', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('image_url', sa.String(length=500)),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('parent_id', 'slug', name='uq_resource_categories_parent_slug'),
    )

    # 2. Create resources table
    op.create_table(
        'resources',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column('category_id', sa.String(length=100),
                  sa.ForeignKey('resource_categories.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('slug', sa.String(length=300), nullable=False, unique=True),
        sa.Column('description', sa.Text()),
        sa.Column('file_filename', sa.String(length=500)),
        sa.Column('file_content_type', sa.String(length=200)),
        sa.Column('file_size_bytes', sa.Integer()),
        sa.Column('file_url_path', sa.String(length=500)),
        sa.Column('external_url', sa.String(length=500)),
        sa.Column('thumbnail_url', sa.String(length=500)),
        sa.Column('scope_type', sa.String(length=50)),
        sa.Column('scope_id', sa.String(length=100)),
        sa.Column('download_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_published', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('resources')
    op.drop_table('resource_categories')
