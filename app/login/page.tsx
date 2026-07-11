"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Loader2, Lock, Mail, Recycle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login, error, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await login(email, password);
  }

  return (
    <main className="grid min-h-screen bg-[#f4f2ed] lg:grid-cols-[1fr_520px]">
      <section className="hidden border-r border-stone-200 bg-[#fbfaf7] p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-800 text-white">
            <Recycle size={20} />
          </div>
          <div>
            <p className="text-lg font-semibold text-stone-950">Symbi-OS</p>
            <p className="text-sm text-stone-500">Industrial materials marketplace</p>
          </div>
        </div>

        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
            Karnataka pilot
          </p>
          <h1 className="mt-3 text-5xl font-semibold tracking-tight text-stone-950">
            Trade secondary raw materials with verified counterparties.
          </h1>
          <p className="mt-5 text-lg leading-8 text-stone-600">
            Manage listings, bids, compliance readiness, and buyer demand from a
            single marketplace workspace.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {["Verified sellers", "Bid workflows", "Compliance trail"].map((item) => (
            <div key={item} className="rounded-lg border border-stone-200 bg-white p-4">
              <Building2 size={18} className="text-emerald-700" />
              <p className="mt-3 text-sm font-medium text-stone-800">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-7 shadow-sm">
          <div className="mb-7 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-800 text-white">
                <Recycle size={20} />
              </div>
              <div>
                <p className="text-lg font-semibold text-stone-950">Symbi-OS</p>
                <p className="text-sm text-stone-500">Materials marketplace</p>
              </div>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-stone-950">
            Sign in
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            Continue to your sourcing and deal workspace.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <Field icon={Mail} label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className="h-11 w-full rounded-md border border-stone-300 pl-10 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
              />
            </Field>

            <Field icon={Lock} label="Password">
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                className="h-11 w-full rounded-md border border-stone-300 pl-10 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
              />
            </Field>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-800 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              Sign in
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-stone-500">
            New to Symbi-OS?{" "}
            <Link href="/register" className="font-semibold text-emerald-800 hover:text-emerald-900">
              Create an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-700">
        {label}
      </span>
      <div className="relative">
        <Icon
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
        />
        {children}
      </div>
    </label>
  );
}
