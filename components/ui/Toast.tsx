"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

type ToastInput = Omit<Toast, "id"> & { duration?: number };

interface ToastContextValue {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Wrap the app once, near the root. Mount it inside components/Providers.tsx
 * when the surfaces migrate; until then the style guide mounts its own.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ duration = 5000, ...input }: ToastInput) => {
      const id = Math.random().toString(36).slice(2, 10);
      setToasts((current) => [...current, { ...input, id }]);
      // Errors persist: a failed action must not disappear before it is read.
      if (duration > 0 && input.tone !== "danger") {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider.");
  }
  return context;
}

const toneStyles: Record<ToastTone, { wrap: string; icon: ReactNode }> = {
  info: {
    wrap: "border-ink-200 bg-surface-card text-ink-900",
    icon: <Info className="h-4 w-4 text-ink-500" />,
  },
  success: {
    wrap: "border-success-border bg-success-subtle text-success-strong",
    icon: <CheckCircle2 className="h-4 w-4 text-success" />,
  },
  warning: {
    wrap: "border-warning-border bg-warning-subtle text-warning-strong",
    icon: <AlertTriangle className="h-4 w-4 text-warning" />,
  },
  danger: {
    wrap: "border-danger-border bg-danger-subtle text-danger-strong",
    icon: <XCircle className="h-4 w-4 text-danger" />,
  },
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      // Polite: a toast should not interrupt what is being read. Errors that
      // must interrupt belong inline on the control that failed.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:items-end"
    >
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <motion.div
            key={item.id}
            layout={!reduceMotion}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 12, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-control border px-4 py-3 shadow-raised",
              toneStyles[item.tone].wrap,
            )}
          >
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              {toneStyles[item.tone].icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-[13px] opacity-80">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label={`Dismiss: ${item.title}`}
              className={cn(
                "-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full opacity-60",
                "transition-opacity duration-[120ms] hover:opacity-100",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper-700",
              )}
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default ToastProvider;
