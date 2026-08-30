import prisma from "@/lib/prisma";
import { importRealListings } from "@/server/listings/import";
import {
  JsonApiListingProvider,
  RecycleInMeProvider,
  TradeIndiaProvider,
  type ListingProvider,
} from "@/server/listings/providers";
import { configuredImportedListingStaleDays } from "@/lib/listing-freshness";

export interface DailyListingSyncOptions {
  providers?: ListingProvider[];
  maxRowsPerProvider?: number;
  staleAfterDays?: number;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < min || resolved > max) {
    throw new Error(
      `Expected an integer from ${min} to ${max}; received ${resolved}.`,
    );
  }
  return resolved;
}

export function configuredDailyListingProviders() {
  const names = (
    process.env.DAILY_LISTING_PROVIDERS ?? "tradeindia,recycleinme"
  )
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const providers: ListingProvider[] = [];
  for (const name of [...new Set(names)]) {
    if (name === "tradeindia") providers.push(new TradeIndiaProvider());
    else if (name === "recycleinme") providers.push(new RecycleInMeProvider());
    else if (name === "json") providers.push(new JsonApiListingProvider());
    else throw new Error(`Unknown daily listing provider "${name}".`);
  }
  if (!providers.length)
    throw new Error("At least one daily listing provider is required.");
  return providers;
}

/**
 * Refresh each configured source independently. Stable provider IDs make the
 * import idempotent: existing offers are updated, while unseen offer IDs and
 * seller names create new listings and supplier companies.
 */
export async function syncDailyListings(options: DailyListingSyncOptions = {}) {
  const providers = options.providers ?? configuredDailyListingProviders();
  const maxRowsPerProvider = boundedInteger(
    options.maxRowsPerProvider,
    500,
    1,
    2_000,
  );
  const staleAfterDays = boundedInteger(
    options.staleAfterDays,
    configuredImportedListingStaleDays(),
    1,
    365,
  );
  const cutoff = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1_000);
  const results: Array<{
    provider: string;
    status: "COMPLETED" | "FAILED";
    import?: Awaited<ReturnType<typeof importRealListings>>;
    archived?: number;
    error?: string;
  }> = [];

  for (const provider of providers) {
    try {
      const imported = await importRealListings(provider, {
        maxRows: maxRowsPerProvider,
        refreshEmbeddings: false,
      });
      // Only archive after a complete successful provider fetch. A temporary
      // upstream failure can therefore never empty the marketplace.
      const archived = imported.truncated
        ? { count: 0 }
        : await prisma.marketplaceListing.updateMany({
            where: {
              externalId: { startsWith: provider.externalIdPrefix },
              isEvalOnly: false,
              status: { in: ["ACTIVE", "active"] },
              lastVerifiedAt: { lt: cutoff },
            },
            data: { status: "ARCHIVED", archivedAt: new Date() },
          });
      results.push({
        provider: provider.name,
        status: "COMPLETED",
        import: imported,
        archived: archived.count,
      });
    } catch (error) {
      results.push({
        provider: provider.name,
        status: "FAILED",
        error:
          error instanceof Error ? error.message.slice(0, 500) : String(error),
      });
    }
  }

  const completed = results.filter(
    (result) => result.status === "COMPLETED",
  ).length;
  const failed = results.length - completed;
  return {
    completed,
    failed,
    degraded: failed > 0,
    results,
  };
}
