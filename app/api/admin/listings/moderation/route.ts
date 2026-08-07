import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { notify } from "@/lib/marketplace";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireAdmin,
  requireUser,
} from "@/server/http";
import {
  assertListingSafe,
  listingSnapshot,
  recordListingEvent,
} from "@/server/listings/lifecycle";
import { recordSafetyEvent } from "@/server/safety";
import { matchListingToOpenDemands } from "@/server/matching";

const decisionSchema = z.object({
  listingId: z.string().min(1),
  version: z.coerce.number().int().positive(),
  decision: z.enum(["APPROVE", "REJECT", "CHANGES_REQUIRED"]),
  note: z.string().trim().min(3).max(1000),
});

export async function GET() {
  try {
    await requireAdmin();
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
    const auth = await requireAdmin();
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
      // Scored against the buyer's own constraints, not an ID equality, and
      // written to ListingMatch so /rfq/[id] agrees with the notification.
      const matches = await matchListingToOpenDemands(updated.id);
      const notified = new Set<string>();
      for (const match of matches) {
        const recipients = match.userId
          ? [match.userId]
          : (
              await prisma.user.findMany({
                where: { companyId: match.companyId },
                select: { id: true },
              })
            ).map((user) => user.id);
        for (const userId of recipients) {
          if (!userId || userId === sellerUser?.id || notified.has(userId)) continue;
          notified.add(userId);
          await notify(
            userId,
            "MATCHED_LISTING_ACTIVATED",
            `New match for "${match.query}"`,
            // Skip the leading "Exact safe-category match": it is on every
            // match and tells the buyer nothing. The grade, price and distance
            // lines are what decide whether this is worth opening.
            `${updated.title} scores ${match.score}/100. ${(match.explanations.slice(1, 3).join(". ") || match.explanations[0])}.`,
            `/rfq/${match.demandId}`,
          );
        }
      }
    }

    return NextResponse.json({ listing: updated });
  } catch (error) {
    return apiError(error);
  }
}
