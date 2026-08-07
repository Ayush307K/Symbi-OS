"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, KeyRound } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoToken, setDemoToken] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Could not send the reset link.");
      // In sandbox mode the API hands the token back rather than emailing it,
      // since SMTP is not configured. Surfaced plainly rather than hidden, so
      // nobody mistakes a demo affordance for a delivered email.
      setDemoToken(payload.demoPasswordResetToken ?? null);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset link.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We will send a link to the email on your account."
      footer={
        <>
          Remembered it?{" "}
          <Link
            href="/login"
            className="rounded-sm font-medium text-copper-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
          >
            Sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="flex flex-col gap-4">
          {/* Deliberately the same message whether or not the address exists.
              Confirming which emails have accounts is an enumeration channel. */}
          <p className="flex items-start gap-2 rounded-control border border-success-border bg-success-subtle px-3 py-2.5 text-[13px] text-success-strong">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            If an account exists for {email}, a reset link is on its way. The link
            is valid for 30 minutes.
          </p>

          {demoToken ? (
            <div className="rounded-control border border-warning-border bg-warning-subtle p-3">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-warning-strong">
                <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
                Sandbox mode
              </p>
              <p className="mt-1 text-[13px] text-warning-strong">
                Email is not configured, so the token is shown here instead of
                being sent.
              </p>
              <Link
                href={`/reset-password?token=${encodeURIComponent(demoToken)}`}
                className="mt-2 inline-block rounded-sm text-[13px] font-semibold text-copper-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
              >
                Continue to set a new password →
              </Link>
            </div>
          ) : null}

          <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
            Use a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-control border border-danger-border bg-danger-subtle px-3 py-2.5 text-[13px] text-danger-strong"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <Button type="submit" variant="primary" size="lg" fullWidth loading={sending}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
