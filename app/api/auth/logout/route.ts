// ---------------------------------------------------------------------------
//  POST /api/auth/logout
//
//  Clears the JWT auth cookie.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookie, getAuthFromCookie, hashRequestIp } from "@/lib/auth";
import { apiError, assertTrustedOrigin } from "@/server/http";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const auth = await getAuthFromCookie();
    await clearAuthCookie();
    if (auth) {
      await prisma.securityEvent.create({
        data: {
          userId: auth.userId,
          type: "LOGOUT_SUCCEEDED",
          ipHash: hashRequestIp(request),
          metadata: JSON.stringify({ sessionId: auth.sessionId.split(".")[0] }),
        },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
