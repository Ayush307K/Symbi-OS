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
  recordListingEvent,
  requireOwnedListing,
} from "@/server/listings/lifecycle";

const schema = z.object({
  action: z.enum(["PAUSE", "RESUME", "CLOSE", "ARCHIVE", "RENEW"]),
  version: z.coerce.number().int().positive(),
});

const transitions: Record<
  z.infer<typeof schema>["action"],
  { from: string[]; to: string }
> = {
  PAUSE: { from: ["ACTIVE"], to: "PAUSED" },
  RESUME: { from: ["PAUSED"], to: "ACTIVE" },
  CLOSE: { from: ["ACTIVE", "PAUSED", "RESERVED"], to: "SOLD" },
  ARCHIVE: {
    from: ["DRAFT", "REJECTED", "EXPIRED", "SOLD", "PAUSED", "ACTIVE"],
    to: "ARCHIVED",
  },
  RENEW: { from: ["EXPIRED"], to: "PENDING_MODERATION" },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["SELLER"]);
    const { id } = await params;
    const body = await parseJson(request, schema);
    const listing = await requireOwnedListing(id, auth);
    const transition = transitions[body.action];
    if (!transition.from.includes(listing.status)) {
      throw new ApiError(
        409,
        `${body.action.toLowerCase()} is not allowed from ${listing.status}.`,
        "INVALID_LISTING_TRANSITION",
      );
    }
    if (
      body.action === "RESUME" &&
      ((listing.expiresAt && listing.expiresAt <= new Date()) ||
        (listing.availableUntil && listing.availableUntil <= new Date()))
    ) {
      throw new ApiError(
        409,
        "Renew this expired listing before resuming it.",
        "LISTING_EXPIRED",
      );
    }
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.marketplaceListing.updateMany({
        where: { id: listing.id, version: body.version },
        data: {
          status: transition.to,
          ...(body.action === "ARCHIVE" ? { archivedAt: now } : {}),
          ...(body.action === "RENEW"
            ? {
                submittedAt: now,
                expiresAt: null,
                moderationNote: null,
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
        type: `LISTING_${body.action}`,
        fromStatus: listing.status,
        toStatus: transition.to,
        version: next.version,
      });
      return next;
    });
    await notify(
      auth.userId,
      `LISTING_${body.action}`,
      `Listing ${body.action.toLowerCase()}d`,
      `${updated.title} is now ${updated.status.toLowerCase()}.`,
      "/seller",
    );
    return NextResponse.json({ listing: updated });
  } catch (error) {
    return apiError(error);
  }
}
