import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Money columns are `Decimal` in the database and plain numbers in the app.
 *
 * Postgres stores currency as numeric so that stored values and SQL-side
 * aggregates are exact — binary floats cannot represent 0.1, and a marketplace
 * that drops a paise per line item eventually disagrees with its own invoices.
 *
 * Prisma surfaces those columns as Decimal objects, whose toJSON emits a
 * *string*. Left alone, every API response would have silently changed shape
 * from `540` to `"540"`, and every price calculation would have become object
 * multiplication. This extension converts them back to numbers on read, so the
 * field types the rest of the codebase sees are exactly what they were. Writes
 * need no change: Prisma accepts number, string or Decimal as Decimal input.
 *
 * Exactness therefore holds where it is durable — storage, comparison, and
 * aggregation — while in-process arithmetic stays float, as it was before.
 * Moving the whole app to Decimal maths would be the next step, and is only
 * worth doing once money is real; server/fees.ts already rounds to paise.
 *
 * Each field is spelled out rather than generated in a loop: Prisma infers the
 * result types from the literal keys, and a computed key erases them.
 */
const toNumber = (value: Prisma.Decimal) => value.toNumber();
const toNullableNumber = (value: Prisma.Decimal | null) =>
  value === null ? null : value.toNumber();

export function createPrismaClient(
  options?: ConstructorParameters<typeof PrismaClient>[0],
) {
  return new PrismaClient(options).$extends({
    result: {
      bid: {
        pricePerUnit: {
          needs: { pricePerUnit: true },
          compute: (bid) => toNumber(bid.pricePerUnit),
        },
      },
      offerRevision: {
        pricePerUnit: {
          needs: { pricePerUnit: true },
          compute: (revision) => toNumber(revision.pricePerUnit),
        },
      },
      marketplaceListing: {
        pricePerUnit: {
          needs: { pricePerUnit: true },
          compute: (listing) => toNumber(listing.pricePerUnit),
        },
      },
      cartItem: {
        priceSnapshot: {
          needs: { priceSnapshot: true },
          compute: (item) => toNumber(item.priceSnapshot),
        },
      },
      purchaseOrder: {
        subtotal: {
          needs: { subtotal: true },
          compute: (order) => toNumber(order.subtotal),
        },
        taxAmount: {
          needs: { taxAmount: true },
          compute: (order) => toNumber(order.taxAmount),
        },
        shippingAmount: {
          needs: { shippingAmount: true },
          compute: (order) => toNumber(order.shippingAmount),
        },
        discountAmount: {
          needs: { discountAmount: true },
          compute: (order) => toNumber(order.discountAmount),
        },
        buyerFeeAmount: {
          needs: { buyerFeeAmount: true },
          compute: (order) => toNumber(order.buyerFeeAmount),
        },
        sellerFeeAmount: {
          needs: { sellerFeeAmount: true },
          compute: (order) => toNumber(order.sellerFeeAmount),
        },
        totalAmount: {
          needs: { totalAmount: true },
          compute: (order) => toNumber(order.totalAmount),
        },
      },
      purchaseOrderItem: {
        pricePerUnit: {
          needs: { pricePerUnit: true },
          compute: (item) => toNumber(item.pricePerUnit),
        },
        lineTotal: {
          needs: { lineTotal: true },
          compute: (item) => toNumber(item.lineTotal),
        },
      },
      demoPayment: {
        amount: {
          needs: { amount: true },
          compute: (payment) => toNumber(payment.amount),
        },
      },
      demand: {
        maxPrice: {
          needs: { maxPrice: true },
          compute: (demand) => toNullableNumber(demand.maxPrice),
        },
      },
    },
  });
}

/**
 * The client type as the app sees it, money already converted.
 *
 * Anything holding a Prisma client — a helper taking a transaction, a script,
 * a test — must use this rather than PrismaClient, or it will be typed against
 * raw Decimal columns and disagree with every caller.
 */
export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

/** A transaction handle from `prisma.$transaction`, with the same conversions. */
export type ExtendedTransactionClient = Omit<
  ExtendedPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedPrismaClient;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
