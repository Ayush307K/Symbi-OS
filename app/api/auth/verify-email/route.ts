import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashOpaqueToken } from "@/lib/auth";
import { apiError, assertTrustedOrigin, parseJson } from "@/server/http";
import { consumeTokenSchema } from "@/server/auth/schemas";

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const { token } = await parseJson(request, consumeTokenSchema);
    const now = new Date();
    const record = await prisma.authToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    if (
      !record ||
      record.type !== "EMAIL_VERIFICATION" ||
      record.usedAt ||
      record.expiresAt <= now
    ) {
      return NextResponse.json(
        { error: "Verification token is invalid or expired.", code: "TOKEN_INVALID" },
        { status: 400 }
      );
    }
    await prisma.$transaction([
      prisma.authToken.update({ where: { id: record.id }, data: { usedAt: now } }),
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: now },
      }),
      prisma.securityEvent.create({
        data: { userId: record.userId, type: "EMAIL_VERIFIED" },
      }),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
