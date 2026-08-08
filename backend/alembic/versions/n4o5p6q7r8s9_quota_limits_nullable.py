"""quota limits nullable: NULL = unlimited, 0 = disabled

Revision ID: n4o5p6q7r8s9
Revises: m1n2o3p4q5r6
Create Date: 2026-08-08 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'n4o5p6q7r8s9'
down_revision: Union[str, None] = 'm1n2o3p4q5r6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make limit columns nullable: NULL = unlimited, 0 = disabled.
    op.alter_column('subscription_plans', 'search_limit_daily',
                    existing_type=sa.Integer(), nullable=True)
    op.alter_column('subscription_plans', 'detail_view_limit_daily',
                    existing_type=sa.Integer(), nullable=True)
    op.alter_column('subscription_plans', 'download_limit_monthly',
                    existing_type=sa.Integer(), nullable=True)

    op.alter_column('member_subscriptions', 'snapshot_search_limit',
                    existing_type=sa.Integer(), nullable=True)
    op.alter_column('member_subscriptions', 'snapshot_detail_limit',
                    existing_type=sa.Integer(), nullable=True)
    op.alter_column('member_subscriptions', 'snapshot_download_limit',
                    existing_type=sa.Integer(), nullable=True)

    # Personal and Enterprise use NULL (unlimited) for all limits.
    # Freemium keeps 10/20/0 (0 download = disabled).
    op.execute("""
        UPDATE subscription_plans
        SET search_limit_daily = NULL,
            detail_view_limit_daily = NULL,
            download_limit_monthly = NULL
        WHERE tier_level IN ('personal', 'enterprise')
    """)

    # Backfill existing subscription snapshots to match.
    op.execute("""
        UPDATE member_subscriptions ms
        SET snapshot_search_limit = NULL,
            snapshot_detail_limit = NULL,
            snapshot_download_limit = NULL
        FROM subscription_plans sp
        WHERE ms.plan_id = sp.id
          AND sp.tier_level IN ('personal', 'enterprise')
    """)


def downgrade() -> None:
    # Revert personal/enterprise back to 0 (old "unlimited" sentinel).
    op.execute("""
        UPDATE subscription_plans
        SET search_limit_daily = 0,
            detail_view_limit_daily = 0,
            download_limit_monthly = 0
        WHERE tier_level IN ('personal', 'enterprise')
              AND search_limit_daily IS NULL
    """)
    op.execute("""
        UPDATE member_subscriptions
        SET snapshot_search_limit = 0,
            snapshot_detail_limit = 0,
            snapshot_download_limit = 0
        WHERE snapshot_search_limit IS NULL
    """)
    op.alter_column('member_subscriptions', 'snapshot_download_limit',
                    existing_type=sa.Integer(), nullable=False,
                    server_default='0')
    op.alter_column('member_subscriptions', 'snapshot_detail_limit',
                    existing_type=sa.Integer(), nullable=False,
                    server_default='0')
    op.alter_column('member_subscriptions', 'snapshot_search_limit',
                    existing_type=sa.Integer(), nullable=False,
                    server_default='0')
    op.alter_column('subscription_plans', 'download_limit_monthly',
                    existing_type=sa.Integer(), nullable=False,
                    server_default='0')
    op.alter_column('subscription_plans', 'detail_view_limit_daily',
                    existing_type=sa.Integer(), nullable=False,
                    server_default='0')
    op.alter_column('subscription_plans', 'search_limit_daily',
                    existing_type=sa.Integer(), nullable=False,
                    server_default='0')
