import { NextRequest, NextResponse } from "next/server";
import { serviceabilityForPincode } from "@/lib/marketplace";

export async function GET(request: NextRequest) {
  const pincode = request.nextUrl.searchParams.get("pincode") ?? "";
  return NextResponse.json(serviceabilityForPincode(pincode));
}
