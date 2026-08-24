import { NextResponse } from "next/server";
import { productionReadiness } from "@/server/deployment/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = await productionReadiness();
  return NextResponse.json(
    result.ready
      ? { status: "ready" }
      : {
          status: "unavailable",
          code: "DATABASE_SCHEMA_NOT_READY",
          requiredMigration: result.migration,
        },
    {
      status: result.ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
