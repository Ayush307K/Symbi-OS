import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, setAuthCookie } from "@/lib/auth";

interface RegisterBody {
  email: string;
  password: string;
  companyName: string;
  industry?: string;
}

export async function POST(request: NextRequest) {
  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const companyName = body.companyName?.trim();
  const industry = body.industry?.trim() || "General";
  const role = "BOTH";

  if (!email || !password || !companyName) {
    return NextResponse.json(
      { error: "Missing required fields: email, password, companyName" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const company = await prisma.company.upsert({
      where: { name: companyName },
      update: { industry },
      create: {
        id: `company_${randomUUID().slice(0, 8)}`,
        name: companyName,
        industry,
        location: "Unknown",
        carbonRating: "B",
        latitude: 0,
        longitude: 0,
        capacity: 0,
      },
    });

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        companyName,
        companyId: company.id,
      },
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyName: user.companyName,
      companyId: company.id,
    });

    await setAuthCookie(token);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        companyName: user.companyName,
        companyId: company.id,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Register] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
