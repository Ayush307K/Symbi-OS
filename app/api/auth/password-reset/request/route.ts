import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  hashOpaqueToken,
  hashRequestIp,
  newOpaqueToken,
} from "@/lib/auth";
import { apiError, assertTrustedOrigin, parseJson } from "@/server/http";
import { requestTokenSchema } from "@/server/auth/schemas";
import { enforceRateLimit } from "@/server/rate-limit";

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const { email } = await parseJson(request, requestTokenSchema);
    await enforceRateLimit(`password-reset:${hashRequestIp(request) ?? "unknown"}`, {
      max: 5,
      windowMs: 60 * 60 * 1000,
    });
    const user = await prisma.user.findUnique({ where: { email } });
    let demoToken: string | undefined;
    if (user) {
      const token = newOpaqueToken();
      await prisma.authToken.create({
        data: {
          userId: user.id,
          type: "PASSWORD_RESET",
          tokenHash: hashOpaqueToken(token),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      if (process.env.DEMO_VERIFICATION_ENABLED === "true") demoToken = token;
    }
    return NextResponse.json({
      message: "If that account exists, password-reset instructions have been issued.",
      ...(demoToken ? { demoPasswordResetToken: demoToken } : {}),
    });
  } catch (error) {
    return apiError(error);
  }
}
