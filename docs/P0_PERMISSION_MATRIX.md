# Symbi-OS v0 permission matrix

All state-changing requests are same-origin protected by `proxy.ts`; high-risk
routes also call `assertTrustedOrigin` directly. `BOTH` inherits buyer and seller
permissions. Object ownership is checked in addition to role.

| Capability | Buyer | Seller | Admin | Ownership/state rule |
| --- | --- | --- | --- | --- |
| Manage addresses, cart, wishlist | Yes | No unless `BOTH` | No | Current user only |
| Create RFQ and view matches | Yes | No unless `BOTH` | No | Current user/company demand only |
| Create/counter/withdraw offer | Yes | Counter only | No | Negotiation participant; cannot act on own current revision |
| Accept/reject/cancel offer | Counter acceptance | Yes | No | Negotiation participant; verified seller required for seller acceptance |
| Create/edit/submit listing | No | Yes | No | Approved seller; same company; version/state checks |
| Moderate listing | No | No | Yes | Pending moderation and matching version |
| Complete seller onboarding | No | Yes | No | Current user only |
| Review seller verification | No | No | Yes | Submitted/under-review records only |
| Create/reply/read message | Participant | Participant | No | Buyer, seller user, or seller company only |
| Report/block/close thread | Participant | Participant | No | Thread participant only |
| Direct sandbox checkout | Yes | No | No | Active safe listing; no self-purchase; MOQ/lot/inventory checks |
| Pay accepted offer | Yes | No | No | Bid buyer and linked awaiting-confirmation order |
| Accept/dispatch seller order | No | Yes | No | Seller company on order; paid order only |
| Confirm delivery/cancel/dispute | Yes | No | No | Order buyer; state-specific rules |
| Download invoice | Buyer | Order seller | Yes | Order participant only |
| Inventory reconciliation | No | No | Yes | Read-only report; expired reservations are released idempotently |

Authentication endpoints are intentionally public but rate-limited where they can
be abused. Catalog, product detail, public-source retrieval, and grounded RAG
queries are read-only.
