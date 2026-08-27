"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileCheck2,
  Landmark,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  UploadCloud,
  UserCheck,
  Warehouse,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MarketplaceNav } from "@/components/marketplace/MarketplaceNav";
import { Button, buttonClassName } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { StatusPill } from "@/components/ui/StatusPill";
import { cn } from "@/lib/cn";

type Step = "BUSINESS" | "TAX" | "BANK" | "KYC" | "WAREHOUSE" | "POLICY";
type RouteStep = Lowercase<Step> | "review";

interface OnboardingDocument {
  id: string;
  kind: string;
  originalName: string;
  sizeBytes: number;
  url: string;
}

interface JourneyStep {
  step: Step;
  detailsComplete: boolean;
  documentKind: string | null;
  documentComplete: boolean;
  complete: boolean;
}

interface OnboardingResponse {
  onboarding: Record<string, unknown> & {
    status: string;
    reviewerNote?: string | null;
    businessJson?: string | null;
    taxJson?: string | null;
    bankJson?: string | null;
    kycJson?: string | null;
    warehouseJson?: string | null;
    policyJson?: string | null;
  };
  documents: OnboardingDocument[];
  completion: {
    percentage: number;
    missingSteps: string[];
    missingDocuments: string[];
  };
  journey: {
    currentStep: Step | "REVIEW";
    completedSteps: Step[];
    percentage: number;
    steps: JourneyStep[];
  };
  verificationMode: "SANDBOX" | "MANUAL";
}

interface StepDefinition {
  id: Step;
  slug: Lowercase<Step>;
  title: string;
  shortTitle: string;
  description: string;
  icon: React.ElementType;
  document?: {
    kind: string;
    label: string;
    description: string;
    required: boolean;
  };
}

const STEPS: StepDefinition[] = [
  {
    id: "BUSINESS",
    slug: "business",
    title: "Business details",
    shortTitle: "Business",
    description: "Tell us about the legal entity that will sell on Symbi-OS.",
    icon: Building2,
    document: {
      kind: "REGISTRATION",
      label: "Business registration proof",
      description:
        "Certificate of incorporation, Udyam certificate, or partnership registration.",
      required: true,
    },
  },
  {
    id: "TAX",
    slug: "tax",
    title: "Tax information",
    shortTitle: "Tax",
    description:
      "Provide the GST and PAN details used for marketplace invoices.",
    icon: ReceiptText,
    document: {
      kind: "GST_CERTIFICATE",
      label: "GST registration certificate",
      description:
        "Upload the certificate showing the GSTIN entered on this page.",
      required: true,
    },
  },
  {
    id: "BANK",
    slug: "bank",
    title: "Settlement account",
    shortTitle: "Bank",
    description:
      "Add the business bank account that will receive settlement payments.",
    icon: Landmark,
    document: {
      kind: "BANK_PROOF",
      label: "Bank account proof",
      description:
        "Upload a cancelled cheque or recent bank letter for this account.",
      required: true,
    },
  },
  {
    id: "KYC",
    slug: "kyc",
    title: "Authorized signatory",
    shortTitle: "KYC",
    description:
      "Identify the person authorized to act for this seller account.",
    icon: UserCheck,
    document: {
      kind: "KYC_ID",
      label: "Signatory identity proof",
      description: "Upload the identity document referenced on this page.",
      required: true,
    },
  },
  {
    id: "WAREHOUSE",
    slug: "warehouse",
    title: "Dispatch location",
    shortTitle: "Warehouse",
    description:
      "Set the primary location from which listed material will be dispatched.",
    icon: Warehouse,
    document: {
      kind: "WAREHOUSE_PROOF",
      label: "Warehouse proof",
      description:
        "Optional lease, utility bill, or ownership proof for the dispatch location.",
      required: false,
    },
  },
  {
    id: "POLICY",
    slug: "policy",
    title: "Policies and declarations",
    shortTitle: "Policies",
    description:
      "Confirm the marketplace safety rules before reviewing your application.",
    icon: ShieldCheck,
  },
];

const ROUTES: RouteStep[] = [...STEPS.map((step) => step.slug), "review"];
const JSON_FIELDS: Record<Step, keyof OnboardingResponse["onboarding"]> = {
  BUSINESS: "businessJson",
  TAX: "taxJson",
  BANK: "bankJson",
  KYC: "kycJson",
  WAREHOUSE: "warehouseJson",
  POLICY: "policyJson",
};
const SENSITIVE_STEPS = new Set<Step>(["TAX", "BANK", "KYC"]);

function readJson(value: unknown) {
  try {
    return value ? (JSON.parse(String(value)) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function routeFor(step: Step | "REVIEW") {
  return `/seller/onboarding/${step.toLowerCase()}`;
}

function errorFields(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const details = (payload as { details?: unknown }).details;
  if (!details || typeof details !== "object") return {};
  const fields = (details as { fields?: unknown }).fields;
  return fields && typeof fields === "object"
    ? (fields as Record<string, string>)
    : {};
}

export function SellerOnboardingWizard() {
  const router = useRouter();
  const params = useParams<{ step?: string | string[] }>();
  const rawStep = Array.isArray(params.step) ? params.step[0] : params.step;
  const requested = ROUTES.includes(rawStep as RouteStep)
    ? (rawStep as RouteStep)
    : null;
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const response = await fetch("/api/seller/onboarding", {
      cache: "no-store",
    });
    const payload = (await response.json()) as OnboardingResponse & {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load seller onboarding.");
    }
    setData(payload);
    return payload;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((error) => {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load seller onboarding.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const currentRoute = data.journey.currentStep.toLowerCase() as RouteStep;
    const currentIndex = ROUTES.indexOf(currentRoute);
    const requestedIndex = requested ? ROUTES.indexOf(requested) : -1;
    if (!requested || requestedIndex > currentIndex) {
      router.replace(routeFor(data.journey.currentStep));
    }
  }, [data, requested, router]);

  if (loading) return <WizardLoading />;
  if (loadError || !data) {
    return (
      <WizardShell>
        <div className="mx-auto max-w-xl rounded-panel border border-danger-border bg-danger-subtle p-6 text-center">
          <h1 className="text-lg font-semibold text-danger-strong">
            Onboarding unavailable
          </h1>
          <p className="mt-2 text-sm text-danger-strong">{loadError}</p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </WizardShell>
    );
  }

  const currentRoute = data.journey.currentStep.toLowerCase() as RouteStep;
  const requestedIsAllowed =
    requested !== null &&
    ROUTES.indexOf(requested) <= ROUTES.indexOf(currentRoute);
  const activeRoute = requestedIsAllowed ? requested : null;
  const activeStep = STEPS.find((step) => step.slug === activeRoute);
  return (
    <WizardShell>
      <WizardHeader data={data} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <JourneyNavigation data={data} active={activeRoute ?? currentRoute} />
        <div className="min-w-0">
          {activeRoute === "review" ? (
            <ReviewStep data={data} reload={load} />
          ) : activeStep ? (
            <OnboardingStepPage
              definition={activeStep}
              data={data}
              reload={load}
            />
          ) : (
            <div className="flex min-h-72 items-center justify-center">
              <Spinner label="Opening your current step" />
            </div>
          )}
        </div>
      </div>
    </WizardShell>
  );
}

function WizardShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-surface-page text-ink-900">
      <MarketplaceNav />
      <div className="mx-auto max-w-[1180px] px-4 py-7 sm:px-6 lg:py-10">
        {children}
      </div>
    </main>
  );
}

function WizardLoading() {
  return (
    <WizardShell>
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" label="Loading seller onboarding" />
      </div>
    </WizardShell>
  );
}

function WizardHeader({ data }: { data: OnboardingResponse }) {
  return (
    <header className="flex flex-col gap-4 border-b border-ink-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Link
          href="/seller"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-copper-800 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          Seller dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Set up your seller account
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">
          Complete each verified-business step in order. Your progress is saved
          between sessions.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <StatusPill status={data.onboarding.status} />
        <span className="text-sm font-medium text-ink-600">
          {data.journey.percentage}% complete
        </span>
      </div>
    </header>
  );
}

function JourneyNavigation({
  data,
  active,
}: {
  data: OnboardingResponse;
  active: RouteStep;
}) {
  const currentRoute = data.journey.currentStep.toLowerCase() as RouteStep;
  const currentIndex = ROUTES.indexOf(currentRoute);
  return (
    <aside className="h-fit rounded-panel border border-ink-200 bg-surface-card p-4 shadow-card">
      <div className="flex items-center justify-between text-[13px] font-medium">
        <span>Application progress</span>
        <span className="text-ink-500">
          {data.journey.completedSteps.length} of {STEPS.length} steps
        </span>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-100"
        role="progressbar"
        aria-label="Seller onboarding progress"
        aria-valuenow={data.journey.percentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-copper-700 transition-[width]"
          style={{ width: `${data.journey.percentage}%` }}
        />
      </div>
      <ol className="mt-5 space-y-1">
        {STEPS.map((step, index) => {
          const state = data.journey.steps.find(
            (item) => item.step === step.id,
          );
          const locked = index > currentIndex;
          return (
            <li key={step.id}>
              <JourneyItem
                href={`/seller/onboarding/${step.slug}`}
                label={step.shortTitle}
                index={index + 1}
                active={active === step.slug}
                complete={Boolean(state?.complete)}
                locked={locked}
              />
            </li>
          );
        })}
        <li>
          <JourneyItem
            href="/seller/onboarding/review"
            label="Review & submit"
            index={7}
            active={active === "review"}
            complete={["UNDER_REVIEW", "APPROVED"].includes(
              data.onboarding.status,
            )}
            locked={currentIndex < ROUTES.length - 1}
          />
        </li>
      </ol>
      <p className="mt-5 border-t border-ink-100 pt-4 text-xs leading-5 text-ink-500">
        Required PDFs are private and visible only to your account and
        authorized reviewers.
      </p>
    </aside>
  );
}

function JourneyItem({
  href,
  label,
  index,
  active,
  complete,
  locked,
}: {
  href: string;
  label: string;
  index: number;
  active: boolean;
  complete: boolean;
  locked: boolean;
}) {
  const content = (
    <>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          complete && "border-success bg-success text-white",
          active && !complete && "border-copper-700 bg-copper-700 text-white",
          !active && !complete && "border-ink-200 bg-surface-card text-ink-500",
        )}
      >
        {complete ? (
          <Check className="h-4 w-4" />
        ) : locked ? (
          <LockKeyhole className="h-3.5 w-3.5" />
        ) : (
          index
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? <ChevronRight className="h-4 w-4" /> : null}
    </>
  );
  const classes = cn(
    "flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-sm font-medium",
    active ? "bg-copper-50 text-copper-900" : "text-ink-600",
    !locked && !active && "hover:bg-ink-50 hover:text-ink-900",
    locked && "cursor-not-allowed opacity-55",
  );
  return locked ? (
    <div
      className={classes}
      aria-disabled="true"
      title="Complete the previous step first"
    >
      {content}
    </div>
  ) : (
    <Link
      href={href}
      className={classes}
      aria-current={active ? "step" : undefined}
    >
      {content}
    </Link>
  );
}

function OnboardingStepPage({
  definition,
  data,
  reload,
}: {
  definition: StepDefinition;
  data: OnboardingResponse;
  reload: () => Promise<OnboardingResponse>;
}) {
  const router = useRouter();
  const field = JSON_FIELDS[definition.id];
  const existingValue = data.onboarding[field];
  const existing = Boolean(existingValue);
  const journeyState = data.journey.steps.find(
    (step) => step.step === definition.id,
  );
  const editable = ["DRAFT", "REJECTED", "CHANGES_REQUIRED"].includes(
    data.onboarding.status,
  );
  const sensitive = SENSITIVE_STEPS.has(definition.id);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    readJson(existingValue),
  );
  const [editingSensitive, setEditingSensitive] = useState(!existing);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setValues(readJson(existingValue));
    setEditingSensitive(!existing);
    setFieldErrors({});
    setMessage(null);
  }, [definition.id, existing, existingValue]);

  function update(name: string, value: string | boolean) {
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function save(destination: "CONTINUE" | "EXIT") {
    setBusy(true);
    setMessage(null);
    setFieldErrors({});
    try {
      const response = await fetch("/api/seller/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: definition.id, payload: values }),
      });
      const payload = (await response.json()) as {
        error?: string;
        details?: unknown;
      };
      if (!response.ok) {
        setFieldErrors(errorFields(payload));
        throw new Error(payload.error ?? "Unable to save this step.");
      }
      const refreshed = await reload();
      if (destination === "EXIT") {
        router.push("/seller");
        return;
      }
      const state = refreshed.journey.steps.find(
        (step) => step.step === definition.id,
      );
      if (!state?.complete) {
        setMessage(
          definition.document?.required
            ? `Details saved. Upload ${definition.document.label.toLowerCase()} to continue.`
            : "Details saved. Complete the remaining requirement to continue.",
        );
        return;
      }
      const index = STEPS.findIndex((step) => step.id === definition.id);
      const next = STEPS[index + 1];
      router.push(
        next ? `/seller/onboarding/${next.slug}` : "/seller/onboarding/review",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save this step.",
      );
    } finally {
      setBusy(false);
    }
  }

  function continueWithoutSaving() {
    if (!journeyState?.complete) {
      setMessage(
        definition.document?.required
          ? `Upload ${definition.document.label.toLowerCase()} to continue.`
          : "Complete this step before continuing.",
      );
      return;
    }
    const index = STEPS.findIndex((step) => step.id === definition.id);
    const next = STEPS[index + 1];
    router.push(
      next ? `/seller/onboarding/${next.slug}` : "/seller/onboarding/review",
    );
  }

  const showSensitiveSummary = sensitive && existing && !editingSensitive;
  const Icon = definition.icon;
  return (
    <section className="overflow-hidden rounded-panel border border-ink-200 bg-surface-card shadow-card">
      <div className="border-b border-ink-200 px-5 py-5 sm:px-7">
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-copper-50 text-copper-800">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-copper-800">
              Step {STEPS.findIndex((step) => step.id === definition.id) + 1} of{" "}
              {STEPS.length}
            </p>
            <h2 className="mt-1 text-xl font-semibold">{definition.title}</h2>
            <p className="mt-1 text-sm text-ink-500">
              {definition.description}
            </p>
          </div>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!editable || showSensitiveSummary) continueWithoutSaving();
          else void save("CONTINUE");
        }}
        className="space-y-7 px-5 py-6 sm:px-7"
      >
        {data.onboarding.reviewerNote &&
        ["REJECTED", "CHANGES_REQUIRED"].includes(data.onboarding.status) ? (
          <div className="rounded-control border border-warning-border bg-warning-subtle p-4 text-sm text-warning-strong">
            <p className="font-semibold">Reviewer requested an update</p>
            <p className="mt-1">{data.onboarding.reviewerNote}</p>
          </div>
        ) : null}

        {showSensitiveSummary ? (
          <SensitiveSummary
            step={definition.id}
            values={values}
            editable={editable}
            onEdit={() => {
              setValues(editableSensitiveValues(definition.id, values));
              setEditingSensitive(true);
            }}
          />
        ) : (
          <StepFields
            step={definition.id}
            values={values}
            errors={fieldErrors}
            disabled={!editable || busy}
            update={update}
          />
        )}

        {definition.document ? (
          <DocumentUpload
            definition={definition.document}
            document={data.documents.find(
              (document) => document.kind === definition.document?.kind,
            )}
            disabled={!editable || busy}
            reload={reload}
            onMessage={setMessage}
          />
        ) : null}

        {message ? (
          <p
            role="status"
            className={cn(
              "rounded-control border px-4 py-3 text-sm",
              Object.keys(fieldErrors).length
                ? "border-danger-border bg-danger-subtle text-danger-strong"
                : "border-ink-200 bg-surface-sunken text-ink-700",
            )}
          >
            {message}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => router.push("/seller")}
            disabled={busy}
          >
            Exit onboarding
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {editable && !showSensitiveSummary ? (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() => void save("EXIT")}
              >
                Save and exit
              </Button>
            ) : null}
            {editable || journeyState?.complete ? (
              <Button
                type="submit"
                variant="primary"
                loading={busy}
                trailingIcon={<ChevronRight className="h-4 w-4" />}
              >
                {!editable || (journeyState?.complete && showSensitiveSummary)
                  ? "Continue"
                  : "Save and continue"}
              </Button>
            ) : (
              <Link
                href="/seller/onboarding/review"
                className={buttonClassName({ variant: "primary" })}
              >
                Back to application status
              </Link>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}

function editableSensitiveValues(step: Step, current: Record<string, unknown>) {
  if (step === "TAX") return { gst: "", pan: "" };
  if (step === "BANK") {
    return { ...current, accountNumber: "" };
  }
  if (step === "KYC") {
    return { ...current, documentReference: "" };
  }
  return current;
}

function StepFields({
  step,
  values,
  errors,
  disabled,
  update,
}: {
  step: Step;
  values: Record<string, unknown>;
  errors: Record<string, string>;
  disabled: boolean;
  update: (name: string, value: string | boolean) => void;
}) {
  const value = (name: string) => String(values[name] ?? "");
  const common = "grid gap-5 sm:grid-cols-2";
  if (step === "BUSINESS") {
    return (
      <div className={common}>
        <Input
          label="Legal business name"
          required
          maxLength={160}
          autoComplete="organization"
          disabled={disabled}
          value={value("legalName")}
          error={errors.legalName}
          onChange={(event) => update("legalName", event.target.value)}
        />
        <Select
          label="Entity type"
          required
          disabled={disabled}
          value={value("entityType")}
          error={errors.entityType}
          onChange={(event) => update("entityType", event.target.value)}
        >
          <option value="">Select entity type</option>
          <option value="PROPRIETORSHIP">Proprietorship</option>
          <option value="PARTNERSHIP">Partnership</option>
          <option value="LLP">Limited liability partnership</option>
          <option value="PRIVATE_LIMITED">Private limited company</option>
          <option value="PUBLIC_LIMITED">Public limited company</option>
        </Select>
        <Input
          label="Registration number"
          required
          maxLength={40}
          disabled={disabled}
          value={value("registrationNumber")}
          error={errors.registrationNumber}
          onChange={(event) =>
            update("registrationNumber", event.target.value.toUpperCase())
          }
        />
        <Input
          label="Business mobile number"
          required
          inputMode="numeric"
          autoComplete="tel"
          pattern="[6-9][0-9]{9}"
          maxLength={10}
          hint="10-digit Indian mobile number"
          disabled={disabled}
          value={value("phone")}
          error={errors.phone}
          onChange={(event) =>
            update("phone", event.target.value.replace(/\D/g, "").slice(0, 10))
          }
        />
      </div>
    );
  }
  if (step === "TAX") {
    return (
      <div className={common}>
        <Input
          label="GSTIN"
          required
          autoCapitalize="characters"
          maxLength={15}
          hint="15-character GST registration number"
          disabled={disabled}
          value={value("gst")}
          error={errors.gst}
          onChange={(event) =>
            update("gst", event.target.value.toUpperCase().replace(/\s/g, ""))
          }
        />
        <Input
          label="PAN"
          required
          autoCapitalize="characters"
          maxLength={10}
          hint="PAN must match the value embedded in the GSTIN"
          disabled={disabled}
          value={value("pan")}
          error={errors.pan}
          onChange={(event) =>
            update("pan", event.target.value.toUpperCase().replace(/\s/g, ""))
          }
        />
      </div>
    );
  }
  if (step === "BANK") {
    return (
      <div className={common}>
        <Input
          label="Account holder name"
          required
          maxLength={160}
          autoComplete="name"
          disabled={disabled}
          value={value("accountHolder")}
          error={errors.accountHolder}
          onChange={(event) => update("accountHolder", event.target.value)}
        />
        <SensitiveInput
          label="Bank account number"
          required
          inputMode="numeric"
          autoComplete="off"
          minLength={9}
          maxLength={18}
          disabled={disabled}
          value={value("accountNumber")}
          error={errors.accountNumber}
          onChange={(next) =>
            update("accountNumber", next.replace(/\D/g, "").slice(0, 18))
          }
        />
        <Input
          label="IFSC code"
          required
          maxLength={11}
          autoCapitalize="characters"
          disabled={disabled}
          value={value("ifsc")}
          error={errors.ifsc}
          onChange={(event) =>
            update("ifsc", event.target.value.toUpperCase().replace(/\s/g, ""))
          }
        />
        <CheckboxField
          label="I authorize Symbi-OS to validate this settlement account in sandbox mode."
          checked={Boolean(values.consent)}
          disabled={disabled}
          error={errors.consent}
          onChange={(checked) => update("consent", checked)}
        />
      </div>
    );
  }
  if (step === "KYC") {
    return (
      <div className={common}>
        <Input
          label="Authorized signatory"
          required
          maxLength={160}
          autoComplete="name"
          disabled={disabled}
          value={value("authorizedSignatory")}
          error={errors.authorizedSignatory}
          onChange={(event) =>
            update("authorizedSignatory", event.target.value)
          }
        />
        <Input
          label="Designation"
          required
          maxLength={120}
          disabled={disabled}
          value={value("designation")}
          error={errors.designation}
          onChange={(event) => update("designation", event.target.value)}
        />
        <Select
          label="Identity document"
          required
          disabled={disabled}
          value={value("documentType")}
          error={errors.documentType}
          onChange={(event) => update("documentType", event.target.value)}
        >
          <option value="">Select document</option>
          <option value="PAN">PAN</option>
          <option value="AADHAAR_LAST4">Aadhaar (last four digits only)</option>
          <option value="PASSPORT">Passport</option>
        </Select>
        <SensitiveInput
          label="Document reference"
          required
          maxLength={40}
          disabled={disabled}
          value={value("documentReference")}
          error={errors.documentReference}
          onChange={(next) => update("documentReference", next.trimStart())}
        />
      </div>
    );
  }
  if (step === "WAREHOUSE") {
    return (
      <div className={common}>
        <Input
          label="Address"
          required
          maxLength={240}
          autoComplete="street-address"
          containerClassName="sm:col-span-2"
          disabled={disabled}
          value={value("addressLine")}
          error={errors.addressLine}
          onChange={(event) => update("addressLine", event.target.value)}
        />
        <Input
          label="City"
          required
          maxLength={100}
          autoComplete="address-level2"
          disabled={disabled}
          value={value("city")}
          error={errors.city}
          onChange={(event) => update("city", event.target.value)}
        />
        <Input
          label="State"
          required
          maxLength={100}
          autoComplete="address-level1"
          disabled={disabled}
          value={value("state")}
          error={errors.state}
          onChange={(event) => update("state", event.target.value)}
        />
        <Input
          label="Pincode"
          required
          inputMode="numeric"
          autoComplete="postal-code"
          pattern="[1-9][0-9]{5}"
          maxLength={6}
          disabled={disabled}
          value={value("pincode")}
          error={errors.pincode}
          onChange={(event) =>
            update("pincode", event.target.value.replace(/\D/g, "").slice(0, 6))
          }
        />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <CheckboxField
        label="I accept the Symbi-OS marketplace terms and seller obligations."
        checked={Boolean(values.acceptsMarketplaceTerms)}
        disabled={disabled}
        error={errors.acceptsMarketplaceTerms}
        onChange={(checked) => update("acceptsMarketplaceTerms", checked)}
      />
      <CheckboxField
        label="I confirm that I will list only permitted, non-hazardous industrial by-products."
        checked={Boolean(values.confirmsNonHazardousOnly)}
        disabled={disabled}
        error={errors.confirmsNonHazardousOnly}
        onChange={(checked) => update("confirmsNonHazardousOnly", checked)}
      />
      <CheckboxField
        label="I understand that identity, tax, and banking checks use sandbox verification in this version."
        checked={Boolean(values.acceptsSandboxVerification)}
        disabled={disabled}
        error={errors.acceptsSandboxVerification}
        onChange={(checked) => update("acceptsSandboxVerification", checked)}
      />
    </div>
  );
}

function SensitiveInput({
  label,
  value,
  error,
  onChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      label={label}
      type={visible ? "text" : "password"}
      value={value}
      error={error}
      onChange={(event) => onChange(event.target.value)}
      trailingAction={
        <button
          type="button"
          aria-label={
            visible
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
          aria-pressed={visible}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((current) => !current)}
          className="flex h-8 w-8 items-center justify-center rounded-control text-ink-500 hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-copper-700"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      }
    />
  );
}

function CheckboxField({
  label,
  checked,
  disabled,
  error,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  error?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "block rounded-control border p-3",
        error ? "border-danger bg-danger-subtle" : "border-ink-200",
        disabled && "opacity-65",
      )}
    >
      <span className="flex items-start gap-3 text-sm text-ink-700">
        <input
          type="checkbox"
          required
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-copper-700"
        />
        <span>{label}</span>
      </span>
      {error ? (
        <span className="mt-1 block pl-7 text-xs text-danger">{error}</span>
      ) : null}
    </label>
  );
}

function SensitiveSummary({
  step,
  values,
  editable,
  onEdit,
}: {
  step: Step;
  values: Record<string, unknown>;
  editable: boolean;
  onEdit: () => void;
}) {
  const fields =
    step === "TAX"
      ? [
          ["GSTIN", values.gst],
          ["PAN", values.pan],
        ]
      : step === "BANK"
        ? [
            ["Account holder", values.accountHolder],
            ["Account number", values.accountNumber],
            ["IFSC", values.ifsc],
          ]
        : [
            ["Authorized signatory", values.authorizedSignatory],
            ["Designation", values.designation],
            ["Document", values.documentType],
            ["Reference", values.documentReference],
          ];
  return (
    <div className="rounded-control border border-success-border bg-success-subtle p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-success-strong">
          <FileCheck2 className="h-4 w-4" />
          Information saved securely
        </div>
        {editable ? (
          <Button size="sm" onClick={onEdit}>
            Update information
          </Button>
        ) : null}
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {fields.map(([label, fieldValue]) => (
          <div key={String(label)}>
            <dt className="text-xs text-ink-500">{String(label)}</dt>
            <dd className="mt-0.5 text-sm font-medium text-ink-800">
              {String(fieldValue ?? "—").replaceAll("_", " ")}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DocumentUpload({
  definition,
  document,
  disabled,
  reload,
  onMessage,
}: {
  definition: NonNullable<StepDefinition["document"]>;
  document?: OnboardingDocument;
  disabled: boolean;
  reload: () => Promise<OnboardingResponse>;
  onMessage: (message: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [progress, setProgress] = useState(0);

  async function upload(file: File) {
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      onMessage("Choose a PDF document.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      onMessage("The PDF must be 15 MB or smaller.");
      return;
    }
    setUploading(true);
    setProgress(0);
    onMessage(null);
    try {
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", "/api/seller/onboarding/documents");
        request.upload.onprogress = (event) => {
          if (event.lengthComputable)
            setProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onload = () => {
          const payload = JSON.parse(request.responseText || "{}") as {
            error?: string;
          };
          if (request.status >= 200 && request.status < 300) resolve();
          else reject(new Error(payload.error ?? "Document upload failed."));
        };
        request.onerror = () => reject(new Error("Document upload failed."));
        const form = new FormData();
        form.set("kind", definition.kind);
        form.set("file", file);
        request.send(form);
      });
      await reload();
      onMessage(`${definition.label} uploaded securely.`);
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "Document upload failed.",
      );
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function remove() {
    if (!document) return;
    setRemoving(true);
    onMessage(null);
    try {
      const response = await fetch(
        `/api/seller/onboarding/documents/${document.id}`,
        {
          method: "DELETE",
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to remove document.");
      await reload();
      onMessage("Document removed.");
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "Unable to remove document.",
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="rounded-control border border-ink-200 bg-surface-sunken p-4">
      <div className="flex items-start gap-3">
        <UploadCloud className="mt-0.5 h-5 w-5 shrink-0 text-copper-800" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            {definition.label}
            {definition.required ? (
              <span className="ml-1 text-danger">*</span>
            ) : (
              <span className="ml-2 text-xs font-normal text-ink-500">
                Optional
              </span>
            )}
          </h3>
          <p className="mt-1 text-xs leading-5 text-ink-500">
            {definition.description}
          </p>
          <p className="text-xs text-ink-500">PDF only · maximum 15 MB</p>
        </div>
      </div>
      {document ? (
        <div className="mt-4 flex flex-col gap-3 rounded-control border border-success-border bg-surface-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <BadgeCheck className="h-5 w-5 shrink-0 text-success" />
            <div className="min-w-0">
              <a
                href={document.url}
                className="block truncate text-sm font-medium text-copper-800 hover:underline"
              >
                {document.originalName}
              </a>
              <p className="text-xs text-ink-500">
                {formatBytes(document.sizeBytes)} · uploaded securely
              </p>
            </div>
          </div>
          {!disabled ? (
            <div className="flex shrink-0 items-center gap-2">
              <UploadLabel
                label="Replace"
                disabled={uploading || removing}
                onFile={upload}
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                loading={removing}
                leadingIcon={<X className="h-4 w-4" />}
                onClick={() => void remove()}
              >
                Remove
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          <UploadLabel
            label={uploading ? `Uploading ${progress}%` : "Choose PDF"}
            disabled={disabled || uploading}
            onFile={upload}
          />
          {uploading ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full bg-copper-700 transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function UploadLabel({
  label,
  disabled,
  onFile,
}: {
  label: string;
  disabled: boolean;
  onFile: (file: File) => Promise<void>;
}) {
  return (
    <label
      className={buttonClassName({
        variant: "secondary",
        size: "sm",
        className: disabled
          ? "pointer-events-none opacity-60"
          : "cursor-pointer",
      })}
    >
      <UploadCloud className="h-4 w-4" />
      {label}
      <input
        type="file"
        accept="application/pdf,.pdf"
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void onFile(file);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function ReviewStep({
  data,
  reload,
}: {
  data: OnboardingResponse;
  reload: () => Promise<OnboardingResponse>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const allComplete = data.journey.steps.every((step) => step.complete);
  const editable = ["DRAFT", "REJECTED", "CHANGES_REQUIRED"].includes(
    data.onboarding.status,
  );

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/seller/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "POLICY",
          payload: readJson(data.onboarding.policyJson),
          submit: true,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to submit onboarding.");
      await reload();
      setMessage(payload.message ?? "Application submitted for verification.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to submit onboarding.",
      );
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
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error ?? "Sandbox verification failed.");
      await reload();
      setMessage("Sandbox verification approved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Sandbox verification failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-panel border border-ink-200 bg-surface-card shadow-card">
      <div className="border-b border-ink-200 px-5 py-5 sm:px-7">
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-copper-50 text-copper-800">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-copper-800">
              Final review
            </p>
            <h2 className="mt-1 text-xl font-semibold">Review and submit</h2>
            <p className="mt-1 text-sm text-ink-500">
              Check every section before sending the application for
              verification.
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-6 px-5 py-6 sm:px-7">
        {data.onboarding.reviewerNote ? (
          <div
            className={cn(
              "rounded-control border p-4 text-sm",
              data.onboarding.status === "APPROVED"
                ? "border-success-border bg-success-subtle text-success-strong"
                : "border-warning-border bg-warning-subtle text-warning-strong",
            )}
          >
            <p className="font-semibold">Reviewer note</p>
            <p className="mt-1">{data.onboarding.reviewerNote}</p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((step) => {
            const state = data.journey.steps.find(
              (item) => item.step === step.id,
            );
            const Icon = step.icon;
            return (
              <Link
                key={step.id}
                href={`/seller/onboarding/${step.slug}`}
                className="group flex items-center gap-3 rounded-control border border-ink-200 p-4 hover:border-ink-300 hover:bg-ink-50"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full",
                    state?.complete
                      ? "bg-success-subtle text-success"
                      : "bg-warning-subtle text-warning-strong",
                  )}
                >
                  {state?.complete ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{step.shortTitle}</p>
                  <p className="text-xs text-ink-500">
                    {state?.complete ? "Complete" : "Action required"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-ink-400 group-hover:text-ink-700" />
              </Link>
            );
          })}
        </div>

        {data.verificationMode === "SANDBOX" ? (
          <div className="rounded-control border border-warning-border bg-warning-subtle p-4 text-sm text-warning-strong">
            <p className="font-semibold">Sandbox verification</p>
            <p className="mt-1">
              The workflow, document controls, and state transitions are real.
              Government, tax, identity, and banking providers are not contacted
              in this version.
            </p>
          </div>
        ) : null}

        {message ? (
          <p
            role="status"
            className="rounded-control border border-ink-200 bg-surface-sunken p-3 text-sm text-ink-700"
          >
            {message}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={() => router.push("/seller")}>
            Exit onboarding
          </Button>
          {editable ? (
            <Button
              variant="primary"
              loading={busy}
              disabled={!allComplete}
              leadingIcon={<ClipboardCheck className="h-4 w-4" />}
              onClick={() => void submit()}
            >
              Submit for verification
            </Button>
          ) : data.onboarding.status === "UNDER_REVIEW" &&
            data.verificationMode === "SANDBOX" ? (
            <Button
              variant="primary"
              loading={busy}
              leadingIcon={<ShieldCheck className="h-4 w-4" />}
              onClick={() => void verifySandbox()}
            >
              Run sandbox verification
            </Button>
          ) : data.onboarding.status === "APPROVED" ? (
            <Link
              href="/seller/listings/new"
              className={buttonClassName({ variant: "primary" })}
            >
              Create your first listing
            </Link>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm font-medium text-ink-600">
              <Circle className="h-3 w-3 fill-warning text-warning" />
              Verification is in progress
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
