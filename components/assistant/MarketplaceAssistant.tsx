"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  BookOpen,
  Clock3,
  Headphones,
  History,
  LifeBuoy,
  MessageCircleQuestion,
  MessagesSquare,
  Package,
  Plus,
  ReceiptIndianRupee,
  Search,
  Send,
  Sparkles,
  Store,
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
import {
  ASSISTANT_RESOLUTION,
  ASSISTANT_TOPICS,
  getAssistantTopic,
  type AssistantTopic,
  type AssistantTopicId,
} from "@/lib/assistant-guidance";
import { cn } from "@/lib/cn";
import { externalHttpUrl } from "@/lib/external-url";

const HIDDEN_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];
const GREETING_MESSAGE_ID = "new-conversation-greeting";
const GREETING_MESSAGE = "Hi! I’m Symbi. What can I help you with today?";
type ResolutionState = "prompt" | "complete" | null;

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

function topicSelectionMessages(topic: AssistantTopic): AssistantMessageDto[] {
  const createdAt = new Date().toISOString();
  return [
    {
      id: `topic-selection-${topic.id}`,
      role: "USER",
      content: topic.label,
      citations: [],
      retrieval: null,
      createdAt,
    },
    {
      id: `topic-follow-up-${topic.id}`,
      role: "ASSISTANT",
      content: topic.followUp,
      citations: [],
      retrieval: null,
      createdAt,
    },
  ];
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
  const [selectedTopicId, setSelectedTopicId] =
    useState<AssistantTopicId | null>(null);
  const [draft, setDraft] = useState("");
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [resolutionState, setResolutionState] = useState<ResolutionState>(null);
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
      setSelectedTopicId(null);
      setResolutionState(
        payload.messages.at(-1)?.role === "ASSISTANT" ? "prompt" : null,
      );
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
    setSelectedTopicId(null);
    setResolutionState(null);
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
  }, [messages, open, resolutionState, sending]);

  const openPanel = () => {
    setOpen(true);
    setShowHistory(false);
    setConversationId(null);
    setConversationTitle("New conversation");
    setMessages(user ? [newConversationGreeting()] : []);
    setSelectedTopicId(null);
    setResolutionState(null);
    setDraft("");
    setError(null);
    if (user) void refreshConversations();
  };

  const newConversation = () => {
    setConversationId(null);
    setConversationTitle("New conversation");
    setMessages([newConversationGreeting()]);
    setSelectedTopicId(null);
    setResolutionState(null);
    setDraft("");
    setError(null);
    setShowHistory(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const selectTopic = (topicId: AssistantTopicId) => {
    const topic = getAssistantTopic(topicId);
    if (!topic) return;
    setSelectedTopicId(topic.id);
    setResolutionState(null);
    setMessages([newConversationGreeting(), ...topicSelectionMessages(topic)]);
    setDraft("");
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const resetTopicSelection = () => {
    if (conversationId) return;
    setSelectedTopicId(null);
    setResolutionState(null);
    setMessages([newConversationGreeting()]);
    setDraft("");
    setError(null);
  };

  const sendQuestion = async (suggested?: string) => {
    if (!user || sending) return;
    if (!conversationId && !selectedTopicId) {
      setError("Choose a help topic before asking your question.");
      return;
    }
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
    const priorResolutionState = resolutionState;
    setResolutionState(null);
    setSending(true);
    try {
      const response = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: question,
          ...(selectedTopicId ? { topic: selectedTopicId } : {}),
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
      setResolutionState("prompt");
      void refreshConversations();
    } catch (sendError) {
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticId),
      );
      setDraft(question);
      setResolutionState(priorResolutionState === "prompt" ? "prompt" : null);
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

  const selectedTopic = selectedTopicId
    ? getAssistantTopic(selectedTopicId)
    : null;
  const choosingTopic =
    !conversationId &&
    !selectedTopic &&
    messages.length === 1 &&
    messages[0]?.id === GREETING_MESSAGE_ID;
  const choosingQuestion =
    !conversationId &&
    Boolean(selectedTopic) &&
    messages.length === 3 &&
    messages[0]?.id === GREETING_MESSAGE_ID;

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
                    {choosingTopic ? (
                      <StarterTopics onSelect={selectTopic} />
                    ) : null}
                    {choosingQuestion && selectedTopic ? (
                      <TopicQuickReplies
                        topic={selectedTopic}
                        sending={sending}
                        onSelect={(query) => void sendQuestion(query)}
                        onBack={resetTopicSelection}
                      />
                    ) : null}
                    {resolutionState === "prompt" && !sending ? (
                      <ResolutionPrompt
                        onContinue={newConversation}
                        onFinish={() => setResolutionState("complete")}
                      />
                    ) : null}
                    {resolutionState === "complete" ? (
                      <ResolutionComplete onContinue={newConversation} />
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
                {resolutionState === "complete" ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-ink-500">
                      This request is complete.
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={newConversation}
                    >
                      Ask another question
                    </Button>
                  </div>
                ) : selectedTopic || conversationId ? (
                  <>
                    {selectedTopic ? (
                      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-copper-800">
                        {selectedTopic.label}
                      </p>
                    ) : null}
                    <div className="flex items-end gap-2 rounded-card border border-ink-300 bg-surface-card p-2 focus-within:border-copper-700 focus-within:ring-1 focus-within:ring-copper-700/20">
                      <label
                        htmlFor="symbi-assistant-input"
                        className="sr-only"
                      >
                        Ask Symbi a marketplace question
                      </label>
                      <textarea
                        ref={inputRef}
                        id="symbi-assistant-input"
                        rows={1}
                        maxLength={1000}
                        value={draft}
                        disabled={sending}
                        placeholder={
                          selectedTopic?.inputPlaceholder ??
                          "Ask a follow-up question…"
                        }
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
                      Routed to catalogue, account or support help as needed.
                    </p>
                  </>
                ) : (
                  <p className="text-center text-[11px] text-ink-500">
                    Choose a topic above to get started.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

function ResolutionPrompt({
  onContinue,
  onFinish,
}: {
  onContinue: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="ml-9 mt-4 rounded-card border border-ink-200 bg-surface-sunken p-3">
      <p className="text-[12px] font-semibold text-ink-800">
        {ASSISTANT_RESOLUTION.question}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-full border border-copper-700 bg-copper-700 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-copper-800"
        >
          {ASSISTANT_RESOLUTION.continueLabel}
        </button>
        <button
          type="button"
          onClick={onFinish}
          className="rounded-full border border-ink-300 bg-surface-card px-3 py-1.5 text-[11px] font-semibold text-ink-700 transition-colors hover:border-ink-400 hover:bg-ink-50"
        >
          {ASSISTANT_RESOLUTION.finishLabel}
        </button>
      </div>
    </div>
  );
}

function ResolutionComplete({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="ml-9 mt-4 rounded-card border border-success-border bg-success-subtle p-3">
      <p className="text-[12px] font-medium leading-relaxed text-success-strong">
        {ASSISTANT_RESOLUTION.completedMessage}
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="mt-2 text-[11px] font-semibold text-copper-800 underline-offset-4 hover:underline"
      >
        Start another question
      </button>
    </div>
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

function StarterTopics({
  onSelect,
}: {
  onSelect: (topicId: AssistantTopicId) => void;
}) {
  return (
    <div className="ml-9 mt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
        Choose a topic
      </p>
      <div className="flex flex-col gap-2">
        {ASSISTANT_TOPICS.map((topic) => (
          <TopicButton key={topic.id} topic={topic} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function TopicButton({
  topic,
  onSelect,
}: {
  topic: AssistantTopic;
  onSelect: (topicId: AssistantTopicId) => void;
}) {
  const icons = {
    catalogue: Search,
    orders: ReceiptIndianRupee,
    selling: Store,
    messages: MessagesSquare,
    account: BadgeCheck,
    support: LifeBuoy,
  };
  const Icon = icons[topic.id];
  return (
    <button
      type="button"
      onClick={() => onSelect(topic.id)}
      className="group flex w-full items-center gap-3 rounded-control border border-ink-200 bg-surface-card px-3 py-2.5 text-left transition-colors hover:border-copper-300 hover:bg-copper-50"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-copper-700 group-hover:bg-white">
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-ink-800">
          {topic.label}
        </span>
        <span className="block text-[11px] leading-relaxed text-ink-500">
          {topic.description}
        </span>
      </span>
    </button>
  );
}

function TopicQuickReplies({
  topic,
  sending,
  onSelect,
  onBack,
}: {
  topic: AssistantTopic;
  sending: boolean;
  onSelect: (query: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="ml-9 mt-4 flex flex-col gap-2">
      {topic.quickReplies.map((reply) => (
        <button
          key={reply.label}
          type="button"
          disabled={sending}
          onClick={() => onSelect(reply.query)}
          className="rounded-full border border-copper-200 bg-copper-50 px-3 py-2 text-left text-[12px] font-medium text-copper-900 transition-colors hover:border-copper-400 hover:bg-copper-100 disabled:opacity-50"
        >
          {reply.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onBack}
        className="mt-1 self-start text-[11px] font-semibold text-ink-500 underline-offset-4 hover:text-ink-800 hover:underline"
      >
        Choose another topic
      </button>
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
  const hasListingCitations = message.citations.some(
    (citation) => citation.sourceType === "LISTING",
  );
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
                content={
                  hasListingCitations
                    ? conciseListingAnswer(message.content)
                    : message.content
                }
                citations={message.citations}
              />
              {message.retrieval?.mode === "support" && message.citations[0] ? (
                <SupportTicketLink citation={message.citations[0]} />
              ) : (
                <>
                  <ListingCitationTable citations={message.citations} />
                  <CitationList citations={message.citations} />
                </>
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

function conciseListingAnswer(content: string) {
  const concise = content
    .split("\n")
    .filter((line) => !/^\s*(?:[-*]\s*)?listing:/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return concise || "Here are the most relevant listings I found.";
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
            if (citation?.sourceType === "LISTING") {
              return <span key={`${part}-${index}`} />;
            }
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

function formatListingPrice(citation: AssistantCitation) {
  const listing = citation.listing;
  if (!listing || listing.priceMode === "ON_REQUEST") return "Quote";
  const price = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: listing.currency,
    maximumFractionDigits: 0,
  }).format(listing.pricePerUnit);
  return `${price}/${listing.priceBasisUnit || listing.unit}`;
}

function ListingThumbnail({ src }: { src: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-copper-50 text-copper-700">
        <Package aria-hidden="true" className="h-4 w-4" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-10 w-10 shrink-0 rounded-control border border-ink-200 object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function ListingCitationTable({
  citations,
}: {
  citations: AssistantCitation[];
}) {
  const listings = citations.filter(
    (citation) => citation.sourceType === "LISTING",
  );
  if (!listings.length) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-card border border-ink-200 bg-surface-card">
      <table className="w-full table-fixed text-left">
        <caption className="sr-only">Recommended marketplace listings</caption>
        <colgroup>
          <col />
          <col className="w-[72px]" />
          <col className="w-8" />
        </colgroup>
        <thead className="border-b border-ink-200 bg-surface-sunken">
          <tr className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-500">
            <th scope="col" className="px-2.5 py-2">
              Listing
            </th>
            <th scope="col" className="px-1.5 py-2 text-right">
              Price · stock
            </th>
            <th scope="col" className="py-2 pr-2">
              <span className="sr-only">Open listing</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200">
          {listings.map((citation) => {
            const href = citationHref(citation);
            const listing = citation.listing;
            const meta = listing
              ? [listing.sellerName, listing.location]
                  .filter(Boolean)
                  .join(" · ")
              : citation.excerpt;
            return (
              <tr
                key={citation.id}
                className="align-middle hover:bg-copper-50/50"
              >
                <td className="min-w-0 px-2.5 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <ListingThumbnail src={listing?.imageUrl} />
                    <div className="min-w-0">
                      {href ? (
                        <Link
                          href={href}
                          target={href.startsWith("/") ? undefined : "_blank"}
                          rel={
                            href.startsWith("/")
                              ? undefined
                              : "noreferrer noopener"
                          }
                          className="line-clamp-2 text-[11px] font-semibold leading-snug text-ink-900 hover:text-copper-800 hover:underline"
                        >
                          {citation.title}
                        </Link>
                      ) : (
                        <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-ink-900">
                          {citation.title}
                        </p>
                      )}
                      <p className="mt-0.5 truncate text-[9.5px] text-ink-500">
                        {meta}
                      </p>
                      {listing ? (
                        <p className="mt-1 flex items-center gap-1 text-[9px] font-semibold text-ink-500">
                          {listing?.verified ? (
                            <BadgeCheck
                              aria-hidden="true"
                              className="h-3 w-3 text-success-strong"
                            />
                          ) : null}
                          {listing.listingMode === "MANAGED" && listing.verified
                            ? "Verified SymbiOS seller"
                            : listing.listingMode === "MANAGED"
                              ? "Seller unavailable"
                              : listing.listingMode === "EVAL"
                                ? "Synthetic demo listing"
                                : "External source"}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-1.5 py-2.5 text-right align-middle">
                  <p className="prose-numerals text-[10.5px] font-bold text-ink-900">
                    {formatListingPrice(citation)}
                  </p>
                  {listing ? (
                    <>
                      <p className="prose-numerals mt-0.5 text-[9px] text-ink-500">
                        {listing.quantityAvailable.toLocaleString("en-IN")}{" "}
                        {listing.unit}
                      </p>
                      <p className="prose-numerals text-[8.5px] text-ink-400">
                        MOQ {listing.minOrderQuantity.toLocaleString("en-IN")}
                      </p>
                    </>
                  ) : (
                    <p className="mt-0.5 text-[9px] text-ink-400">Details</p>
                  )}
                </td>
                <td className="py-2.5 pr-2 text-right align-middle">
                  {href ? (
                    <Link
                      href={href}
                      target={href.startsWith("/") ? undefined : "_blank"}
                      rel={
                        href.startsWith("/") ? undefined : "noreferrer noopener"
                      }
                      aria-label={`View ${citation.title}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-copper-700 hover:bg-copper-100"
                    >
                      <ArrowUpRight
                        aria-hidden="true"
                        className="h-3.5 w-3.5"
                      />
                    </Link>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  const realCitations = citations.filter(
    (citation) => !citation.isEvalOnly && citation.sourceType !== "LISTING",
  );
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
