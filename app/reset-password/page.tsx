"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Checked here so the mismatch is caught before a round trip; the API
  // enforces length, character classes, and breached-password rejection.
  const mismatch =
    confirm.length > 0 && password !== confirm ? "The passwords do not match." : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Could not reset the password.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password.");
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <AuthShell
        title="That link is incomplete"
        subtitle="The reset link is missing its token, so it cannot be used."
        footer={
          <Link
            href="/forgot-password"
            className="rounded-sm font-medium text-copper-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
          >
            Request a new link
          </Link>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-500">
          Reset links expire after 30 minutes and can be used once. Requesting a
          new one takes a moment.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={done ? "Password changed" : "Set a new password"}
      subtitle={
        done
          ? "Every existing session has been signed out."
          : "Choose something you have not used elsewhere."
      }
      footer={
        <Link
          href="/login"
          className="rounded-sm font-medium text-copper-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
        >
          Go to sign in
        </Link>
      }
    >
      {done ? (
        <div className="flex flex-col gap-4">
          {/* Confirming the reset increments tokenVersion server-side, which
              invalidates every issued token — stated because being signed out
              everywhere is surprising if it is not explained. */}
          <p className="flex items-start gap-2 rounded-control border border-success-border bg-success-subtle px-3 py-2.5 text-[13px] text-success-strong">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            Your password is updated. Anyone signed in with the old password,
            on any device, has been signed out.
          </p>
          <Button variant="primary" size="lg" fullWidth onClick={() => router.push("/login")}>
            Sign in
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
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 12 characters, with upper and lower case and a number."
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            error={mismatch ?? undefined}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={saving}
            disabled={Boolean(mismatch) || password.length === 0}
          >
            Change password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
