"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  FileText,
  ImagePlus,
  Loader2,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SAFE_CATEGORIES } from "@/lib/listing-constants";

type Draft = {
  title: string;
  category: (typeof SAFE_CATEGORIES)[number];
  subcategory: string;
  description: string;
  priceMode: "FIXED" | "ON_REQUEST";
  pricePerUnit: string;
  quantityAvailable: string;
  unit: "kg" | "ton" | "lot";
  minOrderQuantity: string;
  lotIncrement: string;
  leadTimeDays: string;
  packaging: string;
  handlingRequirements: string;
  paymentTerms: string;
  pincode: string;
  latitude: string;
  longitude: string;
  availableFrom: string;
  availableUntil: string;
  safetyDeclaration: boolean;
  qualityDeclaration: boolean;
  ownershipDeclaration: boolean;
  authorityDeclaration: boolean;
};

type Asset = {
  id: string;
  kind: "PHOTO" | "CERTIFICATE" | "TEST_REPORT";
  originalName: string;
  sizeBytes: number;
  sortOrder: number;
  url?: string;
  thumbnailUrl?: string | null;
};

type ListingRecord = {
  id: string;
  version: number;
  status: string;
  slug: string;
  moderationNote?: string | null;
  assets?: Asset[];
  [key: string]: unknown;
};

type UploadState = {
  file: File;
  kind: Asset["kind"];
  progress: number;
  state: "uploading" | "failed";
  error?: string;
};

const STORAGE_KEY = "symbios:seller-listing-draft:v1";

function dateOffset(days: number) {
  const value = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return value.toISOString().slice(0, 10);
}

const initialDraft: Draft = {
  title: "",
  category: "Plastic Scrap",
  subcategory: "",
  description: "",
  priceMode: "FIXED",
  pricePerUnit: "",
  quantityAvailable: "",
  unit: "ton",
  minOrderQuantity: "1",
  lotIncrement: "1",
  leadTimeDays: "3",
  packaging: "",
  handlingRequirements: "",
  paymentTerms: "Payment through the Symbi-OS transaction workflow",
  pincode: "",
  latitude: "",
  longitude: "",
  availableFrom: dateOffset(0),
  availableUntil: dateOffset(30),
  safetyDeclaration: false,
  qualityDeclaration: false,
  ownershipDeclaration: false,
  authorityDeclaration: false,
};

function fieldErrors(draft: Draft, photos: number) {
  const errors: Record<string, string> = {};
  if (draft.title.trim().length < 3)
    errors.title = "Use at least 3 characters.";
  if (draft.subcategory.trim().length < 2) {
    errors.subcategory = "Add the subtype, grade, or specification.";
  }
  if (draft.description.trim().length < 20) {
    errors.description = "Add at least 20 characters.";
  }
  if (Number(draft.quantityAvailable) <= 0) {
    errors.quantityAvailable = "Quantity must be positive.";
  }
  if (draft.priceMode === "FIXED" && Number(draft.pricePerUnit) <= 0) {
    errors.pricePerUnit = "Add a positive price.";
  }
  if (Number(draft.minOrderQuantity) <= 0) {
    errors.minOrderQuantity = "MOQ must be positive.";
  }
  if (Number(draft.minOrderQuantity) > Number(draft.quantityAvailable)) {
    errors.minOrderQuantity = "MOQ cannot exceed available quantity.";
  }
  if (Number(draft.lotIncrement) <= 0) {
    errors.lotIncrement = "Lot increment must be positive.";
  }
  if (
    Number(draft.quantityAvailable) > 0 &&
    Number(draft.quantityAvailable) % Number(draft.lotIncrement) !== 0
  ) {
    errors.lotIncrement = "Quantity must be divisible by the increment.";
  }
  if (!draft.packaging.trim()) errors.packaging = "Describe the packaging.";
  if (!draft.handlingRequirements.trim()) {
    errors.handlingRequirements = "Describe safe handling.";
  }
  if (!/^[1-9][0-9]{5}$/.test(draft.pincode)) {
    errors.pincode = "Enter a valid six-digit pincode.";
  }
  if (Boolean(draft.latitude) !== Boolean(draft.longitude)) {
    errors.latitude = "Add both coordinates or leave both blank.";
    errors.longitude = "Add both coordinates or leave both blank.";
  }
  if (!draft.availableFrom) errors.availableFrom = "Choose a date.";
  if (draft.availableUntil && draft.availableUntil <= draft.availableFrom) {
    errors.availableUntil = "End date must be after the start date.";
  }
  if (photos < 1 || photos > 5) errors.photos = "Upload 1–5 photos.";
  if (!draft.safetyDeclaration) errors.safetyDeclaration = "Required.";
  if (!draft.qualityDeclaration) errors.qualityDeclaration = "Required.";
  if (!draft.ownershipDeclaration) errors.ownershipDeclaration = "Required.";
  if (!draft.authorityDeclaration) errors.authorityDeclaration = "Required.";
  return errors;
}

function requestPayload(draft: Draft, version?: number) {
  return {
    ...draft,
    pricePerUnit:
      draft.priceMode === "ON_REQUEST" ? 0 : Number(draft.pricePerUnit),
    quantityAvailable: Number(draft.quantityAvailable || 0),
    minOrderQuantity: Number(draft.minOrderQuantity || 1),
    lotIncrement: Number(draft.lotIncrement || 1),
    leadTimeDays: Number(draft.leadTimeDays || 0),
    availableFrom: draft.availableFrom || null,
    availableUntil: draft.availableUntil || null,
    latitude: draft.latitude ? Number(draft.latitude) : null,
    longitude: draft.longitude ? Number(draft.longitude) : null,
    ...(version ? { version } : {}),
  };
}

function draftFromListing(record: ListingRecord): Draft {
  const value = (key: string) => String(record[key] ?? "");
  return {
    ...initialDraft,
    title: value("title"),
    category: (record.category as Draft["category"]) || initialDraft.category,
    subcategory: value("subcategory"),
    description: value("description"),
    priceMode:
      (record.priceMode as Draft["priceMode"]) || initialDraft.priceMode,
    pricePerUnit: value("pricePerUnit"),
    quantityAvailable: value("quantityAvailable"),
    unit: (record.unit as Draft["unit"]) || initialDraft.unit,
    minOrderQuantity: value("minOrderQuantity") || "1",
    lotIncrement: value("lotIncrement") || "1",
    leadTimeDays: value("leadTimeDays") || "0",
    packaging: value("packaging"),
    handlingRequirements: value("handlingRequirements"),
    paymentTerms: value("paymentTerms"),
    pincode: value("pincode"),
    latitude: value("latitude"),
    longitude: value("longitude"),
    availableFrom: value("availableFrom").slice(0, 10),
    availableUntil: value("availableUntil").slice(0, 10),
    safetyDeclaration: Boolean(record.safetyDeclaration),
    qualityDeclaration: Boolean(record.qualityDeclaration),
    ownershipDeclaration: Boolean(record.ownershipDeclaration),
    authorityDeclaration: Boolean(record.authorityDeclaration),
  };
}

export default function NewSellerListingPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [listing, setListing] = useState<ListingRecord | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);

  const photos = useMemo(
    () =>
      assets
        .filter((asset) => asset.kind === "PHOTO")
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [assets],
  );
  const documents = useMemo(
    () => assets.filter((asset) => asset.kind !== "PHOTO"),
    [assets],
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const queryId = new URLSearchParams(window.location.search).get("id");
    try {
      const parsed = stored
        ? (JSON.parse(stored) as {
            draft?: Draft;
            listingId?: string;
          })
        : ({} as {
            draft?: Draft;
            listingId?: string;
          });
      if (parsed.draft && !queryId) {
        setDraft({ ...initialDraft, ...parsed.draft });
      }
      const listingId = queryId || parsed.listingId;
      if (listingId) {
        fetch(`/api/listings/${listingId}`, { cache: "no-store" })
          .then(async (response) => {
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error);
            setListing(payload.listing);
            setAssets(payload.listing.assets || []);
            setDraft(draftFromListing(payload.listing));
          })
          .catch(() => {
            window.localStorage.removeItem(STORAGE_KEY);
          });
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ draft, listingId: listing?.id }),
    );
  }, [draft, listing?.id]);

  const setField = useCallback(
    <K extends keyof Draft>(field: K, value: Draft[K]) => {
      setDraft((current) => ({ ...current, [field]: value }));
      setErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    },
    [],
  );

  const saveDraft = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        listing ? `/api/listings/${listing.id}` : "/api/listings",
        {
          method: listing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload(draft, listing?.version)),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        setErrors(payload.details?.fields || {});
        throw new Error(payload.error || "Unable to save draft.");
      }
      setListing(payload.listing);
      setMessage(payload.message || "Draft saved.");
      return payload.listing as ListingRecord;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save draft.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }, [draft, listing]);

  const upload = useCallback(
    async (file: File, kind: Asset["kind"]) => {
      let current = listing;
      if (!current) current = await saveDraft();
      if (!current) return;
      const item: UploadState = {
        file,
        kind,
        progress: 0,
        state: "uploading",
      };
      setUploads((values) => [...values, item]);
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/listings/${current.id}/assets`);
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const progress = Math.round((event.loaded / event.total) * 100);
        setUploads((values) =>
          values.map((value) =>
            value === item ? { ...value, progress } : value,
          ),
        );
      };
      xhr.onload = () => {
        let payload: any = {};
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          // The generic message below is safer than exposing an HTML response.
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          setAssets((values) => [...values, payload.asset]);
          setUploads((values) => values.filter((value) => value !== item));
          setMessage(`${file.name} uploaded and processed.`);
        } else {
          setUploads((values) =>
            values.map((value) =>
              value === item
                ? {
                    ...value,
                    state: "failed",
                    error: payload.error || "Upload failed.",
                  }
                : value,
            ),
          );
        }
      };
      xhr.onerror = () => {
        setUploads((values) =>
          values.map((value) =>
            value === item
              ? { ...value, state: "failed", error: "Network error." }
              : value,
          ),
        );
      };
      xhr.send(form);
    },
    [listing, saveDraft],
  );

  const removeAsset = useCallback(
    async (asset: Asset) => {
      if (!listing) return;
      const response = await fetch(
        `/api/listings/${listing.id}/assets/${asset.id}`,
        { method: "DELETE" },
      );
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error || "Unable to remove file.");
        return;
      }
      setAssets((values) => values.filter((value) => value.id !== asset.id));
    },
    [listing],
  );

  const reorder = useCallback(
    async (index: number, direction: -1 | 1) => {
      if (!listing) return;
      const target = index + direction;
      if (target < 0 || target >= photos.length) return;
      const ordered = [...photos];
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      const response = await fetch(`/api/listings/${listing.id}/assets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoIds: ordered.map((photo) => photo.id),
          version: listing.version,
        }),
      });
      if (!response.ok) {
        const payload = await response.json();
        setMessage(payload.error || "Unable to reorder photos.");
        return;
      }
      setAssets((values) => [
        ...values.filter((value) => value.kind !== "PHOTO"),
        ...ordered.map((photo, sortOrder) => ({ ...photo, sortOrder })),
      ]);
    },
    [listing, photos],
  );

  const submit = useCallback(async () => {
    const validation = fieldErrors(draft, photos.length);
    setErrors(validation);
    if (Object.keys(validation).length) {
      setMessage("Complete the highlighted fields before submission.");
      document.getElementById("listing-form-top")?.scrollIntoView();
      return;
    }
    const saved = await saveDraft();
    if (!saved) return;
    setBusy(true);
    const response = await fetch(`/api/listings/${saved.id}/submit`, {
      method: "POST",
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setErrors(payload.details?.fields || {});
      setMessage(payload.error || "Unable to submit listing.");
      return;
    }
    setListing(payload.listing);
    setMessage(payload.message);
    window.localStorage.removeItem(STORAGE_KEY);
  }, [draft, photos.length, saveDraft]);

  // The API refuses to create a listing without approved onboarding. Ask first,
  // so the requirement is visible before any of the form is filled in.
  const [onboardingStatus, setOnboardingStatus] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/seller/onboarding", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        setOnboardingStatus(payload?.onboarding?.status ?? "UNKNOWN");
      })
      .catch(() => {
        if (!cancelled) setOnboardingStatus("UNKNOWN");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (onboardingStatus && onboardingStatus !== "APPROVED") {
    return (
      <main className="min-h-dvh bg-surface-page text-ink-900">
        <div className="mx-auto max-w-2xl px-4 py-16">
          <EmptyState
            icon={<ShieldAlert />}
            title="Seller verification is required first"
            description={
              ["SUBMITTED", "UNDER_REVIEW"].includes(onboardingStatus)
                ? "Your onboarding is submitted and awaiting review. Listing creation unlocks once it is approved."
                : "Complete seller onboarding and verification before creating a managed SymbiOS listing. External sourcing leads remain clearly labelled and cannot transact here."
            }
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => router.push("/seller/onboarding")}
              >
                {["SUBMITTED", "UNDER_REVIEW"].includes(onboardingStatus)
                  ? "View verification status"
                  : "Complete onboarding"}
              </Button>
            }
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-surface-page text-ink-900">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-surface-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/seller"
            className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-600"
          >
            <ArrowLeft size={17} /> Seller dashboard
          </Link>
          <div className="text-right">
            <p className="text-sm font-semibold">Create wholesale listing</p>
            <p className="text-xs text-ink-500">
              {listing?.status || "Unsaved draft"}
            </p>
          </div>
        </div>
      </header>

      <div
        id="listing-form-top"
        className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_360px]"
      >
        <div className="space-y-5">
          <Section title="Material">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Listing title" error={errors.title} wide>
                <input
                  value={draft.title}
                  onChange={(event) => setField("title", event.target.value)}
                  className={inputClass(errors.title)}
                  placeholder="Washed HDPE regrind flakes"
                />
              </Field>
              <Field label="Category" error={errors.category}>
                <select
                  value={draft.category}
                  onChange={(event) =>
                    setField(
                      "category",
                      event.target.value as Draft["category"],
                    )
                  }
                  className={inputClass(errors.category)}
                >
                  {SAFE_CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Subtype / grade / specification"
                error={errors.subcategory}
              >
                <input
                  value={draft.subcategory}
                  onChange={(event) =>
                    setField("subcategory", event.target.value)
                  }
                  className={inputClass(errors.subcategory)}
                  placeholder="Injection-grade HDPE, natural"
                />
              </Field>
              <Field label="Description" error={errors.description} wide>
                <textarea
                  value={draft.description}
                  onChange={(event) =>
                    setField("description", event.target.value)
                  }
                  className={`${inputClass(errors.description)} min-h-28 py-3`}
                  placeholder="Origin, contamination limits, moisture, particle size, quality checks…"
                />
              </Field>
            </div>
          </Section>

          <Section title="Quantity, price, and availability">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Available quantity"
                error={errors.quantityAvailable}
              >
                <input
                  type="number"
                  min="1"
                  value={draft.quantityAvailable}
                  onChange={(event) =>
                    setField("quantityAvailable", event.target.value)
                  }
                  className={inputClass(errors.quantityAvailable)}
                />
              </Field>
              <Field label="Unit" error={errors.unit}>
                <select
                  value={draft.unit}
                  onChange={(event) =>
                    setField("unit", event.target.value as Draft["unit"])
                  }
                  className={inputClass(errors.unit)}
                >
                  <option value="kg">kg</option>
                  <option value="ton">ton</option>
                  <option value="lot">lot</option>
                </select>
              </Field>
              <Field label="Minimum order" error={errors.minOrderQuantity}>
                <input
                  type="number"
                  min="1"
                  value={draft.minOrderQuantity}
                  onChange={(event) =>
                    setField("minOrderQuantity", event.target.value)
                  }
                  className={inputClass(errors.minOrderQuantity)}
                />
              </Field>
              <Field label="Lot increment" error={errors.lotIncrement}>
                <input
                  type="number"
                  min="1"
                  value={draft.lotIncrement}
                  onChange={(event) =>
                    setField("lotIncrement", event.target.value)
                  }
                  className={inputClass(errors.lotIncrement)}
                />
              </Field>
              <Field label="Price mode">
                <select
                  value={draft.priceMode}
                  onChange={(event) =>
                    setField(
                      "priceMode",
                      event.target.value as Draft["priceMode"],
                    )
                  }
                  className={inputClass()}
                >
                  <option value="FIXED">Fixed INR price</option>
                  <option value="ON_REQUEST">Price on request</option>
                </select>
              </Field>
              <Field label="Price per unit" error={errors.pricePerUnit}>
                <input
                  type="number"
                  min="0"
                  disabled={draft.priceMode === "ON_REQUEST"}
                  value={draft.pricePerUnit}
                  onChange={(event) =>
                    setField("pricePerUnit", event.target.value)
                  }
                  className={inputClass(errors.pricePerUnit)}
                  placeholder="INR"
                />
              </Field>
              <Field label="Available from" error={errors.availableFrom}>
                <input
                  type="date"
                  value={draft.availableFrom}
                  onChange={(event) =>
                    setField("availableFrom", event.target.value)
                  }
                  className={inputClass(errors.availableFrom)}
                />
              </Field>
              <Field label="Available until" error={errors.availableUntil}>
                <input
                  type="date"
                  value={draft.availableUntil}
                  onChange={(event) =>
                    setField("availableUntil", event.target.value)
                  }
                  className={inputClass(errors.availableUntil)}
                />
              </Field>
              <Field label="Dispatch lead time (days)">
                <input
                  type="number"
                  min="0"
                  value={draft.leadTimeDays}
                  onChange={(event) =>
                    setField("leadTimeDays", event.target.value)
                  }
                  className={inputClass()}
                />
              </Field>
            </div>
          </Section>

          <Section title="Dispatch and handling">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dispatch pincode" error={errors.pincode}>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={draft.pincode}
                  onChange={(event) =>
                    setField("pincode", event.target.value.replace(/\D/g, ""))
                  }
                  className={inputClass(errors.pincode)}
                />
              </Field>
              <Field label="Latitude (optional)" error={errors.latitude}>
                <input
                  type="number"
                  min="-90"
                  max="90"
                  step="any"
                  value={draft.latitude}
                  onChange={(event) => setField("latitude", event.target.value)}
                  className={inputClass(errors.latitude)}
                  placeholder="12.9716"
                />
              </Field>
              <Field label="Longitude (optional)" error={errors.longitude}>
                <input
                  type="number"
                  min="-180"
                  max="180"
                  step="any"
                  value={draft.longitude}
                  onChange={(event) =>
                    setField("longitude", event.target.value)
                  }
                  className={inputClass(errors.longitude)}
                  placeholder="77.5946"
                />
              </Field>
              <Field label="Packaging" error={errors.packaging}>
                <input
                  value={draft.packaging}
                  onChange={(event) =>
                    setField("packaging", event.target.value)
                  }
                  className={inputClass(errors.packaging)}
                  placeholder="25 kg sealed bags on pallets"
                />
              </Field>
              <Field
                label="Safe handling requirements"
                error={errors.handlingRequirements}
                wide
              >
                <textarea
                  value={draft.handlingRequirements}
                  onChange={(event) =>
                    setField("handlingRequirements", event.target.value)
                  }
                  className={`${inputClass(errors.handlingRequirements)} min-h-24 py-3`}
                  placeholder="Loading equipment, moisture protection, PPE, storage conditions…"
                />
              </Field>
              <Field label="Commercial terms" wide>
                <textarea
                  value={draft.paymentTerms}
                  onChange={(event) =>
                    setField("paymentTerms", event.target.value)
                  }
                  className={`${inputClass()} min-h-20 py-3`}
                />
              </Field>
            </div>
          </Section>

          <Section title="Photos">
            <p className="mb-3 text-sm text-ink-500">
              Upload 1–5 genuine JPG/PNG files, maximum 10 MB each. Images are
              decoded, stripped of metadata, and thumbnail-generated.
            </p>
            <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-ink-400 bg-surface-sunken px-4 text-sm font-semibold hover:bg-surface-page">
              <ImagePlus size={18} /> Choose photos
              <input
                type="file"
                accept="image/jpeg,image/png"
                multiple
                className="sr-only"
                onChange={(event) => {
                  for (const file of Array.from(event.target.files || [])) {
                    void upload(file, "PHOTO");
                  }
                  event.target.value = "";
                }}
              />
            </label>
            {errors.photos && (
              <p className="mt-2 text-sm text-danger">{errors.photos}</p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {photos.map((photo, index) => (
                <div
                  key={photo.id}
                  className="overflow-hidden rounded-md border border-ink-200 bg-surface-card"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      photo.thumbnailUrl ||
                      `/api/listings/${listing?.id}/assets/${photo.id}?variant=thumbnail`
                    }
                    alt=""
                    className="h-36 w-full object-cover"
                  />
                  <div className="flex items-center justify-between gap-2 p-2">
                    <p className="min-w-0 truncate text-xs">
                      {photo.originalName}
                    </p>
                    <div className="flex gap-1">
                      <IconButton
                        label="Move photo earlier"
                        onClick={() => reorder(index, -1)}
                        disabled={index === 0}
                      >
                        <ArrowUp size={15} />
                      </IconButton>
                      <IconButton
                        label="Move photo later"
                        onClick={() => reorder(index, 1)}
                        disabled={index === photos.length - 1}
                      >
                        <ArrowDown size={15} />
                      </IconButton>
                      <IconButton
                        label="Remove photo"
                        onClick={() => removeAsset(photo)}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Private test reports and certificates">
            <p className="mb-3 text-sm text-ink-500">
              PDFs are private and available only to authorized listing owners
              and moderators. Maximum 15 MB.
            </p>
            <div className="flex flex-wrap gap-2">
              {(["TEST_REPORT", "CERTIFICATE"] as const).map((kind) => (
                <label
                  key={kind}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-ink-300 px-3 text-sm font-semibold hover:bg-surface-sunken"
                >
                  <FileText size={16} />
                  Add {kind === "TEST_REPORT" ? "test report" : "certificate"}
                  <input
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(file, kind);
                      event.target.value = "";
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {documents.map((document) => (
                <div
                  key={document.id}
                  className="flex min-h-11 items-center justify-between rounded-md bg-surface-sunken px-3 text-sm"
                >
                  <span className="truncate">
                    {document.kind.replace("_", " ")} · {document.originalName}
                  </span>
                  <IconButton
                    label="Remove document"
                    onClick={() => removeAsset(document)}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Declarations">
            <div className="space-y-3">
              <Check
                checked={draft.safetyDeclaration}
                onChange={(value) => setField("safetyDeclaration", value)}
                error={errors.safetyDeclaration}
                label="The material is non-hazardous and permitted by the Symbi-OS v0 policy."
              />
              <Check
                checked={draft.qualityDeclaration}
                onChange={(value) => setField("qualityDeclaration", value)}
                error={errors.qualityDeclaration}
                label="The grade, condition, quantity, and quality information is accurate."
              />
              <Check
                checked={draft.ownershipDeclaration}
                onChange={(value) => setField("ownershipDeclaration", value)}
                error={errors.ownershipDeclaration}
                label="My company owns or legally controls the listed material."
              />
              <Check
                checked={draft.authorityDeclaration}
                onChange={(value) => setField("authorityDeclaration", value)}
                error={errors.authorityDeclaration}
                label="I am authorized to offer this material for sale."
              />
            </div>
          </Section>

          {uploads.map((item, index) => (
            <div
              key={`${item.file.name}-${index}`}
              className={`rounded-md border p-3 text-sm ${
                item.state === "failed"
                  ? "border-danger-border bg-danger-subtle"
                  : "border-blue-200 bg-blue-50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">{item.file.name}</span>
                <span>
                  {item.state === "failed" ? item.error : `${item.progress}%`}
                </span>
              </div>
              {item.state === "failed" && (
                <button
                  onClick={() => {
                    setUploads((values) =>
                      values.filter((value) => value !== item),
                    );
                    void upload(item.file, item.kind);
                  }}
                  className="mt-2 flex min-h-10 items-center gap-2 font-semibold text-danger-strong"
                >
                  <RefreshCw size={15} /> Retry
                </button>
              )}
            </div>
          ))}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-lg border border-ink-200 bg-surface-card p-4 shadow-sm">
            <h2 className="font-semibold">Readiness</h2>
            <p className="mt-2 text-sm text-ink-500">
              {Object.keys(fieldErrors(draft, photos.length)).length} required
              item(s) remaining.
            </p>
            {listing?.moderationNote && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Moderator: {listing.moderationNote}
              </div>
            )}
            {message && (
              <div className="mt-3 rounded-md border border-brand-200 bg-brand-50 p-3 text-sm text-brand">
                {message}
              </div>
            )}
            {listing?.status === "PENDING_MODERATION" && (
              <div className="mt-4 flex items-start gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
                <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
                Submitted successfully. The listing is not public until a
                moderator approves it.
              </div>
            )}
          </section>

          <section className="rounded-lg border border-ink-200 bg-surface-card p-4 shadow-sm">
            <button
              onClick={() => setPreview((value) => !value)}
              className="min-h-11 w-full rounded-md border border-ink-300 px-4 text-sm font-semibold hover:bg-surface-sunken"
            >
              {preview ? "Hide preview" : "Preview listing"}
            </button>
            {preview && (
              <div className="mt-4 overflow-hidden rounded-md border border-ink-200">
                {photos[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      photos[0].thumbnailUrl ||
                      `/api/listings/${listing?.id}/assets/${photos[0].id}?variant=thumbnail`
                    }
                    alt=""
                    className="h-40 w-full object-cover"
                  />
                )}
                <div className="p-3">
                  <p className="font-semibold">
                    {draft.title || "Untitled listing"}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {draft.category} · {draft.subcategory || "Grade pending"}
                  </p>
                  <p className="mt-3 text-sm font-semibold">
                    {draft.priceMode === "ON_REQUEST"
                      ? "Price on request"
                      : `₹${Number(draft.pricePerUnit || 0).toLocaleString("en-IN")} / ${draft.unit}`}
                  </p>
                  <p className="mt-2 line-clamp-4 text-sm text-ink-600">
                    {draft.description || "Description preview"}
                  </p>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>

      <footer className="sticky bottom-0 z-20 border-t border-ink-200 bg-surface-card/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={saveDraft}
            disabled={busy}
            className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-ink-300 px-5 text-sm font-semibold hover:bg-surface-sunken disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Save size={16} />
            )}
            Save draft
          </button>
          <button
            onClick={submit}
            disabled={busy || listing?.status === "PENDING_MODERATION"}
            className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Send size={16} />
            )}
            Submit for moderation
          </button>
        </div>
      </footer>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-ink-200 bg-surface-card p-4 shadow-sm sm:p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  error,
  wide,
  children,
}: {
  label: string;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "block sm:col-span-2 lg:col-span-3" : "block"}>
      <span className="mb-1.5 block text-sm font-medium text-ink-700">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

function inputClass(error?: string) {
  return `min-h-11 w-full rounded-md border bg-surface-card px-3 text-sm outline-none focus:ring-2 ${
    error
      ? "border-red-400 focus:border-red-500 focus:ring-red-100"
      : "border-ink-300 focus:border-emerald-700 focus:ring-emerald-100"
  }`;
}

function Check({
  checked,
  onChange,
  label,
  error,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  error?: string;
}) {
  return (
    <label
      className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${
        error ? "border-red-300 bg-danger-subtle" : "border-ink-200"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 accent-emerald-700"
      />
      <span>{label}</span>
    </label>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-md text-ink-600 hover:bg-surface-page disabled:opacity-30"
    >
      {children}
    </button>
  );
}
