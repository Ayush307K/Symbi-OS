import { NextRequest, NextResponse } from "next/server";
import { notifyDemandRegistered } from "@/lib/mailer";
import { apiError, assertTrustedOrigin, requireUser } from "@/server/http";
import { createDemandMatches } from "@/server/matching";

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser(["BUYER", "BOTH"]);
    const body = await request.json().catch(() => null);
    const result = await createDemandMatches(auth, body);
    notifyDemandRegistered({
      buyerEmail: auth.email,
      materialQuery: result.demand.query,
    });
    return NextResponse.json(
      {
        status: result.matches.length ? "matches_found" : "demand_registered",
        message: result.matches.length
          ? `${result.matches.length} explainable match${result.matches.length === 1 ? "" : "es"} found and saved.`
          : "Demand saved. You will be notified after a matching listing is approved.",
        demandRegistered: true,
        demandId: result.demand.id,
        matchVersion: result.demand.matchVersion,
        results: result.matches,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
