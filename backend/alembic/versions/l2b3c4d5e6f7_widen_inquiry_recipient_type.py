"""widen inquiry recipient_type to 30

Revision ID: l2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-07-21 00:00:00.000000

Widens inquiries.recipient_type from VARCHAR(20) to VARCHAR(30) so that
the value 'equipment_manufacturer' (22 chars) can be stored. The original
column length of 20 only accommodated 'manufacturer' (12 chars).
"""
from alembic import op
import sqlalchemy as sa


revision: str = 'l2b3c4d5e6f7'
down_revision: str | None = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        'inquiries',
        'recipient_type',
        existing_type=sa.VARCHAR(length=20),
        type_=sa.String(length=30),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        'inquiries',
        'recipient_type',
        existing_type=sa.VARCHAR(length=30),
        type_=sa.String(length=20),
        existing_nullable=False,
    )
