import { Prisma } from "@prisma/client";

/**
 * Seller-facing order data. Never replace the buyer select with `buyer: true`:
 * doing so serializes the User model, including its password hash.
 */
export const sellerOrderItemInclude = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      sourceBidId: true,
      status: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      disputeStatus: true,
      subtotal: true,
      taxAmount: true,
      shippingAmount: true,
      discountAmount: true,
      buyerFeeAmount: true,
      sellerFeeAmount: true,
      feeVersion: true,
      totalAmount: true,
      currency: true,
      gstInvoice: true,
      purchaseOrderNumber: true,
      notes: true,
      taxNote: true,
      createdAt: true,
      updatedAt: true,
      buyer: {
        select: {
          id: true,
          companyName: true,
        },
      },
      shippingAddress: {
        select: {
          id: true,
          label: true,
          contactName: true,
          phone: true,
          country: true,
          state: true,
          city: true,
          district: true,
          area: true,
          locality: true,
          landmark: true,
          buildingName: true,
          floor: true,
          unitNumber: true,
          street: true,
          pincode: true,
          addressType: true,
          verificationStatus: true,
        },
      },
      freightQuotes: {
        select: {
          id: true,
          amount: true,
          source: true,
          distanceKm: true,
          deliveryTerm: true,
          expiresAt: true,
          acceptedAt: true,
        },
      },
      shipment: {
        select: {
          id: true,
          carrierName: true,
          serviceLevel: true,
          trackingNumber: true,
          vehicleNumber: true,
          proofOfDispatchReference: true,
          dispatchedAt: true,
          estimatedDeliveryAt: true,
          deliveredAt: true,
          status: true,
        },
      },
    },
  },
  listing: {
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      deliveryTerm: true,
    },
  },
} satisfies Prisma.PurchaseOrderItemInclude;
