import prisma from "@/lib/prisma";
import { ApiError } from "@/server/http";

export async function enforceRateLimit(
  key: string,
  options: { max: number; windowMs: number; blockMs?: number }
) {
  const now = new Date();
  const existing = await prisma.rateLimitBucket.findUnique({ where: { key } });
  if (existing?.blockedUntil && existing.blockedUntil > now) {
    throw new ApiError(429, "Too many attempts. Try again later.", "RATE_LIMITED");
  }

  const windowExpired =
    !existing || now.getTime() - existing.windowStart.getTime() >= options.windowMs;
  const count = windowExpired ? 1 : (existing?.count ?? 0) + 1;
  const blockedUntil =
    count > options.max
      ? new Date(now.getTime() + (options.blockMs ?? options.windowMs))
      : null;

  await prisma.rateLimitBucket.upsert({
    where: { key },
    create: { key, count, windowStart: now, blockedUntil },
    update: {
      count,
      windowStart: windowExpired ? now : existing!.windowStart,
      blockedUntil,
    },
  });
  if (blockedUntil) {
    throw new ApiError(429, "Too many attempts. Try again later.", "RATE_LIMITED");
  }
}
