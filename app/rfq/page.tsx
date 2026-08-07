"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Crosshair,
  FileSearch,
  Send,
} from "lucide-react";
import { MarketplaceNav } from "@/components/marketplace/MarketplaceNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { MatchScore } from "@/components/rfq/MatchScore";
import { LISTING_UNITS, SAFE_CATEGORIES } from "@/lib/listing-constants";
import { cn } from "@/lib/cn";

interface DemandSummary {
  id: string;
  query: string;
  category: string;
  subcategory: string | null;
  quantity: number;
  unit: string;
  maxPrice: number | null;
  city: string | null;
  state: string | null;
  status: string;
  createdAt: string;
  matchCount: number;
  topScore: number | null;
}

type FieldErrors = Record<string, string>;

const relative = (iso: string) => {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export default function RfqPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<string>("ton");
  const [maxPrice, setMaxPrice] = useState("");
  const [pincode, setPincode] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [availableBy, setAvailableBy] = useState("");

  const [useRadius, setUseRadius] = useState(false);
  const [radiusKm, setRadiusKm] = useState("250");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [demands, setDemands] = useState<DemandSummary[]>([]);
  const [loadingDemands, setLoadingDemands] = useState(true);

  const loadDemands = useCallback(async () => {
    setLoadingDemands(true);
    try {
      const res = await fetch("/api/demand");
      if (res.status === 401) {
        router.push("/login?next=/rfq");
        return;
      }
      const payload = await res.json().catch(() => ({}));
      setDemands(payload.demands ?? []);
    } finally {
      setLoadingDemands(false);
    }
  }, [router]);

  useEffect(() => {
    loadDemands();
  }, [loadDemands]);

  // Pincode is the one location field a buyer knows by heart. Resolving it to
  // city and state fills the two fields the matcher actually compares against.
  useEffect(() => {
    if (!/^[1-9][0-9]{5}$/.test(pincode)) return;
    let cancelled = false;
    fetch(`/api/location/pincode?pincode=${pincode}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.serviceable) return;
        if (data.city) setCity(data.city);
        if (data.state) setState(data.state);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pincode]);

  function locate() {
    if (!navigator.geolocation) {
      toast({ tone: "warning", title: "This browser cannot share a location." });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: Number(position.coords.latitude.toFixed(5)),
          longitude: Number(position.coords.longitude.toFixed(5)),
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setUseRadius(false);
        toast({
          tone: "warning",
          title: "Location not shared",
          description: "Distance filtering needs it. Pincode matching still works.",
        });
      },
      { timeout: 10_000 },
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    // Only send what was filled. The schema is .strict(), and latitude,
    // longitude and radius are refused unless all three arrive together.
    const body: Record<string, unknown> = {
      query: query.trim(),
      quantity: Number(quantity) || 1,
      unit,
    };
    if (category) body.category = category;
    if (subcategory.trim()) body.subcategory = subcategory.trim();
    if (maxPrice.trim()) body.maxPrice = Number(maxPrice);
    if (pincode.trim()) body.pincode = pincode.trim();
    if (city.trim()) body.city = city.trim();
    if (state.trim()) body.state = state.trim();
    if (availableBy) body.availableBy = new Date(`${availableBy}T00:00:00`).toISOString();
    if (useRadius && coords && Number(radiusKm) > 0) {
      body.latitude = coords.latitude;
      body.longitude = coords.longitude;
      body.maxDistanceKm = Number(radiusKm);
    }

    try {
      const res = await fetch("/api/demand/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.push("/login?next=/rfq");
        return;
      }
      if (!res.ok) {
        setFieldErrors(payload.details?.fields ?? {});
        throw new Error(payload.error || "Could not post this RFQ.");
      }

      toast({
        tone: payload.results?.length ? "success" : "info",
        title: payload.results?.length
          ? `${payload.results.length} match${payload.results.length === 1 ? "" : "es"} found`
          : "RFQ posted",
        description: payload.message,
      });
      router.push(`/rfq/${payload.demandId}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not post this RFQ.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-page text-ink-900">
      <MarketplaceNav />

      <header className="border-b border-ink-200 bg-surface-card">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
          <Link href="/" className="text-sm font-semibold text-copper-800 hover:text-copper-900">
            Back to marketplace
          </Link>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Post a request for quote
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Say what you need. We rank every approved listing against it and show
            the reasons behind each rank. If nothing fits today, the request stays
            open and you are told when a matching listing is approved.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] items-start gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <form
          onSubmit={handleSubmit}
          className="rounded-card border border-ink-200 bg-surface-card p-5 shadow-card lg:sticky lg:top-4"
        >
          {formError ? (
            <p
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-control border border-danger-border bg-danger-subtle px-3 py-2.5 text-[13px] text-danger-strong"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {formError}
            </p>
          ) : null}

          <Section title="What you need">
            <Input
              label="Material"
              required
              placeholder="e.g. HDPE regrind, natural, food-grade"
              hint="Describe it the way your plant does. Grade words improve the ranking."
              value={query}
              error={fieldErrors.query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Category"
                hint="Left blank, it is inferred."
                value={category}
                error={fieldErrors.category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">Infer from description</option>
                {SAFE_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
              <Input
                label="Grade or spec"
                placeholder="Optional"
                value={subcategory}
                error={fieldErrors.subcategory}
                onChange={(event) => setSubcategory(event.target.value)}
              />
            </div>
          </Section>

          <Section title="How much">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
              <Input
                label="Quantity"
                type="number"
                inputMode="numeric"
                min={1}
                required
                value={quantity}
                error={fieldErrors.quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
              <Select label="Unit" value={unit} onChange={(event) => setUnit(event.target.value)}>
                {LISTING_UNITS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              label="Ceiling price"
              type="number"
              inputMode="decimal"
              min={0}
              suffix="₹"
              placeholder="Optional"
              hint={`Per ${unit}. Priced listings above this are excluded outright.`}
              value={maxPrice}
              error={fieldErrors.maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
            />
          </Section>

          <Section title="Where and when">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Pincode"
                inputMode="numeric"
                maxLength={6}
                placeholder="560001"
                value={pincode}
                error={fieldErrors.pincode}
                onChange={(event) => setPincode(event.target.value.replace(/\D/g, ""))}
              />
              <Input
                label="City"
                value={city}
                error={fieldErrors.city}
                onChange={(event) => setCity(event.target.value)}
              />
            </div>
            <Input
              label="State"
              value={state}
              error={fieldErrors.state}
              onChange={(event) => setState(event.target.value)}
            />
            <Input
              label="Needed by"
              type="date"
              value={availableBy}
              error={fieldErrors.availableBy}
              onChange={(event) => setAvailableBy(event.target.value)}
            />

            <div className="rounded-control border border-ink-200 bg-surface-sunken/60 p-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={useRadius}
                  className="mt-0.5 h-4 w-4 accent-copper-700"
                  onChange={(event) => {
                    setUseRadius(event.target.checked);
                    if (event.target.checked && !coords) locate();
                  }}
                />
                <span>
                  <span className="text-[13px] font-semibold text-ink-900">
                    Only within a distance of me
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-500">
                    Uses your device location to measure real distance and drop
                    anything further out. Freight is most of the landed cost.
                  </span>
                </span>
              </label>

              {useRadius ? (
                <div className="mt-3 flex items-end gap-2 border-t border-ink-200 pt-3">
                  <Input
                    label="Radius"
                    type="number"
                    min={1}
                    max={2000}
                    suffix="km"
                    containerClassName="flex-1"
                    value={radiusKm}
                    error={fieldErrors.maxDistanceKm}
                    onChange={(event) => setRadiusKm(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={locating}
                    leadingIcon={<Crosshair size={14} />}
                    onClick={locate}
                  >
                    {coords ? "Update" : "Locate me"}
                  </Button>
                </div>
              ) : null}

              {useRadius && coords ? (
                <p className="mt-2 text-[12px] tabular-nums text-ink-500">
                  Measuring from {coords.latitude}, {coords.longitude}
                </p>
              ) : null}
            </div>
          </Section>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            className="mt-5"
            loading={submitting}
            disabled={query.trim().length < 2}
            leadingIcon={<Send size={16} />}
          >
            Post RFQ and find matches
          </Button>
        </form>

        <section className="rounded-card border border-ink-200 bg-surface-card shadow-card">
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-900">Your requests</h2>
            {demands.length ? (
              <span className="text-[12.5px] tabular-nums text-ink-500">
                {demands.length} posted
              </span>
            ) : null}
          </div>

          <div className="p-4">
            {loadingDemands ? (
              <SkeletonRows rows={3} />
            ) : demands.length === 0 ? (
              <EmptyState
                icon={<FileSearch size={22} />}
                title="No requests yet"
                description="Post one on the left. It is matched immediately against every approved listing, and stays open for listings approved later."
              />
            ) : (
              <ul className="space-y-2">
                {demands.map((demand) => (
                  <li key={demand.id}>
                    <Link
                      href={`/rfq/${demand.id}`}
                      className="flex items-center gap-4 rounded-control border border-ink-200 p-3 transition-colors hover:border-copper-300 hover:bg-copper-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-700"
                    >
                      {demand.topScore !== null ? (
                        <MatchScore score={demand.topScore} size="sm" />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-ink-300 text-[11px] font-medium text-ink-400">
                          —
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-900">
                          {demand.query}
                        </p>
                        <p className="mt-0.5 truncate text-[12.5px] text-ink-500">
                          {demand.quantity.toLocaleString("en-IN")} {demand.unit}
                          {demand.city ? ` · ${demand.city}` : ""} · {relative(demand.createdAt)}
                        </p>
                      </div>

                      <Badge tone={demand.matchCount ? "success" : "neutral"}>
                        {demand.matchCount
                          ? `${demand.matchCount} match${demand.matchCount === 1 ? "" : "es"}`
                          : "Open, no match yet"}
                      </Badge>
                      <ArrowRight aria-hidden="true" size={15} className="shrink-0 text-ink-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className={cn("mb-5 last:mb-0")}>
      <legend className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-500">
        {title}
      </legend>
      <div className="flex flex-col gap-3">{children}</div>
    </fieldset>
  );
}
