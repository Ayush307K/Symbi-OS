import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidIndianPincode, requireAuth, serviceabilityForPincode } from "@/lib/marketplace";

export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const addresses = await prisma.address.findMany({
    where: { userId: guard.auth.userId },
    orderBy: [{ isDefaultShipping: "desc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json({ addresses });
}

export async function POST(request: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const body = await request.json().catch(() => null);
  const required = ["contactName", "phone", "street", "pincode"] as const;
  for (const field of required) {
    if (!String(body?.[field] || "").trim()) {
      return NextResponse.json({ error: `${field} is required.` }, { status: 400 });
    }
  }

  const pincode = String(body.pincode).trim();
  if (!isValidIndianPincode(pincode)) {
    return NextResponse.json({ error: "Enter a valid 6-digit Indian pincode." }, { status: 400 });
  }
  const serviceability = serviceabilityForPincode(pincode);
  if (!serviceability.serviceable) {
    return NextResponse.json({ error: serviceability.message }, { status: 400 });
  }

  const makeDefaultShipping = Boolean(body.isDefaultShipping);
  const makeDefaultBilling = Boolean(body.isDefaultBilling);
  if (makeDefaultShipping) {
    await prisma.address.updateMany({
      where: { userId: guard.auth.userId },
      data: { isDefaultShipping: false },
    });
  }
  if (makeDefaultBilling) {
    await prisma.address.updateMany({
      where: { userId: guard.auth.userId },
      data: { isDefaultBilling: false },
    });
  }

  const address = await prisma.address.create({
    data: {
      userId: guard.auth.userId,
      label: String(body.label || "Office").trim(),
      contactName: String(body.contactName).trim(),
      phone: String(body.phone).trim(),
      country: "India",
      state: String(body.state || serviceability.state).trim(),
      city: String(body.city || serviceability.city).trim(),
      district: body.district ? String(body.district).trim() : null,
      area: body.area ? String(body.area).trim() : null,
      locality: body.locality ? String(body.locality).trim() : null,
      landmark: body.landmark ? String(body.landmark).trim() : null,
      buildingName: body.buildingName ? String(body.buildingName).trim() : null,
      floor: body.floor ? String(body.floor).trim() : null,
      unitNumber: body.unitNumber ? String(body.unitNumber).trim() : null,
      street: String(body.street).trim(),
      pincode,
      latitude: body.latitude == null ? null : Number(body.latitude),
      longitude: body.longitude == null ? null : Number(body.longitude),
      isDefaultShipping: makeDefaultShipping,
      isDefaultBilling: makeDefaultBilling,
      addressType: String(body.addressType || "SHIPPING"),
      verificationStatus: body.latitude && body.longitude ? "GPS_VERIFIED" : "PINCODE_VERIFIED",
    },
  });

  return NextResponse.json({ success: true, address, serviceability });
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const body = await request.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "Address id is required." }, { status: 400 });

  const existing = await prisma.address.findFirst({ where: { id, userId: guard.auth.userId } });
  if (!existing) return NextResponse.json({ error: "Address not found." }, { status: 404 });

  if (body.isDefaultShipping) {
    await prisma.address.updateMany({
      where: { userId: guard.auth.userId },
      data: { isDefaultShipping: false },
    });
  }
  if (body.isDefaultBilling) {
    await prisma.address.updateMany({
      where: { userId: guard.auth.userId },
      data: { isDefaultBilling: false },
    });
  }

  const address = await prisma.address.update({
    where: { id },
    data: {
      label: body.label == null ? undefined : String(body.label).trim(),
      isDefaultShipping: body.isDefaultShipping == null ? undefined : Boolean(body.isDefaultShipping),
      isDefaultBilling: body.isDefaultBilling == null ? undefined : Boolean(body.isDefaultBilling),
    },
  });
  return NextResponse.json({ success: true, address });
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Address id is required." }, { status: 400 });
  await prisma.address.deleteMany({ where: { id, userId: guard.auth.userId } });
  return NextResponse.json({ success: true });
}
