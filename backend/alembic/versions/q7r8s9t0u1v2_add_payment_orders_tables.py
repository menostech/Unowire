"""add payment orders tables

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-08-17 00:00:02

Introduces the `orders` and `payments` tables that back the payment
gateway foundation. Orders track a member's intent to purchase a
subscription plan via a given gateway (stripe/paypal); payments record
the immutable stream of gateway events (charges, refunds, disputes)
keyed by the gateway's event id for idempotent webhook processing.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "q7r8s9t0u1v2"
down_revision: Union[str, None] = "p6q7r8s9t0u1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("member_id", sa.BigInteger(), nullable=False),
        sa.Column("plan_id", sa.BigInteger(), nullable=False),
        sa.Column("billing_cycle", sa.String(length=10), nullable=True),
        sa.Column("gateway", sa.String(length=20), nullable=False),
        sa.Column("gateway_order_id", sa.String(length=255), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="usd"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["member_id"], ["members.id"], ondelete="CASCADE", name="fk_orders_member_id"
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["subscription_plans.id"], ondelete="RESTRICT", name="fk_orders_plan_id"
        ),
    )

    op.create_table(
        "payments",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.BigInteger(), nullable=True),
        sa.Column("gateway", sa.String(length=20), nullable=False),
        sa.Column("gateway_payment_id", sa.String(length=255), nullable=True),
        sa.Column("gateway_event_id", sa.String(length=255), nullable=True),
        sa.Column("event_type", sa.String(length=100), nullable=True),
        sa.Column("type", sa.String(length=20), nullable=False, server_default="payment"),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("fee_cents", sa.Integer(), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"], ondelete="CASCADE", name="fk_payments_order_id"
        ),
    )

    op.execute(
        """
        CREATE INDEX idx_orders_member_id
        ON orders(member_id)
        """
    )

    op.execute(
        """
        CREATE INDEX idx_payments_order_id
        ON payments(order_id)
        """
    )

    op.execute(
        """
        CREATE UNIQUE INDEX uq_payments_gateway_event_id
        ON payments(gateway_event_id)
        WHERE gateway_event_id IS NOT NULL
        """
    )

    op.execute(
        """
        INSERT INTO role_permissions (role_id, module)
        VALUES ('admin', 'payment')
        ON CONFLICT (role_id, module) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE role_id = 'admin' AND module = 'payment'
        """
    )

    op.execute("DROP INDEX IF EXISTS uq_payments_gateway_event_id")
    op.execute("DROP INDEX IF EXISTS idx_payments_order_id")
    op.execute("DROP INDEX IF EXISTS idx_orders_member_id")

    op.drop_table("payments")
    op.drop_table("orders")
