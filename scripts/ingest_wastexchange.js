const crypto = require("crypto");
const { createClient } = require("@libsql/client");
const { createPrismaClient } = require("./prisma_runtime");

const BASE_URL = "https://www.wastexchange.org";
const SOURCE_NAME = "WasteXchange / SWIX";
const SOURCE_TYPE = "real_public";
const PAGE_SIZE = 20;
const MAX_PAGES = Number(process.env.WASTEXCHANGE_MAX_PAGES || 60);
const DETAIL_DELAY_MS = Number(process.env.WASTEXCHANGE_DETAIL_DELAY_MS || 120);

const prisma = createPrismaClient();

const FALLBACK_IMAGES = {
  "Metals & Alloys": "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=900&q=80",
  Chemicals: "https://images.unsplash.com/photo-1532187643603-ba119ca4109e?auto=format&fit=crop&w=900&q=80",
  "Organic & Bio": "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80",
  "E-Waste": "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=900&q=80",
  "Polymers & Plastics": "https://images.unsplash.com/photo-1604187351574-c75ca79f5807?auto=format&fit=crop&w=900&q=80",
  "Minerals & Construction": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=900&q=80",
  "Energy Materials": "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=900&q=80",
  "Textiles & Fibers": "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80",
};

const STATE_NAMES = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(value = "") {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value = "") {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " "));
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function stableId(prefix, value) {
  const hash = crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
  return `${prefix}_${hash}`;
}

function absoluteUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Symbi-OS research importer (+https://github.com/Ayush307K/Symbi-OS)",
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.text();
}

function extractField(html, label) {
  const pattern = new RegExp(
    `<td[^>]*>\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    "i"
  );
  const match = html.match(pattern);
  return match ? stripTags(match[1]) : "";
}

function extractDetailImage(html, fallback) {
  const display = html.match(/<img[^>]+src=["']([^"']*upload_images_listings[^"']*display[^"']*)["']/i);
  if (display) return absoluteUrl(display[1]);
  const thumb = html.match(/<img[^>]+src=["']([^"']*upload_images_listings[^"']*)["']/i);
  if (thumb) return absoluteUrl(thumb[1]);
  return fallback;
}

function parseListPage(html) {
  const rows = [];
  const rowRegex = /<tr[^>]*>[\s\S]*?Listing\.cfm\?idsListing=(\d+)[\s\S]*?<\/tr>/gi;
  let match;

  while ((match = rowRegex.exec(html))) {
    const row = match[0];
    const externalId = match[1];
    const title = stripTags(row.match(/<a[^>]+href=["']Listing\.cfm\?idsListing=\d+["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] || "");
    const cells = [...row.matchAll(/<td[\s\S]*?<\/td>/gi)].map((cell) => stripTags(cell[0]));
    const imagePath = row.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";

    if (externalId && title) {
      rows.push({
        externalId,
        title,
        rawQuantityText: cells[2] || "",
        rawLocationText: cells[3] || "",
        thumbUrl: absoluteUrl(imagePath),
        sourceUrl: `${BASE_URL}/Listing.cfm?idsListing=${externalId}`,
      });
    }
  }

  return rows;
}

function parseTotalCount(html) {
  const match = html.match(/Displaying listings\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)/i);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function categorize(title, detailCategory = "") {
  const text = `${title} ${detailCategory}`.toLowerCase();
  if (/hdpe|ldpe|plastic|poly|pvc|abs|vinyl|resin|bucket|repro|film/.test(text)) return "Polymers & Plastics";
  if (/steel|metal|aluminum|aluminium|copper|brass|motor|crane|hoist|scrap/.test(text)) return "Metals & Alloys";
  if (/carbon|chemical|solv|glycol|phosphate|acid|alkali|fertilizer|coolant|oil|paint|drum/.test(text)) return "Chemicals";
  if (/paper|occ|cardboard|wood|pallet|fiber|fibre|organic|food|compost/.test(text)) return "Organic & Bio";
  if (/electronic|battery|computer|pcb|circuit|e-waste|motor/.test(text)) return "E-Waste";
  if (/textile|fabric|webbing|yarn|cloth|polyester/.test(text)) return "Textiles & Fibers";
  if (/solar|fuel|energy|evaporator/.test(text)) return "Energy Materials";
  return "Minerals & Construction";
}

function inferBaseElement(category, title) {
  const lower = title.toLowerCase();
  if (category === "Polymers & Plastics") {
    if (lower.includes("hdpe")) return "HDPE";
    if (lower.includes("ldpe")) return "LDPE";
    if (lower.includes("pvc")) return "PVC";
    if (lower.includes("abs")) return "ABS";
    return "Polymer";
  }
  if (category === "Metals & Alloys") return /copper/.test(lower) ? "Copper" : "Metal";
  if (category === "Chemicals") return /carbon/.test(lower) ? "Carbon" : "Chemical";
  if (category === "Organic & Bio") return /paper|occ|cardboard/.test(lower) ? "Paper fiber" : "Biomass";
  if (category === "Textiles & Fibers") return "Textile fiber";
  return category.split(" ")[0];
}

function inferToxicity(category, title) {
  const lower = title.toLowerCase();
  if (/solv|glycol|chemical|acid|alkali|coolant|paint/.test(lower)) return "high";
  if (category === "Chemicals" || category === "E-Waste") return "medium";
  return "low";
}

function parseLocation(rawLocationText = "") {
  const cleaned = decodeHtml(rawLocationText).replace(/\s+Area$/i, "").trim();
  if (!cleaned) {
    return { area: "Public listing", city: "Unspecified", state: "Industrial Region", country: "USA" };
  }

  const upper = cleaned.toUpperCase();
  const stateCode = Object.keys(STATE_NAMES).find((code) => new RegExp(`(?:,|\\s)${code}\\b`).test(upper));
  const state = stateCode ? STATE_NAMES[stateCode] : "Industrial Region";
  const city = cleaned
    .replace(new RegExp(`,?\\s*${stateCode || ""}\\b`, "i"), "")
    .replace(/\s+Area$/i, "")
    .trim() || cleaned;

  return {
    area: cleaned,
    city,
    state,
    country: stateCode ? "USA" : "Global",
  };
}

function parseQuantity(rawQuantityText = "") {
  const cleaned = decodeHtml(rawQuantityText);
  const number = cleaned.match(/[\d,.]+/)?.[0];
  if (!number) return 1;
  return Math.max(1, Math.min(999999, Math.round(Number(number.replace(/,/g, "")) || 1)));
}

async function ensureLibsqlColumns() {
  const url = process.env.DATABASE_URL || "";
  if (!url.startsWith("libsql://") && !url.startsWith("https://")) return;

  const parsed = new URL(url);
  const authToken = parsed.searchParams.get("authToken") || process.env.TURSO_AUTH_TOKEN || "";
  parsed.searchParams.delete("authToken");
  const client = createClient({ url: parsed.toString(), authToken });
  const statements = [
    "ALTER TABLE MarketplaceListing ADD COLUMN sourceType TEXT NOT NULL DEFAULT 'synthetic'",
    "ALTER TABLE MarketplaceListing ADD COLUMN sourceName TEXT",
    "ALTER TABLE MarketplaceListing ADD COLUMN sourceUrl TEXT",
    "ALTER TABLE MarketplaceListing ADD COLUMN externalId TEXT",
    "ALTER TABLE MarketplaceListing ADD COLUMN rawQuantityText TEXT",
    "ALTER TABLE MarketplaceListing ADD COLUMN rawLocationText TEXT",
    "CREATE UNIQUE INDEX IF NOT EXISTS MarketplaceListing_externalId_key ON MarketplaceListing(externalId)",
    "CREATE INDEX IF NOT EXISTS MarketplaceListing_sourceType_idx ON MarketplaceListing(sourceType)",
    "CREATE INDEX IF NOT EXISTS MarketplaceListing_sourceName_idx ON MarketplaceListing(sourceName)",
  ];

  for (const statement of statements) {
    try {
      await client.execute(statement);
    } catch (error) {
      if (!String(error.message || error).includes("duplicate column name")) {
        throw error;
      }
    }
  }
}

async function hydrateListing(row) {
  await sleep(DETAIL_DELAY_MS);
  const html = await fetchHtml(row.sourceUrl);
  const detailCategory = extractField(html, "Category");
  const quantity = extractField(html, "Quantity") || row.rawQuantityText;
  const location = extractField(html, "Location") || row.rawLocationText;
  const details = extractField(html, "Details");
  const condition = extractField(html, "Condition");
  const availability = extractField(html, "Available/Wanted?");
  const duration = extractField(html, "Listing Duration");
  const category = categorize(row.title, detailCategory);
  const locationParts = parseLocation(location);
  const imageUrl = extractDetailImage(html, row.thumbUrl || FALLBACK_IMAGES[category]);
  const quantityAvailable = parseQuantity(quantity);

  return {
    ...row,
    category,
    subcategory: inferBaseElement(category, row.title),
    toxicityLevel: inferToxicity(category, row.title),
    description: [
      details || `${row.title} public industrial exchange listing.`,
      condition ? `Condition: ${condition}.` : "",
      availability ? `Listing type: ${availability}.` : "",
      duration ? `Duration: ${duration}.` : "",
      "Imported from a public WasteXchange/SWIX listing; contact details are intentionally excluded.",
    ]
      .filter(Boolean)
      .join(" "),
    imageUrl,
    rawQuantityText: quantity,
    rawLocationText: location,
    quantityAvailable,
    ...locationParts,
  };
}

async function upsertListing(listing) {
  const materialId = stableId("real_material", `${SOURCE_NAME}:${listing.externalId}`);
  const companyId = stableId("real_supplier", `${SOURCE_NAME}:${listing.externalId}`);
  const slug = `${slugify(listing.title)}-swix-${listing.externalId}`;
  const materialName = `${listing.title} (SWIX ${listing.externalId})`;

  await prisma.company.upsert({
    where: { id: companyId },
    update: {
      name: `WasteXchange public supplier ${listing.externalId}`,
      industry: listing.category,
      location: listing.rawLocationText || `${listing.city}, ${listing.state}`,
    },
    create: {
      id: companyId,
      name: `WasteXchange public supplier ${listing.externalId}`,
      industry: listing.category,
      location: listing.rawLocationText || `${listing.city}, ${listing.state}`,
      carbonRating: "B",
      latitude: 0,
      longitude: 0,
      capacity: listing.quantityAvailable,
    },
  });

  await prisma.wasteMaterial.upsert({
    where: { id: materialId },
    update: {
      name: materialName,
      category: listing.category,
      baseElement: listing.subcategory,
      toxicityLevel: listing.toxicityLevel,
      description: listing.description,
      quantity: listing.quantityAvailable,
      status: "available",
    },
    create: {
      id: materialId,
      name: materialName,
      category: listing.category,
      baseElement: listing.subcategory,
      toxicityLevel: listing.toxicityLevel,
      description: listing.description,
      price: null,
      quantity: listing.quantityAvailable,
      status: "available",
    },
  });

  await prisma.materialProducer.upsert({
    where: {
      companyId_materialId: {
        companyId,
        materialId,
      },
    },
    update: {},
    create: {
      companyId,
      materialId,
    },
  });

  await prisma.marketplaceListing.upsert({
    where: { externalId: `wastexchange:${listing.externalId}` },
    update: {
      title: listing.title,
      slug,
      materialId,
      sellerCompanyId: companyId,
      category: listing.category,
      subcategory: listing.subcategory,
      area: listing.area,
      city: listing.city,
      state: listing.state,
      country: listing.country,
      imageUrl: listing.imageUrl,
      pricePerUnit: 0,
      currency: "INR",
      unit: "lot",
      minOrderQuantity: 1,
      quantityAvailable: listing.quantityAvailable,
      leadTimeDays: 14,
      rating: 4.2,
      responseRate: 70,
      verified: false,
      tradeAssurance: false,
      yearsActive: 1,
      ordersCompleted: 0,
      description: listing.description,
      packaging: "As listed by source",
      paymentTerms: "Contact source exchange",
      status: "active",
      sourceType: SOURCE_TYPE,
      sourceName: SOURCE_NAME,
      sourceUrl: listing.sourceUrl,
      rawQuantityText: listing.rawQuantityText,
      rawLocationText: listing.rawLocationText,
    },
    create: {
      id: `swix_listing_${listing.externalId}`,
      title: listing.title,
      slug,
      materialId,
      sellerCompanyId: companyId,
      category: listing.category,
      subcategory: listing.subcategory,
      area: listing.area,
      city: listing.city,
      state: listing.state,
      country: listing.country,
      imageUrl: listing.imageUrl,
      pricePerUnit: 0,
      currency: "INR",
      unit: "lot",
      minOrderQuantity: 1,
      quantityAvailable: listing.quantityAvailable,
      leadTimeDays: 14,
      rating: 4.2,
      responseRate: 70,
      verified: false,
      tradeAssurance: false,
      yearsActive: 1,
      ordersCompleted: 0,
      description: listing.description,
      packaging: "As listed by source",
      paymentTerms: "Contact source exchange",
      status: "active",
      sourceType: SOURCE_TYPE,
      sourceName: SOURCE_NAME,
      sourceUrl: listing.sourceUrl,
      externalId: `wastexchange:${listing.externalId}`,
      rawQuantityText: listing.rawQuantityText,
      rawLocationText: listing.rawLocationText,
    },
  });
}

async function main() {
  await ensureLibsqlColumns();

  const firstHtml = await fetchHtml(`${BASE_URL}/Listings.cfm?X=MA&START=1`);
  const totalCount = parseTotalCount(firstHtml);
  const pagesByTotal = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : MAX_PAGES;
  const pagesToFetch = Math.min(MAX_PAGES, pagesByTotal);
  const rows = parseListPage(firstHtml);

  for (let page = 2; page <= pagesToFetch; page += 1) {
    const start = (page - 1) * PAGE_SIZE + 1;
    const html = await fetchHtml(`${BASE_URL}/Listings.cfm?X=MA&START=${start}`);
    const pageRows = parseListPage(html);
    if (pageRows.length === 0) break;
    rows.push(...pageRows);
    console.log(`Fetched page ${page}/${pagesToFetch}: ${rows.length} public rows`);
  }

  const uniqueRows = [...new Map(rows.map((row) => [row.externalId, row])).values()];
  let imported = 0;

  for (const row of uniqueRows) {
    try {
      const listing = await hydrateListing(row);
      await upsertListing(listing);
      imported += 1;
      if (imported % 25 === 0) {
        console.log(`Imported ${imported}/${uniqueRows.length}: ${listing.title}`);
      }
    } catch (error) {
      console.warn(`Skipped WasteXchange listing ${row.externalId}: ${error.message}`);
    }
  }

  const realPublicCount = await prisma.marketplaceListing.count({
    where: { sourceType: SOURCE_TYPE, sourceName: SOURCE_NAME },
  });
  const totalListings = await prisma.marketplaceListing.count();

  console.log(
    JSON.stringify(
      {
        source: SOURCE_NAME,
        fetchedRows: uniqueRows.length,
        imported,
        realPublicCount,
        totalListings,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    prisma.$disconnect();
  });
