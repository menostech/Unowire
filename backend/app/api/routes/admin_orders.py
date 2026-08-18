"""Admin order management routes.

Currently provides the refund endpoint, which issues a full or partial
refund via PaymentService and records the result in the payments table.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.core.database import get_db
from app.models.order import Order
from app.models.payment import Payment
from app.schemas.order import OrderRead
from app.schemas.payment import PaymentRead
from app.services.payment import PaymentService

router = APIRouter(tags=["admin-orders"])


class RefundRequest(BaseModel):
    amount: int | None = Field(default=None, ge=1, description="Refund amount in cents. Omit for full refund.")


class RefundResponse(BaseModel):
    order: OrderRead
    refund_payment: PaymentRead | None


@router.post("/api/admin/orders/{order_id}/refund", response_model=RefundResponse)
async def refund_order(
    order_id: int,
    body: RefundRequest,
    db: AsyncSession = Depends(get_db),
    _payment_user=Depends(require_operator("payment")),
    _subs_user=Depends(require_operator("subscriptions")),
):
    """Issue a full or partial refund for an order.

    Requires both the `payment` and `subscriptions` RBAC modules.
    Calls PaymentService.refund_payment against the gateway that captured
    the original payment. On success, updates order.status and inserts a
    new payments row with type='refund'.

    Idempotent: refunding an already-fully-refunded order returns the
    existing state without calling the gateway.
    """
    # 1. Find the order
    order = await db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Order not found"})

    # 2. Idempotency: already fully refunded -> return existing state
    if order.status == "refunded":
        # Return the latest refund payment for this order
        refund_stmt = (
            select(Payment)
            .where(Payment.order_id == order_id, Payment.type == "refund")
            .order_by(Payment.created_at.desc())
            .limit(1)
        )
        result = await db.execute(refund_stmt)
        last_refund = result.scalar_one_or_none()
        return RefundResponse(
            order=OrderRead.model_validate(order),
            refund_payment=PaymentRead.model_validate(last_refund) if last_refund else None,
        )

    # 3. Find the original successful payment (type='payment' with gateway_payment_id)
    pay_stmt = (
        select(Payment)
        .where(
            Payment.order_id == order_id,
            Payment.type == "payment",
            Payment.gateway_payment_id.isnot(None),
        )
        .order_by(Payment.created_at.desc())
        .limit(1)
    )
    pay_result = await db.execute(pay_stmt)
    original_payment = pay_result.scalar_one_or_none()
    if original_payment is None:
        raise HTTPException(
            status_code=422,
            detail={"code": 422, "message": "No capturable payment found for this order"},
        )

    # 4. Calculate refunded total from existing refund payments
    refund_total_stmt = (
        select(func.coalesce(func.sum(Payment.amount_cents), 0))
        .where(Payment.order_id == order_id, Payment.type == "refund")
    )
    refund_total_result = await db.execute(refund_total_stmt)
    refunded_total = refund_total_result.scalar() or 0

    refundable_remaining = order.amount_cents - refunded_total
    if refundable_remaining <= 0:
        # Should not reach here (status would be 'refunded'), but guard anyway
        raise HTTPException(
            status_code=422,
            detail={"code": 422, "message": "Order has no refundable remaining amount"},
        )

    # 5. Determine refund amount (full if omitted)
    refund_amount = body.amount if body.amount is not None else refundable_remaining

    # 6. Validate: refunded_total + refund_amount <= original_amount
    if refunded_total + refund_amount > order.amount_cents:
        raise HTTPException(
            status_code=422,
            detail={
                "code": 422,
                "message": f"Refund amount {refund_amount} exceeds refundable remaining {refundable_remaining}",
            },
        )

    # 7. Call PaymentService.refund_payment
    svc = PaymentService(db)
    refund_result = await svc.refund_payment(
        gateway=order.gateway,
        payment_id=original_payment.gateway_payment_id,  # type: ignore[arg-type]
        amount_cents=refund_amount,
    )

    # 8. Insert the refund payment row
    refund_payment = Payment(
        order_id=order_id,
        gateway=order.gateway,
        gateway_payment_id=refund_result.refund_id,
        type="refund",
        status=refund_result.status,
        amount_cents=refund_result.amount_cents,
    )
    db.add(refund_payment)

    # 9. Update order status
    new_refunded_total = refunded_total + refund_result.amount_cents
    if new_refunded_total >= order.amount_cents:
        order.status = "refunded"
    else:
        order.status = "partially_refunded"
    db.add(order)

    await db.commit()
    await db.refresh(order)
    await db.refresh(refund_payment)

    return RefundResponse(
        order=OrderRead.model_validate(order),
        refund_payment=PaymentRead.model_validate(refund_payment),
    )
