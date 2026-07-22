import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiError, assertTrustedOrigin, parseJson, requireUser } from "@/server/http";
import {
  assertCompleteOnboarding,
  maskOnboarding,
  onboardingCompletion,
  onboardingJsonField,
  onboardingRequestSchema,
  serializeOnboardingPayload,
  sensitiveValueHash,
  validateOnboardingStep,
} from "@/server/onboarding";
import { notify } from "@/lib/marketplace";

export async function GET() {
  try {
    const auth = await requireUser(["SELLER"]);
    const onboarding = await prisma.sellerOnboarding.upsert({
      where: { userId: auth.userId },
      update: {},
      create: { userId: auth.userId },
    });
    const documents = await prisma.onboardingDocument.findMany({
      where: { onboardingId: onboarding.id, status: "READY" },
      select: {
        id: true,
        kind: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      onboarding: maskOnboarding(onboarding),
      documents: documents.map((document) => ({
        ...document,
        url: `/api/seller/onboarding/documents/${document.id}`,
      })),
      completion: onboardingCompletion(
        onboarding,
        documents.map((document) => document.kind),
      ),
      verificationMode:
        process.env.DEMO_VERIFICATION_ENABLED === "true" ? "SANDBOX" : "MANUAL",
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["SELLER"]);
    const body = await parseJson(request, onboardingRequestSchema);
    const payload = validateOnboardingStep(body.step, body.payload);
    const field = onboardingJsonField(body.step);

    const existing = await prisma.sellerOnboarding.upsert({
      where: { userId: auth.userId },
      update: {},
      create: { userId: auth.userId },
    });
    if (!["DRAFT", "REJECTED", "CHANGES_REQUIRED"].includes(existing.status)) {
      return NextResponse.json(
        { error: "Submitted onboarding cannot be edited.", code: "INVALID_STATE" },
        { status: 409 }
      );
    }

    const gstinHash =
      body.step === "TAX"
        ? sensitiveValueHash(
            String((payload as { gst: string }).gst),
          )
        : undefined;
    if (gstinHash) {
      const duplicate = await prisma.sellerOnboarding.findFirst({
        where: { gstinHash, userId: { not: auth.userId } },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            error: "This GSTIN is already associated with another seller.",
            code: "GSTIN_DUPLICATE",
          },
          { status: 409 },
        );
      }
    }
    const saved = await prisma.sellerOnboarding.update({
      where: { userId: auth.userId },
      data: {
        [field]: serializeOnboardingPayload(body.step, payload),
        currentStep: body.step,
        status: "DRAFT",
        reviewerNote: null,
        ...(gstinHash ? { gstinHash } : {}),
      },
    });

    if (!body.submit) {
      return NextResponse.json({ success: true, onboarding: maskOnboarding(saved) });
    }

    assertCompleteOnboarding(saved);
    const documents = await prisma.onboardingDocument.findMany({
      where: { onboardingId: saved.id, status: "READY" },
      select: { kind: true },
    });
    const completion = onboardingCompletion(
      saved,
      documents.map((document) => document.kind),
    );
    if (completion.missingDocuments.length) {
      return NextResponse.json(
        {
          error: `Upload required documents: ${completion.missingDocuments.join(", ")}.`,
          code: "ONBOARDING_DOCUMENTS_INCOMPLETE",
          details: { missingDocuments: completion.missingDocuments },
        },
        { status: 422 },
      );
    }
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { emailVerifiedAt: true },
    });
    if (!user?.emailVerifiedAt) {
      return NextResponse.json(
        {
          error: "Verify your email before submitting seller onboarding.",
          code: "EMAIL_NOT_VERIFIED",
        },
        { status: 409 }
      );
    }
    const submitted = await prisma.$transaction(async (tx) => {
      const submittedAt = new Date();
      const record = await tx.sellerOnboarding.update({
        where: { userId: auth.userId },
        data: {
          status: "UNDER_REVIEW",
          submittedAt,
          currentStep: "REVIEW",
        },
      });
      await tx.verificationEvent.createMany({
        data: [
          {
            onboardingId: record.id,
            actorUserId: auth.userId,
            type: "SUBMITTED",
            fromStatus: saved.status,
            toStatus: "SUBMITTED",
          },
          {
            onboardingId: record.id,
            type: "QUEUED_FOR_REVIEW",
            fromStatus: "SUBMITTED",
            toStatus: "UNDER_REVIEW",
          },
        ],
      });
      return record;
    });
    await prisma.securityEvent.create({
      data: { userId: auth.userId, type: "SELLER_ONBOARDING_SUBMITTED" },
    });
    await notify(
      auth.userId,
      "SELLER_VERIFICATION_UNDER_REVIEW",
      "Seller verification submitted",
      "Your documents are in the moderator review queue.",
      "/seller",
    );
    return NextResponse.json({
      success: true,
      onboarding: maskOnboarding(submitted),
      message: "Seller onboarding submitted for verification.",
    });
  } catch (error) {
    return apiError(error);
  }
}
