"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  BookOpen,
  Clock3,
  Headphones,
  History,
  MessageCircleQuestion,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/context/AuthContext";
import type {
  AssistantCitation,
  AssistantConversationSummary,
  AssistantMessageDto,
} from "@/lib/assistant-types";
import { cn } from "@/lib/cn";
import { externalHttpUrl } from "@/lib/external-url";

const HIDDEN_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];
const SUGGESTIONS = [
  "Find HDPE scrap suppliers near Pune",
  "Compare PET bottle scrap options",
  "How do I place a bid?",
];
const GREETING_MESSAGE_ID = "new-conversation-greeting";
const GREETING_MESSAGE =
  "Hi! I’m Symbi. What material are you looking for, or how can I help with your account?";

function newConversationGreeting(): AssistantMessageDto {
  return {
    id: GREETING_MESSAGE_ID,
    role: "ASSISTANT",
    content: GREETING_MESSAGE,
    citations: [],
    retrieval: null,
    createdAt: new Date().toISOString(),
  };
}

interface ConversationResponse {
  conversation: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  messages: AssistantMessageDto[];
}

interface QueryResponse {
  conversation: ConversationResponse["conversation"];
  userMessage: AssistantMessageDto;
  assistantMessage: AssistantMessageDto;
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "The marketplace assistant is unavailable.",
    );
  }
  return payload as T;
}

export function MarketplaceAssistant() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<
    AssistantConversationSummary[]
  >([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] =
    useState("New conversation");
  const [messages, setMessages] = useState<AssistantMessageDto[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const previousUserId = useRef<string | null>(null);

  const loadConversation = useCallback(async (id: string) => {
    setLoadingConversation(true);
    setError(null);
    try {
      const response = await fetch(`/api/assistant/conversations/${id}`, {
        cache: "no-store",
      });
      const payload = await responseJson<ConversationResponse>(response);
      setConversationId(payload.conversation.id);
      setConversationTitle(payload.conversation.title);
      setMessages(payload.messages);
      setShowHistory(false);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load this conversation.",
      );
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/assistant/conversations", {
        cache: "no-store",
      });
      const payload = await responseJson<{
        items: AssistantConversationSummary[];
      }>(response);
      setConversations(payload.items);
    } catch (historyError) {
      setError(
        historyError instanceof Error
          ? historyError.message
          : "Unable to load assistant history.",
      );
    }
  }, [user]);

  useEffect(() => {
    const nextUserId = user?.id ?? null;
    if (previousUserId.current === nextUserId) return;
    previousUserId.current = nextUserId;
    setConversations([]);
    setConversationId(null);
    setConversationTitle("New conversation");
    setMessages(nextUserId ? [newConversationGreeting()] : []);
    setError(null);
    if (open && user) void refreshConversations();
  }, [open, refreshConversations, user]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      cancelAnimationFrame(frame);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open, sending]);

  const openPanel = () => {
    setOpen(true);
    setShowHistory(false);
    setConversationId(null);
    setConversationTitle("New conversation");
    setMessages(user ? [newConversationGreeting()] : []);
    setDraft("");
    setError(null);
    if (user) void refreshConversations();
  };

  const newConversation = () => {
    setConversationId(null);
    setConversationTitle("New conversation");
    setMessages([newConversationGreeting()]);
    setDraft("");
    setError(null);
    setShowHistory(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const sendQuestion = async (suggested?: string) => {
    if (!user || sending) return;
    const question = (suggested ?? draft).replace(/\s+/g, " ").trim();
    if (question.length < 3) {
      setError("Ask a marketplace question using at least 3 characters.");
      return;
    }
    const optimisticId = `pending-${crypto.randomUUID()}`;
    const optimistic: AssistantMessageDto = {
      id: optimisticId,
      role: "USER",
      content: question,
      citations: [],
      retrieval: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setDraft("");
    setError(null);
    setSending(true);
    try {
      const response = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: question,
          ...(conversationId ? { conversationId } : {}),
        }),
      });
      const payload = await responseJson<QueryResponse>(response);
      setConversationId(payload.conversation.id);
      setConversationTitle(payload.conversation.title);
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimisticId),
        payload.userMessage,
        payload.assistantMessage,
      ]);
      void refreshConversations();
    } catch (sendError) {
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticId),
      );
      setDraft(question);
      setError(
        sendError instanceof Error
          ? sendError.message
          : "The marketplace assistant could not answer.",
      );
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendQuestion();
    }
  };

  if (HIDDEN_PATHS.some((path) => pathname.startsWith(path))) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={openPanel}
          aria-label="Open Symbi marketplace assistant"
          className={cn(
            "fixed bottom-4 right-4 z-50 flex h-12 items-center gap-2 rounded-full",
            "border border-copper-800 bg-copper-700 px-4 text-sm font-semibold text-white shadow-overlay",
            "transition-colors duration-[120ms] hover:bg-copper-800",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700",
            "sm:bottom-5 sm:right-5",
          )}
        >
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          Ask Symbi
        </button>
      ) : (
        <section
          role="dialog"
          aria-label="Symbi marketplace assistant"
          className={cn(
            "fixed inset-x-3 bottom-3 top-3 z-[55] flex flex-col overflow-hidden",
            "rounded-card border border-ink-200 bg-surface-card shadow-overlay",
            "sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(720px,calc(100vh-40px))] sm:w-[430px]",
          )}
        >
          <header className="flex items-center gap-3 border-b border-ink-200 px-3 py-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-copper-700 text-white"
            >
              <Bot className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-ink-900">
                Symbi
              </h2>
              <p className="truncate text-[12px] text-ink-500">
                {conversationTitle}
              </p>
            </div>
            {user ? (
              <IconButton
                icon={<History className="h-4 w-4" />}
                label="Conversation history"
                variant={showHistory ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={showHistory}
                onClick={() => setShowHistory((current) => !current)}
              />
            ) : null}
            <IconButton
              icon={<Plus className="h-4 w-4" />}
              label="New conversation"
              variant="ghost"
              size="sm"
              onClick={newConversation}
              disabled={!user}
            />
            <IconButton
              icon={<X className="h-4 w-4" />}
              label="Close assistant"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            />
          </header>

          {!user ? (
            <SignedOutState
              onSignIn={() => {
                setOpen(false);
                router.push("/login");
              }}
              onRegister={() => {
                setOpen(false);
                router.push("/register");
              }}
            />
          ) : showHistory ? (
            <HistoryView
              conversations={conversations}
              activeId={conversationId}
              loading={loadingConversation}
              onSelect={(id) => void loadConversation(id)}
              onNew={newConversation}
            />
          ) : (
            <>
              <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
                {loadingConversation ? (
                  <div className="flex h-full items-center justify-center text-ink-500">
                    <Spinner label="Loading conversation" />
                  </div>
                ) : (
                  <>
                    <ol className="flex flex-col gap-4" aria-live="polite">
                      {messages.map((message) => (
                        <ChatMessage key={message.id} message={message} />
                      ))}
                      {sending ? <ThinkingMessage /> : null}
                    </ol>
                    {messages.length === 1 &&
                    messages[0]?.id === GREETING_MESSAGE_ID ? (
                      <StarterSuggestions
                        onSelect={(query) => void sendQuestion(query)}
                      />
                    ) : null}
                  </>
                )}
                <div ref={endRef} />
              </div>

              <div className="border-t border-ink-200 bg-surface-card p-3">
                {error ? (
                  <div
                    role="alert"
                    className="mb-2 flex items-start gap-2 rounded-control border border-danger-border bg-danger-subtle px-3 py-2 text-[12px] leading-relaxed text-danger-strong"
                  >
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    />
                    <span>{error}</span>
                  </div>
                ) : null}
                <div className="flex items-end gap-2 rounded-card border border-ink-300 bg-surface-card p-2 focus-within:border-copper-700 focus-within:ring-1 focus-within:ring-copper-700/20">
                  <label htmlFor="symbi-assistant-input" className="sr-only">
                    Ask Symbi a marketplace question
                  </label>
                  <textarea
                    ref={inputRef}
                    id="symbi-assistant-input"
                    rows={1}
                    maxLength={1000}
                    value={draft}
                    disabled={sending}
                    placeholder="Ask about listings or how SymbiOS works…"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    className="scrollbar-thin max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-[13px] leading-relaxed text-ink-900 outline-none placeholder:text-ink-400 disabled:opacity-60"
                  />
                  <IconButton
                    icon={
                      sending ? (
                        <Spinner size="sm" label={null} />
                      ) : (
                        <Send className="h-4 w-4" />
                      )
                    }
                    label="Send question"
                    variant="primary"
                    size="sm"
                    disabled={sending || draft.trim().length < 3}
                    onClick={() => void sendQuestion()}
                  />
                </div>
                <p className="mt-1.5 text-center text-[10.5px] leading-relaxed text-ink-400">
                  Grounded in the current catalogue and verified SymbiOS product
                  guidance.
                </p>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

function SignedOutState({
  onSignIn,
  onRegister,
}: {
  onSignIn: () => void;
  onRegister: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-ink-200 bg-surface-sunken text-copper-700"
      >
        <MessageCircleQuestion className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink-900">
        Research the marketplace with Symbi
      </h3>
      <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-500">
        Sign in to ask grounded questions, compare current listings, and keep
        your conversation history.
      </p>
      <div className="mt-5 flex gap-2">
        <Button variant="secondary" size="sm" onClick={onSignIn}>
          Sign in
        </Button>
        <Button variant="primary" size="sm" onClick={onRegister}>
          Create account
        </Button>
      </div>
    </div>
  );
}

function StarterSuggestions({
  onSelect,
}: {
  onSelect: (query: string) => void;
}) {
  return (
    <div className="ml-9 mt-4 flex flex-col gap-2">
      {SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onSelect(suggestion)}
          className="rounded-control border border-ink-200 bg-surface-card px-3 py-2.5 text-left text-[13px] font-medium text-ink-700 transition-colors hover:border-ink-300 hover:bg-ink-50"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

function HistoryView({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
}: {
  conversations: AssistantConversationSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto p-3">
      <Button
        variant="secondary"
        size="sm"
        fullWidth
        onClick={onNew}
        leadingIcon={<Plus className="h-4 w-4" />}
      >
        New conversation
      </Button>
      <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
        Recent conversations
      </p>
      {loading ? (
        <div className="flex justify-center py-8 text-ink-500">
          <Spinner label="Loading conversation" />
        </div>
      ) : conversations.length ? (
        <ul className="flex flex-col gap-1">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  "w-full rounded-control px-3 py-2.5 text-left transition-colors",
                  activeId === conversation.id
                    ? "bg-copper-50 text-copper-900"
                    : "text-ink-700 hover:bg-ink-50",
                )}
              >
                <span className="block truncate text-[13px] font-medium">
                  {conversation.title}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500">
                  <Clock3 aria-hidden="true" className="h-3 w-3" />
                  {new Date(conversation.updatedAt).toLocaleDateString(
                    "en-IN",
                    {
                      day: "numeric",
                      month: "short",
                    },
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-control border border-dashed border-ink-300 px-4 py-8 text-center text-[13px] text-ink-500">
          Your saved conversations will appear here.
        </p>
      )}
    </div>
  );
}

function ChatMessage({ message }: { message: AssistantMessageDto }) {
  const assistant = message.role === "ASSISTANT";
  return (
    <li className={cn("flex", assistant ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[92%] text-[13px] leading-relaxed",
          assistant
            ? "text-ink-700"
            : "rounded-card bg-ink-900 px-3 py-2.5 text-white",
        )}
      >
        {assistant ? (
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-copper-50 text-copper-700"
            >
              <Bot className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <AnswerText
                content={message.content}
                citations={message.citations}
              />
              {message.retrieval?.mode === "support" && message.citations[0] ? (
                <SupportTicketLink citation={message.citations[0]} />
              ) : (
                <CitationList citations={message.citations} />
              )}
              {message.retrieval ? (
                <p className="mt-2 flex items-center gap-1 text-[10.5px] text-ink-400">
                  <BookOpen aria-hidden="true" className="h-3 w-3" />
                  {message.retrieval.mode === "platform"
                    ? "Verified SymbiOS product guide"
                    : message.retrieval.mode === "account"
                      ? "Your live SymbiOS account"
                      : message.retrieval.mode === "support"
                        ? "Escalated to SymbiOS support"
                        : message.retrieval.mode === "tool"
                          ? `Live SymbiOS data${message.retrieval.toolName ? ` · ${toolLabel(message.retrieval.toolName)}` : ""}`
                          : message.retrieval.resultCount
                            ? `Grounded in ${message.retrieval.resultCount} catalogue source${message.retrieval.resultCount === 1 ? "" : "s"}`
                            : "No sufficiently relevant catalogue source"}
                  {message.retrieval.degraded ? " · lexical fallback" : ""}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="prose-numerals whitespace-pre-wrap">
            {message.content}
          </p>
        )}
      </div>
    </li>
  );
}

function toolLabel(toolName: string) {
  const labels: Record<string, string> = {
    search_listings: "catalogue search",
    get_listing_details: "listing details",
    get_my_orders: "your orders",
    get_my_bids: "your bids",
    diagnose_my_bid: "bid diagnosis",
    get_my_messages: "your messages",
    get_seller_onboarding_status: "seller onboarding",
    get_my_support_tickets: "support cases",
  };
  return labels[toolName] ?? "account lookup";
}

function SupportTicketLink({ citation }: { citation: AssistantCitation }) {
  const href = citationHref(citation);
  if (!href) return null;
  return (
    <Link
      href={href}
      className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-control border border-copper-700 bg-copper-700 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-copper-800"
    >
      <Headphones aria-hidden="true" className="h-3.5 w-3.5" />
      Track support ticket
    </Link>
  );
}

function AnswerText({
  content,
  citations,
}: {
  content: string;
  citations: AssistantCitation[];
}) {
  const citationById = new Map(
    citations.map((citation) => [citation.id, citation]),
  );
  return (
    <div className="prose-numerals flex flex-col gap-2 whitespace-pre-wrap">
      {content.split("\n").map((line, lineIndex) => (
        <p key={`${lineIndex}-${line.slice(0, 16)}`}>
          {line.split(/(\[S\d+\])/g).map((part, index) => {
            const id = /^\[(S\d+)\]$/.exec(part)?.[1];
            const citation = id ? citationById.get(id) : null;
            return citation ? (
              <CitationToken key={`${part}-${index}`} citation={citation}>
                {id}
              </CitationToken>
            ) : (
              <span key={`${part}-${index}`}>{part}</span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

function citationHref(citation: AssistantCitation) {
  if (citation.sourceId)
    return `/products/${encodeURIComponent(citation.sourceId)}`;
  if (citation.url?.startsWith("/") && !citation.url.startsWith("//")) {
    return citation.url;
  }
  return externalHttpUrl(citation.url);
}

function CitationToken({
  citation,
  children,
}: {
  citation: AssistantCitation;
  children: ReactNode;
}) {
  const href = citationHref(citation);
  if (!href)
    return <span className="font-semibold text-copper-700">[{children}]</span>;
  return (
    <Link
      href={href}
      target={href.startsWith("/") ? undefined : "_blank"}
      rel={href.startsWith("/") ? undefined : "noreferrer noopener"}
      title={citation.title}
      className="mx-0.5 inline-flex rounded-sm bg-copper-50 px-1 py-0.5 text-[10px] font-bold leading-none text-copper-800 hover:bg-copper-100"
    >
      {children}
    </Link>
  );
}

function CitationList({ citations }: { citations: AssistantCitation[] }) {
  const realCitations = citations.filter((citation) => !citation.isEvalOnly);
  if (!realCitations.length) return null;
  return (
    <details className="mt-3 rounded-control border border-ink-200 bg-surface-sunken/60">
      <summary className="cursor-pointer select-none px-2.5 py-2 text-[11px] font-semibold text-ink-600">
        {realCitations.length} source{realCitations.length === 1 ? "" : "s"}
      </summary>
      <ul className="border-t border-ink-200 px-2.5 py-1.5">
        {realCitations.map((citation) => {
          const href = citationHref(citation);
          return (
            <li
              key={citation.id}
              className="border-b border-ink-200 py-2 last:border-0"
            >
              {href ? (
                <Link
                  href={href}
                  target={href.startsWith("/") ? undefined : "_blank"}
                  rel={href.startsWith("/") ? undefined : "noreferrer noopener"}
                  className="line-clamp-2 text-[11.5px] font-medium leading-snug text-copper-800 hover:underline"
                >
                  {citation.id} · {citation.title}
                </Link>
              ) : (
                <p className="line-clamp-2 text-[11.5px] font-medium text-ink-700">
                  {citation.id} · {citation.title}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function ThinkingMessage() {
  return (
    <li
      className="flex items-center gap-2 text-[12px] text-ink-500"
      role="status"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-copper-50 text-copper-700">
        <Bot aria-hidden="true" className="h-3.5 w-3.5" />
      </span>
      <Spinner size="sm" label={null} />
      Researching the catalogue…
    </li>
  );
}

export default MarketplaceAssistant;
