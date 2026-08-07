import { jwtVerify } from "jose/jwt/verify";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/register", "/login", "/forgot-password", "/reset-password"];

// Ungated, but not auth pages: reachable signed in or out, and never redirected
// away from either way. The design-system reference is static and reads no
// product data. Keep this list to routes that touch neither.
const UNGATED_PATHS = ["/", "/style-guide"];

// Product detail shows exactly what the public catalogue already shows, so a
// shared listing link must open rather than bounce to sign-in.
const UNGATED_PREFIXES = ["/products/"];

function secure(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)"
  );
  return response;
}

function trustedMutationOrigin(request: NextRequest) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto") ||
    request.nextUrl.protocol.replace(":", "");
  const allowed = new Set([
    request.nextUrl.origin,
    ...(host ? [`${protocol}://${host}`] : []),
    ...(process.env.APP_URL ? [new URL(process.env.APP_URL).origin] : []),
  ]);
  return allowed.has(origin);
}

async function hasValidSession(request: NextRequest) {
  const token = request.cookies.get("symbi_session")?.value;
  const secret = process.env.JWT_SECRET;
  if (!token || !secret || secret.length < 32) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: "symbi-os",
      audience: "symbi-os-web",
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/") && !trustedMutationOrigin(request)) {
    return secure(
      NextResponse.json(
        { error: "Untrusted request origin.", code: "CSRF_REJECTED" },
        { status: 403 }
      )
    );
  }
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
    return secure(NextResponse.next());
  }
  if (
    UNGATED_PATHS.includes(pathname) ||
    UNGATED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return secure(NextResponse.next());
  }
  const authenticated = await hasValidSession(request);
  const isAuthPage = PUBLIC_PATHS.includes(pathname);
  if (isAuthPage) {
    return secure(authenticated
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next());
  }
  if (!authenticated) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    if (request.cookies.has("symbi_session")) {
      response.cookies.delete("symbi_session");
    }
    return secure(response);
  }
  return secure(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
