export const IMPORTED_LISTING_STALE_DAYS = 14;
export const IMPORTED_LISTING_FRESH_DAYS = 7;

export function configuredImportedListingStaleDays() {
  const configured = Number(process.env.IMPORTED_LISTING_STALE_DAYS);
  return Number.isInteger(configured) && configured >= 1 && configured <= 365
    ? configured
    : IMPORTED_LISTING_STALE_DAYS;
}

export type ListingFreshnessStatus = "FRESH" | "AGING" | "STALE" | "UNVERIFIED";

export function listingFreshness(
  lastVerifiedAt: Date | string | null | undefined,
  now = new Date(),
) {
  if (!lastVerifiedAt) {
    return {
      status: "UNVERIFIED" as const,
      ageDays: null,
      label: "Verification unavailable",
    };
  }
  const date = new Date(lastVerifiedAt);
  if (Number.isNaN(date.getTime())) {
    return {
      status: "UNVERIFIED" as const,
      ageDays: null,
      label: "Verification unavailable",
    };
  }
  const ageDays = Math.max(
    0,
    Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)),
  );
  const status: ListingFreshnessStatus =
    ageDays <= IMPORTED_LISTING_FRESH_DAYS
      ? "FRESH"
      : ageDays <= configuredImportedListingStaleDays()
        ? "AGING"
        : "STALE";
  return {
    status,
    ageDays,
    label:
      status === "STALE"
        ? "Verification overdue"
        : ageDays === 0
          ? "Verified today"
          : ageDays === 1
            ? "Verified yesterday"
            : `Verified ${ageDays} days ago`,
  };
}
