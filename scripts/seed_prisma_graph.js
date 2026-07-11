/**
 * Symbi-OS relational seed pipeline.
 *
 * Loads supply_chain_graph.json into Prisma-managed tables so the marketplace
 * can run from a local SQLite database.
 */

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const DATA_PATH = path.join(__dirname, "..", "supply_chain_graph.json");
const LISTING_COUNT = 10000;

const CATEGORY_IMAGES = {
  "Metals & Alloys": [
    "https://images.unsplash.com/photo-1518709268805-4e9042af2176?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=900&q=80",
  ],
  Chemicals: [
    "https://images.unsplash.com/photo-1532187643603-ba119ca4109e?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1581093804475-577d72e38aa0?auto=format&fit=crop&w=900&q=80",
  ],
  "Organic & Bio": [
    "https://images.unsplash.com/photo-1605000797499-95a51c5269ae?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80",
  ],
  "E-Waste": [
    "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
  ],
  "Polymers & Plastics": [
    "https://images.unsplash.com/photo-1604187351574-c75ca79f5807?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1621451537084-482c73073a0f?auto=format&fit=crop&w=900&q=80",
  ],
  "Minerals & Construction": [
    "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1517089596392-fb9a9033e05b?auto=format&fit=crop&w=900&q=80",
  ],
  "Energy Materials": [
    "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=900&q=80",
  ],
  "Textiles & Fibers": [
    "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1528459105426-b9548367069b?auto=format&fit=crop&w=900&q=80",
  ],
};

const INDIA_AREAS = [
  ["Peenya Industrial Area", "Bengaluru", "Karnataka", "India"],
  ["Electronic City", "Bengaluru", "Karnataka", "India"],
  ["Tumakuru Industrial Area", "Tumakuru", "Karnataka", "India"],
  ["MIDC Taloja", "Navi Mumbai", "Maharashtra", "India"],
  ["GIDC Vatva", "Ahmedabad", "Gujarat", "India"],
  ["Sriperumbudur", "Chennai", "Tamil Nadu", "India"],
  ["Bhosari MIDC", "Pune", "Maharashtra", "India"],
  ["Jeedimetla", "Hyderabad", "Telangana", "India"],
];

function pick(arr, index) {
  return arr[index % arr.length];
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function listingTitle(material, variant) {
  const prefixes = [
    "Bulk supply",
    "Factory direct",
    "Verified lot",
    "Wholesale grade",
    "Ready stock",
    "Monthly contract",
    "Export-ready",
    "Industrial grade",
  ];
  const suffixes = [
    "for recycling",
    "with test report",
    "for upcycling plants",
    "available ex-works",
    "for secondary raw material buyers",
    "with bulk dispatch",
  ];
  return `${pick(prefixes, variant)} ${material.name} ${pick(suffixes, variant + 3)}`;
}

function getLabel(edge, key) {
  return edge.properties?.[key] ?? "";
}

async function main() {
  const graph = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  console.log(
    `Loading ${graph.nodes.length} nodes and ${graph.edges.length} edges from supply_chain_graph.json`
  );

  await prisma.$transaction([
    prisma.demand.deleteMany(),
    prisma.potentialMatch.deleteMany(),
    prisma.materialComplement.deleteMany(),
    prisma.materialRegulation.deleteMany(),
    prisma.materialUpcycler.deleteMany(),
    prisma.materialProducer.deleteMany(),
    prisma.marketplaceListing.deleteMany(),
    prisma.regulation.deleteMany(),
    prisma.wasteMaterial.deleteMany(),
    prisma.company.deleteMany(),
  ]);

  for (const node of graph.nodes) {
    const props = node.properties ?? {};
    if (node.type === "Company") {
      await prisma.company.create({
        data: {
          id: node.id,
          name: props.name,
          industry: props.industry ?? "General",
          location: props.location ?? "Unknown",
          carbonRating: props.carbon_rating ?? "B",
          latitude: Number(props.latitude ?? 0),
          longitude: Number(props.longitude ?? 0),
          capacity: Number(props.capacity ?? 0),
        },
      });
    } else if (node.type === "WasteMaterial") {
      await prisma.wasteMaterial.create({
        data: {
          id: node.id,
          name: props.name,
          toxicityLevel: props.toxicity_level ?? "medium",
          baseElement: props.base_element ?? "Unknown",
          category: props.category ?? "Uncategorized",
          description: props.description ?? `${props.name} industrial by-product`,
          price: props.price == null ? null : Number(props.price),
          quantity: props.quantity == null ? null : Number(props.quantity),
          status: props.status ?? "available",
        },
      });
    } else if (node.type === "Regulation") {
      await prisma.regulation.create({
        data: {
          id: node.id,
          code: props.code,
          description: props.description ?? "",
        },
      });
    }
  }

  let producerEdges = 0;
  let upcyclerEdges = 0;
  let complianceEdges = 0;
  let complementEdges = 0;

  for (const edge of graph.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) continue;

    if (edge.type === "PRODUCES") {
      await prisma.materialProducer.upsert({
        where: {
          companyId_materialId: {
            companyId: edge.source,
            materialId: edge.target,
          },
        },
        update: {},
        create: {
          companyId: edge.source,
          materialId: edge.target,
        },
      });
      producerEdges += 1;
    } else if (edge.type === "CAN_UPCYCLE") {
      await prisma.materialUpcycler.upsert({
        where: {
          companyId_materialId: {
            companyId: edge.source,
            materialId: edge.target,
          },
        },
        update: {},
        create: {
          companyId: edge.source,
          materialId: edge.target,
        },
      });
      upcyclerEdges += 1;
    } else if (edge.type === "REQUIRES_COMPLIANCE") {
      await prisma.materialRegulation.upsert({
        where: {
          materialId_regulationId: {
            materialId: edge.source,
            regulationId: edge.target,
          },
        },
        update: {},
        create: {
          materialId: edge.source,
          regulationId: edge.target,
        },
      });
      complianceEdges += 1;
    } else if (edge.type === "COMPLEMENTS") {
      await prisma.materialComplement.upsert({
        where: {
          sourceId_targetId: {
            sourceId: edge.source,
            targetId: edge.target,
          },
        },
        update: {},
        create: {
          sourceId: edge.source,
          targetId: edge.target,
        },
      });
      complementEdges += 1;
    }
  }

  const producers = await prisma.materialProducer.findMany({
    include: {
      company: true,
      material: true,
    },
  });

  const listings = [];
  for (let i = 0; i < LISTING_COUNT; i++) {
    const producer = producers[i % producers.length];
    const material = producer.material;
    const seller = producer.company;
    const [area, city, state, country] =
      seller.location?.includes("India") && i % 3 !== 0
        ? pick(INDIA_AREAS, i)
        : [
            `${seller.industry} cluster`,
            seller.location.split(",")[0]?.trim() || seller.location,
            seller.location.split(",")[1]?.trim() || "Industrial Region",
            seller.location.split(",")[1]?.trim() || "Global",
          ];
    const imagePool =
      CATEGORY_IMAGES[material.category] ?? CATEGORY_IMAGES["Minerals & Construction"];
    const price = Number(material.price ?? 50);
    const priceFactor = 0.72 + ((i % 17) * 0.035);
    const quantity = Number(material.quantity ?? 100);
    const title = listingTitle(material, i);

    listings.push({
      id: `listing_${String(i + 1).padStart(5, "0")}`,
      title,
      slug: `${slugify(title)}-${i + 1}`,
      materialId: material.id,
      sellerCompanyId: seller.id,
      category: material.category,
      subcategory: material.baseElement,
      area,
      city,
      state,
      country,
      imageUrl: pick(imagePool, i),
      pricePerUnit: Math.max(5, Math.round(price * 83 * priceFactor)),
      currency: "INR",
      unit: "ton",
      minOrderQuantity: 1 + (i % 40),
      quantityAvailable: Math.max(5, quantity + ((i * 13) % 900)),
      leadTimeDays: 2 + (i % 28),
      rating: Math.round((3.7 + ((i % 14) * 0.09)) * 10) / 10,
      responseRate: 72 + (i % 27),
      verified: i % 11 !== 0,
      tradeAssurance: i % 7 !== 0,
      yearsActive: 1 + (i % 12),
      ordersCompleted: 8 + ((i * 19) % 1200),
      description: `${material.description} Offered by ${seller.name} from ${area}, ${city}. Suitable for bulk sourcing, recurring contracts, split-lot dispatch, and verified industrial reuse workflows.`,
      packaging: pick(
        ["Loose bulk", "Jumbo bags", "Drums", "Palletized", "Container load", "Baled"],
        i
      ),
      paymentTerms: pick(
        ["Advance + dispatch", "Escrow supported", "Net 15 for verified buyers", "LC accepted", "Milestone billing"],
        i + 2
      ),
      status: "active",
    });
  }

  for (let i = 0; i < listings.length; i += 500) {
    await prisma.marketplaceListing.createMany({
      data: listings.slice(i, i + 500),
    });
    console.log(`  Listings: ${Math.min(i + 500, listings.length)} / ${listings.length}`);
  }

  console.log(
    JSON.stringify(
      {
        companies: await prisma.company.count(),
        materials: await prisma.wasteMaterial.count(),
        regulations: await prisma.regulation.count(),
        producerEdges,
        upcyclerEdges,
        complianceEdges,
        complementEdges,
        marketplaceListings: await prisma.marketplaceListing.count(),
        sampleProducer: getLabel(
          graph.edges.find((edge) => edge.type === "PRODUCES") ?? {},
          "source_label"
        ),
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
    await prisma.$disconnect();
  });
