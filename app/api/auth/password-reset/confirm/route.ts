import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashOpaqueToken, hashPassword } from "@/lib/auth";
import { apiError, assertTrustedOrigin, parseJson } from "@/server/http";
import { resetPasswordSchema } from "@/server/auth/schemas";
import { assertPasswordNotBreached } from "@/server/auth/breached-password";

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const body = await parseJson(request, resetPasswordSchema);
    await assertPasswordNotBreached(body.password);
    const now = new Date();
    const record = await prisma.authToken.findUnique({
      where: { tokenHash: hashOpaqueToken(body.token) },
    });
    if (
      !record ||
      record.type !== "PASSWORD_RESET" ||
      record.usedAt ||
      record.expiresAt <= now
    ) {
      return NextResponse.json(
        { error: "Reset token is invalid or expired.", code: "TOKEN_INVALID" },
        { status: 400 }
      );
    }
    const passwordHash = await hashPassword(body.password);
    await prisma.$transaction([
      prisma.authToken.update({ where: { id: record.id }, data: { usedAt: now } }),
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      prisma.securityEvent.create({
        data: { userId: record.userId, type: "PASSWORD_RESET_COMPLETED" },
      }),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
