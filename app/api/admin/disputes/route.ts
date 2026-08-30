import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiError, requireAdmin } from "@/server/http";

function safeSnapshot(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

function strings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

/**
 * Complete operator view of every dispute. Raw event snapshots and storage
 * keys stay server-side; the response exposes only the reason, party notes,
 * safe evidence links, timeline, and eligible replacement stock.
 */
export async function GET() {
  try {
    await requireAdmin();

    const orders = await prisma.purchaseOrder.findMany({
      where: { disputeStatus: { not: "NONE" } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        disputeStatus: true,
        totalAmount: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
        buyer: {
          select: { id: true, companyName: true, email: true },
        },
        invoice: { select: { invoiceNumber: true, issuedAt: true } },
        creditNote: {
          select: { creditNoteNumber: true, reasonCode: true, issuedAt: true },
        },
        items: {
          select: {
            id: true,
            title: true,
            quantity: true,
            unit: true,
            pricePerUnit: true,
            status: true,
            listingId: true,
            sellerCompanyId: true,
            listing: {
              select: {
                id: true,
                category: true,
                assets: {
                  where: { status: "READY" },
                  select: {
                    id: true,
                    kind: true,
                    originalName: true,
                    mimeType: true,
                    createdAt: true,
                  },
                  orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
                },
              },
            },
          },
        },
        events: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            actorUserId: true,
            type: true,
            fromStatus: true,
            toStatus: true,
            reasonCode: true,
            snapshotJson: true,
            createdAt: true,
          },
        },
      },
    });

    const actorIds = [
      ...new Set(
        orders.flatMap((order) =>
          order.events.flatMap((event) =>
            event.actorUserId ? [event.actorUserId] : [],
          ),
        ),
      ),
    ];
    const sellerCompanyIds = [
      ...new Set(
        orders.flatMap((order) =>
          order.items.map((item) => item.sellerCompanyId),
        ),
      ),
    ];
    const [actors, sellers, possibleReplacements] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: {
          id: true,
          companyName: true,
          role: true,
          isAdmin: true,
        },
      }),
      prisma.company.findMany({
        where: { id: { in: sellerCompanyIds } },
        select: { id: true, name: true },
      }),
      prisma.marketplaceListing.findMany({
        where: {
          listingMode: "MANAGED",
          sellerCompanyId: { in: sellerCompanyIds },
          verified: true,
          status: { in: ["ACTIVE", "active"] },
          quantityAvailable: { gt: 0 },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: {
          id: true,
          title: true,
          sellerCompanyId: true,
          category: true,
          unit: true,
          quantityAvailable: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 250,
      }),
    ]);
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));
    const sellerById = new Map(sellers.map((seller) => [seller.id, seller]));

    return NextResponse.json({
      orders: orders.map((order) => {
        const openedEvent = [...order.events]
          .reverse()
          .find((event) => event.type === "DISPUTE_OPENED");
        const openedSnapshot = openedEvent
          ? safeSnapshot(openedEvent.snapshotJson)
          : {};
        const timeline = order.events.map((event) => {
          const snapshot = safeSnapshot(event.snapshotJson);
          const actor = event.actorUserId
            ? actorById.get(event.actorUserId)
            : undefined;
          return {
            id: event.id,
            type: event.type,
            fromStatus: event.fromStatus,
            toStatus: event.toStatus,
            reasonCode: event.reasonCode,
            createdAt: event.createdAt,
            actor: actor
              ? {
                  id: actor.id,
                  name: actor.companyName,
                  role: actor.isAdmin ? "ADMIN" : actor.role,
                }
              : null,
            note: typeof snapshot.note === "string" ? snapshot.note : null,
            action:
              typeof snapshot.action === "string" ? snapshot.action : null,
            refundAmount:
              typeof snapshot.refundAmount === "number"
                ? snapshot.refundAmount
                : null,
            replacement:
              snapshot.replacement && typeof snapshot.replacement === "object"
                ? snapshot.replacement
                : null,
          };
        });
        const evidence = [
          ...strings(openedSnapshot.evidence).map((reference, index) => ({
            id: `reference-${index}`,
            kind: "REFERENCE",
            label: reference,
            url: null,
          })),
          ...(order.invoice
            ? [
                {
                  id: `invoice-${order.invoice.invoiceNumber}`,
                  kind: "INVOICE",
                  label: order.invoice.invoiceNumber,
                  url: `/api/orders/${order.id}/invoice`,
                },
              ]
            : []),
          ...(order.creditNote
            ? [
                {
                  id: `credit-${order.creditNote.creditNoteNumber}`,
                  kind: "CREDIT_NOTE",
                  label: order.creditNote.creditNoteNumber,
                  url: `/api/orders/${order.id}/invoice?document=credit-note`,
                },
              ]
            : []),
          ...order.items.flatMap((item) =>
            item.listing.assets.map((asset) => ({
              id: asset.id,
              kind: asset.kind,
              label: asset.originalName,
              url: `/api/listings/${item.listing.id}/assets/${asset.id}`,
            })),
          ),
        ];
        const partyNotes = timeline.filter((event) => Boolean(event.note));
        const replacementCandidates = order.items.flatMap((item) =>
          possibleReplacements
            .filter(
              (candidate) =>
                candidate.id !== item.listingId &&
                candidate.sellerCompanyId === item.sellerCompanyId &&
                candidate.category === item.listing.category &&
                candidate.unit === item.unit &&
                candidate.quantityAvailable >= item.quantity,
            )
            .map((candidate) => ({
              orderItemId: item.id,
              listingId: candidate.id,
              title: candidate.title,
              quantityAvailable: candidate.quantityAvailable,
              requiredQuantity: item.quantity,
              unit: candidate.unit,
            })),
        );

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          disputeStatus: order.disputeStatus,
          totalAmount: order.totalAmount,
          currency: order.currency,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          reasonCode: openedEvent?.reasonCode ?? "UNSPECIFIED",
          disputeNote:
            typeof openedSnapshot.note === "string"
              ? openedSnapshot.note
              : "No dispute note was submitted.",
          buyer: order.buyer,
          sellers: [
            ...new Map(
              order.items.map((item) => [
                item.sellerCompanyId,
                {
                  id: item.sellerCompanyId,
                  name:
                    sellerById.get(item.sellerCompanyId)?.name ??
                    "Unknown seller company",
                },
              ]),
            ).values(),
          ],
          items: order.items.map(({ listing, ...item }) => item),
          partyNotes,
          evidence,
          timeline,
          replacementCandidates,
        };
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}
