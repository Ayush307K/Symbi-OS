import { NextResponse } from "next/server";
import type { JWTPayload } from "@/lib/auth";

const FORBIDDEN_RESPONSE_KEY_NAMES = new Set([
  "passwordhash",
  "tokenhash",
  "sessionid",
  "sessionsecret",
  "tokenversion",
  "verificationtoken",
  "emailverificationtoken",
  "passwordresettoken",
  "resettoken",
  "authtoken",
  "jwt",
  "secret",
]);

function normalizedKey(key: string) {
  return key.replaceAll("_", "").replaceAll("-", "").toLowerCase();
}

function isForbiddenResponseKey(key: string) {
  const normalized = normalizedKey(key);
  return (
    FORBIDDEN_RESPONSE_KEY_NAMES.has(normalized) ||
    normalized.endsWith("emailverificationtoken") ||
    normalized.endsWith("passwordresettoken")
  );
}

/**
 * Recursively locate authentication and credential fields before a payload is
 * serialized. This is intentionally based on key names rather than values:
 * hashes and opaque tokens are still secrets even when they look harmless.
 */
export function sensitiveApiResponsePaths(
  value: unknown,
  path = "$",
  seen = new WeakSet<object>(),
): string[] {
  if (value === null || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      sensitiveApiResponsePaths(item, `${path}[${index}]`, seen),
    );
  }

  return Object.entries(value).flatMap(([key, nested]) => {
    const nextPath = `${path}.${key}`;
    const ownPath = isForbiddenResponseKey(key)
      ? [nextPath]
      : [];
    return [...ownPath, ...sensitiveApiResponsePaths(nested, nextPath, seen)];
  });
}

export function assertSafeApiResponse(value: unknown) {
  const sensitivePaths = sensitiveApiResponsePaths(value);
  if (sensitivePaths.length) {
    throw new Error(
      `Refusing to serialize sensitive API fields: ${sensitivePaths.join(", ")}`,
    );
  }
}

/** Use on authenticated aggregate responses where a future broad include is risky. */
export function safeJson<T>(body: T, init?: ResponseInit) {
  assertSafeApiResponse(body);
  return NextResponse.json(body, init);
}

export interface AuthenticatedUserDto {
  userId: string;
  email: string;
  role: JWTPayload["role"];
  companyName: string;
  companyId: string | null;
  isAdmin: boolean;
}

/** Public account identity. Session validation fields must never leave the server. */
export function authenticatedUserDto(
  auth: JWTPayload,
): AuthenticatedUserDto {
  return {
    userId: auth.userId,
    email: auth.email,
    role: auth.role,
    companyName: auth.companyName,
    companyId: auth.companyId,
    isAdmin: auth.isAdmin,
  };
}
