import "dotenv/config";
import prisma from "../lib/prisma";
import { deleteObject } from "../server/listings/storage";

async function main() {
  const expired = await prisma.onboardingDocument.findMany({
    where: {
      retentionUntil: { lte: new Date() },
      onboarding: { status: { in: ["REJECTED", "CHANGES_REQUIRED"] } },
    },
    take: 500,
  });
  for (const document of expired) {
    await deleteObject(document.storageKey);
    await prisma.onboardingDocument.delete({ where: { id: document.id } });
  }
  console.log(`Deleted ${expired.length} expired onboarding document(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
