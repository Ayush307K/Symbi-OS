// ---------------------------------------------------------------------------
//  POST /api/auth/register
//
//  Creates a new user in SQLite, MERGEs the Company node in Neo4j,
//  and sets a JWT cookie.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, setAuthCookie } from "@/lib/auth";
import { getNeo4jGraph } from "@/lib/neo4j-graph";
import { randomUUID } from "crypto";

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

  const { email, password, companyName } = body;
  const industry = body.industry ?? "General";
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

  // Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  try {
    // ---- Step 1: MERGE Company in Neo4j ----------------------------------------
    const graph = await getNeo4jGraph();
    const genId = `company_${randomUUID().slice(0, 8)}`;

    const mergeResult = await graph.query<{ neo4jCompanyId: string }>(
      `MERGE (c:Company {name: $companyName})
       ON CREATE SET c.industry = $industry, c.id = $genId,
                     c.location = 'Unknown', c.carbon_rating = 'B',
                     c.latitude = 0, c.longitude = 0, c.capacity = 0
       RETURN c.id AS neo4jCompanyId`,
      { companyName, industry, genId }
    );

    const neo4jCompanyId = mergeResult[0]?.neo4jCompanyId ?? genId;

    // ---- Step 2: Create user in SQLite -----------------------------------------
    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        companyName,
        neo4jCompanyId,
      },
    });

    // ---- Step 3: Issue JWT + cookie --------------------------------------------
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyName: user.companyName,
      neo4jCompanyId,
    });

    await setAuthCookie(token);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        companyName: user.companyName,
        neo4jCompanyId,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Register] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
