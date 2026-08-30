import "dotenv/config";
import prisma from "@/lib/prisma";
import {
  configuredGeocodingProvider,
  geocodeData,
  geocodeLocation,
  IndiaCityGeocodingProvider,
} from "@/server/geocoding";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const managedOnly = args.has("--managed-only");
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = Math.max(1, Math.min(10_000, Number(limitArg?.split("=")[1] || 10_000)));
const configuredProvider = configuredGeocodingProvider();
let activeProvider = configuredProvider;

async function throttleIfRemote() {
  if (!activeProvider.name.startsWith("nominatim:")) return;
  await new Promise((resolve) => setTimeout(resolve, 1_100));
}

function useFallbackAfterProviderFailure(result: Awaited<ReturnType<typeof geocodeLocation>>) {
  if (
    activeProvider.name.startsWith("nominatim:") &&
    result?.provider === "india-city-centroid-v1"
  ) {
    // geocodeLocation already returned a truthful offline result. Avoid
    // repeating an eight-second remote timeout for every remaining row in a
    // deployment/backfill when the configured provider is down.
    activeProvider = new IndiaCityGeocodingProvider();
  }
}

async function run() {
  const listings = await prisma.marketplaceListing.findMany({
    where: {
      status: { in: ["ACTIVE", "active", "DRAFT", "PENDING_MODERATION", "PAUSED"] },
      ...(managedOnly ? { listingMode: "MANAGED" as const } : {}),
      OR: [
        { latitude: null },
        { longitude: null },
        { geocodingProvider: null },
      ],
    },
    select: {
      id: true,
      listingMode: true,
      area: true,
      city: true,
      state: true,
      country: true,
      pincode: true,
      latitude: true,
      longitude: true,
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });
  const addresses = await prisma.address.findMany({
    where: {
      OR: [
        { latitude: null },
        { longitude: null },
        { geocodingProvider: null },
      ],
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  let listingUpdated = 0;
  let listingUnresolved = 0;
  for (const listing of listings) {
    const result = await geocodeLocation(
      {
        addressLine: listing.area,
        city: listing.city,
        state: listing.state,
        country: listing.country,
        pincode: listing.pincode,
        latitude: listing.latitude,
        longitude: listing.longitude,
      },
      activeProvider,
    );
    useFallbackAfterProviderFailure(result);
    if (!result) {
      listingUnresolved += 1;
      await throttleIfRemote();
      continue;
    }
    if (!dryRun) {
      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          ...geocodeData(result),
          // Known city centroids also repair impossible imported state/city
          // combinations while preserving the raw source string for audit.
          city: result.normalizedCity || listing.city,
          state: result.normalizedState || listing.state,
        },
      });
    }
    listingUpdated += 1;
    await throttleIfRemote();
  }

  let addressUpdated = 0;
  let addressUnresolved = 0;
  for (const address of addresses) {
    const result = await geocodeLocation(
      {
        addressLine: address.street,
        city: address.city,
        state: address.state,
        country: address.country,
        pincode: address.pincode,
        latitude: address.latitude,
        longitude: address.longitude,
      },
      activeProvider,
    );
    useFallbackAfterProviderFailure(result);
    if (!result) {
      addressUnresolved += 1;
      await throttleIfRemote();
      continue;
    }
    if (!dryRun) {
      await prisma.address.update({
        where: { id: address.id },
        data: {
          ...geocodeData(result),
          city: result.normalizedCity || address.city,
          state: result.normalizedState || address.state,
          verificationStatus:
            result.precision === "MANUAL" ? "GPS_VERIFIED" : "GEOCODED",
        },
      });
    }
    addressUpdated += 1;
    await throttleIfRemote();
  }

  const [active, activeLocated, managed, managedLocated] = await Promise.all([
    prisma.marketplaceListing.count({ where: { status: { in: ["ACTIVE", "active"] } } }),
    prisma.marketplaceListing.count({
      where: {
        status: { in: ["ACTIVE", "active"] },
        latitude: { not: null },
        longitude: { not: null },
      },
    }),
    prisma.marketplaceListing.count({
      where: { status: { in: ["ACTIVE", "active"] }, listingMode: "MANAGED" },
    }),
    prisma.marketplaceListing.count({
      where: {
        status: { in: ["ACTIVE", "active"] },
        listingMode: "MANAGED",
        latitude: { not: null },
        longitude: { not: null },
      },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        configuredProvider: configuredProvider.name,
        completedWithProvider: activeProvider.name,
        dryRun,
        listings: { scanned: listings.length, updated: listingUpdated, unresolved: listingUnresolved },
        addresses: { scanned: addresses.length, updated: addressUpdated, unresolved: addressUnresolved },
        coverage: {
          active: { located: activeLocated, total: active, percent: active ? (activeLocated / active) * 100 : 100 },
          managed: { located: managedLocated, total: managed, percent: managed ? (managedLocated / managed) * 100 : 100 },
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
