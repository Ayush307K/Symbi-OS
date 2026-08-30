"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, PackageSearch, ScrollText } from "lucide-react";
import { MarketplaceNav } from "@/components/marketplace/MarketplaceNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { MatchCard, type MatchListing } from "@/components/rfq/MatchCard";

interface Demand {
  id: string;
  query: string;
  category: string;
  quantity: number;
  unit: string;
  status: string;
  matchVersion: string;
  createdAt: string;
}

interface Match {
  id: string;
  score: number;
  version: string;
  status: string;
  explanations: string[];
  listing: MatchListing;
}

export default function RfqDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [demand, setDemand] = useState<Demand | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/demand/${id}/matches`);
      if (res.status === 401) {
        router.push(`/login?next=/rfq/${id}`);
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error || "Could not load this request.");
        return;
      }
      setDemand(payload.demand);
      setMatches(payload.matches ?? []);
    } catch {
      setError("Could not load this request.");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="min-h-screen bg-surface-page text-ink-900">
      <MarketplaceNav />

      <header className="border-b border-ink-200 bg-surface-card">
        <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
          <Link
            href="/rfq"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-copper-800 hover:text-copper-900"
          >
            <ArrowLeft aria-hidden="true" size={15} />
            All requests
          </Link>

          {demand ? (
            <>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
                {demand.query}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-500">
                <Badge>{demand.category}</Badge>
                <span className="tabular-nums">
                  {demand.quantity.toLocaleString("en-IN")} {demand.unit}
                </span>
                <span>
                  Posted{" "}
                  {new Date(demand.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                {/* The ruleset is stamped on the demand, so an old result set can
                    always be told apart from one a newer ruleset would produce. */}
                <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-400">
                  <ScrollText aria-hidden="true" size={13} />
                  Ranked by {demand.matchVersion}
                </span>
              </div>
            </>
          ) : (
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              {loading ? "Loading request…" : "Request"}
            </h1>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
        {loading ? (
          <div className="rounded-card border border-ink-200 bg-surface-card p-4 shadow-card">
            <SkeletonRows rows={3} columns={2} />
          </div>
        ) : error ? (
          <EmptyState
            icon={<PackageSearch size={22} />}
            title="This request could not be opened"
            description={error}
            action={
              <Button variant="secondary" onClick={load}>
                Try again
              </Button>
            }
            secondaryAction={
              <Link href="/rfq" className="text-sm font-semibold text-copper-800 hover:underline">
                Back to requests
              </Link>
            }
          />
        ) : matches.length === 0 ? (
          <div className="rounded-card border border-ink-200 bg-surface-card p-6 shadow-card">
            <EmptyState
              icon={<Bell size={22} />}
              title="No listing clears your constraints yet"
              description="This request stays open. When a seller posts something that fits — and it passes moderation — you are notified. Widening the ceiling price or the radius often finds more."
              action={
                <Button variant="primary" onClick={() => router.push("/rfq")}>
                  Post a wider request
                </Button>
              }
              secondaryAction={
                <Link href="/" className="text-sm font-semibold text-copper-800 hover:underline">
                  Browse the marketplace
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-ink-900">
                {matches.length} match{matches.length === 1 ? "" : "es"}, best first
              </h2>
              <p className="text-[12.5px] text-ink-500">
                Each listing clears the hard constraints you supplied. Distance is only claimed when both locations were available.
              </p>
            </div>
            <ul className="space-y-3">
              {matches.map((match) => (
                <MatchCard
                  key={match.id}
                  listing={match.listing}
                  score={match.score}
                  explanations={match.explanations}
                  quantity={demand?.quantity ?? 1}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
