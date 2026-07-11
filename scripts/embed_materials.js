/**
 * Symbi-OS — Waste Material Embedding Pipeline (Prisma)
 *
 * Reads WasteMaterial descriptions from the Prisma database, generates
 * embeddings with OpenAI, and stores them as JSON for later search upgrades.
 */

require("dotenv").config();

const OpenAI = require("openai").default;
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 50;

if (!OPENAI_API_KEY) {
  console.error("ERROR: Missing OPENAI_API_KEY.");
  process.exit(1);
}

async function main() {
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const materials = await prisma.wasteMaterial.findMany({
    where: { description: { not: "" } },
    orderBy: { id: "asc" },
    select: { id: true, name: true, description: true },
  });

  console.log(`Found ${materials.length} materials with descriptions.`);
  if (materials.length === 0) {
    console.log("No materials found. Run npm run ingest first.");
    return;
  }

  for (let i = 0; i < materials.length; i += BATCH_SIZE) {
    const batch = materials.slice(i, i + BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map((material) => material.description),
    });

    for (let j = 0; j < batch.length; j++) {
      await prisma.wasteMaterial.update({
        where: { id: batch[j].id },
        data: { embeddingJson: JSON.stringify(response.data[j].embedding) },
      });
    }

    console.log(`Embedded ${Math.min(i + BATCH_SIZE, materials.length)} / ${materials.length}`);
  }

  console.log("Embedding pipeline complete.");
}

main()
  .catch((error) => {
    console.error("FATAL:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
