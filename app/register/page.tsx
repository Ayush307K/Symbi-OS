"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { cn } from "@/lib/cn";

const ROLES = [
  { value: "BUYER", label: "I'm buying", hint: "Source secondary materials" },
  { value: "SELLER", label: "I'm selling", hint: "List by-products" },
  { value: "BOTH", label: "Both", hint: "Buy and sell" },
] as const;

export default function RegisterPage() {
  const { register, error, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [role, setRole] = useState<"BUYER" | "SELLER" | "BOTH">("BOTH");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await register({
      email,
      password,
      companyName,
      industry: industry || undefined,
      role,
    });
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Create transparent deal flow for scrap and by-products."
      footer={
        <>
          Already registered?{" "}
          <Link
            href="/login"
            className="rounded-sm font-medium text-copper-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-control border border-danger-border bg-danger-subtle px-3 py-2.5 text-[13px] text-danger-strong"
          >
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            {error}
          </p>
        ) : null}

        {/* Role as a radio group, not a select: three options that change what
            the rest of the product does deserve to be visible, not hidden. */}
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink-700">
            Account role
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "cursor-pointer rounded-control border px-2.5 py-2 text-center transition-colors",
                  "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-copper-700",
                  role === option.value
                    ? "border-copper-700 bg-copper-50"
                    : "border-ink-200 bg-surface-card hover:border-ink-300",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  checked={role === option.value}
                  onChange={() => setRole(option.value)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "block text-[13px] font-semibold",
                    role === option.value ? "text-copper-800" : "text-ink-900",
                  )}
                >
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-tight text-ink-500">
                  {option.hint}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Input
          label="Company name"
          required
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
        />
        <Input
          label="Industry"
          hint="Optional."
          value={industry}
          onChange={(event) => setIndustry(event.target.value)}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <PasswordInput
          label="Password"
          autoComplete="new-password"
          required
          hint="At least 12 characters."
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={isLoading}
        >
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
