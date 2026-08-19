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
