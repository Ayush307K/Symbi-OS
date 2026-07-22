"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";

type Step = "BUSINESS" | "TAX" | "BANK" | "KYC" | "WAREHOUSE" | "POLICY";

const STEPS: Step[] = ["BUSINESS", "TAX", "BANK", "KYC", "WAREHOUSE", "POLICY"];
const JSON_FIELDS: Record<Step, string> = {
  BUSINESS: "businessJson",
  TAX: "taxJson",
  BANK: "bankJson",
  KYC: "kycJson",
  WAREHOUSE: "warehouseJson",
  POLICY: "policyJson",
};

function readJson(value: unknown) {
  try {
    return value ? JSON.parse(String(value)) : {};
  } catch {
    return {};
  }
}

export function SellerOnboardingForm({
  onboarding,
  onChanged,
}: {
  onboarding: Record<string, any>;
  onChanged: () => Promise<void>;
}) {
  const firstMissing = useMemo(
    () => STEPS.find((step) => !onboarding[JSON_FIELDS[step]]) ?? "POLICY",
    [onboarding]
  );
  const [step, setStep] = useState<Step>(firstMissing);
  const [values, setValues] = useState<Record<string, any>>(() =>
    readJson(onboarding[JSON_FIELDS[firstMissing]])
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const editable = ["DRAFT", "REJECTED", "CHANGES_REQUIRED"].includes(onboarding.status);

  async function uploadDocument(kind: string, file: File) {
    setUploading(kind);
    setUploadProgress(0);
    setMessage(null);
    try {
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", "/api/seller/onboarding/documents");
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        request.onload = () => {
          const payload = JSON.parse(request.responseText || "{}");
          if (request.status >= 200 && request.status < 300) resolve();
          else reject(new Error(payload.error ?? "Upload failed."));
        };
        request.onerror = () => reject(new Error("Upload failed."));
        const form = new FormData();
        form.set("kind", kind);
        form.set("file", file);
        request.send(form);
      });
      setMessage(`${kind.replaceAll("_", " ")} uploaded privately.`);
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(null);
      setUploadProgress(0);
    }
  }

  async function removeDocument(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/seller/onboarding/documents/${id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to remove document.");
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove document.");
    } finally {
      setBusy(false);
    }
  }

  function choose(next: Step) {
    setStep(next);
    setValues(readJson(onboarding[JSON_FIELDS[next]]));
    setMessage(null);
  }

  function update(name: string, value: string | boolean) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function save(submit: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/seller/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, payload: values, submit }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save onboarding.");
      setMessage(body.message || `${step} saved.`);
      await onChanged();
      if (!submit) {
        const index = STEPS.indexOf(step);
        if (index < STEPS.length - 1) choose(STEPS[index + 1]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save onboarding.");
    } finally {
      setBusy(false);
    }
  }

  async function verifySandbox() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/seller/onboarding/verify-sandbox", {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Verification failed.");
      setMessage(
        "Sandbox verification approved. No government, tax, banking, or identity system was contacted."
      );
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Verification is in sandbox mode for v0. Validation and state transitions are
        real; GST, PAN, bank, and identity providers are not contacted.
      </div>
      <div className="rounded-md border border-stone-200 bg-white p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Onboarding completion</span>
          <span>{onboarding.completion?.percentage ?? 0}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full bg-emerald-700 transition-all"
            style={{ width: `${onboarding.completion?.percentage ?? 0}%` }}
          />
        </div>
        {(onboarding.completion?.missingSteps?.length > 0 ||
          onboarding.completion?.missingDocuments?.length > 0) && (
          <p className="mt-2 text-xs text-stone-500">
            Missing:{" "}
            {[
              ...(onboarding.completion?.missingSteps ?? []),
              ...(onboarding.completion?.missingDocuments ?? []),
            ]
              .map((value: string) => value.replaceAll("_", " "))
              .join(", ")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {STEPS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => choose(item)}
            className={`rounded-md px-3 py-2 text-xs font-semibold ${
              step === item
                ? "bg-emerald-800 text-white"
                : onboarding[JSON_FIELDS[item]]
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-stone-100 text-stone-600"
            }`}
          >
            {onboarding[JSON_FIELDS[item]] ? "✓ " : ""}
            {item}
          </button>
        ))}
      </div>

      <div className="rounded-md border border-stone-200 p-4">
        <h3 className="font-semibold">Private verification documents</h3>
        <p className="mt-1 text-sm text-stone-500">
          PDF only, maximum 15 MB. Files with scripts, launch actions, or embedded
          content are rejected. Access is restricted to you and moderators.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["REGISTRATION", "Business registration"],
            ["GST_CERTIFICATE", "GST certificate"],
            ["KYC_ID", "Authorized signatory KYC"],
            ["BANK_PROOF", "Cancelled cheque / bank proof"],
            ["WAREHOUSE_PROOF", "Warehouse proof (optional)"],
          ].map(([kind, label]) => {
            const document = onboarding.documents?.find(
              (item: any) => item.kind === kind,
            );
            return (
              <div key={kind} className="rounded-md border border-stone-200 p-3">
                <p className="text-sm font-semibold">{label}</p>
                {document ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <a
                      href={document.url}
                      className="text-xs font-semibold text-emerald-700 underline"
                    >
                      {document.originalName}
                    </a>
                    {editable && (
                      <button
                        onClick={() => void removeDocument(document.id)}
                        className="text-xs font-semibold text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ) : editable ? (
                  <label className="mt-2 flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-dashed border-stone-300 px-3 text-xs font-semibold">
                    {uploading === kind
                      ? `Uploading ${uploadProgress}%`
                      : "Choose PDF"}
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      disabled={Boolean(uploading)}
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadDocument(kind, file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                ) : (
                  <p className="mt-2 text-xs text-stone-400">Not uploaded</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border border-stone-200 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{step.replace("_", " ")}</h3>
            <p className="text-sm text-stone-500">Status: {onboarding.status}</p>
          </div>
          {onboarding.status === "APPROVED" && (
            <BadgeCheck className="text-emerald-700" aria-label="Approved" />
          )}
        </div>
        {step === "BUSINESS" && (
          <Grid>
            <Input label="Legal business name" name="legalName" value={values.legalName} update={update} />
            <Select
              label="Entity type"
              name="entityType"
              value={values.entityType}
              update={update}
              options={["PROPRIETORSHIP", "PARTNERSHIP", "LLP", "PRIVATE_LIMITED", "PUBLIC_LIMITED"]}
            />
            <Input label="Registration number" name="registrationNumber" value={values.registrationNumber} update={update} />
            <Input label="Indian mobile number" name="phone" value={values.phone} update={update} />
          </Grid>
        )}
        {step === "TAX" && (
          <Grid>
            <Input label="GSTIN" name="gst" value={values.gst} update={update} />
            <Input label="PAN" name="pan" value={values.pan} update={update} />
          </Grid>
        )}
        {step === "BANK" && (
          <Grid>
            <Input label="Account holder" name="accountHolder" value={values.accountHolder} update={update} />
            <Input label="Account number (sandbox)" name="accountNumber" value={values.accountNumber?.replace?.("••••", "")} update={update} />
            <Input label="IFSC" name="ifsc" value={values.ifsc} update={update} />
            <Check label="I consent to sandbox bank validation." name="consent" checked={values.consent} update={update} />
          </Grid>
        )}
        {step === "KYC" && (
          <Grid>
            <Input label="Authorized signatory" name="authorizedSignatory" value={values.authorizedSignatory} update={update} />
            <Input label="Designation" name="designation" value={values.designation} update={update} />
            <Select label="Document type" name="documentType" value={values.documentType} update={update} options={["PAN", "AADHAAR_LAST4", "PASSPORT"]} />
            <Input label="Document reference (sandbox)" name="documentReference" value={values.documentReference} update={update} />
          </Grid>
        )}
        {step === "WAREHOUSE" && (
          <Grid>
            <Input label="Warehouse address" name="addressLine" value={values.addressLine} update={update} />
            <Input label="City" name="city" value={values.city} update={update} />
            <Input label="State" name="state" value={values.state} update={update} />
            <Input label="Pincode" name="pincode" value={values.pincode} update={update} />
          </Grid>
        )}
        {step === "POLICY" && (
          <div className="space-y-3">
            <Check label="I accept the marketplace terms." name="acceptsMarketplaceTerms" checked={values.acceptsMarketplaceTerms} update={update} />
            <Check label="I will list only non-hazardous industrial by-products." name="confirmsNonHazardousOnly" checked={values.confirmsNonHazardousOnly} update={update} />
            <Check label="I understand this v0 uses sandbox verification." name="acceptsSandboxVerification" checked={values.acceptsSandboxVerification} update={update} />
          </div>
        )}
        {editable && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => save(false)}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Save step
            </button>
            {step === "POLICY" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => save(true)}
                className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Submit complete onboarding
              </button>
            )}
          </div>
        )}
        {onboarding.status === "UNDER_REVIEW" && (
          <button
            type="button"
            disabled={busy}
            onClick={verifySandbox}
            className="mt-5 rounded-md bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Run sandbox verification
          </button>
        )}
        {busy && <Loader2 className="mt-4 animate-spin text-emerald-700" size={18} />}
        {message && <p className="mt-4 text-sm text-stone-700">{message}</p>}
        {onboarding.reviewerNote && (
          <p className="mt-3 rounded-md bg-stone-100 p-3 text-sm text-stone-700">
            {onboarding.reviewerNote}
          </p>
        )}
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function Input({
  label,
  name,
  value,
  update,
}: {
  label: string;
  name: string;
  value?: string;
  update: (name: string, value: string) => void;
}) {
  return (
    <label className="text-sm font-medium text-stone-700">
      {label}
      <input
        required
        value={value ?? ""}
        onChange={(event) => update(name, event.target.value)}
        className="mt-1.5 h-10 w-full rounded-md border border-stone-300 px-3 font-normal outline-none focus:border-emerald-700"
      />
    </label>
  );
}

function Select({
  label,
  name,
  value,
  update,
  options,
}: {
  label: string;
  name: string;
  value?: string;
  update: (name: string, value: string) => void;
  options: string[];
}) {
  return (
    <label className="text-sm font-medium text-stone-700">
      {label}
      <select
        required
        value={value ?? ""}
        onChange={(event) => update(name, event.target.value)}
        className="mt-1.5 h-10 w-full rounded-md border border-stone-300 px-3 font-normal outline-none focus:border-emerald-700"
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}

function Check({
  label,
  name,
  checked,
  update,
}: {
  label: string;
  name: string;
  checked?: boolean;
  update: (name: string, value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-stone-700">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => update(name, event.target.checked)}
        className="mt-0.5"
      />
      {label}
    </label>
  );
}
