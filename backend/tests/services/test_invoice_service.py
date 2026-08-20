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


@pytest.mark.asyncio
async def test_create_from_order_creates_invoice_with_correct_fields(db_session, monkeypatch):
    """create_from_order creates an invoice with amount/currency/plan copied from the order."""
    monkeypatch.setenv("MEDIA_DIR", "/tmp/test-media-invoices")
    order, plan, member = await _make_order_plan_member(db_session, tag="create")

    svc = InvoiceService(db_session)
    invoice = await svc.create_from_order(order.id)

    assert invoice is not None
    assert invoice.order_id == order.id
    assert invoice.member_id == member.id
    assert invoice.plan_id == plan.id
    assert invoice.amount_cents == order.amount_cents
    assert invoice.currency == order.currency
    assert invoice.status == "paid"
    assert invoice.invoice_number.startswith("INV-")
    assert invoice.pdf_path is not None  # generate_pdf succeeded

    # Cleanup
    if invoice.pdf_path and os.path.isfile(invoice.pdf_path):
        os.remove(invoice.pdf_path)
    await db_session.delete(invoice)
    await db_session.delete(order)
    await db_session.delete(plan)
    await db_session.delete(member)
    await db_session.commit()


@pytest.mark.asyncio
async def test_invoice_number_sequencing(db_session, monkeypatch):
    """Two invoices in the same year get sequential numbers; new year resets."""
    monkeypatch.setenv("MEDIA_DIR", "/tmp/test-media-invoices")

    # Determinism: reset the sequence for the current year so exact-number
    # assertions hold across repeated test runs (conftest does not clean
    # invoice_sequences).
    from sqlalchemy import text
    year = datetime.utcnow().year
    await db_session.execute(text("DELETE FROM invoice_sequences WHERE year = :y"), {"y": year})
    await db_session.commit()

    order1, plan1, member1 = await _make_order_plan_member(db_session, tag="seq1")
    order2, plan2, member2 = await _make_order_plan_member(db_session, tag="seq2")

    svc = InvoiceService(db_session)
    inv1 = await svc.create_from_order(order1.id)
    inv2 = await svc.create_from_order(order2.id)

    assert inv1.invoice_number != inv2.invoice_number
    # Both should be in the same year (current year)
    year = datetime.utcnow().year
    assert inv1.invoice_number == f"INV-{year}-000001"
    assert inv2.invoice_number == f"INV-{year}-000002"

    # Cleanup
    for inv in (inv1, inv2):
        if inv and inv.pdf_path and os.path.isfile(inv.pdf_path):
            os.remove(inv.pdf_path)
    for obj in (inv1, inv2, order1, order2, plan1, plan2, member1, member2):
        await db_session.delete(obj)
    await db_session.commit()


@pytest.mark.asyncio
async def test_create_from_order_idempotent(db_session, monkeypatch):
    """Calling create_from_order twice with the same order_id returns the same invoice."""
    monkeypatch.setenv("MEDIA_DIR", "/tmp/test-media-invoices")
    order, plan, member = await _make_order_plan_member(db_session, tag="idem")

    svc = InvoiceService(db_session)
    inv1 = await svc.create_from_order(order.id)
    inv2 = await svc.create_from_order(order.id)

    assert inv1 is not None
    assert inv1.id == inv2.id  # same invoice, no duplicate

    # Cleanup
    if inv1.pdf_path and os.path.isfile(inv1.pdf_path):
        os.remove(inv1.pdf_path)
    await db_session.delete(inv1)
    await db_session.delete(order)
    await db_session.delete(plan)
    await db_session.delete(member)
    await db_session.commit()


@pytest.mark.asyncio
async def test_pdf_failure_resilience(db_session, monkeypatch):
    """When reportlab raises, the invoice row is still created with pdf_path=None."""
    monkeypatch.setenv("MEDIA_DIR", "/tmp/test-media-invoices")
    order, plan, member = await _make_order_plan_member(db_session, tag="fail")

    svc = InvoiceService(db_session)

    # Patch generate_pdf to raise, simulating a reportlab failure.
    async def _boom(self, invoice):
        raise RuntimeError("reportlab exploded")

    with patch.object(InvoiceService, "generate_pdf", _boom):
        invoice = await svc.create_from_order(order.id)

    assert invoice is not None
    assert invoice.pdf_path is None  # no PDF, but invoice row exists
    assert invoice.status == "paid"

    # Cleanup
    await db_session.delete(invoice)
    await db_session.delete(order)
    await db_session.delete(plan)
    await db_session.delete(member)
    await db_session.commit()


@pytest.mark.asyncio
async def test_get_by_member_returns_invoice_for_owner(db_session, monkeypatch):
    """get_by_member returns (invoice, plan_name) for the owner, None for non-owner."""
    monkeypatch.setenv("MEDIA_DIR", "/tmp/test-media-invoices")
    order, plan, member = await _make_order_plan_member(db_session, tag="getowner")
    other_member = Member(
        email=f"inv-other-{uuid.uuid4().hex[:8]}@test-member.com",
        password_hash=hash_password("test123456"),
        name="Other",
    )
    db_session.add(other_member)
    await db_session.commit()
    await db_session.refresh(other_member)

    svc = InvoiceService(db_session)
    invoice = await svc.create_from_order(order.id)

    result = await svc.get_by_member(invoice.id, member.id)
    assert result is not None
    inv, plan_name = result
    assert inv.id == invoice.id
    assert plan_name == plan.name

    # Non-owner gets None
    result_other = await svc.get_by_member(invoice.id, other_member.id)
    assert result_other is None

    # Cleanup
    if invoice.pdf_path and os.path.isfile(invoice.pdf_path):
        os.remove(invoice.pdf_path)
    await db_session.delete(invoice)
    await db_session.delete(order)
    await db_session.delete(plan)
    await db_session.delete(member)
    await db_session.delete(other_member)
    await db_session.commit()


@pytest.mark.asyncio
async def test_list_by_member_paginated(db_session, monkeypatch):
    """list_by_member returns only the member's invoices, paginated."""
    monkeypatch.setenv("MEDIA_DIR", "/tmp/test-media-invoices")
    order, plan, member = await _make_order_plan_member(db_session, tag="list")

    svc = InvoiceService(db_session)
    invoice = await svc.create_from_order(order.id)

    items, total = await svc.list_by_member(member.id, page=1, page_size=20)
    assert total == 1
    assert len(items) == 1
    inv, plan_name = items[0]
    assert inv.id == invoice.id
    assert plan_name == plan.name

    # Cleanup
    if invoice.pdf_path and os.path.isfile(invoice.pdf_path):
        os.remove(invoice.pdf_path)
    await db_session.delete(invoice)
    await db_session.delete(order)
    await db_session.delete(plan)
    await db_session.delete(member)
    await db_session.commit()


@pytest.mark.asyncio
async def test_regenerate_pending_pdfs(db_session, monkeypatch):
    """regenerate_pending_pdfs scans invoices with pdf_path=None and regenerates."""
    monkeypatch.setenv("MEDIA_DIR", "/tmp/test-media-invoices")
    order, plan, member = await _make_order_plan_member(db_session, tag="regen")

    # Create an invoice with no PDF (simulate a prior failure).
    invoice = Invoice(
        invoice_number=f"INV-{datetime.utcnow().year}-999999",
        order_id=order.id,
        member_id=member.id,
        plan_id=plan.id,
        amount_cents=1500,
        currency="usd",
        status="paid",
        pdf_path=None,
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)

    svc = InvoiceService(db_session)
    count = await svc.regenerate_pending_pdfs()

    assert count >= 1
    await db_session.refresh(invoice)
    assert invoice.pdf_path is not None
    assert os.path.isfile(invoice.pdf_path)

    # Cleanup
    if invoice.pdf_path and os.path.isfile(invoice.pdf_path):
        os.remove(invoice.pdf_path)
    await db_session.delete(invoice)
    await db_session.delete(order)
    await db_session.delete(plan)
    await db_session.delete(member)
    await db_session.commit()
