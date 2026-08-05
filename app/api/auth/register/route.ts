import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  createSession,
  hashPassword,
  hashRequestIp,
  newOpaqueToken,
  hashOpaqueToken,
} from "@/lib/auth";
import { apiError, assertTrustedOrigin, parseJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { registerSchema } from "@/server/auth/schemas";
import { assertPasswordNotBreached } from "@/server/auth/breached-password";

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const body = await parseJson(request, registerSchema);
    await enforceRateLimit(`register:${hashRequestIp(request) ?? "unknown"}`, {
      max: 5,
      windowMs: 60 * 60 * 1000,
    });
    await assertPasswordNotBreached(body.password);

    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) {
      return NextResponse.json(
        { error: "An account with this email already exists.", code: "EMAIL_IN_USE" },
        { status: 409 }
      );
    }
    const companyExists = await prisma.company.findUnique({
      where: { name: body.companyName },
    });
    if (companyExists) {
      return NextResponse.json(
        {
          error: "This company name is already registered. Contact support to join it.",
          code: "COMPANY_IN_USE",
        },
        { status: 409 }
      );
    }

    const verificationToken = newOpaqueToken();
    const user = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          id: `company_${randomUUID().slice(0, 12)}`,
          name: body.companyName,
          industry: body.industry,
          location: "Pending verification",
          carbonRating: "Unrated",
          latitude: 0,
          longitude: 0,
          capacity: 0,
        },
      });
      const created = await tx.user.create({
        data: {
          email: body.email,
          passwordHash: await hashPassword(body.password),
          role: body.role,
          companyName: body.companyName,
          companyId: company.id,
        },
      });
      await tx.authToken.create({
        data: {
          userId: created.id,
          type: "EMAIL_VERIFICATION",
          tokenHash: hashOpaqueToken(verificationToken),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await tx.securityEvent.create({
        data: {
          userId: created.id,
          type: "ACCOUNT_REGISTERED",
          ipHash: hashRequestIp(request),
        },
      });
      return created;
    });
    await createSession(user, request);

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          isAdmin: user.isAdmin,
          companyName: user.companyName,
          companyId: user.companyId,
          emailVerified: false,
        },
        ...(process.env.DEMO_VERIFICATION_ENABLED === "true"
          ? { demoEmailVerificationToken: verificationToken }
          : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
