"""add post_categories and posts tables

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-08-03 00:00:04.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # 1. Create post_categories (flat, single-level — no parent_id)
    op.create_table(
        'post_categories',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column('slug', sa.String(length=200), nullable=False),
        sa.Column('label', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('slug', name='uq_post_categories_slug'),
    )

    # 2. Create posts table
    op.create_table(
        'posts',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column('category_id', sa.String(length=100),
                  sa.ForeignKey('post_categories.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('slug', sa.String(length=300), nullable=False),
        sa.Column('content', sa.Text(), nullable=False, server_default=''),
        sa.Column('excerpt', sa.Text()),
        sa.Column('cover_image_url', sa.String(length=500)),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='draft'),
        sa.Column('is_visible', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('published_at', sa.DateTime()),
        sa.Column('meta_title', sa.String(length=200)),
        sa.Column('meta_description', sa.String(length=500)),
        sa.Column('og_image_url', sa.String(length=500)),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('category_id', 'slug', name='uq_posts_category_slug'),
    )


def downgrade():
    op.drop_table('posts')
    op.drop_table('post_categories')
