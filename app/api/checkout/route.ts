import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { notify, orderNumber, requireAuth } from "@/lib/marketplace";

export async function POST(request: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const body = await request.json().catch(() => null);
  const listingId = body?.listingId ? String(body.listingId) : null;
  const shippingAddressId = body?.shippingAddressId ? String(body.shippingAddressId) : null;
  const billingAddressId = body?.billingAddressId ? String(body.billingAddressId) : shippingAddressId;
  const purchaseOrderNumber = body?.purchaseOrderNumber ? String(body.purchaseOrderNumber).trim() : null;

  const shippingAddress = shippingAddressId
    ? await prisma.address.findFirst({ where: { id: shippingAddressId, userId: guard.auth.userId } })
    : await prisma.address.findFirst({ where: { userId: guard.auth.userId, isDefaultShipping: true } });

  if (!shippingAddress) {
    return NextResponse.json({ error: "Add a shipping address before checkout." }, { status: 400 });
  }

  const billingAddress = billingAddressId
    ? await prisma.address.findFirst({ where: { id: billingAddressId, userId: guard.auth.userId } })
    : shippingAddress;

  const sourceItems = listingId
    ? [{ listingId, quantity: Math.max(1, Number(body?.quantity || 1)) }]
    : (await prisma.cartItem.findMany({ where: { userId: guard.auth.userId } })).map((item) => ({
        listingId: item.listingId,
        quantity: item.quantity,
      }));

  if (!sourceItems.length) {
    return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
  }

  const listings = await prisma.marketplaceListing.findMany({
    where: { id: { in: sourceItems.map((item) => item.listingId) }, status: "active" },
  });
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));

  const orderItems = sourceItems.map((item) => {
    const listing = listingById.get(item.listingId);
    if (!listing) throw new Error("One or more listings are unavailable.");
    const quantity = Math.min(Math.max(1, item.quantity), Math.max(1, listing.quantityAvailable || 1));
    const price = listing.pricePerUnit > 0 ? listing.pricePerUnit : 0;
    return {
      listing,
      quantity,
      pricePerUnit: price,
      lineTotal: price * quantity,
    };
  });

  const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxAmount = Math.round(subtotal * 0.18);
  const shippingAmount = subtotal > 0 ? Math.min(25000, Math.max(750, Math.round(subtotal * 0.015))) : 0;
  const totalAmount = subtotal + taxAmount + shippingAmount;

  const order = await prisma.purchaseOrder.create({
    data: {
      orderNumber: orderNumber(),
      buyerUserId: guard.auth.userId,
      shippingAddressId: shippingAddress.id,
      billingAddressId: billingAddress?.id ?? shippingAddress.id,
      subtotal,
      taxAmount,
      shippingAmount,
      totalAmount,
      purchaseOrderNumber,
      notes: body?.notes ? String(body.notes).trim() : null,
      items: {
        create: orderItems.map((item) => ({
          listingId: item.listing.id,
          sellerCompanyId: item.listing.sellerCompanyId,
          title: item.listing.title,
          quantity: item.quantity,
          unit: item.listing.unit,
          pricePerUnit: item.pricePerUnit,
          lineTotal: item.lineTotal,
        })),
      },
    },
    include: { items: true, shippingAddress: true },
  });

  if (!listingId) {
    await prisma.cartItem.deleteMany({ where: { userId: guard.auth.userId } });
  }

  await notify(guard.auth.userId, "ORDER_CREATED", "Order created", `Order ${order.orderNumber} is ready for seller confirmation.`, "/");

  return NextResponse.json({ success: true, order });
}
