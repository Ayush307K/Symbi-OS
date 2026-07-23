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
import {
  assertListingSafe,
  listingSnapshot,
  recordListingEvent,
} from "@/server/listings/lifecycle";
import { recordSafetyEvent } from "@/server/safety";

const decisionSchema = z.object({
  listingId: z.string().min(1),
  version: z.coerce.number().int().positive(),
  decision: z.enum(["APPROVE", "REJECT", "CHANGES_REQUIRED"]),
  note: z.string().trim().min(3).max(1000),
});

export async function GET() {
  try {
    await requireUser(["ADMIN"]);
    const listings = await prisma.marketplaceListing.findMany({
      where: { status: "PENDING_MODERATION" },
      include: {
        seller: true,
        assets: {
          select: {
            id: true,
            kind: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            sortOrder: true,
          },
          orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
        },
      },
      orderBy: { submittedAt: "asc" },
      take: 100,
    });
    const now = Date.now();
    return NextResponse.json({
      listings: listings.map((listing) => ({
        ...listing,
        moderationTargetAt: new Date(
          (listing.submittedAt?.getTime() ?? listing.updatedAt.getTime()) +
            60 * 60 * 1000,
        ),
        moderationOverdue:
          now >
          (listing.submittedAt?.getTime() ?? listing.updatedAt.getTime()) +
            60 * 60 * 1000,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["ADMIN"]);
    const body = await parseJson(request, decisionSchema);
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: body.listingId },
      include: {
        assets: { where: { kind: "PHOTO" }, orderBy: { sortOrder: "asc" } },
      },
    });
    if (!listing) {
      throw new ApiError(404, "Listing not found.", "LISTING_NOT_FOUND");
    }
    if (listing.status !== "PENDING_MODERATION") {
      throw new ApiError(
        409,
        "Only pending listings can be moderated.",
        "INVALID_LISTING_STATE",
      );
    }
    if (body.decision === "APPROVE") {
      assertListingSafe(listing);
      if (!listing.assets.length) {
        throw new ApiError(
          422,
          "At least one processed photo is required.",
          "PHOTO_REQUIRED",
        );
      }
    }
    const sellerUser = await prisma.user.findFirst({
      where: { companyId: listing.sellerCompanyId },
      select: { id: true },
    });
    const now = new Date();
    const toStatus =
      body.decision === "APPROVE" ? "ACTIVE" : "REJECTED";
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.marketplaceListing.updateMany({
        where: { id: listing.id, version: body.version },
        data: {
          status: toStatus,
          moderatedAt: now,
          moderatedByUserId: auth.userId,
          moderationNote: body.note,
          ...(body.decision === "APPROVE"
            ? {
                activatedAt: listing.activatedAt || now,
                expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
                imageUrl: `/api/listings/${listing.id}/assets/${listing.assets[0].id}?variant=thumbnail`,
                verified: true,
                lastVerifiedAt: now,
              }
            : {}),
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
        type: `MODERATION_${body.decision}`,
        fromStatus: listing.status,
        toStatus,
        version: next.version,
        snapshotJson: listingSnapshot(next as unknown as Record<string, unknown>),
        note: body.note,
      });
      return next;
    });
    await recordSafetyEvent({
      userId: auth.userId,
      listingId: listing.id,
      name: listing.title,
      category: listing.category,
      description: listing.description,
      outcome:
        body.decision === "APPROVE" ? "MODERATOR_APPROVED" : "MODERATOR_BLOCKED",
      ruleCode: body.decision,
    });

    await notify(
      sellerUser?.id,
      `LISTING_${body.decision}`,
      body.decision === "APPROVE"
        ? "Listing approved"
        : body.decision === "CHANGES_REQUIRED"
          ? "Listing changes required"
          : "Listing rejected",
      body.note,
      body.decision === "APPROVE"
        ? `/products/${updated.slug}`
        : "/seller",
    );

    if (body.decision === "APPROVE") {
      const demands = await prisma.demand.findMany({
        where: { materialId: listing.materialId },
        select: { userId: true, companyId: true },
        take: 100,
      });
      const companyIds = [
        ...new Set(demands.map((demand) => demand.companyId)),
      ];
      const companyUsers = await prisma.user.findMany({
        where: { companyId: { in: companyIds } },
        select: { id: true },
      });
      const buyerIds = new Set([
        ...demands.map((demand) => demand.userId).filter(Boolean),
        ...companyUsers.map((user) => user.id),
      ]);
      buyerIds.delete(sellerUser?.id || "");
      await Promise.all(
        [...buyerIds].map((userId) =>
          notify(
            userId!,
            "MATCHED_LISTING_ACTIVATED",
            "A matching listing is now active",
            `${updated.title} matches material demand recorded by your company.`,
            `/products/${updated.slug}`,
          ),
        ),
      );
    }

    return NextResponse.json({ listing: updated });
  } catch (error) {
    return apiError(error);
  }
}
