"""Tests for InvoiceService."""
import os
import uuid
from datetime import datetime
from unittest.mock import patch

import pytest

from app.core.security import hash_password
from app.models.invoice import Invoice
from app.models.member import Member
from app.models.order import Order
from app.models.subscription_plan import SubscriptionPlan
from app.services.invoice import InvoiceService


async def _make_order_plan_member(db_session, tag="pdf"):
    """Insert Member + Plan + Order and return (order, plan, member)."""
    suffix = uuid.uuid4().hex[:8]
    member = Member(
        email=f"inv-{tag}-{suffix}@test-member.com",
        password_hash=hash_password("test123456"),
        name=f"Inv {tag}",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)

    plan = SubscriptionPlan(
        name=f"TestPlan {suffix}",
        tier_level=f"test_{suffix}",
        price_monthly=15,
        price_yearly=149,
        is_active=True,
        features=[],
        sort_order=999,
        trial_days=0,
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)

    order = Order(
        member_id=member.id,
        plan_id=plan.id,
        billing_cycle="monthly",
        gateway="stripe",
        gateway_order_id=f"cs_test_{suffix}",
        amount_cents=1500,
        currency="usd",
        status="paid",
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(order)
    return order, plan, member


@pytest.mark.asyncio
async def test_generate_pdf_writes_file_and_sets_path(db_session, monkeypatch):
    """generate_pdf writes a PDF file to media/invoices/ and sets invoice.pdf_path."""
    monkeypatch.setenv("MEDIA_DIR", "/tmp/test-media-invoices")
    order, plan, member = await _make_order_plan_member(db_session, tag="pdf-gen")

    invoice = Invoice(
        invoice_number="INV-2026-000001",
        order_id=order.id,
        member_id=member.id,
        plan_id=plan.id,
        amount_cents=1500,
        tax_amount_cents=None,
        currency="usd",
        status="paid",
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)

    svc = InvoiceService(db_session)
    pdf_path = await svc.generate_pdf(invoice)

    assert pdf_path is not None
    assert invoice.pdf_path == pdf_path
    assert os.path.isfile(pdf_path)
    with open(pdf_path, "rb") as f:
        header = f.read(5)
    assert header == b"%PDF-"

    # Cleanup
    if os.path.isfile(pdf_path):
        os.remove(pdf_path)
    await db_session.delete(invoice)
    await db_session.delete(order)
    await db_session.delete(plan)
    await db_session.delete(member)
    await db_session.commit()
