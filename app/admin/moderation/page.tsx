"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";

type QueueListing = {
  id: string;
  title: string;
  category: string;
  subcategory: string;
  description: string;
  quantityAvailable: number;
  unit: string;
  pricePerUnit: number;
  priceMode: string;
  packaging: string;
  handlingRequirements: string;
  submittedAt: string;
  moderationTargetAt: string;
  moderationOverdue: boolean;
  version: number;
  seller: { name: string; location: string };
  assets: Array<{
    id: string;
    kind: string;
    originalName: string;
    sortOrder: number;
  }>;
};

export default function ModerationPage() {
  const [listings, setListings] = useState<QueueListing[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/admin/listings/moderation", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Unable to load moderation queue.");
      return;
    }
    setListings(payload.listings);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (
    listing: QueueListing,
    decision: "APPROVE" | "REJECT" | "CHANGES_REQUIRED",
  ) => {
    const note = notes[listing.id]?.trim();
    if (!note) {
      setError("Add a clear moderator note before deciding.");
      return;
    }
    setBusyId(listing.id);
    setError("");
    const response = await fetch("/api/admin/listings/moderation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId: listing.id,
        version: listing.version,
        decision,
        note,
      }),
    });
    const payload = await response.json();
    setBusyId("");
    if (!response.ok) {
      setError(payload.error || "Moderation decision failed.");
      return;
    }
    setListings((values) => values.filter((value) => value.id !== listing.id));
  };

  return (
    <main className="min-h-dvh bg-stone-100 text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-semibold text-stone-600"
            >
              <ArrowLeft size={16} /> Marketplace
            </Link>
            <h1 className="mt-2 text-2xl font-semibold">Listing moderation</h1>
          </div>
          <button
            onClick={load}
            className="flex min-h-11 items-center gap-2 rounded-md border border-stone-300 px-4 text-sm font-semibold"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-5">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {!error && !listings.length && (
          <div className="rounded-lg border border-stone-200 bg-white p-10 text-center text-stone-500">
            The moderation queue is clear.
          </div>
        )}
        {listings.map((listing) => {
          const photos = listing.assets.filter((asset) => asset.kind === "PHOTO");
          const documents = listing.assets.filter(
            (asset) => asset.kind !== "PHOTO",
          );
          return (
            <article
              key={listing.id}
              className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{listing.title}</h2>
                    {listing.moderationOverdue && (
                      <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                        <AlertTriangle size={13} /> SLA overdue
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    {listing.seller.name} · {listing.seller.location}
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    {listing.category} · {listing.subcategory} ·{" "}
                    {listing.quantityAvailable} {listing.unit}
                  </p>
                </div>
                <p className="text-xs text-stone-500">
                  Target:{" "}
                  {new Date(listing.moderationTargetAt).toLocaleString("en-IN")}
                </p>
              </div>

              <p className="mt-4 whitespace-pre-wrap text-sm text-stone-700">
                {listing.description}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {photos.map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo.id}
                    src={`/api/listings/${listing.id}/assets/${photo.id}?variant=thumbnail`}
                    alt=""
                    className="h-36 w-full rounded-md object-cover"
                  />
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Detail label="Price">
                  {listing.priceMode === "ON_REQUEST"
                    ? "On request"
                    : `₹${listing.pricePerUnit.toLocaleString("en-IN")} / ${listing.unit}`}
                </Detail>
                <Detail label="Packaging">{listing.packaging}</Detail>
                <Detail label="Handling">
                  {listing.handlingRequirements}
                </Detail>
              </div>

              {!!documents.length && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {documents.map((document) => (
                    <a
                      key={document.id}
                      href={`/api/listings/${listing.id}/assets/${document.id}`}
                      className="flex min-h-11 items-center gap-2 rounded-md border border-stone-300 px-3 text-sm font-semibold"
                    >
                      <FileText size={16} /> {document.kind.replace("_", " ")}
                    </a>
                  ))}
                </div>
              )}

              <label className="mt-4 block">
                <span className="mb-1.5 block text-sm font-medium">
                  Decision note
                </span>
                <textarea
                  value={notes[listing.id] || ""}
                  onChange={(event) =>
                    setNotes((values) => ({
                      ...values,
                      [listing.id]: event.target.value,
                    }))
                  }
                  className="min-h-24 w-full rounded-md border border-stone-300 p-3 text-sm outline-none focus:border-emerald-700"
                  placeholder="State the evidence checked or the exact correction required."
                />
              </label>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  onClick={() => decide(listing, "REJECT")}
                  disabled={busyId === listing.id}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-300 px-4 text-sm font-semibold text-red-700"
                >
                  <XCircle size={16} /> Reject
                </button>
                <button
                  onClick={() => decide(listing, "CHANGES_REQUIRED")}
                  disabled={busyId === listing.id}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-amber-300 px-4 text-sm font-semibold text-amber-800"
                >
                  <AlertTriangle size={16} /> Request changes
                </button>
                <button
                  onClick={() => decide(listing, "APPROVE")}
                  disabled={busyId === listing.id}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white"
                >
                  {busyId === listing.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  Approve
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-stone-50 p-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
        {label}
      </p>
      <p className="mt-1">{children}</p>
    </div>
  );
}
