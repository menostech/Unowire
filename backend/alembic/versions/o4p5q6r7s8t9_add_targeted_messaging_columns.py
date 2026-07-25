"""add targeted messaging columns and system_message_user_reads table

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8
Create Date: 2026-07-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'o4p5q6r7s8t9'
down_revision: str | None = 'n3o4p5q6r7s8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add recipient_type column with server_default so existing rows get 'broadcast'
    op.add_column(
        'system_messages',
        sa.Column('recipient_type', sa.String(length=20), nullable=False,
                  server_default='broadcast'),
    )
    # 2. Add recipient_targets JSONB column (nullable)
    op.add_column(
        'system_messages',
        sa.Column('recipient_targets', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    # 3. Create system_message_user_reads table (parallel to system_message_reads)
    op.create_table(
        'system_message_user_reads',
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('message_id', sa.BigInteger(), nullable=False),
        sa.Column('read_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'], ondelete='CASCADE',
            name='fk_system_message_user_reads_user_id_users',
        ),
        sa.ForeignKeyConstraint(
            ['message_id'], ['system_messages.id'], ondelete='CASCADE',
            name='fk_system_message_user_reads_message_id_system_messages',
        ),
        sa.PrimaryKeyConstraint('user_id', 'message_id'),
    )
    op.create_index(
        'ix_system_message_user_reads_message_id',
        'system_message_user_reads',
        ['message_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_system_message_user_reads_message_id', table_name='system_message_user_reads')
    op.drop_table('system_message_user_reads')
    op.drop_column('system_messages', 'recipient_targets')
    op.drop_column('system_messages', 'recipient_type')
