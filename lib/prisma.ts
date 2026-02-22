import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "";

  // Turso / libsql remote database
  if (url.startsWith("libsql://") || url.startsWith("https://")) {
    const authToken = url.includes("authToken=")
      ? url.split("authToken=")[1]
      : process.env.TURSO_AUTH_TOKEN ?? "";

    const baseUrl = url.includes("?") ? url.split("?")[0] : url;

    const adapter = new PrismaLibSql({ url: baseUrl, authToken });
    return new PrismaClient({ adapter } as any);
  }

  // Local SQLite fallback
  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? buildPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
