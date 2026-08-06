import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth";

/**
 * Create the development accounts on the local database.
 *
 *   npx tsx scripts/seed-local-admins.ts
 *
 * Local runs on its own database, so accounts made in production do not exist
 * here — including the operators. Without them the admin workspace cannot be
 * opened locally at all, since administration has no self-service path.
 *
 * These accounts carry a known password by design. They only ever exist on the
 * docker database, which holds nothing real, and the script refuses to run
 * anywhere else.
 */
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "postgres"];

const PASSWORD = "Marketplace-Local-2471";

const ACCOUNTS = [
  { email: "arorakanan63@gmail.com", companyName: "Kanan Arora", industry: "Recycling" },
  { email: "ayushkesharwani415@gmail.com", companyName: "Ayush Kesharwani", industry: "Recycling" },
];

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

function assertLocal() {
  let host = "";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    /* handled below */
  }
  if (!LOCAL_HOSTS.includes(host)) {
    console.error(
      `\n  Refusing to run: DATABASE_URL points at ${host || "an unreadable URL"}.\n` +
        `  This seeds accounts with a known password and belongs only on the\n` +
        `  docker-compose database.\n`,
    );
    process.exit(1);
  }
}

async function main() {
  assertLocal();

  for (const account of ACCOUNTS) {
    const existing = await prisma.user.findUnique({
      where: { email: account.email },
      select: { id: true },
    });

    if (existing) {
      // Idempotent: re-running resets the password and re-grants administration
      // rather than failing, so it is safe after any db:reset.
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: await hashPassword(PASSWORD),
          isAdmin: true,
          emailVerifiedAt: new Date(),
          accountStatus: "ACTIVE",
        },
      });
      console.log(`  · ${account.email} — updated (password reset, admin granted)`);
      continue;
    }

    const company = await prisma.company.upsert({
      where: { name: account.companyName },
      update: {},
      create: {
        id: `company_local_${account.email.split("@")[0]}`,
        name: account.companyName,
        industry: account.industry,
        location: "Bengaluru, Karnataka",
        carbonRating: "B",
        latitude: 12.9716,
        longitude: 77.5946,
        capacity: 1000,
      },
    });

    await prisma.user.create({
      data: {
        email: account.email,
        passwordHash: await hashPassword(PASSWORD),
        // BOTH so one account can browse, sell, and operate the platform —
        // administration is a separate flag and does not replace market role.
        role: "BOTH",
        isAdmin: true,
        companyName: account.companyName,
        companyId: company.id,
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`  ✓ ${account.email} — created (BOTH + admin)`);
  }

  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: { email: true, role: true },
    orderBy: { email: "asc" },
  });

  console.log(`\n  local administrators (${admins.length}):`);
  for (const admin of admins) console.log(`    ${admin.email}  role: ${admin.role}`);
  console.log(`\n  password for all of these: ${PASSWORD}\n`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
