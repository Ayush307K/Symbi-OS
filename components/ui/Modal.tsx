"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./Button";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Right-aligned action row. Put the primary commit action last. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Set false for destructive confirmations that need a deliberate choice. */
  dismissible?: boolean;
}

const sizes = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      // Keep focus inside the dialog: wrap at both ends.
      const nodes = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((node) => node.offsetParent !== null);
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [dismissible, onClose],
  );

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown, true);

    // Focus the first control, or the panel itself when there is none.
    const frame = requestAnimationFrame(() => {
      const target =
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
        panelRef.current;
      target?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = overflow;
      // Return focus to whatever opened the dialog.
      restoreTo.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={dismissible ? onClose : undefined}
            className="absolute inset-0 bg-ink-950/40"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden",
              "rounded-t-card border border-ink-200 bg-surface-card shadow-overlay sm:rounded-card",
              sizes[size],
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-semibold text-ink-900">
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-0.5 text-[13px] text-ink-500">
                    {description}
                  </p>
                ) : null}
              </div>
              {dismissible ? (
                <IconButton
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  icon={<X className="h-4 w-4" />}
                  label="Close dialog"
                  className="-mr-1.5 -mt-1"
                />
              ) : null}
            </div>

            {children ? (
              <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">
                {children}
              </div>
            ) : null}

            {footer ? (
              <div className="flex items-center justify-end gap-2 border-t border-ink-200 bg-surface-sunken/60 px-5 py-3">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export default Modal;
