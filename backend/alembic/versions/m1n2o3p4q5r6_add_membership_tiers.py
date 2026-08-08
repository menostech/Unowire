"""add membership tiers

Revision ID: m1n2o3p4q5r6
Revises: f2a3b4c5d6e7
Create Date: 2026-08-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'm1n2o3p4q5r6'
down_revision: Union[str, None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'subscription_plans',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('tier_level', sa.String(length=20), nullable=False),
        sa.Column('price_monthly', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'),
        sa.Column('price_yearly', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='USD'),
        sa.Column('search_limit_daily', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('detail_view_limit_daily', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('download_limit_monthly', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_sales_led', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('features', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('trial_days', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tier_level', name='uq_subscription_plans_tier_level'),
    )

    op.create_table(
        'member_subscriptions',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('member_id', sa.BigInteger(), nullable=False),
        sa.Column('plan_id', sa.BigInteger(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('billing_cycle', sa.String(length=10), nullable=True),
        sa.Column('trial_start', sa.DateTime(), nullable=True),
        sa.Column('trial_end', sa.DateTime(), nullable=True),
        sa.Column('current_period_start', sa.DateTime(), nullable=True),
        sa.Column('current_period_end', sa.DateTime(), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(), nullable=True),
        sa.Column('snapshot_search_limit', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('snapshot_detail_limit', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('snapshot_download_limit', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE', name='fk_member_subscriptions_member_id'),
        sa.ForeignKeyConstraint(['plan_id'], ['subscription_plans.id'], ondelete='RESTRICT', name='fk_member_subscriptions_plan_id'),
    )

    op.execute("""
        CREATE INDEX idx_member_subscriptions_member_id
        ON member_subscriptions(member_id)
        WHERE status IN ('active','trialing','cancelled')
    """)

    op.create_table(
        'usage_records',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('member_id', sa.BigInteger(), nullable=False),
        sa.Column('record_date', sa.Date(), nullable=False),
        sa.Column('search_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('detail_view_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('download_count', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE', name='fk_usage_records_member_id'),
        sa.UniqueConstraint('member_id', 'record_date', name='uq_usage_member_date'),
    )

    op.execute("""
        INSERT INTO subscription_plans
            (name, tier_level, price_monthly, price_yearly, currency,
             search_limit_daily, detail_view_limit_daily, download_limit_monthly,
             is_sales_led, is_active, features, sort_order, trial_days, created_at, updated_at)
        VALUES
            ('Freemium', 'freemium', 0, 0, 'USD',
             10, 20, 0,
             false, true, '["10 daily searches","20 daily detail views","Community access"]'::jsonb,
             0, 0, NOW(), NOW()),
            ('Personal', 'personal', 15.00, 149.00, 'USD',
             0, 0, 0,
             false, true, '["Unlimited searches","Unlimited detail views","PDF downloads","Email support"]'::jsonb,
             1, 14, NOW(), NOW()),
            ('Enterprise', 'enterprise', 0, 0, 'USD',
             0, 0, 0,
             true, true, '["Unlimited everything","Dedicated support","Custom integrations","Team accounts"]'::jsonb,
             2, 0, NOW(), NOW())
        ON CONFLICT (tier_level) DO NOTHING
    """)

    op.execute("""
        INSERT INTO member_subscriptions
            (member_id, plan_id, status, billing_cycle, snapshot_search_limit, snapshot_detail_limit, snapshot_download_limit, created_at, updated_at)
        SELECT
            m.id,
            p.id,
            'active',
            NULL,
            10,
            20,
            0,
            NOW(),
            NOW()
        FROM members m
        CROSS JOIN subscription_plans p
        WHERE p.tier_level = 'freemium'
          AND NOT EXISTS (
              SELECT 1 FROM member_subscriptions ms
              WHERE ms.member_id = m.id AND ms.status IN ('active', 'trialing')
          )
    """)

    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES
            ('plans',         NULL, 'page', 'plans',         '/admin/settings/plans', 'Plans',         'CreditCard', 9,  true, NOW(), NOW()),
            ('subscriptions', NULL, 'page', 'subscriptions', '/admin/members',        'Subscriptions', 'Repeat',     10, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)

    op.execute("""
        INSERT INTO role_permissions (role_id, module)
        VALUES
            ('admin', 'plans'),
            ('admin', 'subscriptions')
        ON CONFLICT (role_id, module) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM role_permissions
        WHERE role_id = 'admin' AND module IN ('plans', 'subscriptions')
    """)

    op.execute("""
        DELETE FROM admin_menu_items
        WHERE id IN ('plans', 'subscriptions')
    """)

    op.drop_table('usage_records')
    op.execute('DROP INDEX IF EXISTS idx_member_subscriptions_member_id')
    op.drop_table('member_subscriptions')
    op.drop_table('subscription_plans')
