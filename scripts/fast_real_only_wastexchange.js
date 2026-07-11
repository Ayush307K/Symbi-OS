const crypto = require("crypto");
const { createClient } = require("@libsql/client");
require("dotenv").config();

const BASE_URL = "https://www.wastexchange.org";
const SOURCE_NAME = "WasteXchange / SWIX";
const SOURCE_TYPE = "real_public";
const PAGE_SIZE = 20;

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
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

function dbClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const parsed = new URL(url);
  const authToken = parsed.searchParams.get("authToken") || process.env.TURSO_AUTH_TOKEN || "";
  parsed.searchParams.delete("authToken");
  return createClient({ url: parsed.toString(), authToken });
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
  return decodeHtml(value.replace(/<[^>]+>/g, " "));
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash("sha1").update(value).digest("hex").slice(0, 16)}`;
}

function absoluteUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Symbi-OS real-data importer" },
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${url}`);
  return response.text();
}

function parseTotalCount(html) {
  const match = html.match(/Displaying listings\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)/i);
  return match ? Number(match[1].replace(/,/g, "")) : 0;
}

function parseRows(html) {
  const rows = [];
  const rowRegex = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>\s*<a[^>]+href=["']Listing\.cfm\?idsListing=(\d+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(html))) {
    const imagePath = match[1].match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";
    const externalId = match[2];
    const title = stripTags(match[3]);
    if (!title) continue;
    rows.push({
      externalId,
      title,
      rawQuantityText: stripTags(match[4]),
      rawLocationText: stripTags(match[5]),
      imageUrl: absoluteUrl(imagePath),
      sourceUrl: `${BASE_URL}/Listing.cfm?idsListing=${externalId}`,
    });
  }
  return rows;
}

function categorize(title) {
  const text = title.toLowerCase();
  if (/hdpe|ldpe|plastic|poly|pvc|abs|vinyl|resin|bucket|repro|film|pet|eps|pp\b|bopp/.test(text)) return "Polymers & Plastics";
  if (/steel|metal|aluminum|aluminium|copper|brass|motor|crane|hoist|scrap/.test(text)) return "Metals & Alloys";
  if (/carbon|chemical|solv|glycol|phosphate|acid|alkali|fertilizer|coolant|oil|paint|drum|peroxide/.test(text)) return "Chemicals";
  if (/paper|occ|cardboard|wood|pallet|fiber|fibre|organic|food|compost/.test(text)) return "Organic & Bio";
  if (/electronic|battery|computer|pcb|circuit|e-waste/.test(text)) return "E-Waste";
  if (/textile|fabric|webbing|yarn|cloth|polyester|clothing/.test(text)) return "Textiles & Fibers";
  if (/solar|fuel|energy|evaporator/.test(text)) return "Energy Materials";
  return "Minerals & Construction";
}

function subcategory(category, title) {
  const lower = title.toLowerCase();
  if (category === "Polymers & Plastics") {
    if (lower.includes("hdpe")) return "HDPE";
    if (lower.includes("ldpe")) return "LDPE";
    if (lower.includes("pvc")) return "PVC";
    if (lower.includes("abs")) return "ABS";
    if (lower.includes("pet")) return "PET";
    if (lower.includes("pp")) return "PP";
    return "Polymer";
  }
  if (category === "Chemicals") return lower.includes("carbon") ? "Carbon" : "Chemical";
  if (category === "Metals & Alloys") return lower.includes("copper") ? "Copper" : "Metal";
  if (category === "Textiles & Fibers") return "Textile fiber";
  return category.split(" ")[0];
}

function toxicity(category, title) {
  if (/solv|glycol|chemical|acid|alkali|coolant|paint|peroxide/.test(title.toLowerCase())) return "high";
  if (category === "Chemicals" || category === "E-Waste") return "medium";
  return "low";
}

function parseLocation(raw = "") {
  const cleaned = decodeHtml(raw).replace(/\s+Area$/i, "").trim();
  if (!cleaned) return { area: "Public listing", city: "Unspecified", state: "Industrial Region", country: "USA" };
  const upper = cleaned.toUpperCase();
  const stateCode = Object.keys(STATE_NAMES).find((code) => new RegExp(`(?:,|\\s)${code}\\b`).test(upper));
  const city = cleaned.replace(new RegExp(`,?\\s*${stateCode || ""}\\b`, "i"), "").replace(/\s+Area$/i, "").trim() || cleaned;
  return { area: cleaned, city, state: stateCode ? STATE_NAMES[stateCode] : "Industrial Region", country: stateCode ? "USA" : "Global" };
}

function parseQuantity(raw = "") {
  const number = decodeHtml(raw).match(/[\d,.]+/)?.[0];
  return Math.max(1, Math.min(999999, Math.round(Number((number || "1").replace(/,/g, "")) || 1)));
}

async function collectRows() {
  const first = await fetchHtml(`${BASE_URL}/Listings.cfm?X=MA&START=1`);
  const total = parseTotalCount(first);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const urls = Array.from({ length: pages - 1 }, (_, index) => `${BASE_URL}/Listings.cfm?X=MA&START=${(index + 1) * PAGE_SIZE + 1}`);
  const results = await Promise.all(urls.map((url) => fetchHtml(url).then(parseRows)));
  return [...new Map([parseRows(first), ...results].flat().map((row) => [row.externalId, row])).values()];
}

async function ensureColumns(client) {
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
  for (const sql of statements) {
    try {
      await client.execute(sql);
    } catch (error) {
      if (!String(error.message || error).includes("duplicate column name")) throw error;
    }
  }
}

function statementsFor(row) {
  const category = categorize(row.title);
  const baseElement = subcategory(category, row.title);
  const loc = parseLocation(row.rawLocationText);
  const quantity = parseQuantity(row.rawQuantityText);
  const companyId = stableId("real_supplier", `${SOURCE_NAME}:${row.externalId}`);
  const materialId = stableId("real_material", `${SOURCE_NAME}:${row.externalId}`);
  const now = new Date().toISOString();
  const title = row.title;
  const materialName = `${title} (SWIX ${row.externalId})`;
  const imageUrl = row.imageUrl || FALLBACK_IMAGES[category];
  const description = `${title} public industrial exchange listing from ${SOURCE_NAME}. Quantity listed: ${row.rawQuantityText || "not specified"}. Location: ${row.rawLocationText || "not specified"}. Contact details are intentionally excluded.`;
  const externalId = `wastexchange:${row.externalId}`;

  return [
    {
      sql: `insert into Company (id,name,industry,location,carbonRating,latitude,longitude,capacity,createdAt,updatedAt)
        values (?,?,?,?,?,?,?,?,?,?)
        on conflict(id) do update set industry=excluded.industry, location=excluded.location, capacity=excluded.capacity, updatedAt=excluded.updatedAt`,
      args: [companyId, `WasteXchange public supplier ${row.externalId}`, category, row.rawLocationText || loc.area, "B", 0, 0, quantity, now, now],
    },
    {
      sql: `insert into WasteMaterial (id,name,toxicityLevel,baseElement,category,description,price,quantity,status,createdAt,updatedAt)
        values (?,?,?,?,?,?,?,?,?,?,?)
        on conflict(id) do update set name=excluded.name, toxicityLevel=excluded.toxicityLevel, baseElement=excluded.baseElement, category=excluded.category, quantity=excluded.quantity, updatedAt=excluded.updatedAt`,
      args: [materialId, materialName, toxicity(category, title), baseElement, category, description, null, quantity, "available", now, now],
    },
    {
      sql: `insert into MaterialProducer (companyId,materialId) values (?,?)
        on conflict(companyId,materialId) do nothing`,
      args: [companyId, materialId],
    },
    {
      sql: `insert into MarketplaceListing (
          id,title,slug,sourceType,sourceName,sourceUrl,externalId,rawQuantityText,rawLocationText,materialId,sellerCompanyId,
          category,subcategory,area,city,state,country,imageUrl,pricePerUnit,currency,unit,minOrderQuantity,quantityAvailable,
          leadTimeDays,rating,responseRate,verified,tradeAssurance,yearsActive,ordersCompleted,description,packaging,paymentTerms,status,createdAt,updatedAt
        ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        on conflict(externalId) do update set
          title=excluded.title,
          slug=excluded.slug,
          sourceType=excluded.sourceType,
          sourceName=excluded.sourceName,
          sourceUrl=excluded.sourceUrl,
          rawQuantityText=excluded.rawQuantityText,
          rawLocationText=excluded.rawLocationText,
          materialId=excluded.materialId,
          sellerCompanyId=excluded.sellerCompanyId,
          category=excluded.category,
          subcategory=excluded.subcategory,
          area=excluded.area,
          city=excluded.city,
          state=excluded.state,
          country=excluded.country,
          imageUrl=case when MarketplaceListing.imageUrl like '%upload_images_listings%display%' then MarketplaceListing.imageUrl else excluded.imageUrl end,
          quantityAvailable=excluded.quantityAvailable,
          updatedAt=excluded.updatedAt`,
      args: [
        `swix_listing_${row.externalId}`,
        title,
        `${slugify(title)}-swix-${row.externalId}`,
        SOURCE_TYPE,
        SOURCE_NAME,
        row.sourceUrl,
        externalId,
        row.rawQuantityText,
        row.rawLocationText,
        materialId,
        companyId,
        category,
        baseElement,
        loc.area,
        loc.city,
        loc.state,
        loc.country,
        imageUrl,
        0,
        "INR",
        "lot",
        1,
        quantity,
        14,
        4.2,
        70,
        0,
        0,
        1,
        0,
        description,
        "As listed by source",
        "Contact source exchange",
        "active",
        now,
        now,
      ],
    },
  ];
}

async function main() {
  const client = dbClient();
  await ensureColumns(client);
  const rows = await collectRows();
  console.log(`Collected ${rows.length} real public rows.`);

  const statements = rows.flatMap(statementsFor);
  for (let i = 0; i < statements.length; i += 400) {
    await client.batch(statements.slice(i, i + 400), "write");
    console.log(`Wrote ${Math.min(i + 400, statements.length)} / ${statements.length} statements`);
  }

  await client.execute("delete from MarketplaceListing where sourceType = 'synthetic' or sourceType is null");
  const counts = await client.execute("select count(*) as total, sum(case when sourceType='real_public' then 1 else 0 end) as realPublic, sum(case when sourceType='seller_submitted' then 1 else 0 end) as sellerSubmitted from MarketplaceListing");
  console.log(JSON.stringify(counts.rows[0], null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
