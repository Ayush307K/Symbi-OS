import { createHash } from "crypto";

export interface ProviderListing {
  externalId: string;
  title: string;
  description: string;
  categoryText: string;
  subcategory: string;
  companyName: string;
  city: string;
  state: string;
  country: string;
  quantity: number;
  rawQuantity: string;
  price: number;
  currency: string;
  unit: string;
  sourceName: string;
  sourceUrl: string;
  imageUrl: string;
}

export interface ListingProvider {
  name: string;
  sourceType: "real_api" | "real_public_provider";
  fetch(): Promise<ProviderListing[]>;
}

function decode(value: unknown) {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripContacts(value: unknown) {
  return decode(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contact removed]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[contact removed]");
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function arrayFromPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (!payload || typeof payload !== "object") return [];
  const value = payload as Record<string, unknown>;
  for (const key of ["items", "data", "results", "listings"]) {
    if (Array.isArray(value[key])) return value[key] as Array<Record<string, unknown>>;
  }
  return [];
}

export class JsonApiListingProvider implements ListingProvider {
  name = "Configured listing JSON API";
  sourceType = "real_api" as const;

  async fetch() {
    const url = process.env.REAL_LISTINGS_API_URL;
    if (!url) throw new Error("REAL_LISTINGS_API_URL is required for the JSON API provider.");
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(process.env.REAL_LISTINGS_API_KEY
          ? { Authorization: `Bearer ${process.env.REAL_LISTINGS_API_KEY}` }
          : {}),
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Listing API returned HTTP ${response.status}.`);
    const rows = arrayFromPayload(await response.json());
    return rows.map((row, index) => {
      const externalId = decode(row.id || row.externalId || `row-${index}`);
      const sourceUrl = decode(row.url || row.sourceUrl || url);
      return {
        externalId: `json-api:${externalId}`,
        title: decode(row.title || row.name),
        description: stripContacts(row.description || row.details),
        categoryText: decode(row.category),
        subcategory: decode(row.subcategory || row.material || row.category),
        companyName: decode(row.companyName || row.seller || "API supplier"),
        city: decode(row.city || "India"),
        state: decode(row.state || "India"),
        country: decode(row.country || "India"),
        quantity: Math.max(1, Math.round(number(row.quantity, 1))),
        rawQuantity: decode(row.rawQuantity || row.quantity || "1 lot"),
        price: number(row.price),
        currency: decode(row.currency || "INR"),
        unit: decode(row.unit || "lot"),
        sourceName: decode(row.sourceName || this.name),
        sourceUrl,
        imageUrl: decode(row.imageUrl),
      };
    });
  }
}

export class RecycleInMeProvider implements ListingProvider {
  name = "RecycleInMe India public sell-offer feed";
  sourceType = "real_public_provider" as const;
  private readonly baseUrl = "https://www.recycleinme.com";
  private readonly indiaFeedUrl = `${this.baseUrl}/scrap-sell-offer/country__India`;

  private async fetchPage(page: number) {
    const response = await fetch(`${this.indiaFeedUrl}?country=India&page=${page}`, {
      headers: { "user-agent": "Symbi-OS/1.0 listing importer" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Provider page ${page} returned HTTP ${response.status}.`);
    const html = await response.text();
    const match = html.match(/data-page="([\s\S]*?)"/);
    if (!match) {
      throw new Error(
        `Provider page ${page} did not contain its expected public listing payload.`,
      );
    }
    const payload = JSON.parse(decode(match[1]));
    if (payload.props?.currentcountry !== "India") {
      throw new Error(`Provider page ${page} did not confirm the India country filter.`);
    }
    if (Number(payload.props?.selloffers?.current_page) !== page) {
      throw new Error(`Provider returned the wrong pagination page for page ${page}.`);
    }
    return {
      rows: (payload.props?.selloffers?.data ?? []) as Array<Record<string, unknown>>,
      lastPage: Number(payload.props?.selloffers?.last_page ?? page),
    };
  }

  async fetch() {
    const first = await this.fetchPage(1);
    const maxPages = Math.min(
      Number(process.env.REAL_LISTINGS_MAX_PAGES || 10),
      first.lastPage
    );
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, maxPages - 1) }, (_, index) =>
        this.fetchPage(index + 2)
      )
    );
    const rows = [first, ...rest]
      .flatMap((page) => page.rows)
      .filter((row) => decode(row.country).toLowerCase() === "india");
    if (rows.length === 0) {
      throw new Error(
        "The India provider feed returned no listings. No placeholder data was imported.",
      );
    }
    const unique = [
      ...new Map(rows.map((row) => [decode(row.ItemID), row])).values(),
    ];
    return unique.map((row) => {
      const id = decode(row.ItemID);
      const title = decode(row.ItemTitle);
      const city = decode(row.City || row.city || "India");
      const state = decode(row.state || "India");
      const rawQuantity = decode(row.quant || "1 lot");
      return {
        externalId: `recycleinme:${id}`,
        title,
        description: stripContacts(
          row.Description || `${title}. Sell offer published by the source provider.`
        ),
        categoryText: decode(`${row.Category || ""} ${row.SubCategory || ""} ${title}`),
        subcategory: decode(row.SubCategory || row.Category || "Industrial material"),
        companyName: decode(row.CompanyName || `Provider seller ${id}`),
        city,
        state,
        country: "India",
        quantity: Math.max(1, Math.round(number(rawQuantity, 1))),
        rawQuantity,
        price: number(row.price),
        currency: "INR",
        unit: decode(row.unit || "lot"),
        sourceName: this.name,
        sourceUrl: `${this.baseUrl}/rim-${decode(row.username)}/selloffer-${id}`,
        imageUrl: `${this.baseUrl}/storage/userimg/thumb200/${id}.webp`,
      };
    });
  }
}

export function configuredProvider(): ListingProvider {
  return process.env.LISTINGS_PROVIDER === "json"
    ? new JsonApiListingProvider()
    : new RecycleInMeProvider();
}

export function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}
