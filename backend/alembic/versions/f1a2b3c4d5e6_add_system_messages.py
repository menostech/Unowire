"""add system_messages tables and menu item

Revision ID: f1a2b3c4d5e6
Revises: k1a2b3c4d5e6
Create Date: 2026-07-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: str | None = 'k1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. system_messages table
    op.create_table(
        'system_messages',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_by', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ['created_by'], ['users.id'], ondelete='SET NULL',
            name='fk_system_messages_created_by_users',
        ),
        sa.PrimaryKeyConstraint('id'),
    )

    # 2. system_message_reads join table
    op.create_table(
        'system_message_reads',
        sa.Column('member_id', sa.BigInteger(), nullable=False),
        sa.Column('message_id', sa.BigInteger(), nullable=False),
        sa.Column('read_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ['member_id'], ['members.id'], ondelete='CASCADE',
            name='fk_system_message_reads_member_id_members',
        ),
        sa.ForeignKeyConstraint(
            ['message_id'], ['system_messages.id'], ondelete='CASCADE',
            name='fk_system_message_reads_message_id_system_messages',
        ),
        sa.PrimaryKeyConstraint('member_id', 'message_id'),
    )
    op.create_index(
        'ix_system_message_reads_message_id',
        'system_message_reads',
        ['message_id'],
    )

    # 3. Seed 'Messages' menu item under settings group (sort_order=7)
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES ('menu-messages', 'settings', 'page', 'messages', NULL, 'Messages', 'Megaphone', 7, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)

    # 4. Grant admin role access to messages module
    op.execute("""
        INSERT INTO role_permissions (role_id, module)
        VALUES ('admin', 'messages')
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM role_permissions WHERE module = 'messages'")
    op.execute("DELETE FROM admin_menu_items WHERE id = 'menu-messages'")
    op.drop_index('ix_system_message_reads_message_id', table_name='system_message_reads')
    op.drop_table('system_message_reads')
    op.drop_table('system_messages')
