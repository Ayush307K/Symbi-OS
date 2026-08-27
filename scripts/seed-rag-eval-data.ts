import "dotenv/config";
import prisma from "@/lib/prisma";
import { EVAL_BUYERS, EVAL_BUYER_ID } from "@/eval/fixtures/buyers";
import { EVAL_LISTINGS, EVAL_LISTING_ID } from "@/eval/fixtures/listings";
import { buildBuyerDemandProfile } from "@/server/feed/buyer-profile";
import { refreshMaterialEdges } from "@/server/feed/material-edges";
import { seedEvaluationCatalog } from "@/server/listings/eval-catalog";

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

function assertSafeEvaluationDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required.");
  const host = new URL(raw).hostname;
  if (!LOCAL_DATABASE_HOSTS.has(host)) {
    throw new Error(
      `Refusing to seed evaluation data into non-local database host ${host}. ` +
        "Use a dedicated local/test database.",
    );
  }
  if (process.env.RAG_EVAL_ENABLED !== "true") {
    throw new Error("RAG_EVAL_ENABLED=true is required to seed evaluation data.");
  }
}

const referenceDate = new Date(
  process.env.EVAL_REFERENCE_DATE || "2026-08-24T00:00:00.000Z",
);
if (Number.isNaN(referenceDate.getTime())) {
  throw new Error("EVAL_REFERENCE_DATE must be a valid ISO date.");
}

function listingCompanyId(key: string) {
  return `eval_seller_company_${key}`;
}

async function seedListings() {
  return (
    await seedEvaluationCatalog({
      referenceDate,
      refreshEmbeddings: true,
    })
  ).embedded;
}

async function seedBuyers() {
  const listingByKey = new Map(EVAL_LISTINGS.map((listing) => [listing.key, listing]));
  let orderCount = 0;
  for (const buyer of EVAL_BUYERS) {
    const userId = EVAL_BUYER_ID(buyer.key);
    const companyId = `eval_buyer_company_${buyer.key}`;
    await prisma.company.upsert({
      where: { id: companyId },
      create: {
        id: companyId,
        name: buyer.companyName,
        industry: buyer.industry,
        location: `${buyer.city}, ${buyer.state}, India`,
        carbonRating: "Evaluation only",
        latitude: buyer.latitude,
        longitude: buyer.longitude,
        capacity: 1000,
      },
      update: {
        industry: buyer.industry,
        location: `${buyer.city}, ${buyer.state}, India`,
        latitude: buyer.latitude,
        longitude: buyer.longitude,
      },
    });
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: `${buyer.key}@eval.symbios.invalid`,
        passwordHash: "EVAL_ONLY_ACCOUNT_HAS_NO_LOGIN_CREDENTIAL",
        role: "BUYER",
        isEvalOnly: true,
        accountStatus: "DISABLED",
        companyName: buyer.companyName,
        companyId,
      },
      update: {
        isEvalOnly: true,
        accountStatus: "DISABLED",
        companyName: buyer.companyName,
        companyId,
      },
    });
    await prisma.address.upsert({
      where: { id: `eval_address_${buyer.key}` },
      create: {
        id: `eval_address_${buyer.key}`,
        userId,
        label: "Evaluation location",
        contactName: "Evaluation Buyer",
        phone: "+910000000000",
        state: buyer.state,
        city: buyer.city,
        street: "Evaluation data — not a physical address",
        pincode: "000000",
        latitude: buyer.latitude,
        longitude: buyer.longitude,
        isDefaultShipping: true,
        addressType: "SHIPPING",
      },
      update: {
        state: buyer.state,
        city: buyer.city,
        latitude: buyer.latitude,
        longitude: buyer.longitude,
      },
    });

    for (const [orderIndex, order] of buyer.orders.entries()) {
      const id = `eval_order_${buyer.key}_${orderIndex}`;
      const createdAt = new Date(referenceDate.getTime() - order.ageDays * 86_400_000);
      const selected = order.listingKeys.map((key) => {
        const listing = listingByKey.get(key);
        if (!listing) throw new Error(`Unknown evaluation listing ${key}.`);
        return listing;
      });
      const subtotal = selected.reduce((sum, listing) => sum + listing.price * 10, 0);
      await prisma.$transaction(async (tx) => {
        await tx.purchaseOrder.upsert({
          where: { id },
          create: {
            id,
            orderNumber: `EVAL-${buyer.key.toUpperCase()}-${orderIndex}`,
            buyerUserId: userId,
            isEvalOnly: true,
            status: "CLOSED",
            paymentStatus: "PAID",
            fulfillmentStatus: "DELIVERED",
            subtotal,
            taxAmount: 0,
            shippingAmount: 0,
            totalAmount: subtotal,
            currency: "INR",
            gstInvoice: false,
            taxNote: "Evaluation fixture",
            createdAt,
            updatedAt: createdAt,
          },
          update: {
            isEvalOnly: true,
            status: "CLOSED",
            paymentStatus: "PAID",
            fulfillmentStatus: "DELIVERED",
            subtotal,
            totalAmount: subtotal,
            createdAt,
            updatedAt: createdAt,
          },
        });
        await tx.purchaseOrderItem.deleteMany({ where: { orderId: id } });
        await tx.purchaseOrderItem.createMany({
          data: selected.map((listing, itemIndex) => ({
            id: `${id}_item_${itemIndex}`,
            orderId: id,
            listingId: EVAL_LISTING_ID(listing.key),
            sellerCompanyId: listingCompanyId(listing.key),
            title: listing.title,
            quantity: 10,
            unit: "ton",
            pricePerUnit: listing.price,
            lineTotal: listing.price * 10,
            status: "DELIVERED",
            createdAt,
          })),
        });
      });
      orderCount += 1;
    }

    for (const key of buyer.cart ?? []) {
      const listing = listingByKey.get(key);
      if (!listing) throw new Error(`Unknown evaluation cart listing ${key}.`);
      await prisma.cartItem.upsert({
        where: { userId_listingId: { userId, listingId: EVAL_LISTING_ID(key) } },
        create: {
          id: `eval_cart_${buyer.key}_${key}`,
          userId,
          listingId: EVAL_LISTING_ID(key),
          quantity: 10,
          priceSnapshot: listing.price,
        },
        update: { quantity: 10, priceSnapshot: listing.price },
      });
    }
    for (const key of buyer.wishlist ?? []) {
      await prisma.wishlistItem.upsert({
        where: { userId_listingId: { userId, listingId: EVAL_LISTING_ID(key) } },
        create: {
          id: `eval_wishlist_${buyer.key}_${key}`,
          userId,
          listingId: EVAL_LISTING_ID(key),
        },
        update: {},
      });
    }
  }
  return orderCount;
}

async function main() {
  assertSafeEvaluationDatabase();
  const embeddedListings = await seedListings();
  const orders = await seedBuyers();
  const profiles = [];
  for (const buyer of EVAL_BUYERS) {
    profiles.push(await buildBuyerDemandProfile(EVAL_BUYER_ID(buyer.key)));
  }
  const edges = await refreshMaterialEdges(prisma, referenceDate, { includeEval: true });
  console.log(
    JSON.stringify(
      {
        referenceDate: referenceDate.toISOString(),
        listings: EVAL_LISTINGS.length,
        embeddedListings,
        buyers: EVAL_BUYERS.length,
        orders,
        coldStartBuyers: profiles.filter((profile) => !profile.hasHistory).length,
        edges,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
