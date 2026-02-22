// ---------------------------------------------------------------------------
//  Symbi-OS — Auth Middleware
//
//  Route protection matrix:
//    /register, /login  → public (redirect to / if already authed)
//    /api/*, /_next/*   → pass-through
//    Everything else    → requires auth cookie (redirect to /register if missing)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/register", "/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never interfere with API routes or static assets
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("symbi_token")?.value;
  const isAuthPage = PUBLIC_PATHS.includes(pathname);

  // Auth pages: redirect away if already authenticated
  if (isAuthPage) {
    if (token) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Protected pages: redirect to /register if not authenticated
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/register";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
