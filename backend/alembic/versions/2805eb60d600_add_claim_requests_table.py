"""add claim_requests table

Revision ID: 2805eb60d600
Revises: o4p5q6r7s8t9
Create Date: 2026-07-30 04:10:18.547440

Creates the `claim_requests` table used by the portal "Claim Your Company"
feature to store submission requests from manufacturers who want to claim
their company profile.

Note: autogenerate also detected unrelated drift (removed page_views/pages/
site_menu_items tables, description type change on recommended_equipments,
removed admin_menu_items indexes). Those changes are intentionally omitted
from this migration; they are out of scope for the portal-brand-claim change
and should be handled separately if needed.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2805eb60d600'
down_revision: Union[str, None] = 'o4p5q6r7s8t9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'claim_requests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('manufacturer_type', sa.String(length=20), nullable=False),
        sa.Column('manufacturer_id', sa.String(length=100), nullable=False),
        sa.Column('contact_name', sa.String(length=200), nullable=False),
        sa.Column('contact_email', sa.String(length=200), nullable=False),
        sa.Column('contact_phone', sa.String(length=50), nullable=True),
        sa.Column('proof_description', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
        sa.Column('reviewed_by', sa.String(length=100), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('claim_requests')
