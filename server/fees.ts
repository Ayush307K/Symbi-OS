export const FEE_VERSION = "fees-v1.0";

export interface FeeQuote {
  subtotal: number;
  buyerFeeAmount: number;
  sellerFeeAmount: number;
  shippingAmount: number;
  taxAmount: number;
  totalAmount: number;
  feeVersion: string;
  taxNote: string;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateFees(
  subtotal: number,
  options: { shippingAmount?: number } = {},
): FeeQuote {
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new Error("Subtotal must be a non-negative finite value.");
  }
  const buyerFeeAmount = money(subtotal * 0.01);
  const sellerFeeAmount = money(subtotal * 0.02);
  const shippingAmount = money(options.shippingAmount ?? 0);
  const taxAmount = 0;
  return {
    subtotal: money(subtotal),
    buyerFeeAmount,
    sellerFeeAmount,
    shippingAmount,
    taxAmount,
    totalAmount: money(subtotal + buyerFeeAmount + shippingAmount),
    feeVersion: FEE_VERSION,
    taxNote:
      "Sandbox v0: GST/TDS is not calculated. Final tax treatment requires verified tax profiles and accounting approval.",
  };
}
