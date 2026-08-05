import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Grant or revoke platform administration.
 *
 *   npx tsx scripts/grant-admin.ts <email> [more emails…]
 *   npx tsx scripts/grant-admin.ts --revoke <email>
 *   npx tsx scripts/grant-admin.ts --list
 *
 * Administration is deliberately not self-service: there is no registration
 * path to it and no in-product promotion, because the first admin has to come
 * from somewhere trusted and every later one should be a deliberate act with a
 * record. Each change writes a SecurityEvent naming the operator.
 *
 * Granting does not change the user's market role. An admin who is a SELLER
 * stays a SELLER.
 */
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

async function list() {
  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: { email: true, role: true, companyName: true },
    orderBy: { email: "asc" },
  });
  if (admins.length === 0) {
    console.log("No platform administrators.");
    return;
  }
  console.log(`${admins.length} platform administrator(s):`);
  for (const admin of admins) {
    console.log(`  ${admin.email}  (market role: ${admin.role})  ${admin.companyName}`);
  }
}

async function setAdmin(emails: string[], isAdmin: boolean) {
  for (const email of emails) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, isAdmin: true },
    });

    if (!user) {
      console.error(`  ✗ ${email} — no such user`);
      process.exitCode = 1;
      continue;
    }
    if (user.isAdmin === isAdmin) {
      console.log(`  · ${email} — already ${isAdmin ? "an admin" : "not an admin"}`);
      continue;
    }

    // The flag and its audit record are written together: an administration
    // change that leaves no trace is the one you cannot investigate later.
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { isAdmin } }),
      prisma.securityEvent.create({
        data: {
          userId: user.id,
          type: isAdmin ? "ADMIN_GRANTED" : "ADMIN_REVOKED",
          ipHash: null,
        },
      }),
    ]);
    console.log(`  ✓ ${email} — ${isAdmin ? "granted" : "revoked"} (market role unchanged: ${user.role})`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--list")) return list();

  const revoke = args.includes("--revoke");
  const emails = args.filter((arg) => !arg.startsWith("--"));

  if (emails.length === 0) {
    console.error("Usage: npx tsx scripts/grant-admin.ts [--revoke] <email>…");
    console.error("       npx tsx scripts/grant-admin.ts --list");
    process.exitCode = 1;
    return;
  }

  await setAdmin(emails, !revoke);
  console.log();
  await list();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
