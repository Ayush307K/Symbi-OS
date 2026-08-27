import { afterEach, describe, expect, it } from "vitest";
import {
  integerEnvironment,
  isCronRequestAuthorized,
} from "@/server/cron-auth";
import { configuredDailyListingProviders } from "@/server/listings/daily-sync";

const originalProviders = process.env.DAILY_LISTING_PROVIDERS;
const originalLimit = process.env.DAILY_EMBEDDING_MAX_LISTINGS;

afterEach(() => {
  if (originalProviders === undefined)
    delete process.env.DAILY_LISTING_PROVIDERS;
  else process.env.DAILY_LISTING_PROVIDERS = originalProviders;
  if (originalLimit === undefined)
    delete process.env.DAILY_EMBEDDING_MAX_LISTINGS;
  else process.env.DAILY_EMBEDDING_MAX_LISTINGS = originalLimit;
});

describe("cron authentication", () => {
  const secret = "fixture-cron-secret-at-least-32-characters";

  it("accepts only the exact bearer secret", () => {
    expect(
      isCronRequestAuthorized(
        new Request("https://symbi.test/api/cron", {
          headers: { authorization: `Bearer ${secret}` },
        }),
        secret,
      ),
    ).toBe(true);
    expect(
      isCronRequestAuthorized(
        new Request("https://symbi.test/api/cron", {
          headers: { authorization: "Bearer wrong-secret" },
        }),
        secret,
      ),
    ).toBe(false);
  });

  it("fails closed when the configured secret is missing", () => {
    expect(
      isCronRequestAuthorized(
        new Request("https://symbi.test/api/cron", {
          headers: { authorization: "Bearer undefined" },
        }),
        "",
      ),
    ).toBe(false);
  });
});

describe("cron configuration", () => {
  it("loads each configured listing source once", () => {
    process.env.DAILY_LISTING_PROVIDERS =
      "tradeindia,recycleinme,tradeindia,json";
    expect(
      configuredDailyListingProviders().map(
        (provider) => provider.externalIdPrefix,
      ),
    ).toEqual(["tradeindia:", "recycleinme:", "json-api:"]);
  });

  it("rejects unsafe numeric limits", () => {
    process.env.DAILY_EMBEDDING_MAX_LISTINGS = "0";
    expect(() =>
      integerEnvironment("DAILY_EMBEDDING_MAX_LISTINGS", 500, 1, 10_000),
    ).toThrow(/integer from 1 to 10000/);
  });
});
