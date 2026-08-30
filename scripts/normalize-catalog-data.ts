import "dotenv/config";
import prisma from "@/lib/prisma";
import type { GeocodeResult } from "@/server/geocoding";
import {
  cleanImportedSellerName,
  hasEncodingArtifacts,
  normalizeCommercials,
  normalizeImportedText,
  publishedPriceFromDescription,
  validateImportedLocation,
} from "@/server/listings/data-quality";

const dryRun = process.argv.includes("--dry-run");

function existingGeocode(listing: {
  latitude: number | null;
  longitude: number | null;
  geocodingProvider: string | null;
  geocodingConfidence: number | null;
  geocodingPrecision: string | null;
  geocodedAt: Date | null;
  city: string;
  state: string;
}): GeocodeResult | null {
  if (
    listing.latitude === null ||
    listing.longitude === null ||
    !listing.geocodingProvider
  ) {
    return null;
  }
  return {
    latitude: listing.latitude,
    longitude: listing.longitude,
    provider: listing.geocodingProvider,
    confidence: listing.geocodingConfidence ?? 0,
    precision:
      listing.geocodingPrecision === "ROOFTOP" ||
      listing.geocodingPrecision === "POSTCODE" ||
      listing.geocodingPrecision === "MANUAL"
        ? listing.geocodingPrecision
        : "CITY",
    normalizedCity: listing.city,
    normalizedState: listing.state,
    geocodedAt: listing.geocodedAt ?? new Date(),
  };
}

async function run() {
  const companies = await prisma.company.findMany({
    where: {
      OR: [{ displayName: null }, { name: { endsWith: ")" } }],
    },
    select: { id: true, name: true, displayName: true },
  });
  let companiesUpdated = 0;
  for (const company of companies) {
    const displayName = cleanImportedSellerName(
      company.displayName || company.name,
    );
    if (!displayName || displayName === company.displayName) continue;
    if (!dryRun) {
      await prisma.company.update({
        where: { id: company.id },
        data: { displayName },
      });
    }
    companiesUpdated += 1;
  }

  const listings = await prisma.marketplaceListing.findMany({
    include: {
      material: { select: { id: true, name: true, description: true } },
    },
    orderBy: { id: "asc" },
  });
  let normalized = 0;
  let repairedEncoding = 0;
  let repairedLocations = 0;
  let quarantined = 0;

  for (const listing of listings) {
    const title = normalizeImportedText(listing.title);
    const description = normalizeImportedText(listing.description);
    const subcategory = normalizeImportedText(listing.subcategory);
    const hadEncodingArtifacts =
      hasEncodingArtifacts(listing.title) ||
      hasEncodingArtifacts(listing.description) ||
      hasEncodingArtifacts(listing.material.name) ||
      hasEncodingArtifacts(listing.material.description);
    const published = publishedPriceFromDescription(description);
    const commercials = normalizeCommercials({
      price: Number(listing.pricePerUnit),
      currency: listing.currency,
      rawPrice: listing.rawPriceText || published.rawPrice,
      rawQuantity: listing.rawQuantityText,
      quantityUnit: published.rawUnit || listing.rawUnitText || listing.unit,
      priceUnit: published.rawUnit || listing.priceBasisUnit || listing.unit,
      description,
    });
    const location = validateImportedLocation(
      {
        city: listing.city,
        state: listing.state,
        country: listing.country,
      },
      existingGeocode(listing),
    );
    const unresolvedEncoding =
      hasEncodingArtifacts(title) || hasEncodingArtifacts(description);
    const issues = [
      ...location.issues,
      ...commercials.issues,
      ...(unresolvedEncoding ? ["ENCODING_ARTIFACT_UNRESOLVED"] : []),
    ];
    const imported = ["real_api", "real_public_provider"].includes(
      listing.sourceType,
    );
    const valid =
      !imported || (location.valid && commercials.valid && !unresolvedEncoding);
    const nextStatus = imported
      ? valid
        ? listing.status === "QUARANTINED"
          ? "ACTIVE"
          : listing.status
        : "QUARANTINED"
      : listing.status;

    if (!dryRun) {
      await prisma.$transaction([
        prisma.marketplaceListing.update({
          where: { id: listing.id },
          data: {
            title,
            description,
            subcategory,
            city: location.city,
            state: location.state,
            country: location.country,
            area:
              normalizeImportedText(listing.area) ===
              normalizeImportedText(listing.city)
                ? location.city
                : normalizeImportedText(listing.area),
            priceMode: commercials.priceMode,
            pricePerUnit: commercials.pricePerUnit,
            currency: commercials.currency,
            unit: commercials.unit,
            priceBasisUnit: commercials.priceBasisUnit,
            normalizedPricePerKg: commercials.normalizedPricePerKg,
            rawPriceText:
              (imported ? published.rawPrice : null) ||
              listing.rawPriceText ||
              commercials.rawPriceText,
            rawUnitText:
              (imported ? published.rawUnit : null) ||
              listing.rawUnitText ||
              commercials.rawUnitText,
            dataQualityStatus: valid ? "VALID" : "QUARANTINED",
            dataQualityIssues: issues,
            dataNormalizedAt: new Date(),
            status: nextStatus,
            ...(nextStatus === "QUARANTINED" ? { activatedAt: null } : {}),
          },
        }),
        prisma.wasteMaterial.update({
          where: { id: listing.material.id },
          data: {
            name: normalizeImportedText(listing.material.name),
            description: normalizeImportedText(listing.material.description),
          },
        }),
      ]);
    }
    normalized += 1;
    if (hadEncodingArtifacts) repairedEncoding += 1;
    if (location.issues.includes("CITY_STATE_COMBINATION_REPAIRED")) {
      repairedLocations += 1;
    }
    if (!valid) quarantined += 1;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        companiesUpdated,
        listings: {
          scanned: listings.length,
          normalized,
          repairedEncoding,
          repairedLocations,
          quarantined,
        },
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
