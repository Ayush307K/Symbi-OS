"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";

export interface CounterOffer {
  quantity: number;
  pricePerUnit: number;
  terms?: string;
}

export interface CounterOfferDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (counter: CounterOffer) => void;
  submitting?: boolean;
  /** The offer being countered, used to seed the fields and show the delta. */
  current: {
    quantity: number;
    pricePerUnit: number;
    unit: string;
    title?: string;
  } | null;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

/**
 * Countering an offer, in the product rather than in a browser prompt.
 *
 * window.prompt was doing this: two blocking dialogs in sequence, titled
 * "localhost says", with no validation, no way to see what was being countered,
 * no terms field, and a cancel that returned null and produced NaN. It also
 * cannot be styled, so the most delicate moment in a negotiation looked like a
 * browser fault.
 */
export function CounterOfferDialog({
  open,
  onClose,
  onSubmit,
  submitting = false,
  current,
}: CounterOfferDialogProps) {
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [terms, setTerms] = useState("");

  useEffect(() => {
    if (open && current) {
      setQuantity(String(current.quantity));
      setPrice(String(current.pricePerUnit));
      setTerms("");
    }
  }, [open, current]);

  const quantityValue = Number(quantity);
  const priceValue = Number(price);

  const quantityError =
    quantity.trim() === ""
      ? "Enter a quantity."
      : !Number.isInteger(quantityValue) || quantityValue <= 0
        ? "Enter a whole number greater than zero."
        : null;

  const priceError =
    price.trim() === ""
      ? "Enter a price."
      : !Number.isFinite(priceValue) || priceValue <= 0
        ? "Enter a price greater than zero."
        : null;

  const valid = !quantityError && !priceError && current;
  const newTotal = valid ? quantityValue * priceValue : 0;
  const oldTotal = current ? current.quantity * current.pricePerUnit : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Counter this offer"
      description={current?.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={!valid}
            title={quantityError ?? priceError ?? undefined}
            onClick={() =>
              valid &&
              onSubmit({
                quantity: quantityValue,
                pricePerUnit: priceValue,
                terms: terms.trim() || undefined,
              })
            }
          >
            Send counter
          </Button>
        </>
      }
    >
      {current ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between rounded-control border border-ink-200 bg-surface-sunken px-3 py-2.5">
            <span className="text-[13px] text-ink-500">Current offer</span>
            <span className="text-sm font-semibold text-ink-900">
              {current.quantity} {current.unit} × {money(current.pricePerUnit)} ={" "}
              {money(oldTotal)}
            </span>
          </div>

          <Input
            label="Quantity"
            type="number"
            inputMode="numeric"
            min={1}
            value={quantity}
            suffix={current.unit}
            error={quantityError ?? undefined}
            onChange={(event) => setQuantity(event.target.value)}
          />

          <Input
            label={`Price per ${current.unit}`}
            type="number"
            inputMode="decimal"
            min={0}
            value={price}
            suffix="₹"
            error={priceError ?? undefined}
            onChange={(event) => setPrice(event.target.value)}
          />

          <Textarea
            label="Terms"
            rows={3}
            placeholder="What changed, and why."
            hint="Optional."
            value={terms}
            onChange={(event) => setTerms(event.target.value)}
          />

          {valid ? (
            <div className="flex items-baseline justify-between border-t border-ink-200 pt-3">
              <span className="text-[13px] text-ink-500">Your counter</span>
              <span className="text-lg font-semibold text-ink-900">
                {money(newTotal)}
                {newTotal !== oldTotal ? (
                  <span
                    className={
                      newTotal > oldTotal
                        ? "ml-2 text-[12px] font-medium text-brand"
                        : "ml-2 text-[12px] font-medium text-warning"
                    }
                  >
                    {newTotal > oldTotal ? "+" : ""}
                    {money(newTotal - oldTotal)}
                  </span>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

export default CounterOfferDialog;
