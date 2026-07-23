import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { notify } from "@/lib/marketplace";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  requireUser,
} from "@/server/http";
import {
  assertListingSafe,
  listingSnapshot,
  recordListingEvent,
  requireOwnedListing,
  submissionErrors,
} from "@/server/listings/lifecycle";
import {
  classifyMaterialSafety,
  recordSafetyEvent,
} from "@/server/safety";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["SELLER"]);
    const { id } = await params;
    await requireOwnedListing(id, auth);
    const listing = await prisma.marketplaceListing.findUniqueOrThrow({
      where: { id },
      include: {
        assets: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
      },
    });
    if (!["DRAFT", "REJECTED"].includes(listing.status)) {
      throw new ApiError(
        409,
        `A ${listing.status.toLowerCase()} listing cannot be submitted.`,
        "INVALID_LISTING_STATE",
      );
    }
    const onboarding = await prisma.sellerOnboarding.findUnique({
      where: { userId: auth.userId },
    });
    if (!onboarding || onboarding.status !== "APPROVED") {
      throw new ApiError(
        403,
        "Approved seller onboarding is required before moderation.",
        "SELLER_NOT_VERIFIED",
      );
    }

    const fields = submissionErrors(listing);
    if (Object.keys(fields).length) {
      throw new ApiError(
        422,
        "Complete the highlighted listing fields before submission.",
        "LISTING_INCOMPLETE",
        { fields },
      );
    }
    const safety = classifyMaterialSafety({
      name: listing.title,
      category: listing.category,
      description: listing.description,
      toxicity: "none",
    });
    await recordSafetyEvent({
      userId: auth.userId,
      listingId: listing.id,
      name: listing.title,
      category: listing.category,
      description: listing.description,
      ...safety,
    });
    assertListingSafe(listing);

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.marketplaceListing.updateMany({
        where: { id: listing.id, version: listing.version },
        data: {
          status: "PENDING_MODERATION",
          submittedAt: new Date(),
          moderationNote: null,
          moderatedAt: null,
          moderatedByUserId: null,
          safetyReviewReason:
            safety.outcome === "MANUAL_REVIEW" ? safety.ruleCode : null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ApiError(
          409,
          "This listing changed in another session. Reload and retry.",
          "LISTING_VERSION_CONFLICT",
        );
      }
      const next = await tx.marketplaceListing.findUniqueOrThrow({
        where: { id: listing.id },
      });
      await recordListingEvent(tx, {
        listingId: listing.id,
        actorUserId: auth.userId,
        type: "LISTING_SUBMITTED",
        fromStatus: listing.status,
        toStatus: "PENDING_MODERATION",
        version: next.version,
        snapshotJson: listingSnapshot(next as unknown as Record<string, unknown>),
      });
      return next;
    });

    await notify(
      auth.userId,
      "LISTING_SUBMITTED",
      "Listing submitted for review",
      `${updated.title} is in the moderation queue. The target review time is one hour.`,
      "/seller",
    );
    return NextResponse.json({
      listing: updated,
      message:
        "Listing submitted for moderation. It is not public until approved.",
      moderationTargetAt: new Date(
        (updated.submittedAt?.getTime() ?? Date.now()) + 60 * 60 * 1000,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
