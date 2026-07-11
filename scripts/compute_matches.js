/**
 * Symbi-OS — Latent Link Prediction (Prisma)
 *
 * Computes Jaccard similarity between companies based on their combined
 * PRODUCES + CAN_UPCYCLE material profiles and stores POTENTIAL_MATCH rows.
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const JACCARD_THRESHOLD = 0.12;

async function materialProfile(companyId) {
  const [produces, upcycles] = await Promise.all([
    prisma.materialProducer.findMany({
      where: { companyId },
      include: { material: { select: { id: true, name: true } } },
    }),
    prisma.materialUpcycler.findMany({
      where: { companyId },
      include: { material: { select: { id: true, name: true } } },
    }),
  ]);

  const map = new Map();
  for (const edge of [...produces, ...upcycles]) {
    map.set(edge.material.id, edge.material.name);
  }
  return map;
}

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, industry: true },
    orderBy: { id: "asc" },
  });

  console.log(`Computing matches for ${companies.length} companies...`);
  await prisma.potentialMatch.deleteMany();

  const profiles = new Map();
  for (const company of companies) {
    profiles.set(company.id, await materialProfile(company.id));
  }

  let created = 0;
  const rows = [];

  for (let i = 0; i < companies.length; i++) {
    for (let j = i + 1; j < companies.length; j++) {
      const c1 = companies[i];
      const c2 = companies[j];
      if (c1.industry === c2.industry) continue;

      const p1 = profiles.get(c1.id);
      const p2 = profiles.get(c2.id);
      const ids = new Set([...p1.keys(), ...p2.keys()]);
      if (ids.size === 0) continue;

      const shared = [...p1.keys()].filter((id) => p2.has(id));
      const score = shared.length / ids.size;
      if (score < JACCARD_THRESHOLD) continue;

      const sharedNames = shared.map((id) => p1.get(id)).slice(0, 5);
      rows.push({
        company1Id: c1.id,
        company2Id: c2.id,
        score: Math.round(score * 1000) / 1000,
        sharedMaterials: shared.length,
        sharedNamesJson: JSON.stringify(sharedNames),
      });
    }
  }

  for (const row of rows) {
    await prisma.potentialMatch.create({ data: row });
    created += 1;
  }

  console.log(`Created ${created} potential matches.`);
  const top = await prisma.potentialMatch.findMany({
    orderBy: { score: "desc" },
    take: 10,
    include: {
      company1: { select: { name: true, industry: true } },
      company2: { select: { name: true, industry: true } },
    },
  });

  for (const match of top) {
    console.log(
      `[${match.score.toFixed(3)}] ${match.company1.name} (${match.company1.industry}) ↔ ${match.company2.name} (${match.company2.industry}) — ${match.sharedMaterials} shared`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
