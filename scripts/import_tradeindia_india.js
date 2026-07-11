const crypto = require("crypto");
const { createClient } = require("@libsql/client");
require("dotenv").config();

const SOURCE_NAME = "TradeIndia supplier products";
const SOURCE_TYPE = "real_public_india";
const BASE_URL = "https://www.tradeindia.com";

const CATEGORY_PAGES = [
  {
    url: `${BASE_URL}/seller/plastics-products/plastic-scrap/`,
    category: "Polymers & Plastics",
    subcategory: "Plastic Scrap",
  },
  {
    url: `${BASE_URL}/seller/metal-products-powder/metal-scrap/`,
    category: "Metals & Alloys",
    subcategory: "Metal Scrap",
  },
  {
    url: `${BASE_URL}/seller/metal-products-powder/aluminium-scrap/`,
    category: "Metals & Alloys",
    subcategory: "Aluminium Scrap",
  },
  {
    url: `${BASE_URL}/seller/metal-products-powder/copper-scrap/`,
    category: "Metals & Alloys",
    subcategory: "Copper Scrap",
  },
  {
    url: `${BASE_URL}/seller/metal-products-powder/iron-scrap/`,
    category: "Metals & Alloys",
    subcategory: "Iron Scrap",
  },
  {
    url: `${BASE_URL}/seller/metal-products-powder/steel-scrap/`,
    category: "Metals & Alloys",
    subcategory: "Steel Scrap",
  },
  {
    url: `${BASE_URL}/seller/paper-paper-products/waste-paper/`,
    category: "Organic & Bio",
    subcategory: "Waste Paper",
  },
  {
    url: `${BASE_URL}/seller/rubber-rubber-products/rubber-scrap/`,
    category: "Polymers & Plastics",
    subcategory: "Rubber Scrap",
  },
  {
    url: `${BASE_URL}/seller/textiles-fabrics/textile-waste/`,
    category: "Textiles & Fibers",
    subcategory: "Textile Waste",
  },
];

const SCRAP_TERMS =
  /scrap|waste|regrind|recycled|recycling|flake|flakes|bottle|cutting|shredded|used|pvc|hdpe|ldpe|pet|bopp|abs|rubber/i;

const INDIA_STATES = new Set(
  [
    "andhra pradesh",
    "arunachal pradesh",
    "assam",
    "bihar",
    "chhattisgarh",
    "delhi",
    "goa",
    "gujarat",
    "haryana",
    "himachal pradesh",
    "india",
    "jammu and kashmir",
    "jharkhand",
    "karnataka",
    "kerala",
    "madhya pradesh",
    "maharashtra",
    "manipur",
    "meghalaya",
    "mizoram",
    "nagaland",
    "odisha",
    "orissa",
    "punjab",
    "rajasthan",
    "sikkim",
    "tamil nadu",
    "telangana",
    "tripura",
    "uttar pradesh",
    "uttarakhand",
    "west bengal",
  ]
);

const FALLBACK_IMAGES = {
  "Metals & Alloys": "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=900&q=80",
  "Polymers & Plastics": "https://images.unsplash.com/photo-1604187351574-c75ca79f5807?auto=format&fit=crop&w=900&q=80",
  "Textiles & Fibers": "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80",
  "Organic & Bio": "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80",
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
    .replace(/\s+/g, " ")
    .trim();
}

function stripContact(text = "") {
  return decodeHtml(text)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[phone removed]")
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

function metaValue(row, section, label) {
  const items = row.custom_field_data_meta_info?.[section] || [];
  const match = items.find((item) => String(item.label_name || "").toLowerCase() === label.toLowerCase());
  return decodeHtml(match?.value || "");
}

function parsePrice(row) {
  const raw = row.price || metaValue(row, "Price_And_Quantity", "Price") || row.price_es;
  const match = String(raw || "").match(/[\d,.]+/);
  if (!match) return 0;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function parseQuantity(row) {
  const raw =
    metaValue(row, "Trade_Information", "Supply Ability") ||
    metaValue(row, "Price_And_Quantity", "Minimum Order Quantity");
  const match = String(raw || "").match(/[\d,.]+/);
  if (!match) return 1;
  return Math.max(1, Math.min(999999, Math.round(Number(match[0].replace(/,/g, "")) || 1)));
}

function unitFor(row) {
  const raw =
    metaValue(row, "Price_And_Quantity", "Unit of Measure") ||
    metaValue(row, "Price_And_Quantity", "Unit of Price");
  const lower = raw.toLowerCase();
  if (lower.includes("kilogram")) return "kg";
  if (lower.includes("ton")) return "ton";
  if (lower.includes("piece")) return "piece";
  if (lower.includes("bag")) return "bag";
  return "unit";
}

function locationFor(row) {
  const city = decodeHtml(row.city || "India");
  const state = decodeHtml(row.state || "India");
  return {
    area: city,
    city,
    state,
    country: "India",
    raw: [city, state, "India"].filter(Boolean).join(", "),
  };
}

function sourceUrl(row) {
  const raw = row.prod_url || row.product_url || row.filename || "";
  if (!raw) return BASE_URL;
  if (raw.startsWith("http")) return raw;
  return `${BASE_URL}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function productRowsFromPage(page) {
  const sellerData = page?.props?.pageProps?.initialState?.productList?.product_list?.product_list_res?.sellerData;
  if (!sellerData) return [];
  return [
    ...(sellerData.listing?.data || []),
    ...(sellerData.product_list_data?.readyToShip || []),
    ...(sellerData.product_list_data?.latest || []),
    ...(sellerData.product_list_data?.popular || []),
  ];
}

async function fetchCategory(pageConfig) {
  const response = await fetch(pageConfig.url, {
    headers: { "user-agent": "Symbi-OS India public-data importer" },
  });
  if (!response.ok) throw new Error(`TradeIndia ${pageConfig.url} returned ${response.status}`);
  const html = await response.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return [];
  const page = JSON.parse(match[1]);
  return productRowsFromPage(page).map((row) => ({ ...row, sourceCategory: pageConfig }));
}

function isUsableScrapRow(row) {
  const text = [
    row.product_name,
    row.long_tail_prod_name,
    row.product_description,
    row.sourceCategory?.subcategory,
  ]
    .join(" ")
    .toLowerCase();
  const state = String(row.state || "India").trim().toLowerCase();
  return row.product_id && row.product_name && row.co_name && INDIA_STATES.has(state) && SCRAP_TERMS.test(text);
}

function statementsFor(row) {
  const id = String(row.product_id);
  const category = row.sourceCategory.category;
  const subcategory = row.sourceCategory.subcategory;
  const loc = locationFor(row);
  const title = decodeHtml(row.product_name || row.long_tail_prod_name);
  const companyName = decodeHtml(row.co_name || row.initial_co_name || `TradeIndia supplier ${id}`);
  const description = stripContact(
    row.product_description ||
      row.long_tail_prod_name ||
      `${title}. Public supplier product listing from TradeIndia.`
  );
  const price = parsePrice(row);
  const quantity = parseQuantity(row);
  const rawQuantityText =
    metaValue(row, "Trade_Information", "Supply Ability") ||
    metaValue(row, "Price_And_Quantity", "Minimum Order Quantity") ||
    "";
  const paymentTerms = metaValue(row, "Trade_Information", "Payment Terms") || "Contact through original marketplace";
  const packaging = metaValue(row, "Trade_Information", "Packaging Details") || "As listed by source";
  const companyId = stableId("tradeindia_supplier", companyName);
  const materialId = stableId("tradeindia_material", `${SOURCE_NAME}:${id}`);
  const listingId = `tradeindia_listing_${id}`;
  const externalId = `tradeindia:${id}`;
  const now = new Date().toISOString();
  const url = sourceUrl(row);
  const image = row.product_image || FALLBACK_IMAGES[category];

  return [
    {
      sql: `insert into Company (id,name,industry,location,carbonRating,latitude,longitude,capacity,createdAt,updatedAt)
        values (?,?,?,?,?,?,?,?,?,?)
        on conflict(id) do update set name=excluded.name, industry=excluded.industry, location=excluded.location, capacity=excluded.capacity, updatedAt=excluded.updatedAt`,
      args: [companyId, companyName, category, loc.raw, "Unrated", 0, 0, quantity, now, now],
    },
    {
      sql: `insert into WasteMaterial (id,name,toxicityLevel,baseElement,category,description,price,quantity,status,createdAt,updatedAt)
        values (?,?,?,?,?,?,?,?,?,?,?)
        on conflict(id) do update set name=excluded.name, baseElement=excluded.baseElement, category=excluded.category, description=excluded.description, price=excluded.price, quantity=excluded.quantity, updatedAt=excluded.updatedAt`,
      args: [materialId, `${title} (TradeIndia ${id})`, "medium", subcategory, category, description, price || null, quantity, "available", now, now],
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
        `${slugify(title)}-tradeindia-${id}`,
        SOURCE_TYPE,
        SOURCE_NAME,
        url,
        externalId,
        rawQuantityText,
        loc.raw,
        materialId,
        companyId,
        category,
        subcategory,
        loc.area,
        loc.city,
        loc.state,
        loc.country,
        image,
        price,
        "INR",
        unitFor(row),
        1,
        quantity,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        description,
        packaging,
        paymentTerms,
        "active",
        now,
        now,
      ],
    },
  ];
}

async function main() {
  const client = dbClient();
  const allRows = (await Promise.all(CATEGORY_PAGES.map(fetchCategory))).flat();
  const uniqueRows = [...new Map(allRows.filter(isUsableScrapRow).map((row) => [String(row.product_id), row])).values()];
  console.log(`Collected ${uniqueRows.length} TradeIndia public supplier products.`);

  await client.execute({
    sql: "delete from MarketplaceListing where sourceType = ? and sourceName = ?",
    args: [SOURCE_TYPE, SOURCE_NAME],
  });

  const statements = uniqueRows.flatMap(statementsFor);
  if (process.env.TRADEINDIA_WRITE_MODE === "execute") {
    for (let i = 0; i < statements.length; i += 1) {
      let attempt = 0;
      while (true) {
        try {
          await client.execute(statements[i]);
          break;
        } catch (error) {
          attempt += 1;
          if (attempt >= 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
      if ((i + 1) % 100 === 0 || i + 1 === statements.length) {
        console.log(`Wrote ${i + 1} / ${statements.length} statements`);
      }
    }
  } else {
  const chunkSize = Number(process.env.TRADEINDIA_BATCH_SIZE || 80);
  for (let i = 0; i < statements.length; i += chunkSize) {
    const chunk = statements.slice(i, i + chunkSize);
    let attempt = 0;
    while (true) {
      try {
        await client.batch(chunk, "write");
        break;
      } catch (error) {
        attempt += 1;
        if (attempt >= 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
    console.log(`Wrote ${Math.min(i + chunkSize, statements.length)} / ${statements.length} statements`);
  }
  }

  const counts = await client.execute(
    "select sourceType, sourceName, count(*) as count from MarketplaceListing group by sourceType, sourceName order by sourceName"
  );
  console.log(JSON.stringify(counts.rows, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
