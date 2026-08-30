import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { notify } from "@/lib/marketplace";
import {
  apiError,
  assertTrustedOrigin,
  parseJson,
  requireAdmin,
} from "@/server/http";
import {
  disputeResolutionSchema,
  resolveDispute,
} from "@/server/disputes";

const resolutionLabels = {
  RELEASE_TO_SELLER: "Payment released to seller",
  REFUND_BUYER: "Buyer refunded",
  REPLACE_INVENTORY: "Replacement inventory allocated",
  PARTIAL_SETTLEMENT: "Partial settlement recorded",
  REJECT_DISPUTE: "Dispute rejected",
} as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const admin = await requireAdmin();
    const input = await parseJson(request, disputeResolutionSchema);
    const { id } = await params;
    const order = await resolveDispute(id, input, admin.userId);

    const sellerCompanyIds = [
      ...new Set(order.items.map((item) => item.sellerCompanyId)),
    ];
    const sellerUsers = await prisma.user.findMany({
      where: { companyId: { in: sellerCompanyIds }, accountStatus: "ACTIVE" },
      select: { id: true },
    });
    const title = resolutionLabels[input.action];
    await Promise.all([
      notify(
        order.buyerUserId,
        "DISPUTE_RESOLVED",
        title,
        `${order.orderNumber}: ${input.note}`,
        "/account",
      ),
      ...sellerUsers.map((seller) =>
        notify(
          seller.id,
          "DISPUTE_RESOLVED",
          title,
          `${order.orderNumber}: ${input.note}`,
          "/seller",
        ),
      ),
    ]);

    return NextResponse.json({
      success: true,
      order,
      resolution: {
        action: input.action,
        label: title,
        paymentMode: "SANDBOX",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
