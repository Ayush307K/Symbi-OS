const crypto = require("crypto");
const { createClient } = require("@libsql/client");
require("dotenv").config();

const BASE_URL = "https://www.recycleinme.com";
const SOURCE_NAME = "RecycleInMe India sell offers";
const SOURCE_TYPE = "real_public_india";
const MAX_PAGES = Number(process.env.RIM_MAX_PAGES || 120);

const FALLBACK_IMAGES = {
  "Metals & Alloys": "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=900&q=80",
  "Polymers & Plastics": "https://images.unsplash.com/photo-1604187351574-c75ca79f5807?auto=format&fit=crop&w=900&q=80",
  "E-Waste": "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=900&q=80",
  "Textiles & Fibers": "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80",
  "Organic & Bio": "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80",
  Chemicals: "https://images.unsplash.com/photo-1532187643603-ba119ca4109e?auto=format&fit=crop&w=900&q=80",
  "Minerals & Construction": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=900&q=80",
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
  return String(value)
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u2013/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function stripContact(text = "") {
  return decodeHtml(text)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[phone removed]")
    .replace(/\s+/g, " ")
    .trim();
}

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash("sha1").update(value).digest("hex").slice(0, 16)}`;
}

function slugify(text) {
  return decodeHtml(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

async function fetchPage(page) {
  const response = await fetch(`${BASE_URL}/scrap-sell-offer?page=${page}`, {
    headers: { "user-agent": "Symbi-OS India public-data importer" },
  });
  if (!response.ok) throw new Error(`RecycleInMe page ${page} returned ${response.status}`);
  const html = await response.text();
  const match = html.match(/data-page=\"([\s\S]*?)\"/);
  if (!match) return { rows: [], lastPage: page };

  const json = decodeHtml(match[1]);
  const pageData = JSON.parse(json);
  const selloffers = pageData.props?.selloffers;
  return {
    rows: selloffers?.data ?? [],
    lastPage: Number(selloffers?.last_page ?? page),
  };
}

function categoryFor(row) {
  const text = `${row.Category || ""} ${row.SubCategory || ""} ${row.ItemTitle || ""}`.toLowerCase();
  if (/aluminium|aluminum|copper|brass|metal|steel|ingot|cathode|rail|hms|ubc/.test(text)) return "Metals & Alloys";
  if (/ldpe|hdpe|pet|plastic|poly|granule|rubber|crumb|film/.test(text)) return "Polymers & Plastics";
  if (/paper|cardboard|kraft|box/.test(text)) return "Organic & Bio";
  if (/battery|e-waste|electronic|computer/.test(text)) return "E-Waste";
  if (/textile|cloth|clothing|fabric/.test(text)) return "Textiles & Fibers";
  if (/chemical|oil|solvent/.test(text)) return "Chemicals";
  return "Minerals & Construction";
}

function parseQuantity(raw = "") {
  const match = String(raw).match(/[\d,.]+/);
  if (!match) return 1;
  return Math.max(1, Math.min(999999, Math.round(Number(match[0].replace(/,/g, "")) || 1)));
}

function priceValue(raw) {
  if (raw == null || raw === "") return 0;
  const parsed = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceUrl(row) {
  return `${BASE_URL}/rim-${row.username}/selloffer-${row.ItemID}`;
}

function imageUrl(row, category) {
  return `${BASE_URL}/storage/userimg/thumb200/${row.ItemID}.webp` || FALLBACK_IMAGES[category];
}

function statementsFor(row) {
  const id = String(row.ItemID);
  const category = categoryFor(row);
  const subcategory = decodeHtml(row.SubCategory || category);
  const companyId = stableId("rim_supplier", `${SOURCE_NAME}:${row.username || row.CompanyName}`);
  const materialId = stableId("rim_material", `${SOURCE_NAME}:${id}`);
  const listingId = `rim_india_listing_${id}`;
  const externalId = `recycleinme:${id}`;
  const title = decodeHtml(row.ItemTitle);
  const companyName = decodeHtml(row.CompanyName || `RecycleInMe seller ${id}`);
  const offerCity = decodeHtml(row.City || row.city || "India");
  const sellerCity = decodeHtml(row.city || row.City || "India");
  const state = decodeHtml(row.state || "India");
  const rawQuantityText = decodeHtml(row.quant || "");
  const quantity = parseQuantity(rawQuantityText);
  const price = priceValue(row.price);
  const description = stripContact(row.Description || `${title}. Public sell offer from RecycleInMe.`);
  const now = new Date().toISOString();
  const source = sourceUrl(row);
  const image = imageUrl(row, category) || FALLBACK_IMAGES[category];
  const location = `${offerCity}, ${state}, India`;

  return [
    {
      sql: `insert into Company (id,name,industry,location,carbonRating,latitude,longitude,capacity,createdAt,updatedAt)
        values (?,?,?,?,?,?,?,?,?,?)
        on conflict(id) do update set name=excluded.name, industry=excluded.industry, location=excluded.location, capacity=excluded.capacity, updatedAt=excluded.updatedAt`,
      args: [companyId, companyName, category, `${sellerCity}, ${state}, India`, "Unrated", 0, 0, quantity, now, now],
    },
    {
      sql: `insert into WasteMaterial (id,name,toxicityLevel,baseElement,category,description,price,quantity,status,createdAt,updatedAt)
        values (?,?,?,?,?,?,?,?,?,?,?)
        on conflict(id) do update set name=excluded.name, baseElement=excluded.baseElement, category=excluded.category, description=excluded.description, price=excluded.price, quantity=excluded.quantity, updatedAt=excluded.updatedAt`,
      args: [materialId, `${title} (RIM ${id})`, "medium", subcategory, category, description, price || null, quantity, "available", now, now],
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
          imageUrl=excluded.imageUrl,
          pricePerUnit=excluded.pricePerUnit,
          unit=excluded.unit,
          quantityAvailable=excluded.quantityAvailable,
          description=excluded.description,
          packaging=excluded.packaging,
          paymentTerms=excluded.paymentTerms,
          updatedAt=excluded.updatedAt`,
      args: [
        listingId,
        title,
        `${slugify(title)}-rim-${id}`,
        SOURCE_TYPE,
        SOURCE_NAME,
        source,
        externalId,
        rawQuantityText,
        location,
        materialId,
        companyId,
        category,
        subcategory,
        offerCity,
        offerCity,
        state,
        "India",
        image,
        price,
        "INR",
        decodeHtml(row.unit || "lot"),
        1,
        quantity,
        0,
        0,
        0,
        row.RIMVerified === "1" ? 1 : 0,
        0,
        0,
        0,
        description,
        decodeHtml(row.packing || "As listed by source"),
        "Contact through original marketplace",
        "active",
        now,
        now,
      ],
    },
  ];
}

async function main() {
  const client = dbClient();
  const first = await fetchPage(1);
  const lastPage = Math.min(MAX_PAGES, first.lastPage);
  const pages = Array.from({ length: lastPage - 1 }, (_, index) => index + 2);
  const rest = await Promise.all(pages.map((page) => fetchPage(page).then((result) => result.rows)));
  const rows = [first.rows, ...rest]
    .flat()
    .filter((row) => String(row.country || "").trim().toLowerCase() === "india");
  const uniqueRows = [...new Map(rows.map((row) => [String(row.ItemID), row])).values()];
  console.log(`Collected ${uniqueRows.length} India sell offers from RecycleInMe.`);

  const statements = uniqueRows.flatMap(statementsFor);
  for (let i = 0; i < statements.length; i += 400) {
    await client.batch(statements.slice(i, i + 400), "write");
    console.log(`Wrote ${Math.min(i + 400, statements.length)} / ${statements.length} statements`);
  }

  await client.execute({
    sql: `delete from MarketplaceListing
      where sourceType in ('synthetic', 'real_public')
      or (sourceType = 'real_public_india' and sourceName != ?)`,
    args: [SOURCE_NAME],
  });
  const counts = await client.execute(
    "select sourceType, sourceName, count(*) as count from MarketplaceListing group by sourceType, sourceName"
  );
  console.log(JSON.stringify(counts.rows, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
