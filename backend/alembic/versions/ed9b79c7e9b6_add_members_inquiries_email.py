"""add members inquiries email

Revision ID: ed9b79c7e9b6
Revises: c4d5e6f7a8b9
Create Date: 2026-07-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ed9b79c7e9b6'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. members table
    op.create_table(
        'members',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('email', sa.String(length=200), nullable=False),
        sa.Column('password_hash', sa.String(length=200), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('company', sa.String(length=200), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('verification_token', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email', name='uq_members_email'),
    )

    # 2. inquiries table
    op.create_table(
        'inquiries',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('sender_id', sa.BigInteger(), nullable=False),
        sa.Column('recipient_type', sa.String(length=20), nullable=False),
        sa.Column('recipient_id', sa.String(length=100), nullable=False),
        sa.Column('subject', sa.String(length=200), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('reply_body', sa.Text(), nullable=True),
        sa.Column('replied_at', sa.DateTime(), nullable=True),
        sa.Column('replied_by', sa.BigInteger(), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('is_member_read', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ['sender_id'], ['members.id'], ondelete='CASCADE',
            name='fk_inquiries_sender_id_members',
        ),
        sa.ForeignKeyConstraint(
            ['replied_by'], ['users.id'], ondelete='SET NULL',
            name='fk_inquiries_replied_by_users',
        ),
        sa.PrimaryKeyConstraint('id'),
    )

    # 3. email_configs table (singleton; only row id=1 exists)
    op.create_table(
        'email_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('smtp_host', sa.String(length=200), nullable=False),
        sa.Column('smtp_port', sa.Integer(), nullable=False),
        sa.Column('smtp_user', sa.String(length=200), nullable=False),
        sa.Column('smtp_password', sa.String(length=500), nullable=False),
        sa.Column('from_name', sa.String(length=100), nullable=False),
        sa.Column('from_email', sa.String(length=200), nullable=False),
        sa.Column('use_tls', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_by', sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # 4. email_templates table
    op.create_table(
        'email_templates',
        sa.Column('id', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('subject', sa.String(length=200), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )

    # Seed email templates
    op.execute("""
        INSERT INTO email_templates (id, name, subject, body, is_system, is_active, created_at, updated_at)
        VALUES
            ('verify_email', 'Email Verification',
             'Verify Your Email - {from_name}',
             'Hello {name},\n\nPlease verify your email by clicking the link below:\n{verify_url}\n\nThis link expires in 24 hours.\n\n- Unowire Team',
             true, true, NOW(), NOW()),
            ('inquiry_received', 'Inquiry Received',
             'New Inquiry: {subject}',
             'Hello {staff_name},\n\nYou received a new inquiry from {member_name} ({member_company}).\n\nSubject: {subject}\nMessage: {body}\n\nView: {inquiry_url}\n\n- Unowire System',
             true, true, NOW(), NOW()),
            ('inquiry_replied', 'Inquiry Replied',
             'Reply to Your Inquiry: {subject}',
             'Hello {member_name},\n\nYour inquiry has been replied to.\n\nSubject: {subject}\nReply: {reply_body}\n\nView: {inquiry_url}\n\n- Unowire Team',
             true, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
    """)

    # Seed admin menu items: inquiries (top-level) and email-config (under settings)
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES
            ('menu-inquiries', NULL, 'page', 'inquiries', NULL, 'Inquiries', 'Mail', 6, true, NOW(), NOW()),
            ('menu-email-config', 'settings', 'page', 'email_config', NULL, 'Email Config', 'Mail', 3, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
    """)

    # Add inquiries + email_config to admin/cable_manager/equipment_manager role permissions
    op.execute("""
        INSERT INTO role_permissions (role_id, module)
        VALUES
            ('admin', 'inquiries'),
            ('admin', 'email_config'),
            ('cable_manager', 'inquiries'),
            ('equipment_manager', 'inquiries')
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("DELETE FROM role_permissions WHERE module IN ('inquiries', 'email_config')")
    op.execute("DELETE FROM admin_menu_items WHERE id IN ('menu-inquiries', 'menu-email-config')")
    op.execute("DELETE FROM email_templates WHERE id IN ('verify_email', 'inquiry_received', 'inquiry_replied')")

    op.drop_table('email_templates')
    op.drop_table('email_configs')
    op.drop_table('inquiries')
    op.drop_table('members')
