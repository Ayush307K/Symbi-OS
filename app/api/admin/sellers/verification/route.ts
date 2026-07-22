import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { notify } from "@/lib/marketplace";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireUser,
} from "@/server/http";
import { maskOnboarding, onboardingCompletion } from "@/server/onboarding";

const decisionSchema = z
  .object({
    onboardingId: z.string().uuid(),
    decision: z.enum(["APPROVE", "REJECT", "CHANGES_REQUIRED"]),
    note: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine(
    (value) => value.decision === "APPROVE" || Boolean(value.note?.trim()),
    { path: ["note"], message: "Explain rejections or required corrections." },
  );

export async function GET() {
  try {
    await requireUser(["ADMIN"]);
    const records = await prisma.sellerOnboarding.findMany({
      where: {
        status: {
          in: ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUIRED", "REJECTED"],
        },
      },
      include: {
        user: {
          select: { id: true, email: true, companyName: true, createdAt: true },
        },
        documents: {
          select: {
            id: true,
            kind: true,
            originalName: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
        events: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { submittedAt: "asc" },
      take: 100,
    });
    return NextResponse.json({
      items: records.map((record) => ({
        ...maskOnboarding(record),
        completion: onboardingCompletion(
          record,
          record.documents.map((document) => document.kind),
        ),
        documents: record.documents.map((document) => ({
          ...document,
          url: `/api/seller/onboarding/documents/${document.id}`,
        })),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const admin = await requireUser(["ADMIN"]);
    const body = await parseJson(request, decisionSchema);
    const onboarding = await prisma.sellerOnboarding.findUnique({
      where: { id: body.onboardingId },
      include: { documents: { select: { kind: true } } },
    });
    if (!onboarding) {
      throw new ApiError(404, "Seller onboarding not found.", "NOT_FOUND");
    }
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(onboarding.status)) {
      throw new ApiError(
        409,
        "This verification is not awaiting a decision.",
        "INVALID_STATE",
      );
    }
    const nextStatus =
      body.decision === "APPROVE"
        ? "APPROVED"
        : body.decision === "REJECT"
          ? "REJECTED"
          : "CHANGES_REQUIRED";
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.sellerOnboarding.update({
        where: { id: onboarding.id },
        data: {
          status: nextStatus,
          currentStep:
            nextStatus === "APPROVED" ? "COMPLETE" : "CORRECTIONS",
          reviewedAt: now,
          verifiedAt: nextStatus === "APPROVED" ? now : null,
          verificationProvider:
            nextStatus === "APPROVED" ? "MANUAL_ADMIN_REVIEW" : null,
          verificationReference:
            nextStatus === "APPROVED" ? `admin:${admin.userId}:${now.toISOString()}` : null,
          reviewerNote: body.note ?? "Approved after manual document review.",
        },
      });
      await tx.verificationEvent.create({
        data: {
          onboardingId: onboarding.id,
          actorUserId: admin.userId,
          type: `MANUAL_${body.decision}`,
          fromStatus: onboarding.status,
          toStatus: nextStatus,
          note: record.reviewerNote,
          provider: "MANUAL_ADMIN_REVIEW",
          reference: record.verificationReference,
        },
      });
      return record;
    });
    await notify(
      onboarding.userId,
      `SELLER_VERIFICATION_${nextStatus}`,
      `Seller verification ${nextStatus.toLowerCase().replaceAll("_", " ")}`,
      updated.reviewerNote ?? `Verification status changed to ${nextStatus}.`,
      "/seller",
    );
    return NextResponse.json({ success: true, onboarding: maskOnboarding(updated) });
  } catch (error) {
    return apiError(error);
  }
}
