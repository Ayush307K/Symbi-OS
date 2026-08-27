import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  requireUser,
} from "@/server/http";
import { preparePrivatePdf } from "@/server/listings/assets";
import { deleteObject } from "@/server/listings/storage";
import {
  assertOnboardingStepAccessible,
  onboardingJourney,
  onboardingStepForDocumentKind,
} from "@/server/onboarding";

const documentKinds = new Set([
  "REGISTRATION",
  "GST_CERTIFICATE",
  "KYC_ID",
  "BANK_PROOF",
  "WAREHOUSE_PROOF",
]);

export async function POST(request: NextRequest) {
  let prepared: Awaited<ReturnType<typeof preparePrivatePdf>> | undefined;
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["SELLER"]);
    const onboarding = await prisma.sellerOnboarding.upsert({
      where: { userId: auth.userId },
      update: {},
      create: { userId: auth.userId },
    });
    if (
      !["DRAFT", "REJECTED", "CHANGES_REQUIRED"].includes(onboarding.status)
    ) {
      throw new ApiError(
        409,
        "Documents cannot be changed while verification is in progress or approved.",
        "INVALID_STATE",
      );
    }
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "").toUpperCase();
    if (!(file instanceof File)) {
      throw new ApiError(422, "Choose a PDF to upload.", "FILE_REQUIRED");
    }
    if (!documentKinds.has(kind)) {
      throw new ApiError(
        422,
        "Unsupported onboarding document type.",
        "DOCUMENT_KIND_INVALID",
      );
    }
    const documentStep = onboardingStepForDocumentKind(kind);
    if (!documentStep) {
      throw new ApiError(
        422,
        "Unsupported onboarding document type.",
        "DOCUMENT_KIND_INVALID",
      );
    }
    const readyDocuments = await prisma.onboardingDocument.findMany({
      where: { onboardingId: onboarding.id, status: "READY" },
      select: { kind: true },
    });
    assertOnboardingStepAccessible(
      onboarding,
      readyDocuments.map((document) => document.kind),
      documentStep,
    );
    const documentKindsAfterUpload = new Set(
      readyDocuments.map((document) => document.kind),
    );
    documentKindsAfterUpload.add(kind);
    const journeyAfterUpload = onboardingJourney(onboarding, [
      ...documentKindsAfterUpload,
    ]);
    prepared = await preparePrivatePdf(
      `onboarding/${onboarding.id}/${kind.toLowerCase()}`,
      file,
      "ONBOARDING_DOCUMENT",
    );
    const old = await prisma.onboardingDocument.findUnique({
      where: {
        onboardingId_kind: { onboardingId: onboarding.id, kind },
      },
    });
    const retentionDays = Math.max(
      30,
      Math.min(
        3650,
        Number(process.env.ONBOARDING_DOCUMENT_RETENTION_DAYS ?? 730),
      ),
    );
    const document = await prisma.$transaction(async (tx) => {
      if (old) {
        await tx.onboardingDocument.delete({ where: { id: old.id } });
      }
      const created = await tx.onboardingDocument.create({
        data: {
          id: prepared!.id,
          onboardingId: onboarding.id,
          ownerUserId: auth.userId,
          kind,
          storageKey: prepared!.storageKey,
          originalName: prepared!.originalName,
          mimeType: prepared!.mimeType,
          sizeBytes: prepared!.sizeBytes,
          checksumSha256: prepared!.checksumSha256,
          retentionUntil: new Date(
            Date.now() + retentionDays * 24 * 60 * 60 * 1000,
          ),
        },
      });
      await tx.sellerOnboarding.update({
        where: { id: onboarding.id },
        data: { currentStep: journeyAfterUpload.currentStep },
      });
      await tx.verificationEvent.create({
        data: {
          onboardingId: onboarding.id,
          actorUserId: auth.userId,
          type: old ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED",
          fromStatus: onboarding.status,
          toStatus: onboarding.status,
          note: kind,
        },
      });
      return created;
    });
    if (old) await deleteObject(old.storageKey).catch(() => undefined);
    return NextResponse.json(
      {
        document: {
          id: document.id,
          kind: document.kind,
          originalName: document.originalName,
          sizeBytes: document.sizeBytes,
          url: `/api/seller/onboarding/documents/${document.id}`,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (prepared) {
      await deleteObject(prepared.storageKey).catch(() => undefined);
    }
    return apiError(error);
  }
}
