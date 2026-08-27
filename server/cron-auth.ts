import { timingSafeEqual } from "node:crypto";

/** Vercel sends CRON_SECRET as `Authorization: Bearer …` on scheduled GETs. */
export function isCronRequestAuthorized(
  request: Request,
  expectedSecret = process.env.CRON_SECRET,
) {
  const expected = expectedSecret?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  if (!expected || !authorization.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

export function integerEnvironment(
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}
