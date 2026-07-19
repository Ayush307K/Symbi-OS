import "dotenv/config";
import { mkdir, open } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
const databaseUrl = process.env.DATABASE_URL || "";

if (databaseUrl.startsWith("file:")) {
  const configuredPath = databaseUrl.slice("file:".length).split("?")[0];
  const databasePath = isAbsolute(configuredPath)
    ? configuredPath
    : resolve(process.cwd(), "prisma", configuredPath);
  await mkdir(dirname(databasePath), { recursive: true });
  const file = await open(databasePath, "a", 0o600);
  await file.close();
}
