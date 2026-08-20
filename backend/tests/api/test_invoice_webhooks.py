"""Tests for invoice generation via webhook handlers."""
import pytest
from unittest.mock import patch, AsyncMock


@pytest.mark.asyncio
async def test_stripe_invoice_payment_succeeded_creates_invoice(db_session, personal_plan, freemium_plan):
    """The invoice.payment_succeeded handler creates an invoice for the order."""
    from datetime import datetime
    from app.core.security import hash_password
    from app.models.member import Member
    from app.models.order import Order
    from app.models.member_subscription import MemberSubscription
    from app.services.payment_webhooks import _handle_stripe_payment_succeeded

    member = Member(
        email="wh-stripe@test-member.com",
        password_hash=hash_password("test123456"),
        name="WH Stripe",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)

    order = Order(
        member_id=member.id,
        plan_id=personal_plan.id,
        billing_cycle="monthly",
        gateway="stripe",
        gateway_order_id="cs_test_wh_1",
        amount_cents=1500,
        currency="usd",
        status="paid",
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(order)

    sub = MemberSubscription(
        member_id=member.id,
        plan_id=personal_plan.id,
        status="paid",
        billing_cycle="monthly",
        gateway="stripe",
        gateway_subscription_id="sub_test_wh_1",
    )
    db_session.add(sub)
    await db_session.commit()
    await db_session.refresh(sub)

    period_end = int(datetime.utcnow().timestamp())
    event = {
        "id": "evt_inv_1",
        "type": "invoice.payment_succeeded",
        "data": {
            "object": {
                "subscription": "sub_test_wh_1",
                "period_end": period_end,
                "metadata": {"order_id": str(order.id)},
            }
        },
    }

    with patch(
        "app.services.invoice.InvoiceService.generate_pdf",
        new=AsyncMock(return_value="/tmp/test.pdf"),
    ):
        await _handle_stripe_payment_succeeded(event, event, db_session)

    from app.models.invoice import Invoice
    from sqlalchemy import select
    stmt = select(Invoice).where(Invoice.order_id == order.id)
    invoice = (await db_session.execute(stmt)).scalar_one_or_none()
    assert invoice is not None
    assert invoice.amount_cents == 1500
    assert invoice.member_id == member.id

    # Cleanup
    await db_session.delete(invoice)
    await db_session.delete(sub)
    await db_session.delete(order)
    await db_session.delete(member)
    await db_session.commit()


@pytest.mark.asyncio
async def test_webhook_invoice_idempotent_on_replay(db_session, personal_plan, freemium_plan):
    """Replaying the same invoice.payment_succeeded event creates only one invoice."""
    from datetime import datetime
    from app.core.security import hash_password
    from app.models.member import Member
    from app.models.order import Order
    from app.models.member_subscription import MemberSubscription
    from app.services.payment_webhooks import _handle_stripe_payment_succeeded

    member = Member(
        email="wh-replay@test-member.com",
        password_hash=hash_password("test123456"),
        name="WH Replay",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)

    order = Order(
        member_id=member.id,
        plan_id=personal_plan.id,
        billing_cycle="monthly",
        gateway="stripe",
        gateway_order_id="cs_test_wh_2",
        amount_cents=1500,
        currency="usd",
        status="paid",
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(order)

    sub = MemberSubscription(
        member_id=member.id,
        plan_id=personal_plan.id,
        status="paid",
        billing_cycle="monthly",
        gateway="stripe",
        gateway_subscription_id="sub_test_wh_2",
    )
    db_session.add(sub)
    await db_session.commit()
    await db_session.refresh(sub)

    period_end = int(datetime.utcnow().timestamp())
    event = {
        "id": "evt_inv_replay",
        "type": "invoice.payment_succeeded",
        "data": {
            "object": {
                "subscription": "sub_test_wh_2",
                "period_end": period_end,
                "metadata": {"order_id": str(order.id)},
            }
        },
    }

    with patch(
        "app.services.invoice.InvoiceService.generate_pdf",
        new=AsyncMock(return_value="/tmp/test.pdf"),
    ):
        await _handle_stripe_payment_succeeded(event, event, db_session)
        await _handle_stripe_payment_succeeded(event, event, db_session)  # replay

    from app.models.invoice import Invoice
    from sqlalchemy import select, func
    count_stmt = select(func.count(Invoice.id)).where(Invoice.order_id == order.id)
    count = (await db_session.execute(count_stmt)).scalar()
    assert count == 1  # no duplicate

    # Cleanup
    stmt = select(Invoice).where(Invoice.order_id == order.id)
    invoice = (await db_session.execute(stmt)).scalar_one()
    await db_session.delete(invoice)
    await db_session.delete(sub)
    await db_session.delete(order)
    await db_session.delete(member)
    await db_session.commit()
