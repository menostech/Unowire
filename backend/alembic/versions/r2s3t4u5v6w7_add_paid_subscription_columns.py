"""add paid subscription columns

Revision ID: r2s3t4u5v6w7
Revises: q7r8s9t0u1v2
Create Date: 2026-08-17 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "r2s3t4u5v6w7"
down_revision = "q7r8s9t0u1v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # member_subscriptions: paid lifecycle columns
    op.add_column("member_subscriptions", sa.Column("gateway", sa.String(20), nullable=True))
    op.add_column("member_subscriptions", sa.Column("gateway_subscription_id", sa.String(255), nullable=True))
    op.add_column("member_subscriptions", sa.Column("payment_method_id", sa.String(255), nullable=True))
    op.add_column("member_subscriptions", sa.Column("grace_period_end", sa.DateTime(), nullable=True))

    # subscription_plans: pre-created Stripe Price IDs
    op.add_column("subscription_plans", sa.Column("stripe_price_id_monthly", sa.String(255), nullable=True))
    op.add_column("subscription_plans", sa.Column("stripe_price_id_yearly", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("subscription_plans", "stripe_price_id_yearly")
    op.drop_column("subscription_plans", "stripe_price_id_monthly")
    op.drop_column("member_subscriptions", "grace_period_end")
    op.drop_column("member_subscriptions", "payment_method_id")
    op.drop_column("member_subscriptions", "gateway_subscription_id")
    op.drop_column("member_subscriptions", "gateway")
