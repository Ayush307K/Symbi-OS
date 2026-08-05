import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getAuthFromCookie, type JWTPayload, type UserRole } from "@/lib/auth";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function parseJson<T>(request: NextRequest, schema: ZodType<T>) {
  const body = await request.json().catch(() => {
    throw new ApiError(400, "Request body must be valid JSON.", "INVALID_JSON");
  });
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      const fields = Object.fromEntries(
        error.issues.map((issue) => [
          issue.path.join(".") || "_form",
          issue.message,
        ]),
      );
      throw new ApiError(
        422,
        error.issues.map((issue) => issue.message).join("; "),
        "VALIDATION_ERROR",
        { fields },
      );
    }
    throw error;
  }
}

export function assertTrustedOrigin(request: NextRequest) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin) return;
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const allowed = new Set([
    url.origin,
    ...(host ? [`${protocol}://${host}`] : []),
    ...(process.env.APP_URL ? [new URL(process.env.APP_URL).origin] : []),
  ]);
  if (!allowed.has(origin)) {
    throw new ApiError(403, "Untrusted request origin.", "CSRF_REJECTED");
  }
}

export async function requireUser(roles?: UserRole[]): Promise<JWTPayload> {
  const auth = await getAuthFromCookie();
  if (!auth) throw new ApiError(401, "Authentication required.", "UNAUTHORIZED");
  if (!roles) return auth;

  // "ADMIN" in a role list means platform administration, which is carried by
  // isAdmin rather than by `role` — an admin is still a BUYER or SELLER in the
  // market, and conflating the two meant granting admin revoked trading.
  const satisfied = roles.some((role) => {
    if (role === "ADMIN") return auth.isAdmin;
    if (auth.role === "BOTH") return role === "BUYER" || role === "SELLER";
    return auth.role === role;
  });

  if (!satisfied) {
    throw new ApiError(403, "You are not allowed to perform this action.", "FORBIDDEN");
  }
  return auth;
}

/** Platform administration only. Market role is irrelevant here. */
export async function requireAdmin(): Promise<JWTPayload> {
  const auth = await getAuthFromCookie();
  if (!auth) throw new ApiError(401, "Authentication required.", "UNAUTHORIZED");
  if (!auth.isAdmin) {
    throw new ApiError(403, "Platform administration is required.", "FORBIDDEN");
  }
  return auth;
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.status }
    );
  }
  console.error("[API]", error);
  return NextResponse.json(
    { error: "An unexpected server error occurred.", code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}
