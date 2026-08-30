import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireUser,
} from "@/server/http";
import {
  ensureCanonicalMaterial,
  listingUpdateSchema,
  listingSnapshot,
  listingUpdateData,
  recordListingEvent,
  requireOwnedListing,
  slugify,
} from "@/server/listings/lifecycle";
import {
  classifyMaterialSafety,
  recordSafetyEvent,
} from "@/server/safety";
import { tryRefreshListingEmbedding } from "@/server/semantic/listing-embeddings";
import { geocodeData, geocodeLocation } from "@/server/geocoding";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(["SELLER"]);
    const { id } = await params;
    const listing = await requireOwnedListing(id, auth);
    const detail = await prisma.marketplaceListing.findUnique({
      where: { id: listing.id },
      include: {
        assets: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
        events: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    return NextResponse.json({ listing: detail });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["SELLER"]);
    const { id } = await params;
    const body = await parseJson(
      request,
      listingUpdateSchema,
    );
    const listing = await requireOwnedListing(id, auth);
    if (!["DRAFT", "REJECTED", "PAUSED", "ACTIVE"].includes(listing.status)) {
      throw new ApiError(
        409,
        `A ${listing.status.toLowerCase()} listing cannot be edited.`,
        "INVALID_LISTING_STATE",
      );
    }
    const safety = classifyMaterialSafety({
      name: body.title ?? listing.title,
      category: body.category ?? listing.category,
      description: body.description ?? listing.description,
      toxicity: "none",
    });
    if (safety.outcome === "BLOCKED") {
      await recordSafetyEvent({
        userId: auth.userId,
        listingId: listing.id,
        name: body.title ?? listing.title,
        category: body.category ?? listing.category,
        description: body.description ?? listing.description,
        ...safety,
      });
      throw new ApiError(
        422,
        "This marketplace only accepts verified, non-hazardous industrial by-products.",
        "MATERIAL_OUT_OF_SCOPE",
      );
    }

    const locationChanged =
      body.pincode !== undefined ||
      body.latitude !== undefined ||
      body.longitude !== undefined;
    const geocode = locationChanged
      ? await geocodeLocation({
          addressLine: listing.area,
          city: listing.city,
          state: listing.state,
          country: listing.country,
          pincode: body.pincode ?? listing.pincode,
          latitude: body.latitude ?? listing.latitude,
          longitude: body.longitude ?? listing.longitude,
        })
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      let materialId = listing.materialId;
      const category = body.category ?? listing.category;
      const subcategory = body.subcategory ?? listing.subcategory;
      if (
        category !== listing.category ||
        subcategory !== listing.subcategory
      ) {
        const material = await ensureCanonicalMaterial(tx, {
          category,
          subcategory,
          description: body.description ?? listing.description,
        });
        materialId = material.id;
        await tx.materialProducer.upsert({
          where: {
            companyId_materialId: {
              companyId: listing.sellerCompanyId,
              materialId,
            },
          },
          create: { companyId: listing.sellerCompanyId, materialId },
          update: {},
        });
      }

      const requiresReview = listing.status === "ACTIVE";
      const result = await tx.marketplaceListing.updateMany({
        where: { id: listing.id, version: body.version },
        data: {
          ...listingUpdateData(body),
          ...(locationChanged ? geocodeData(geocode) : {}),
          ...(geocode?.normalizedCity ? { city: geocode.normalizedCity } : {}),
          ...(geocode?.normalizedState ? { state: geocode.normalizedState } : {}),
          safetyReviewReason:
            safety.outcome === "MANUAL_REVIEW" ? safety.ruleCode : null,
          materialId,
          ...(body.title
            ? { slug: `${slugify(body.title)}-${listing.id.slice(-10)}` }
            : {}),
          ...(requiresReview
            ? {
                status: "PENDING_MODERATION",
                submittedAt: new Date(),
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
        type: requiresReview ? "ACTIVE_LISTING_EDITED" : "LISTING_DRAFT_UPDATED",
        fromStatus: listing.status,
        toStatus: next.status,
        version: next.version,
        snapshotJson: listingSnapshot(next as unknown as Record<string, unknown>),
      });
      return next;
    });
    await tryRefreshListingEmbedding(updated.id);
    return NextResponse.json({
      listing: updated,
      message:
        listing.status === "ACTIVE"
          ? "Changes saved and returned to moderation."
          : "Draft changes saved.",
    });
  } catch (error) {
    return apiError(error);
  }
}
