import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import prisma from "@/lib/prisma";
import { apiError, ApiError, requireUser } from "@/server/http";

function safeText(value: unknown) {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .slice(0, 140);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser();
    const { id } = await context.params;
    const invoice = await prisma.invoice.findUnique({
      where: { orderId: id },
      include: {
        order: {
          include: {
            items: true,
            creditNote: true,
          },
        },
      },
    });
    if (!invoice) {
      throw new ApiError(404, "Invoice not found.", "INVOICE_NOT_FOUND");
    }
    const isBuyer = invoice.order.buyerUserId === auth.userId;
    const isSeller = Boolean(
      auth.companyId &&
        invoice.order.items.some(
          (item) => item.sellerCompanyId === auth.companyId,
        ),
    );
    if (!isBuyer && !isSeller && !auth.isAdmin) {
      throw new ApiError(403, "You cannot access this invoice.", "FORBIDDEN");
    }
    const wantsCreditNote =
      request.nextUrl.searchParams.get("document") === "credit-note";
    const creditNote = invoice.order.creditNote;
    if (wantsCreditNote && !creditNote) {
      throw new ApiError(
        404,
        "Credit note not found for this order.",
        "CREDIT_NOTE_NOT_FOUND",
      );
    }
    const snapshot = JSON.parse(invoice.snapshotJson) as {
      orderNumber: string;
      currency: string;
      items: Array<{
        title: string;
        quantity: number;
        unit: string;
        pricePerUnit: number;
        lineTotal: number;
      }>;
      subtotal: number;
      buyerFeeAmount: number;
      sellerFeeAmount: number;
      shippingAmount: number;
      taxAmount: number;
      totalAmount: number;
      feeVersion: string;
      taxNote: string;
    };
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let y = 790;
    page.drawText(
      wantsCreditNote
        ? "Symbi-OS Sandbox Credit Note"
        : "Symbi-OS Sandbox Commercial Invoice",
      {
        x: 48,
        y,
        size: 18,
        font: bold,
        color: rgb(0.05, 0.35, 0.25),
      },
    );
    y -= 28;
    page.drawText(
      wantsCreditNote
        ? `Credit note: ${safeText(creditNote!.creditNoteNumber)}`
        : `Invoice: ${safeText(invoice.invoiceNumber)}`,
      {
        x: 48,
        y,
        size: 10,
        font: regular,
      },
    );
    if (wantsCreditNote) {
      y -= 16;
      page.drawText(`Original invoice: ${safeText(invoice.invoiceNumber)}`, {
        x: 48,
        y,
        size: 10,
        font: regular,
      });
    }
    y -= 16;
    page.drawText(`Order: ${safeText(snapshot.orderNumber)}`, {
      x: 48,
      y,
      size: 10,
      font: regular,
    });
    y -= 16;
    page.drawText(`Issued: ${invoice.issuedAt.toISOString()}`, {
      x: 48,
      y,
      size: 10,
      font: regular,
    });
    y -= 30;
    page.drawText("Line items", { x: 48, y, size: 12, font: bold });
    y -= 20;
    for (const item of snapshot.items.slice(0, 20)) {
      page.drawText(safeText(item.title), {
        x: 48,
        y,
        size: 9,
        font: regular,
      });
      page.drawText(
        `${item.quantity} ${safeText(item.unit)} x ${snapshot.currency} ${item.pricePerUnit.toFixed(2)} = ${snapshot.currency} ${wantsCreditNote ? "-" : ""}${item.lineTotal.toFixed(2)}`,
        { x: 280, y, size: 9, font: regular },
      );
      y -= 18;
    }
    y -= 12;
    const totals = [
      ["Subtotal", snapshot.subtotal],
      ["Buyer platform fee", snapshot.buyerFeeAmount],
      ["Shipping", snapshot.shippingAmount],
      ["Tax", snapshot.taxAmount],
      ["Total", snapshot.totalAmount],
    ] as const;
    for (const [label, value] of totals) {
      page.drawText(label, { x: 330, y, size: 10, font: bold });
      page.drawText(
        `${snapshot.currency} ${wantsCreditNote ? "-" : ""}${value.toFixed(2)}`,
        {
        x: 455,
        y,
        size: 10,
        font: regular,
        },
      );
      y -= 18;
    }
    y -= 20;
    page.drawText(safeText(snapshot.taxNote), {
      x: 48,
      y,
      size: 8,
      font: regular,
      maxWidth: 500,
      lineHeight: 12,
    });
    page.drawText(
      `Fee calculation: ${safeText(snapshot.feeVersion)}. Seller fee retained in immutable snapshot: ${snapshot.currency} ${snapshot.sellerFeeAmount.toFixed(2)}.`,
      {
        x: 48,
        y: y - 30,
        size: 8,
        font: regular,
        maxWidth: 500,
        lineHeight: 12,
      },
    );
    page.drawText(
      wantsCreditNote
        ? `Sandbox refund document. Reason: ${safeText(creditNote!.reasonCode)}. No real funds, GST filing, or tax credit is represented.`
        : "Sandbox document: no real funds, settlement, GST filing, or tax invoice is represented.",
      {
        x: 48,
        y: 48,
        size: 8,
        font: bold,
        color: rgb(0.55, 0.2, 0.05),
      },
    );
    const bytes = await pdf.save();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${
          wantsCreditNote ? creditNote!.creditNoteNumber : invoice.invoiceNumber
        }.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
