const { PrismaClient } = require("@prisma/client");
const { PrismaLibSql } = require("@prisma/adapter-libsql");
require("dotenv").config();

function getLibsqlConfig(url) {
  const parsed = new URL(url);
  const authToken = parsed.searchParams.get("authToken") || process.env.TURSO_AUTH_TOKEN || "";
  parsed.searchParams.delete("authToken");

  return {
    url: parsed.toString(),
    authToken,
  };
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL || "";

  if (url.startsWith("libsql://") || url.startsWith("https://")) {
    const adapter = new PrismaLibSql(getLibsqlConfig(url));
    return new PrismaClient({ adapter });
  }

  return new PrismaClient();
}

module.exports = {
  createPrismaClient,
};
