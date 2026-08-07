"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const { login, error, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await login(email, password);
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Trade secondary raw materials with verified counterparties."
      footer={
        <>
          No account yet?{" "}
          <Link
            href="/register"
            className="rounded-sm font-medium text-copper-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
          >
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Server-side failures land here, not on a field: the API does not say
            which credential was wrong, and guessing would be misleading. */}
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
        <div>
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Link
            href="/forgot-password"
            className="mt-1.5 inline-block rounded-sm text-[12.5px] font-medium text-ink-500 underline-offset-2 hover:text-copper-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
          >
            Forgot your password?
          </Link>
        </div>

        <Button type="submit" variant="primary" size="lg" fullWidth loading={isLoading}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
