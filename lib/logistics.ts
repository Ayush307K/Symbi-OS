export const DELIVERY_TERMS = [
  "EX_WORKS",
  "FOB",
  "DELIVERED",
  "FREIGHT_QUOTE_REQUIRED",
] as const;

export type DeliveryTerm = (typeof DELIVERY_TERMS)[number];

export const DELIVERY_TERM_DETAILS: Record<
  DeliveryTerm,
  { label: string; shortLabel: string; responsibility: string }
> = {
  EX_WORKS: {
    label: "Ex Works (buyer arranges freight)",
    shortLabel: "Ex Works",
    responsibility:
      "The seller makes the material ready at the dispatch location. The buyer arranges and pays for pickup and freight.",
  },
  FOB: {
    label: "FOB / loaded at origin",
    shortLabel: "FOB origin",
    responsibility:
      "The seller loads the material at the named origin. The buyer arranges and pays for onward freight.",
  },
  DELIVERED: {
    label: "Delivered price (freight included)",
    shortLabel: "Delivered",
    responsibility:
      "The seller arranges delivery and the published material price includes freight to the selected delivery location.",
  },
  FREIGHT_QUOTE_REQUIRED: {
    label: "Seller/carrier freight quote required",
    shortLabel: "Freight quoted separately",
    responsibility:
      "Freight is arranged separately and must be quoted and accepted before payment is confirmed.",
  },
};

export function deliveryTermLabel(term: DeliveryTerm | null | undefined) {
  return term ? DELIVERY_TERM_DETAILS[term].shortLabel : "Delivery terms not stated";
}
