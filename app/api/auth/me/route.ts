// ---------------------------------------------------------------------------
//  GET /api/auth/me
//
//  Returns the currently authenticated user from the JWT cookie.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getAuthFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const payload = await getAuthFromCookie();
  if (!payload) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        companyName: true,
        neo4jCompanyId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({ user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Auth/Me] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
