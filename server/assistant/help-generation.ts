import type { PlatformHelpAnswer } from "@/server/assistant/platform-help";
import type { RagConversationTurn } from "@/server/rag/query";
import { getGenerationProvider } from "@/server/rag/generation";

/**
 * Turn verified product guidance into a contextual support response when a
 * generation provider is available. The model may change presentation, not
 * facts or product state; local development keeps the deterministic answer.
 */
export async function contextualizeHelpAnswer(
  query: string,
  base: PlatformHelpAnswer,
  history: RagConversationTurn[],
): Promise<PlatformHelpAnswer> {
  const provider = getGenerationProvider();
  if (!provider.isConfigured()) return base;

  try {
    const answer = await provider.generate({
      instructions:
        "You are Symbi, a concise product support agent for SymbiOS. Answer the user's current message using only VERIFIED_GUIDANCE. Use RECENT_CONVERSATION only to understand intent and constraints, never as factual evidence. Start with the direct answer. Use at most 70 words and at most 3 short bullets; never write a long paragraph. Do not repeat the previous answer. Never claim an action, ticket, payment, verification, refund, or account change occurred unless VERIFIED_GUIDANCE says it did. If the guidance cannot solve the constraint, state what cannot be bypassed and offer a support ticket. Do not add facts, policies, URLs, or requirements.",
      prompt: `RECENT_CONVERSATION:\n${JSON.stringify(
        history.slice(-6).map((turn) => ({
          role: turn.role,
          content: turn.content.slice(0, 1200),
        })),
      )}\n\nCURRENT_MESSAGE:\n${query}\n\nVERIFIED_GUIDANCE:\n${base.answer}`,
    });
    return answer ? { ...base, answer } : base;
  } catch (error) {
    console.warn(
      "[assistant] contextual help generation unavailable:",
      error instanceof Error ? error.message : "unknown provider error",
    );
    return base;
  }
}
