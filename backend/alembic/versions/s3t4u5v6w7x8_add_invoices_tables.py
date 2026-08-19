"""add invoices tables

Revision ID: s3t4u5v6w7x8
Revises: r2s3t4u5v6w7
Create Date: 2026-08-19 00:00:00.000000

Introduces the `invoices` and `invoice_sequences` tables. Invoices are
created when a payment succeeds (via webhook) and store a sequential
per-year invoice number, PDF path, and billing period. The
invoice_sequences table holds one counter row per calendar year for
gapless invoice numbering.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "s3t4u5v6w7x8"
down_revision: Union[str, None] = "r2s3t4u5v6w7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "invoices",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("invoice_number", sa.String(length=30), nullable=False),
        sa.Column("order_id", sa.BigInteger(), nullable=False),
        sa.Column("member_id", sa.BigInteger(), nullable=False),
        sa.Column("plan_id", sa.BigInteger(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("tax_amount_cents", sa.Integer(), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="usd"),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("pdf_path", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="paid"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"], ondelete="CASCADE", name="fk_invoices_order_id"
        ),
        sa.ForeignKeyConstraint(
            ["member_id"], ["members.id"], ondelete="CASCADE", name="fk_invoices_member_id"
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["subscription_plans.id"], ondelete="RESTRICT", name="fk_invoices_plan_id"
        ),
        sa.UniqueConstraint("invoice_number", name="uq_invoices_invoice_number"),
        sa.UniqueConstraint("order_id", name="uq_invoices_order_id"),
    )

    op.create_table(
        "invoice_sequences",
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("next_seq", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("year"),
    )

    op.execute(
        """
        CREATE INDEX idx_invoices_member_id
        ON invoices(member_id)
        """
    )

    op.execute(
        """
        CREATE INDEX idx_invoices_order_id
        ON invoices(order_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_invoices_order_id")
    op.execute("DROP INDEX IF EXISTS idx_invoices_member_id")
    op.drop_table("invoice_sequences")
    op.drop_table("invoices")
