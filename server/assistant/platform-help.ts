import type {
  AssistantCitation,
  AssistantRetrieval,
} from "@/lib/assistant-types";

export interface PlatformHelpAnswer {
  answer: string;
  citations: AssistantCitation[];
  retrieval: AssistantRetrieval;
}

interface PlatformHelpTopic {
  id: string;
  patterns: RegExp[];
  answer: string;
  citations: Omit<AssistantCitation, "id">[];
}

interface ConversationTurn {
  role: "USER" | "ASSISTANT";
  content: string;
}

function normalizedQuery(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function guideCitation(
  title: string,
  url: string,
  excerpt: string,
): Omit<AssistantCitation, "id"> {
  return {
    title,
    url,
    sourceType: "PLATFORM_GUIDE",
    sourceId: null,
    isEvalOnly: false,
    excerpt,
  };
}

function contextualConstraintAnswer(
  query: string,
  conversation: ConversationTurn[],
): PlatformHelpAnswer | null {
  const value = normalizedQuery(query);
  const recentContext = conversation
    .slice(-4)
    .map((turn) => normalizedQuery(turn.content))
    .join(" ");
  const onboardingContext = /\b(onboarding|seller verification|kyc)\b/.test(
    `${recentContext} ${value}`,
  );
  const currentProblem =
    /\b(still|again|already tried|tried that|not working|doesn t work|didn t work|cannot|can t|failed|broken|stuck|blocked)\b/.test(
      value,
    );
  const missing =
    /\b(don t have|do not have|haven t got|missing|no|cannot provide|can t provide)\b/;
  const followsKycContext =
    /\b(kyc|pan|aadhaar|aadhar|passport|identity details?)\b/.test(value) ||
    (/\b(kyc|pan|aadhaar|aadhar|passport|identity details?)\b/.test(
      recentContext,
    ) &&
      /\b(it|that|those|them|the details?|the id)\b/.test(value));

  if (onboardingContext && missing.test(value) && followsKycContext) {
    return {
      answer:
        "KYC cannot be skipped.\n" +
        "- Demo: use fictional values and a harmless PDF labelled DEMO—never real identity data.\n" +
        "- Real account: save a draft until an authorised signatory provides an accepted ID and KYC PDF.\n" +
        "- Need help? Ask me to create a KYC support ticket.",
      citations: [
        {
          id: "S1",
          ...guideCitation(
            "Open seller onboarding",
            "/seller",
            "Continue the sandbox onboarding flow or save an incomplete application as a draft.",
          ),
        },
      ],
      retrieval: { mode: "platform", resultCount: 1 },
    };
  }

  const workflowContext = `${recentContext} ${value}`;
  if (
    currentProblem &&
    /\b(bid|bidding|offer|counter bid)\b/.test(workflowContext)
  ) {
    return {
      answer:
        "Check these before retrying the bid:\n" +
        "- Use a buyer account on an active SymbiOS listing—not your own or an imported listing.\n" +
        "- Meet its MOQ, stock and lot increment; use positive whole-number quantity.\n" +
        "- If it still fails, send the exact error or ask me to create a ticket.",
      citations: [
        {
          id: "S1",
          ...guideCitation(
            "Open a listing to retry the bid",
            "/",
            "Retry on an active first-party listing and note the exact validation message.",
          ),
        },
        {
          id: "S2",
          ...guideCitation(
            "Review your buyer bids",
            "/account",
            "Check whether the bid already exists, expired, or reached a final status.",
          ),
        },
      ],
      retrieval: { mode: "platform", resultCount: 2 },
    };
  }

  if (
    currentProblem &&
    /\b(checkout|buy now|cart|order|payment|invoice)\b/.test(workflowContext)
  ) {
    return {
      answer:
        "Check the listing is active, quantity meets MOQ and stock, and your shipping address is complete. For accepted bids, the reservation must still be valid. Payments are sandbox-only. Send the exact error if retrying fails.",
      citations: [
        {
          id: "S1",
          ...guideCitation(
            "Review cart, addresses, bids, and orders",
            "/account",
            "Check quantity, stock, address, bid reservation, and order state.",
          ),
        },
      ],
      retrieval: { mode: "platform", resultCount: 1 },
    };
  }

  if (
    currentProblem &&
    /\b(message|messaging|chat|contact seller|conversation|inbox)\b/.test(
      workflowContext,
    )
  ) {
    return {
      answer:
        "Internal chat needs an active SymbiOS seller; imported listings use View source instead. Buyer and seller must be different active accounts. Tell me whether the Message seller button is missing or what error appears.",
      citations: [
        {
          id: "S1",
          ...guideCitation(
            "Open buyer messages",
            "/account",
            "Check the buyer-side thread and its latest response.",
          ),
        },
        {
          id: "S2",
          ...guideCitation(
            "Open seller messages",
            "/seller",
            "Check the matching seller-side conversation.",
          ),
        },
      ],
      retrieval: { mode: "platform", resultCount: 2 },
    };
  }

  if (
    onboardingContext &&
    missing.test(value) &&
    /\b(document|documents|pdf|gst certificate|bank proof|warehouse proof)\b/.test(
      value,
    )
  ) {
    return {
      answer:
        "Save incomplete onboarding as a draft. Demo environments should use harmless PDFs labelled DEMO; real onboarding still requires valid registration, GST, KYC and bank proof. Ask me to create a ticket if a document requirement is unclear.",
      citations: [
        {
          id: "S1",
          ...guideCitation(
            "Continue seller onboarding",
            "/seller",
            "Save incomplete steps as a draft and review the required document slots.",
          ),
        },
      ],
      retrieval: { mode: "platform", resultCount: 1 },
    };
  }

  return null;
}

/**
 * First-party workflows that must remain correct when embeddings or generation
 * are unavailable. Patterns deliberately describe product intent rather than
 * material terms, so "find PET suppliers" still reaches catalogue RAG.
 */
const PLATFORM_HELP_TOPICS: PlatformHelpTopic[] = [
  {
    id: "welcome",
    patterns: [
      /^(hi|hello|hey|namaste|good morning|good afternoon|good evening)( symbi)?$/,
      /\b(what can you do|how can you help|help me use|what is symbi(?:os)?|about symbi(?:os)?)\b/,
    ],
    answer:
      "I can search and compare listings, check your orders or bids, explain marketplace workflows, troubleshoot issues, and contact support. Try “find PET near Pune” or “show my latest bids.”",
    citations: [
      guideCitation(
        "Browse the SymbiOS marketplace",
        "/",
        "Search, filter, compare, save, buy, or bid on marketplace listings.",
      ),
      guideCitation(
        "Open your account workspace",
        "/account",
        "Manage buyer orders, bids, messages, saved listings, cart, and addresses.",
      ),
    ],
  },
  {
    id: "bids",
    patterns: [
      /\b(bid|bidding|counter ?offer|counter ?bid|withdraw (?:a |my )?(?:bid|offer)|offer negotiation)\b/,
      /\b(make|place|send|submit|accept|reject|decline|counter|cancel|withdraw) (?:a |an |the |my )?offer\b/,
    ],
    answer:
      "To place a bid:\n" +
      "1. Open an active SymbiOS listing and enter a quantity meeting MOQ, stock and lot increment.\n" +
      "2. Select Place a bid, enter price and optional terms.\n" +
      "3. Send it, then track counters or decisions under Account → Bids.",
    citations: [
      guideCitation(
        "Browse listings and place a bid",
        "/",
        "Open a live listing and use its Place a bid action.",
      ),
      guideCitation(
        "Manage buyer bids",
        "/account",
        "Track, counter, accept, or withdraw buyer bids.",
      ),
      guideCitation(
        "Manage incoming seller bids",
        "/seller",
        "Verified sellers can respond to incoming marketplace bids.",
      ),
    ],
  },
  {
    id: "checkout-orders",
    patterns: [
      /\b(check ?out|buy now|shopping cart|add to cart|remove from cart|shipping address|billing address)\b/,
      /\b(place (?:an |my )?order|order (?:status|history|tracking)|track (?:an |my )?order|purchase history)\b/,
      /\b(payment|invoice|fees?|subtotal|sandbox gateway|funds transfer)\b/,
    ],
    answer:
      "Choose Buy now or add a priced listing to your cart. Confirm quantity and shipping address, review the calculated total, then place the order. Accepted bids also continue through checkout. Payments are sandbox-only in v0.",
    citations: [
      guideCitation(
        "Browse purchasable listings",
        "/",
        "Choose Buy now or add a priced marketplace listing to the cart.",
      ),
      guideCitation(
        "Manage cart, addresses, and orders",
        "/account",
        "Review cart items, saved addresses, purchase history, and invoices.",
      ),
    ],
  },
  {
    id: "messages",
    patterns: [
      /\b(message|messaging|chat|conversation|inbox)\b/,
      /\b(contact|talk to|speak to|reach) (?:a |the )?seller\b/,
    ],
    answer:
      "Select Message seller on an active SymbiOS listing. Both sides receive the same thread in their Messages tab. Imported listings cannot use internal chat; open View source instead.",
    citations: [
      guideCitation(
        "Buyer messages",
        "/account",
        "Open and reply to buyer-side marketplace conversations.",
      ),
      guideCitation(
        "Seller messages",
        "/seller",
        "Open and reply to seller-side marketplace conversations.",
      ),
    ],
  },
  {
    id: "rfq-demand",
    patterns: [
      /\b(rfq|request for quote|standing demand|demand profile|material request)\b/,
      /\b(post|create|submit|manage|close) (?:an |a |my )?(?:rfq|demand|material request)\b/,
    ],
    answer:
      "Use Post RFQ when no listing fits. Enter material, quantity, unit, location, required date and optional price/radius. SymbiOS ranks current matches and keeps the demand open for new supply.",
    citations: [
      guideCitation(
        "Post and manage RFQs",
        "/rfq",
        "Create a material demand and review current or future matches.",
      ),
    ],
  },
  {
    id: "seller-onboarding",
    patterns: [
      /\b(seller onboarding|become (?:a )?seller|start selling|seller verification|verify (?:my |the )?(?:seller|business|company))\b/,
      /\b(kyc|gstin|gst certificate|pan|bank proof|warehouse proof|business verification|sandbox verification)\b/,
    ],
    answer:
      "Complete Business, Tax, Bank, KYC, Warehouse and Policy in the Seller dashboard, upload the required PDFs, then submit. Run sandbox verification tests the workflow only; it does not contact real verification providers.",
    citations: [
      guideCitation(
        "Complete seller onboarding",
        "/seller",
        "Complete business, tax, bank, KYC, warehouse, policy, and document steps.",
      ),
    ],
  },
  {
    id: "seller-listings",
    patterns: [
      /\b(create|add|post|publish|submit|edit|update|delete|archive|manage) (?:a |my |the )?(?:seller )?listings?\b/,
      /\b(list (?:a |my )?(?:material|scrap|by product)|sell (?:a |my )?(?:material|scrap|by product))\b/,
      /\b(listing (?:draft|approval|moderation|status))\b/,
    ],
    answer:
      "After seller verification, choose New listing and enter material, quantity, MOQ, price, location, lead time and images. Save drafts freely; submit when ready. Buyers see it only after moderation approval.",
    citations: [
      guideCitation(
        "Manage seller listings",
        "/seller",
        "Create, submit, and manage listings from the verified seller workspace.",
      ),
      guideCitation(
        "Create a new listing",
        "/seller/listings/new",
        "Enter commercial, location, material, safety, and image details.",
      ),
    ],
  },
  {
    id: "search-feed",
    patterns: [
      /\b(how (?:do|can) i (?:search|find|filter|sort|compare)|use (?:the )?(?:search|filters?))\b/,
      /\b(feed|recommendations?|recommended listings?|personalized|personalised|why (?:am i|is this) seeing)\b/,
      /\b(sort by|price filter|quantity filter|category filter)\b/,
    ],
    answer:
      "Search by material, then filter category, price, quantity and location. Your feed ranks semantic fit, company industry, distance, price, stock, freshness and seller reliability; new buyers use industry, location and freshness as cold-start signals.",
    citations: [
      guideCitation(
        "Search and filter the marketplace",
        "/",
        "Search, filter, sort, and browse the current marketplace feed.",
      ),
    ],
  },
  {
    id: "marketplace-concepts",
    patterns: [
      /\b(what (?:is|does)|meaning of|mean by|explain).*(?:moq|minimum order|lot increment|lead time|ask quote|price per unit|available stock|freight|seller reliability)\b/,
      /\b(moq|minimum order quantity|lot increment|lead time|ask quote) (?:meaning|definition)\b/,
    ],
    answer:
      "MOQ is the smallest accepted quantity; lot increment is the allowed step above it. Lead time is preparation time, not guaranteed delivery. Ask quote means no public fixed price. Checkout adds applicable fees, shipping and tax notes.",
    citations: [
      guideCitation(
        "Browse listing terms in context",
        "/",
        "Marketplace cards and listing pages show price, stock, MOQ, unit, location, and seller status.",
      ),
    ],
  },
  {
    id: "location",
    patterns: [
      /\b(geolocation|geo location|current location|share (?:my )?location|location permission|distance radius|radius filter|nearby filter|pincode lookup)\b/,
      /\b(how (?:does|do|can).*(?:location|distance|pincode|near me))\b/,
    ],
    answer:
      "Enter an Indian pincode, or allow browser location while posting an RFQ and choose a radius. If permission is denied, city/state and pincode matching still work. Distance helps rank freight relevance.",
    citations: [
      guideCitation(
        "Use location in an RFQ",
        "/rfq",
        "Enter a pincode or grant browser location for radius-based matching.",
      ),
    ],
  },
  {
    id: "saved",
    patterns: [
      /\b(saved listings?|saved products?|wishlist|wish list|bookmark|bookmarked|favorite|favourite)\b/,
    ],
    answer:
      "Select a listing’s heart icon, then open Account → Saved. Saving does not reserve stock or lock the price.",
    citations: [
      guideCitation(
        "View saved listings",
        "/account",
        "Manage the listings saved by the signed-in buyer.",
      ),
    ],
  },
  {
    id: "reviews",
    patterns: [
      /\b(review|reviews|rating|ratings|feedback|verified purchase)\b/,
    ],
    answer:
      "Buyers can review a listing only after a fulfilled or delivered purchase. Reviews require 1–5 stars and at least 10 characters; submitting again updates the existing verified-purchase review.",
    citations: [
      guideCitation(
        "Review marketplace listings",
        "/account",
        "Review eligible fulfilled purchases from the buyer workspace.",
      ),
    ],
  },
  {
    id: "account-auth",
    patterns: [
      /\b(sign in|log in|login|register|create (?:an |my )?account|forgot (?:my )?password|reset (?:my )?password|email verification)\b/,
      /\b(buyer role|seller role|both roles|account role|switch (?:to )?(?:buyer|seller))\b/,
    ],
    answer:
      "Register, then sign in with your email and password. Use Forgot password if needed. Buyer tools are under Account; seller tools require the Seller dashboard and completed onboarding. Passwords are hashed and cannot be read from the database.",
    citations: [
      guideCitation("Sign in", "/login", "Access an existing SymbiOS account."),
      guideCitation(
        "Create an account",
        "/register",
        "Register a new buyer or seller account.",
      ),
      guideCitation(
        "Reset a forgotten password",
        "/forgot-password",
        "Start the supported password-reset flow.",
      ),
    ],
  },
  {
    id: "safety",
    patterns: [
      /\b(safety|safe category|allowed material|accepted material|prohibited|restricted|hazardous|non hazardous|radioactive|biomedical|explosive|asbestos|e waste|ewaste)\b/,
      /\b(can i (?:sell|list).*(?:waste|scrap|material))\b/,
    ],
    answer:
      "SymbiOS v0 accepts only approved non-hazardous industrial by-products. Radioactive, biomedical, explosive, asbestos, e-waste and other hazardous materials are blocked. Seller declarations, moderation and server-side checks still apply.",
    citations: [
      guideCitation(
        "Review accepted marketplace categories",
        "/",
        "The marketplace exposes its accepted non-hazardous material categories and safety notice.",
      ),
      guideCitation(
        "Seller safety and verification",
        "/seller",
        "Seller onboarding requires agreement to non-hazardous-material policies.",
      ),
    ],
  },
  {
    id: "external-listings",
    patterns: [
      /\b(imported listing|external listing|source listing|view source|unverified source|tradeindia|recycleinme|seller not (?:on|in) (?:the )?platform)\b/,
    ],
    answer:
      "Imported listings are labelled Unverified source and are not platform-verified supply. Use View source when the supplier has not joined SymbiOS. Reconfirm price, stock, specifications, freight and terms before transacting.",
    citations: [
      guideCitation(
        "Browse sourced and seller-created listings",
        "/",
        "Imported supply is visibly labeled separately from verified seller-created listings.",
      ),
    ],
  },
];

/** Resolve stable product-workflow questions before catalogue retrieval. */
export function answerPlatformHelp(
  query: string,
  conversation: ConversationTurn[] = [],
): PlatformHelpAnswer | null {
  const contextual = contextualConstraintAnswer(query, conversation);
  if (contextual) return contextual;
  const normalized = normalizedQuery(query);
  const topic = PLATFORM_HELP_TOPICS.find((candidate) =>
    candidate.patterns.some((pattern) => pattern.test(normalized)),
  );
  if (!topic) return null;

  return {
    answer: topic.answer,
    citations: topic.citations.map((citation, index) => ({
      id: `S${index + 1}`,
      ...citation,
    })),
    retrieval: {
      mode: "platform",
      resultCount: topic.citations.length,
    },
  };
}
