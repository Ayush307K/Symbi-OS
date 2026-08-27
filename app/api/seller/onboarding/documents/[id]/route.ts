import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  requireUser,
} from "@/server/http";
import { deleteObject, getObject } from "@/server/listings/storage";
import { onboardingJourney } from "@/server/onboarding";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser();
    const { id } = await context.params;
    const document = await prisma.onboardingDocument.findUnique({
      where: { id },
      include: { onboarding: { select: { userId: true } } },
    });
    if (
      !document ||
      (document.onboarding.userId !== auth.userId && !auth.isAdmin)
    ) {
      throw new ApiError(404, "Document not found.", "DOCUMENT_NOT_FOUND");
    }
    const stored = await getObject(document.storageKey);
    const safeName = document.originalName.replace(/["\r\n]/g, "_");
    return new NextResponse(new Uint8Array(stored.body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Length": String(stored.body.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["SELLER"]);
    const { id } = await context.params;
    const document = await prisma.onboardingDocument.findFirst({
      where: { id, ownerUserId: auth.userId },
      include: { onboarding: true },
    });
    if (!document) {
      throw new ApiError(404, "Document not found.", "DOCUMENT_NOT_FOUND");
    }
    if (
      !["DRAFT", "REJECTED", "CHANGES_REQUIRED"].includes(
        document.onboarding.status,
      )
    ) {
      throw new ApiError(
        409,
        "Documents cannot be removed in the current verification state.",
        "INVALID_STATE",
      );
    }
    const remainingDocuments = await prisma.onboardingDocument.findMany({
      where: {
        onboardingId: document.onboardingId,
        status: "READY",
        id: { not: document.id },
      },
      select: { kind: true },
    });
    const journeyAfterRemoval = onboardingJourney(
      document.onboarding,
      remainingDocuments.map((item) => item.kind),
    );
    await prisma.$transaction(async (tx) => {
      await tx.onboardingDocument.delete({ where: { id } });
      await tx.sellerOnboarding.update({
        where: { id: document.onboardingId },
        data: { currentStep: journeyAfterRemoval.currentStep },
      });
      await tx.verificationEvent.create({
        data: {
          onboardingId: document.onboardingId,
          actorUserId: auth.userId,
          type: "DOCUMENT_REMOVED",
          fromStatus: document.onboarding.status,
          toStatus: document.onboarding.status,
          note: document.kind,
        },
      });
    });
    await deleteObject(document.storageKey);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
