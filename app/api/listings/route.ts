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
  listingDraftSchema,
  newListingId,
  recordListingEvent,
  slugify,
} from "@/server/listings/lifecycle";
import {
  classifyMaterialSafety,
  recordSafetyEvent,
} from "@/server/safety";

export async function GET() {
  try {
    const auth = await requireUser(["SELLER"]);
    if (!auth.companyId) {
      throw new ApiError(409, "A company profile is required.", "COMPANY_REQUIRED");
    }
    const listings = await prisma.marketplaceListing.findMany({
      where: { sellerCompanyId: auth.companyId },
      include: {
        assets: {
          select: {
            id: true,
            kind: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            sortOrder: true,
            visibility: true,
            createdAt: true,
          },
          orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
        },
        events: { orderBy: { createdAt: "desc" }, take: 10 },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ listings });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["SELLER"]);
    if (!auth.companyId) {
      throw new ApiError(409, "A company profile is required.", "COMPANY_REQUIRED");
    }
    const body = await parseJson(request, listingDraftSchema);
    const onboarding = await prisma.sellerOnboarding.findUnique({
      where: { userId: auth.userId },
    });
    // Submission already refuses an unapproved seller, but only after the whole
    // listing has been filled in. Refuse at creation too, so the requirement is
    // met before any work is done and no orphan drafts accumulate.
    if (!onboarding || onboarding.status !== "APPROVED") {
      throw new ApiError(
        403,
        "Complete seller onboarding and verification before creating a listing.",
        "SELLER_NOT_VERIFIED",
      );
    }
    const warehouse = JSON.parse(onboarding?.warehouseJson || "{}") as {
      addressLine?: string;
      city?: string;
      state?: string;
      pincode?: string;
    };
    const id = newListingId();
    const title = body.title || "Untitled material";
    const category = body.category || "Plastic Scrap";
    const subcategory = body.subcategory || "Unspecified grade";
    const safety = classifyMaterialSafety({
      name: title,
      category,
      description: body.description,
      toxicity: "none",
    });
    if (safety.outcome === "BLOCKED") {
      await recordSafetyEvent({
        userId: auth.userId,
        name: title,
        category,
        description: body.description,
        ...safety,
      });
      throw new ApiError(
        422,
        "This marketplace only accepts verified, non-hazardous industrial by-products.",
        "MATERIAL_OUT_OF_SCOPE",
      );
    }

    const listing = await prisma.$transaction(async (tx) => {
      const material = await ensureCanonicalMaterial(tx, {
        category,
        subcategory,
        description: body.description,
      });
      await tx.materialProducer.upsert({
        where: {
          companyId_materialId: {
            companyId: auth.companyId!,
            materialId: material.id,
          },
        },
        create: { companyId: auth.companyId!, materialId: material.id },
        update: {},
      });
      const created = await tx.marketplaceListing.create({
        data: {
          id,
          title,
          slug: `${slugify(title)}-${id.slice(-10)}`,
          sourceType: "seller_submitted",
          sourceName: "Symbi-OS seller submission",
          externalId: `seller:${id}`,
          materialId: material.id,
          sellerCompanyId: auth.companyId!,
          category,
          subcategory,
          area: warehouse.addressLine || "Draft dispatch location",
          city: warehouse.city || "Unspecified",
          state: warehouse.state || "Unspecified",
          country: "India",
          pincode: body.pincode || warehouse.pincode || null,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          imageUrl: "",
          priceMode: body.priceMode || "FIXED",
          pricePerUnit: body.pricePerUnit || 0,
          currency: "INR",
          unit: body.unit || "ton",
          minOrderQuantity: body.minOrderQuantity || 1,
          lotIncrement: body.lotIncrement || 1,
          quantityAvailable: body.quantityAvailable || 0,
          leadTimeDays: body.leadTimeDays || 0,
          rating: 0,
          responseRate: 0,
          verified: false,
          tradeAssurance: false,
          yearsActive: 0,
          ordersCompleted: 0,
          description: body.description || "",
          packaging: body.packaging || "",
          handlingRequirements: body.handlingRequirements || "",
          paymentTerms: body.paymentTerms || "",
          availableFrom: body.availableFrom
            ? new Date(body.availableFrom)
            : null,
          availableUntil: body.availableUntil
            ? new Date(body.availableUntil)
            : null,
          safetyDeclaration: body.safetyDeclaration || false,
          qualityDeclaration: body.qualityDeclaration || false,
          ownershipDeclaration: body.ownershipDeclaration || false,
          authorityDeclaration: body.authorityDeclaration || false,
          status: "DRAFT",
          safetyReviewReason:
            safety.outcome === "MANUAL_REVIEW" ? safety.ruleCode : null,
        },
      });
      await recordListingEvent(tx, {
        listingId: created.id,
        actorUserId: auth.userId,
        type: "LISTING_DRAFT_CREATED",
        toStatus: "DRAFT",
        version: created.version,
      });
      return created;
    });

    return NextResponse.json(
      {
        listing,
        message: "Draft saved. Add details and photos before moderation.",
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
