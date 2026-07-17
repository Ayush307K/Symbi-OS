import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/marketplace";

const GST_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const onboarding = await prisma.sellerOnboarding.upsert({
    where: { userId: guard.auth.userId },
    update: {},
    create: { userId: guard.auth.userId },
  });
  return NextResponse.json({ onboarding });
}

export async function POST(request: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const body = await request.json().catch(() => null);
  const step = String(body?.step || "BUSINESS").toUpperCase();
  const payload = body?.payload ?? {};

  if (payload.gst && !GST_RE.test(String(payload.gst).toUpperCase())) {
    return NextResponse.json({ error: "Invalid GST format." }, { status: 400 });
  }
  if (payload.pan && !PAN_RE.test(String(payload.pan).toUpperCase())) {
    return NextResponse.json({ error: "Invalid PAN format." }, { status: 400 });
  }
  if (payload.ifsc && !IFSC_RE.test(String(payload.ifsc).toUpperCase())) {
    return NextResponse.json({ error: "Invalid IFSC format." }, { status: 400 });
  }

  const data: Record<string, string | Date> = { currentStep: step };
  if (step === "BUSINESS") data.businessJson = JSON.stringify(payload);
  if (step === "TAX") data.taxJson = JSON.stringify(payload);
  if (step === "BANK") data.bankJson = JSON.stringify(payload);
  if (step === "KYC") data.kycJson = JSON.stringify(payload);
  if (step === "WAREHOUSE") data.warehouseJson = JSON.stringify(payload);
  if (step === "POLICY") data.policyJson = JSON.stringify(payload);
  if (body?.submit) {
    data.status = "SUBMITTED";
    data.submittedAt = new Date();
  }

  const onboarding = await prisma.sellerOnboarding.upsert({
    where: { userId: guard.auth.userId },
    update: data,
    create: { userId: guard.auth.userId, ...data },
  });

  return NextResponse.json({ success: true, onboarding });
}
