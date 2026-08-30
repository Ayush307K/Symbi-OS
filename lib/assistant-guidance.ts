export const ASSISTANT_TOPIC_IDS = [
  "catalogue",
  "orders",
  "selling",
  "messages",
  "account",
  "support",
] as const;

export type AssistantTopicId = (typeof ASSISTANT_TOPIC_IDS)[number];

export interface AssistantQuickReply {
  label: string;
  query: string;
}

export interface AssistantTopic {
  id: AssistantTopicId;
  label: string;
  description: string;
  followUp: string;
  inputPlaceholder: string;
  quickReplies: readonly AssistantQuickReply[];
}

/**
 * Deterministic end-of-answer copy. Keeping this outside the generation layer
 * makes the resolution checkpoint consistent for RAG, live-data and support
 * answers alike.
 */
export const ASSISTANT_RESOLUTION = {
  question: "Can I help with anything else?",
  continueLabel: "Yes, another question",
  finishLabel: "No, I’m done",
  completedMessage:
    "Glad I could help. This conversation is saved in your history.",
} as const;

/**
 * Guided entry points for Symbi. These are presentation and intent hints, not
 * separate assistant implementations: the selected follow-up still reaches
 * the existing catalogue RAG, account tools, platform guidance, or support
 * escalation path according to the user's concrete question.
 */
export const ASSISTANT_TOPICS: readonly AssistantTopic[] = [
  {
    id: "catalogue",
    label: "Find materials",
    description: "Search and compare live scrap listings.",
    followUp: "What material are you looking for?",
    inputPlaceholder: "Describe the material, grade, quantity or location…",
    quickReplies: [
      {
        label: "Find plastic scrap near me",
        query: "Find plastic scrap suppliers near me",
      },
      {
        label: "Compare HDPE listings",
        query: "Compare the current HDPE scrap listings",
      },
      {
        label: "Post an RFQ",
        query: "How do I post an RFQ for a material I need?",
      },
    ],
  },
  {
    id: "orders",
    label: "Orders, bids & payments",
    description: "Track purchases, offers, checkout and invoices.",
    followUp: "What do you need help with—an order, bid or payment?",
    inputPlaceholder: "Describe the order, bid or payment question…",
    quickReplies: [
      { label: "Show my latest orders", query: "Show my latest orders" },
      { label: "Why is my bid blocked?", query: "Why is my bid blocked?" },
      {
        label: "How does checkout work?",
        query: "How does checkout and payment work?",
      },
    ],
  },
  {
    id: "selling",
    label: "Selling & listings",
    description: "Complete onboarding and manage your supply.",
    followUp: "What would you like help with as a seller?",
    inputPlaceholder: "Ask about onboarding, verification or listings…",
    quickReplies: [
      {
        label: "Check my onboarding",
        query: "What is missing from my seller onboarding?",
      },
      { label: "Create a listing", query: "How do I create a seller listing?" },
      { label: "Show my listings", query: "Show my seller listings" },
    ],
  },
  {
    id: "messages",
    label: "Messages & sellers",
    description: "Contact sellers or troubleshoot conversations.",
    followUp: "What do you need help with in messaging?",
    inputPlaceholder: "Ask about contacting a seller or a conversation…",
    quickReplies: [
      { label: "Show my messages", query: "Show my recent messages" },
      { label: "Message a seller", query: "How do I message a seller?" },
      {
        label: "Messaging is not working",
        query: "Seller messaging is not working",
      },
    ],
  },
  {
    id: "account",
    label: "Account & verification",
    description: "Sign-in, profile, KYC and account access.",
    followUp: "Which account or verification task can I help with?",
    inputPlaceholder: "Ask about your account, password or KYC…",
    quickReplies: [
      { label: "Forgot my password", query: "I forgot my password" },
      { label: "Complete KYC", query: "How do I complete KYC verification?" },
      { label: "Check notifications", query: "Show my unread notifications" },
    ],
  },
  {
    id: "support",
    label: "Report a problem",
    description: "Troubleshoot an issue or contact support.",
    followUp:
      "Tell me what went wrong. I’ll troubleshoot it first and escalate if needed.",
    inputPlaceholder: "Describe what happened and any error you saw…",
    quickReplies: [
      {
        label: "Checkout is not working",
        query: "Checkout is not working",
      },
      { label: "I cannot place a bid", query: "I cannot place a bid" },
      { label: "Talk to support", query: "I need to talk to a human agent" },
    ],
  },
];

export function getAssistantTopic(id: AssistantTopicId) {
  return ASSISTANT_TOPICS.find((topic) => topic.id === id) ?? null;
}

export function assistantTopicContext(id: AssistantTopicId) {
  const topic = getAssistantTopic(id);
  return topic
    ? `Selected help area: ${topic.label}. ${topic.description}`
    : null;
}
