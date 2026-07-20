import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  createSession,
  hashRequestIp,
  verifyPassword,
} from "@/lib/auth";
import { apiError, assertTrustedOrigin, parseJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { loginSchema } from "@/server/auth/schemas";

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const body = await parseJson(request, loginSchema);
    const rateKey = `login:${hashRequestIp(request) ?? "unknown"}:${body.email}`;
    await enforceRateLimit(rateKey, {
      max: 8,
      windowMs: 15 * 60 * 1000,
      blockMs: 30 * 60 * 1000,
    });

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const valid =
      user?.accountStatus === "ACTIVE" &&
      (await verifyPassword(
        body.password,
        user?.passwordHash ??
          "$2b$12$wjbU2pQ/FZRm9eCqvHh2wOnaECYQdHjgP/0jGd6ERqhxS2Wz5YQj."
      ));
    if (!user || !valid) {
      await prisma.securityEvent.create({
        data: {
          userId: user?.id,
          type: "LOGIN_FAILED",
          ipHash: hashRequestIp(request),
        },
      });
      return NextResponse.json(
        { error: "Invalid email or password.", code: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await createSession(user, request);
    await prisma.securityEvent.create({
      data: { userId: user.id, type: "LOGIN_SUCCEEDED", ipHash: hashRequestIp(request) },
    });
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        companyName: user.companyName,
        companyId: user.companyId,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
