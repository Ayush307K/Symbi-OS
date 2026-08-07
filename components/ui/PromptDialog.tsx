"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { Textarea } from "./Textarea";

export interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  /** When true the dialog cannot be submitted empty. */
  required?: boolean;
  confirmLabel?: string;
  /** Destructive confirmations get the danger treatment. */
  tone?: "primary" | "danger";
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
}

/**
 * Collects one piece of free text — a note, a reason, an explanation.
 *
 * Replaces window.prompt, which blocks the page, is titled "localhost says",
 * cannot be styled or validated, returns null on cancel in a way that silently
 * became NaN or "undefined" downstream, and looks like a browser fault at the
 * exact moments that need to feel deliberate: cancelling an order, opening a
 * dispute, rejecting a seller.
 */
export function PromptDialog({
  open,
  title,
  description,
  label,
  placeholder,
  required = false,
  confirmLabel = "Submit",
  tone = "primary",
  submitting = false,
  onClose,
  onSubmit,
}: PromptDialogProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  const error = required && value.trim() === "" ? `${label} is required.` : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={tone}
            loading={submitting}
            disabled={Boolean(error)}
            title={error ?? undefined}
            onClick={() => !error && onSubmit(value.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Textarea
        label={label}
        rows={4}
        placeholder={placeholder}
        value={value}
        error={error ?? undefined}
        hint={error ? undefined : required ? undefined : "Optional."}
        onChange={(event) => setValue(event.target.value)}
      />
    </Modal>
  );
}

export default PromptDialog;
