import { createHash } from "crypto";
import { normalizeImportedText } from "@/server/listings/data-quality";

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
  rawPrice?: string;
  price: number;
  currency: string;
  /** Supplier's quantity unit; kept separate from the price basis. */
  unit: string;
  priceUnit?: string;
  sourceName: string;
  sourceUrl: string;
  imageUrl: string;
}

export interface ListingProvider {
  name: string;
  sourceType: "real_api" | "real_public_provider";
  externalIdPrefix: string;
  fetch(): Promise<ProviderListing[]>;
}

function decode(value: unknown) {
  return normalizeImportedText(value).replace(/\s+/g, " ").trim();
}

function stripContacts(value: unknown) {
  return decode(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contact removed]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[contact removed]");
}

function number(value: unknown, fallback = 0) {
  // Parse the first number, not every digit in the string. Removing all
  // separators turned a legitimate "100-200 MT" range into 100200.
  const match = String(value ?? "").match(/-?\d[\d,]*(?:\.\d+)?/);
  const parsed = Number(match?.[0].replace(/,/g, "") ?? Number.NaN);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function textFields(
  value: unknown,
): Array<{ label_name?: unknown; value?: unknown }> {
  return Array.isArray(value)
    ? (value as Array<{ label_name?: unknown; value?: unknown }>)
    : [];
}

function customFields(row: Record<string, unknown>) {
  const source = row.custom_field_data_meta_info;
  if (!source || typeof source !== "object") return [];
  const sections = source as Record<string, unknown>;
  return Object.entries(sections).flatMap(([section, entries]) =>
    textFields(entries)
      .map((entry) => ({
        section,
        label: decode(entry.label_name),
        value: decode(entry.value),
      }))
      .filter((entry) => entry.label && entry.value),
  );
}

function tradeIndiaProducts(payload: unknown) {
  const products = new Map<string, Record<string, unknown>>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value)) {
      const row = value as Record<string, unknown>;
      if (
        row.product_id &&
        row.prod_url &&
        row.product_name &&
        row.is_product_record === 1
      ) {
        products.set(decode(row.product_id), row);
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(payload);
  return [...products.values()];
}

function tradeIndiaNextData(html: string, sourceUrl: string) {
  const match = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) {
    throw new Error(
      `TradeIndia page changed shape and has no __NEXT_DATA__: ${sourceUrl}`,
    );
  }
  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    throw new Error(`TradeIndia returned invalid __NEXT_DATA__: ${sourceUrl}`);
  }
}

export function isTradeIndiaScrapProduct(title: string) {
  const value = title.toLowerCase();
  if (
    /\b(machine|machinery|shredder|system|plant|equipment|lift|crusher|grinder|service)\b/.test(
      value,
    )
  ) {
    return false;
  }
  return /\b(scrap|scraps|regrind|regrinds|flake|flakes|granule|granules|agglomerate|agglomerates|turning|turnings|shaving|shavings|offcut|offcuts|bale|bales|cullet)\b/.test(
    value,
  );
}

function arrayFromPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (!payload || typeof payload !== "object") return [];
  const value = payload as Record<string, unknown>;
  for (const key of ["items", "data", "results", "listings"]) {
    if (Array.isArray(value[key]))
      return value[key] as Array<Record<string, unknown>>;
  }
  return [];
}

export class JsonApiListingProvider implements ListingProvider {
  name = "Configured listing JSON API";
  sourceType = "real_api" as const;
  externalIdPrefix = "json-api:";

  async fetch() {
    const url = process.env.REAL_LISTINGS_API_URL;
    if (!url)
      throw new Error(
        "REAL_LISTINGS_API_URL is required for the JSON API provider.",
      );
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(process.env.REAL_LISTINGS_API_KEY
          ? { Authorization: `Bearer ${process.env.REAL_LISTINGS_API_KEY}` }
          : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
      throw new Error(`Listing API returned HTTP ${response.status}.`);
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
        rawPrice: decode(row.rawPrice || row.price),
        price: number(row.price),
        currency: decode(row.currency || "INR"),
        unit: decode(row.unit || "lot"),
        priceUnit: decode(row.priceUnit || row.unit || "lot"),
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
  externalIdPrefix = "recycleinme:";
  private readonly baseUrl = "https://www.recycleinme.com";
  private readonly indiaFeedUrl = `${this.baseUrl}/scrap-sell-offer/country__India`;

  private async fetchPage(page: number) {
    const response = await fetch(
      `${this.indiaFeedUrl}?country=India&page=${page}`,
      {
        headers: { "user-agent": "Symbi-OS/1.0 listing importer" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok)
      throw new Error(
        `Provider page ${page} returned HTTP ${response.status}.`,
      );
    const html = await response.text();
    const match = html.match(/data-page="([\s\S]*?)"/);
    if (!match) {
      throw new Error(
        `Provider page ${page} did not contain its expected public listing payload.`,
      );
    }
    const payload = JSON.parse(decode(match[1]));
    if (payload.props?.currentcountry !== "India") {
      throw new Error(
        `Provider page ${page} did not confirm the India country filter.`,
      );
    }
    if (Number(payload.props?.selloffers?.current_page) !== page) {
      throw new Error(
        `Provider returned the wrong pagination page for page ${page}.`,
      );
    }
    return {
      rows: (payload.props?.selloffers?.data ?? []) as Array<
        Record<string, unknown>
      >,
      lastPage: Number(payload.props?.selloffers?.last_page ?? page),
    };
  }

  async fetch() {
    const first = await this.fetchPage(1);
    const maxPages = Math.min(
      Number(process.env.REAL_LISTINGS_MAX_PAGES || 10),
      first.lastPage,
    );
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, maxPages - 1) }, (_, index) =>
        this.fetchPage(index + 2),
      ),
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
          row.Description ||
            `${title}. Sell offer published by the source provider.`,
        ),
        categoryText: decode(
          `${row.Category || ""} ${row.SubCategory || ""} ${title}`,
        ),
        subcategory: decode(
          row.SubCategory || row.Category || "Industrial material",
        ),
        companyName: decode(row.CompanyName || `Provider seller ${id}`),
        city,
        state,
        country: "India",
        quantity: Math.max(1, Math.round(number(rawQuantity, 1))),
        rawQuantity,
        rawPrice: decode(row.price),
        price: number(row.price),
        currency: "INR",
        unit: decode(row.unit || "lot"),
        priceUnit: decode(row.unit || "lot"),
        sourceName: this.name,
        sourceUrl: `${this.baseUrl}/rim-${decode(row.username)}/selloffer-${id}`,
        imageUrl: `${this.baseUrl}/storage/userimg/thumb200/${id}.webp`,
      };
    });
  }
}

const TRADEINDIA_CATEGORY_PAGES = [
  ["aluminium-scrap.html", "Aluminium Scrap"],
  ["copper-scrap.html", "Copper Scrap"],
  ["ferrous-metal-scraps.html", "Ferrous Metal Scrap"],
  ["steel-metal-scrap.html", "Steel Scrap"],
  ["iron-scrap.html", "Iron Scrap"],
  ["ms-scrap.html", "Mild Steel Scrap"],
  ["stainless-steel-scrap.html", "Stainless Steel Scrap"],
  ["brass-scrap.html", "Brass Scrap"],
  ["aluminium-wire-scrap.html", "Aluminium Wire Scrap"],
  ["copper-wire-scrap.html", "Copper Wire Scrap"],
  ["metal-scrap.html", "Metal Scrap"],
  ["hdpe-scrap.html", "HDPE Scrap"],
  ["ldpe-plastic-scrap.html", "LDPE Scrap"],
  ["pet-bottle-scrap.html", "PET Bottle Scrap"],
  ["plastic-scrap.html", "Plastic Scrap"],
  ["rubber-scrap.html", "Rubber Scrap"],
  ["scrap-rubber.html", "Scrap Rubber"],
  ["tyre-scrap.html", "Tyre Scrap"],
] as const;

export class TradeIndiaProvider implements ListingProvider {
  name = "TradeIndia public marketplace listings";
  sourceType = "real_public_provider" as const;
  externalIdPrefix = "tradeindia:";
  private readonly baseUrl = "https://www.tradeindia.com";

  private async fetchCategory(slug: string, subcategory: string) {
    const sourceUrl = `${this.baseUrl}/manufacturers/${slug}`;
    const response = await fetch(sourceUrl, {
      headers: {
        Accept: "text/html",
        "user-agent": "Symbi-OS/1.0 listing importer",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(
        `TradeIndia category ${slug} returned HTTP ${response.status}.`,
      );
    }
    const payload = tradeIndiaNextData(await response.text(), sourceUrl);
    return tradeIndiaProducts(payload)
      .filter((row) => decode(row.country_name).toLowerCase() === "india")
      .filter((row) => decode(row.product_status || "a").toLowerCase() === "a")
      .filter((row) =>
        isTradeIndiaScrapProduct(
          decode(row.long_tail_prod_name || row.product_name),
        ),
      )
      .map((row): ProviderListing => {
        const id = decode(row.product_id);
        const title = decode(row.long_tail_prod_name || row.product_name);
        const fields = customFields(row);
        const specifications = fields
          .filter((field) => field.section === "Product_Specifications")
          .map((field) => `${field.label}: ${field.value}`);
        const trade = fields
          .filter((field) => field.section === "Trade_Information")
          .map((field) => `${field.label}: ${field.value}`);
        const priceAndQuantity = fields.filter(
          (field) => field.section === "Price_And_Quantity",
        );
        const valueFor = (label: RegExp) =>
          priceAndQuantity.find((field) => label.test(field.label))?.value ??
          "";
        const rawPrice =
          valueFor(/^Price(?: Range)?$/i) ||
          decode(row.price_range) ||
          decode(row.price);
        const priceUnit = valueFor(/Unit of Price/i) || decode(row.unit);
        const unit =
          valueFor(/Unit of Measure/i) ||
          priceUnit ||
          decode(row.unit) ||
          "lot";
        const rawQuantity = valueFor(/Minimum Order Quantity/i) || "1 lot";
        const currency = /USD|\$/.test(rawPrice)
          ? "USD"
          : /EUR|€/.test(rawPrice)
            ? "EUR"
            : "INR";
        const descriptionParts = [
          stripContacts(row.product_description || row.product_name),
          specifications.length
            ? `Product specifications:\n${specifications.map((line) => `- ${line}`).join("\n")}`
            : "",
          trade.length
            ? `Trade information:\n${trade.map((line) => `- ${line}`).join("\n")}`
            : "",
          rawPrice
            ? `Published price: ${rawPrice} per ${unit}.`
            : "Price on request.",
        ].filter(Boolean);
        return {
          externalId: `tradeindia:${id}`,
          title,
          description: descriptionParts.join("\n\n"),
          categoryText: decode(
            `${subcategory} ${row.category_name || ""} ${row.product_name || ""} ${specifications.join(" ")}`,
          ),
          subcategory,
          companyName: decode(
            row.co_name || row.initial_co_name || `TradeIndia supplier ${id}`,
          ),
          city: decode(row.city || "India"),
          state: decode(row.state || "India"),
          country: "India",
          quantity: Math.max(1, Math.round(number(rawQuantity, 1))),
          rawQuantity,
          rawPrice,
          price: number(rawPrice),
          currency,
          unit,
          priceUnit: priceUnit || unit,
          sourceName: this.name,
          sourceUrl: new URL(decode(row.prod_url), this.baseUrl).toString(),
          imageUrl: decode(row.product_image),
        };
      });
  }

  async fetch() {
    const pages = await Promise.all(
      TRADEINDIA_CATEGORY_PAGES.map(([slug, subcategory]) =>
        this.fetchCategory(slug, subcategory),
      ),
    );
    const unique = new Map(
      pages.flat().map((row) => [row.externalId, row] as const),
    );
    if (!unique.size) {
      throw new Error("TradeIndia returned no active Indian listings.");
    }
    return [...unique.values()];
  }
}

export function configuredProvider(): ListingProvider {
  if (process.env.LISTINGS_PROVIDER === "json")
    return new JsonApiListingProvider();
  if (process.env.LISTINGS_PROVIDER === "tradeindia")
    return new TradeIndiaProvider();
  return new RecycleInMeProvider();
}

export function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}
