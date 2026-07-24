"""add page_views table for portal dashboard

Revision ID: m2n3o4p5q6r7
Revises: l2b3c4d5e6f7
Create Date: 2026-07-21 00:00:00.000000

Creates the page_views table to track SSR page views on cable and equipment
detail pages. Data feeds the portal dashboard's Views stat and 30-day trend
chart. Denormalized scope_type/scope_id columns enable fast scope-filtered
aggregation without joining back to the entity tables.
"""
from alembic import op
import sqlalchemy as sa


revision: str = 'm2n3o4p5q6r7'
down_revision: str | None = 'l2b3c4d5e6f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'page_views',
        sa.Column('id', sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column('entity_type', sa.String(length=30), nullable=False),
        sa.Column('entity_id', sa.String(length=100), nullable=False),
        sa.Column('scope_type', sa.String(length=50), nullable=False),
        sa.Column('scope_id', sa.String(length=100), nullable=False),
        sa.Column('viewed_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        'ix_page_views_scope_date',
        'page_views',
        ['scope_type', 'scope_id', 'viewed_at'],
    )
    op.create_index(
        'ix_page_views_entity',
        'page_views',
        ['entity_type', 'entity_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_page_views_entity', table_name='page_views')
    op.drop_index('ix_page_views_scope_date', table_name='page_views')
    op.drop_table('page_views')
