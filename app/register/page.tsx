"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Briefcase,
  Building2,
  Loader2,
  Lock,
  Mail,
  Recycle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

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
    <main className="grid min-h-screen bg-[#f4f2ed] lg:grid-cols-[1fr_540px]">
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
            Supplier and buyer workspace
          </p>
          <h1 className="mt-3 text-5xl font-semibold tracking-tight text-stone-950">
            Create transparent deal flow for scrap and by-products.
          </h1>
          <p className="mt-5 text-lg leading-8 text-stone-600">
            Join as a seller, buyer, or both. List materials, capture demand,
            place bids, and build a verified transaction history.
          </p>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
            <BadgeCheck size={18} className="text-emerald-700" />
            What happens after signup
          </div>
          <div className="mt-4 grid gap-3 text-sm text-stone-600">
            <p>1. Your company node is created in the supply network.</p>
            <p>2. You can list surplus material or bid on available supply.</p>
            <p>3. Demand alerts and seller bids start building marketplace liquidity.</p>
          </div>
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
            Create account
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            Set up your company profile for the exchange.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <Field icon={Mail} label="Work email">
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
                minLength={12}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="12+ chars, upper/lowercase and number"
                className="h-11 w-full rounded-md border border-stone-300 pl-10 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
              />
            </Field>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-stone-700">
                Account role
              </span>
              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as "BUYER" | "SELLER" | "BOTH")
                }
                className="h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
              >
                <option value="BOTH">Buyer and seller</option>
                <option value="BUYER">Buyer only</option>
                <option value="SELLER">Seller only</option>
              </select>
            </label>

            <Field icon={Building2} label="Company name">
              <input
                type="text"
                required
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Your company"
                className="h-11 w-full rounded-md border border-stone-300 pl-10 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
              />
            </Field>

            <Field icon={Briefcase} label="Industry">
              <input
                type="text"
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                placeholder="Steel, chemicals, textiles..."
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
              Create account
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-stone-500">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-emerald-800 hover:text-emerald-900">
              Sign in
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
