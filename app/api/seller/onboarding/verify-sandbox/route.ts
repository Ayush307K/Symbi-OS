import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiError, assertTrustedOrigin, requireUser } from "@/server/http";
import { assertCompleteOnboarding, maskOnboarding } from "@/server/onboarding";
import { notify } from "@/lib/marketplace";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/server/http";

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    if (process.env.DEMO_VERIFICATION_ENABLED !== "true") {
      return NextResponse.json(
        { error: "Sandbox verification is disabled.", code: "SANDBOX_DISABLED" },
        { status: 404 }
      );
    }
    const auth = await requireUser(["SELLER"]);
    const onboarding = await prisma.sellerOnboarding.findUnique({
      where: { userId: auth.userId },
    });
    if (!onboarding || onboarding.status !== "UNDER_REVIEW") {
      return NextResponse.json(
        { error: "Submit complete onboarding before verification.", code: "INVALID_STATE" },
        { status: 409 }
      );
    }
    assertCompleteOnboarding(onboarding);
    const business = JSON.parse(onboarding.businessJson!) as {
      legalName: string;
    };
    const normalize = (value: string) =>
      value.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalize(business.legalName) !== normalize(auth.companyName)) {
      throw new ApiError(
        422,
        "The legal business name must match the registered company name in sandbox verification.",
        "LEGAL_NAME_MISMATCH",
        {
          fields: {
            legalName: "Use the same legal name as the registered company.",
          },
        },
      );
    }
    const reference = `sandbox_${randomUUID()}`;
    const approved = await prisma.$transaction(async (tx) => {
      const verifiedAt = new Date();
      const record = await tx.sellerOnboarding.update({
        where: { id: onboarding.id },
        data: {
          status: "APPROVED",
          currentStep: "COMPLETE",
          reviewedAt: verifiedAt,
          verifiedAt,
          verificationProvider: "SYMBIOS_SANDBOX",
          verificationReference: reference,
          reviewerNote:
            "Approved by Symbi-OS sandbox verifier. No government, tax, identity, or banking system was contacted.",
        },
      });
      await tx.verificationEvent.create({
        data: {
          onboardingId: onboarding.id,
          actorUserId: auth.userId,
          type: "SANDBOX_APPROVED",
          fromStatus: onboarding.status,
          toStatus: "APPROVED",
          provider: "SYMBIOS_SANDBOX",
          reference,
          note: record.reviewerNote,
        },
      });
      return record;
    });
    await prisma.securityEvent.create({
      data: {
        userId: auth.userId,
        type: "SELLER_ONBOARDING_SANDBOX_APPROVED",
      },
    });
    await notify(
      auth.userId,
      "SELLER_VERIFICATION_APPROVED",
      "Seller verification approved",
      "Your sandbox seller verification is approved. You may submit listings for moderation.",
      "/seller",
    );
    return NextResponse.json({
      success: true,
      onboarding: maskOnboarding(approved),
      verificationMode: "SANDBOX",
    });
  } catch (error) {
    return apiError(error);
  }
}
