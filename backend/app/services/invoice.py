"""Invoice generation and billing-history service.

Creates invoice records from paid orders, generates PDF documents via
reportlab, and provides query methods for member/admin billing history.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice, InvoiceSequence
from app.models.member import Member
from app.models.order import Order
from app.models.subscription_plan import SubscriptionPlan

logger = logging.getLogger(__name__)


class InvoiceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_pdf(self, invoice: Invoice) -> str | None:
        """Generate a PDF invoice via reportlab platypus.

        Writes to ``media/invoices/{invoice_id}.pdf``, updates
        ``invoice.pdf_path``, and returns the path. Returns ``None`` on
        failure (exception logged, not propagated).
        """
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.lib.units import inch
            from reportlab.platypus import (
                SimpleDocTemplate,
                Paragraph,
                Spacer,
                Table,
                TableStyle,
            )
            from reportlab.lib import colors
        except ImportError:
            logger.exception("reportlab is not installed; cannot generate PDF")
            return None

        # Resolve related data for the PDF content.
        order = await self.db.get(Order, invoice.order_id)
        plan = await self.db.get(SubscriptionPlan, invoice.plan_id)
        member = await self.db.get(Member, invoice.member_id)
        if order is None or plan is None or member is None:
            logger.error("Cannot generate PDF: missing related data for invoice %s", invoice.id)
            return None

        media_dir = os.environ.get("MEDIA_DIR", "/app/media")
        invoices_dir = os.path.join(media_dir, "invoices")
        os.makedirs(invoices_dir, exist_ok=True)
        pdf_path = os.path.join(invoices_dir, f"{invoice.id}.pdf")

        try:
            styles = getSampleStyleSheet()
            doc = SimpleDocTemplate(
                pdf_path,
                pagesize=letter,
                leftMargin=1 * inch,
                rightMargin=1 * inch,
                topMargin=1 * inch,
                bottomMargin=1 * inch,
            )
            flowables = []

            # Header
            flowables.append(Paragraph("<b>UnoWire</b>", styles["Title"]))
            flowables.append(Spacer(1, 0.3 * inch))

            # Invoice info
            flowables.append(Paragraph(f"Invoice {invoice.invoice_number}", styles["Heading2"]))
            issued = invoice.created_at.strftime("%Y-%m-%d") if invoice.created_at else "N/A"
            flowables.append(Paragraph(f"Issued: {issued}", styles["Normal"]))
            flowables.append(Spacer(1, 0.2 * inch))

            # Bill To
            flowables.append(Paragraph("<b>Bill To:</b>", styles["Normal"]))
            flowables.append(Paragraph(member.email, styles["Normal"]))
            if member.name:
                flowables.append(Paragraph(member.name, styles["Normal"]))
            if member.company:
                flowables.append(Paragraph(member.company, styles["Normal"]))
            flowables.append(Spacer(1, 0.2 * inch))

            # Plan + period
            plan_label = plan.name
            if order.billing_cycle:
                plan_label += f" ({order.billing_cycle.capitalize()})"
            flowables.append(Paragraph(f"Plan: {plan_label}", styles["Normal"]))
            if invoice.period_start and invoice.period_end:
                flowables.append(
                    Paragraph(
                        f"Period: {invoice.period_start} to {invoice.period_end}",
                        styles["Normal"],
                    )
                )
            flowables.append(Spacer(1, 0.2 * inch))

            # Totals table
            currency_symbol = "$" if invoice.currency.lower() == "usd" else invoice.currency.upper() + " "
            subtotal_str = f"{currency_symbol}{invoice.amount_cents / 100:.2f}"
            rows = [["Subtotal", subtotal_str]]
            if invoice.tax_amount_cents and invoice.tax_amount_cents > 0:
                tax_str = f"{currency_symbol}{invoice.tax_amount_cents / 100:.2f}"
                rows.append(["Tax", tax_str])
            total_cents = invoice.amount_cents + (invoice.tax_amount_cents or 0)
            rows.append(["Total", f"{currency_symbol}{total_cents / 100:.2f}"])

            table = Table(rows, colWidths=[3 * inch, 2 * inch])
            table.setStyle(
                TableStyle(
                    [
                        ("fontSize", (0, 0), (-1, -1), 10),
                        ("bottomPadding", (0, 0), (-1, -1), 4),
                        ("topPadding", (0, 0), (-1, -1), 4),
                        ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.grey),
                        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                    ]
                )
            )
            flowables.append(table)
            flowables.append(Spacer(1, 0.3 * inch))

            # Payment method
            flowables.append(Paragraph(f"Payment Method: {order.gateway.capitalize()}", styles["Normal"]))
            flowables.append(Spacer(1, 0.3 * inch))

            # Footer
            flowables.append(Paragraph("Thank you for your subscription.", styles["Normal"]))

            doc.build(flowables)

            invoice.pdf_path = pdf_path
            self.db.add(invoice)
            await self.db.commit()
            await self.db.refresh(invoice)
            return pdf_path
        except Exception:
            logger.exception("PDF generation failed for invoice %s", invoice.id)
            return None

    async def create_from_order(self, order_id: int) -> Invoice | None:
        """Idempotently create an invoice from a paid order.

        Returns the existing invoice if one already exists for this
        ``order_id`` (idempotency via the unique constraint on
        ``invoices.order_id``). Resolves the order + member + plan,
        assigns a sequential invoice number, inserts the invoice row
        with ``status='paid'`` and ``pdf_path=None``, then attempts
        ``generate_pdf``. PDF failures are caught and logged — the
        invoice row is still returned with ``pdf_path=None``.
        """
        from sqlalchemy.exc import IntegrityError

        # 1. Idempotency: check for existing invoice
        stmt = select(Invoice).where(Invoice.order_id == order_id).limit(1)
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing is not None:
            return existing

        # 2. Resolve order + member + plan
        order = await self.db.get(Order, order_id)
        if order is None:
            logger.warning("create_from_order: order %s not found", order_id)
            return None

        plan = await self.db.get(SubscriptionPlan, order.plan_id)
        if plan is None:
            logger.warning("create_from_order: plan %s not found for order %s", order.plan_id, order_id)
            return None

        # 3. Assign invoice number
        invoice_number = await self._assign_invoice_number()

        # 4. Insert invoice row
        invoice = Invoice(
            invoice_number=invoice_number,
            order_id=order.id,
            member_id=order.member_id,
            plan_id=order.plan_id,
            amount_cents=order.amount_cents,
            tax_amount_cents=None,
            currency=order.currency,
            period_start=None,
            period_end=None,
            pdf_path=None,
            status="paid",
        )
        self.db.add(invoice)
        try:
            await self.db.commit()
        except IntegrityError:
            # Race condition: another transaction created the invoice first.
            await self.db.rollback()
            result = await self.db.execute(stmt)
            return result.scalar_one_or_none()
        await self.db.refresh(invoice)

        # 5. Try generate_pdf — catch exceptions, leave pdf_path=null
        try:
            await self.generate_pdf(invoice)
        except Exception:
            logger.exception("generate_pdf failed during create_from_order for invoice %s", invoice.id)

        return invoice

    async def _assign_invoice_number(self) -> str:
        """Assign a sequential invoice number: INV-{YYYY}-{000001}.

        Uses the ``invoice_sequences`` table with ``SELECT ... FOR UPDATE``
        to ensure gapless numbering. If the year row doesn't exist, it is
        inserted. The unique constraint on ``invoice_number`` is the
        backstop for any race that slips past the row lock.
        """
        from sqlalchemy.exc import IntegrityError

        year = datetime.utcnow().year

        for _attempt in range(3):
            stmt = (
                select(InvoiceSequence)
                .where(InvoiceSequence.year == year)
                .with_for_update()
            )
            result = await self.db.execute(stmt)
            seq_row = result.scalar_one_or_none()

            if seq_row is None:
                # Insert the year row. If another transaction inserts first,
                # IntegrityError -> retry (row will exist on next iteration).
                seq_row = InvoiceSequence(year=year, next_seq=1)
                self.db.add(seq_row)
                try:
                    await self.db.flush()
                except IntegrityError:
                    await self.db.rollback()
                    continue

            seq = seq_row.next_seq
            seq_row.next_seq = seq + 1
            self.db.add(seq_row)
            await self.db.commit()
            return f"INV-{year}-{seq:06d}"

        # Should not reach here under normal conditions.
        logger.error("Failed to assign invoice number after 3 attempts")
        raise RuntimeError("Failed to assign invoice number")
