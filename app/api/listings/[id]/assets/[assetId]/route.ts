import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookie } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  requireUser,
} from "@/server/http";
import {
  recordListingEvent,
  requireOwnedListing,
} from "@/server/listings/lifecycle";
import { deleteObject, getObject } from "@/server/listings/storage";

function contentDisposition(name: string, inline: boolean) {
  const safe = name.replace(/["\r\n]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${safe}"`;
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; assetId: string }> },
) {
  try {
    const { id, assetId } = await params;
    const asset = await prisma.listingAsset.findFirst({
      where: { id: assetId, listingId: id, status: "READY" },
      include: { listing: true },
    });
    if (!asset) {
      throw new ApiError(404, "Asset not found.", "ASSET_NOT_FOUND");
    }
    const isPublicPhoto =
      asset.kind === "PHOTO" &&
      ["ACTIVE", "active"].includes(asset.listing.status);
    if (!isPublicPhoto) {
      const auth = await getAuthFromCookie();
      const owns =
        auth?.companyId === asset.listing.sellerCompanyId ||
        auth?.isAdmin === true;
      if (!owns) {
        throw new ApiError(404, "Asset not found.", "ASSET_NOT_FOUND");
      }
    }
    const thumbnail =
      request.nextUrl.searchParams.get("variant") === "thumbnail" &&
      asset.thumbnailKey;
    const stored = await getObject(thumbnail || asset.storageKey);
    const mimeType = thumbnail ? "image/jpeg" : asset.mimeType;
    return new NextResponse(new Uint8Array(stored.body), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(stored.body.length),
        "Content-Disposition": contentDisposition(
          thumbnail ? `thumbnail-${asset.originalName}.jpg` : asset.originalName,
          asset.kind === "PHOTO",
        ),
        "Cache-Control": isPublicPhoto
          ? "public, max-age=86400, immutable"
          : "private, no-store",
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
  {
    params,
  }: { params: Promise<{ id: string; assetId: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["SELLER"]);
    const { id, assetId } = await params;
    const listing = await requireOwnedListing(id, auth);
    if (!["DRAFT", "REJECTED", "PAUSED"].includes(listing.status)) {
      throw new ApiError(
        409,
        "Assets can only be changed while a listing is editable.",
        "INVALID_LISTING_STATE",
      );
    }
    const asset = await prisma.listingAsset.findFirst({
      where: { id: assetId, listingId: listing.id },
    });
    if (!asset) {
      throw new ApiError(404, "Asset not found.", "ASSET_NOT_FOUND");
    }
    await prisma.$transaction(async (tx) => {
      await tx.listingAsset.delete({ where: { id: asset.id } });
      await recordListingEvent(tx, {
        listingId: listing.id,
        actorUserId: auth.userId,
        type: `${asset.kind}_REMOVED`,
        version: listing.version,
        note: asset.originalName,
      });
    });
    await Promise.all([
      deleteObject(asset.storageKey),
      asset.thumbnailKey
        ? deleteObject(asset.thumbnailKey)
        : Promise.resolve(),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
