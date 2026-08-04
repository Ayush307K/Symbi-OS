"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  Filter,
  PackageSearch,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
  IconButton,
  Input,
  Modal,
  Select,
  Skeleton,
  SkeletonCard,
  SkeletonRows,
  Spinner,
  StatusPill,
  Tag,
  Textarea,
  ToastProvider,
  useToast,
} from "@/components/ui";

const RAMPS = {
  copper: ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"],
  brand: ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"],
  ink: ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"],
} as const;

const RAMP_HEX: Record<string, Record<string, string>> = {
  copper: {
    50: "#FFF7ED", 100: "#FFEDD5", 200: "#FED7AA", 300: "#FDBA74", 400: "#FB923C",
    500: "#F97316", 600: "#EA580C", 700: "#C2410C", 800: "#9A3412", 900: "#7C2D12",
  },
  brand: {
    50: "#ECFDF5", 100: "#D1FAE5", 200: "#A7F3D0", 300: "#6EE7B7", 400: "#34D399",
    500: "#10B981", 600: "#059669", 700: "#047857", 800: "#065F46", 900: "#064E3B",
  },
  ink: {
    50: "#FAFAF9", 100: "#F5F5F4", 200: "#E7E5E4", 300: "#D6D3D1", 400: "#A8A29E",
    500: "#78716C", 600: "#57534E", 700: "#44403C", 800: "#292524", 900: "#1C1917",
    950: "#0C0A09",
  },
};

const STATUSES = [
  "ACTIVE", "APPROVED", "ACCEPTED", "CONFIRMED", "PAID", "FULFILLED", "DELIVERED",
  "DRAFT", "OPEN", "SUBMITTED", "AWAITING_BUYER_CONFIRMATION", "COUNTERED",
  "RESERVED", "UNFULFILLED", "PAUSED", "EXPIRED",
  "REJECTED", "CANCELLED", "DISPUTED", "INVENTORY_CONFLICT",
  "ARCHIVED", "CLOSED", "WITHDRAWN",
];

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="scroll-mt-8">
      <div className="mb-4 border-b border-ink-200 pb-2">
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {note ? <p className="mt-0.5 text-[13px] text-ink-500">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <span className="w-28 shrink-0 text-[12px] font-medium uppercase tracking-wide text-ink-500">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Demos() {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState(["Metal Scrap", "Karnataka", "≥ 5 ton"]);

  return (
    <div className="flex flex-col gap-12">
      <Section
        title="Colour ramps"
        note="Copper commits. Emerald reassures. Stone carries everything else."
      >
        <div className="flex flex-col gap-6">
          {(Object.keys(RAMPS) as Array<keyof typeof RAMPS>).map((name) => (
            <div key={name}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-sm font-semibold capitalize text-ink-900">{name}</h3>
                <span className="text-[12px] text-ink-500">
                  {name === "copper"
                    ? "primary action only — never decorative"
                    : name === "brand"
                      ? "trust, verification, brand marks"
                      : "text, borders, chrome"}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 sm:grid-cols-11">
                {RAMPS[name].map((step) => (
                  <div key={step} className="min-w-0">
                    <div
                      className="h-12 rounded-control border border-ink-200"
                      style={{ backgroundColor: RAMP_HEX[name][step] }}
                    />
                    <div className="mt-1 truncate text-[11px] text-ink-500">{step}</div>
                    <div className="truncate text-[10px] uppercase text-ink-400">
                      {RAMP_HEX[name][step]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Surface &amp; status</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["surface.page", "#F4F2ED"],
                ["surface.card", "#FFFFFF"],
                ["surface.sunken", "#EDEAE3"],
                ["success", "#0F6E56"],
                ["warning", "#D97706"],
                ["danger", "#DC2626"],
              ].map(([name, hex]) => (
                <div key={name}>
                  <div
                    className="h-14 rounded-control border border-ink-200"
                    style={{ backgroundColor: hex }}
                  />
                  <div className="mt-1 text-[12px] font-medium text-ink-700">{name}</div>
                  <div className="text-[11px] uppercase text-ink-400">{hex}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Typography"
        note="Manrope for headings, IBM Plex Sans for UI. Tabular figures are global."
      >
        <Card>
          <CardBody className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold">Aluminium wire scrap, 100 MT</h1>
            <h2 className="text-xl font-semibold">Nhava Sheva · FOB · Karnataka</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-ink-700">
              Body copy sits on IBM Plex Sans at 14px with relaxed leading, which is
              the density the marketplace tables and listing detail pages assume.
            </p>
            <div className="rounded-control border border-ink-200 bg-surface-sunken p-3">
              <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-ink-500">
                Tabular figures — columns align, widths never shift
              </p>
              <pre className="text-sm leading-6 text-ink-900">
{`  1,111.00   ₹  42,000   11 ton
  8,888.88   ₹ 128,500   80 ton
104,900.10   ₹   9,250    4 ton`}
              </pre>
            </div>
          </CardBody>
        </Card>
      </Section>

      <Section title="Button" note="One primary per view. Danger is for irreversible actions.">
        <Card>
          <CardBody>
            <Row label="Variants">
              <Button variant="primary">Accept offer</Button>
              <Button variant="secondary">Save draft</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="danger">Reject bid</Button>
            </Row>
            <Row label="Sizes">
              <Button size="sm" variant="secondary">Small</Button>
              <Button size="md" variant="secondary">Medium</Button>
              <Button size="lg" variant="secondary">Large</Button>
            </Row>
            <Row label="Icons">
              <Button variant="primary" leadingIcon={<Plus className="h-4 w-4" />}>
                New listing
              </Button>
              <Button variant="secondary" trailingIcon={<ArrowRight className="h-4 w-4" />}>
                Continue
              </Button>
              <IconButton variant="ghost" icon={<Filter className="h-4 w-4" />} label="Filter results" />
              <IconButton variant="ghost" icon={<Download className="h-4 w-4" />} label="Download invoice" />
              <IconButton variant="danger" icon={<Trash2 className="h-4 w-4" />} label="Delete listing" />
            </Row>
            <Row label="States">
              <Button variant="primary" loading>Submitting</Button>
              <Button variant="primary" disabled>Disabled</Button>
              <Button
                variant="primary"
                loading={loading}
                onClick={() => {
                  setLoading(true);
                  setTimeout(() => setLoading(false), 1600);
                }}
              >
                Click to load
              </Button>
            </Row>
            <Row label="Full width">
              <div className="w-full max-w-sm">
                <Button variant="primary" fullWidth>Place bid</Button>
              </div>
            </Row>
          </CardBody>
        </Card>
      </Section>

      <Section title="Form controls" note="Label, hint, and error are wired by id, not by placement.">
        <Card>
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Input label="Listing title" placeholder="e.g. Washed HDPE regrind" required />
            <Input label="Search" placeholder="Search materials" leadingIcon={<Search />} />
            <Input label="Quantity" type="number" defaultValue={25} suffix="ton" hint="Minimum order 5 ton." />
            <Input label="Ask price" type="number" defaultValue={42000} suffix="₹" error="Price must be above the reserve." />
            <Select label="Category" defaultValue="metal">
              <option value="metal">Metal Scrap</option>
              <option value="plastic">Plastic Scrap</option>
              <option value="paper">Paper &amp; Board</option>
            </Select>
            <Select label="State" hint="Karnataka-first pilot." defaultValue="KA">
              <option value="KA">Karnataka</option>
              <option value="MH">Maharashtra</option>
            </Select>
            <Textarea
              label="Description"
              containerClassName="sm:col-span-2"
              placeholder="Post-industrial, uncontaminated, baled."
              hint="Contact details are stripped automatically."
            />
            <Input label="Disabled" defaultValue="Locked after publish" disabled />
            <Input label="Read-only" defaultValue="SYM-2026-0041" readOnly />
          </CardBody>
        </Card>
      </Section>

      <Section title="Card" note="Card for records, sunken for wells and summaries.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Aluminium wire scrap"
              description="NAWAB IRON & STEEL · Mumbai"
              action={<StatusPill status="ACTIVE" />}
            />
            <CardBody className="flex flex-col gap-2 text-sm text-ink-700">
              <div className="flex justify-between"><span className="text-ink-500">Quantity</span><span>100 ton</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Price</span><span>₹ 42,000 / ton</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Lead time</span><span>3 days</span></div>
            </CardBody>
            <CardFooter>
              <Button variant="ghost" size="sm">Message seller</Button>
              <Button variant="primary" size="sm">Place bid</Button>
            </CardFooter>
          </Card>
          <Card tone="sunken">
            <CardHeader title="Order summary" description="Sandbox settlement — no funds move." />
            <CardBody className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-500">Subtotal</span><span>₹ 4,200,000</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Buyer fee</span><span>₹ 84,000</span></div>
              <div className="flex justify-between border-t border-ink-200 pt-2 font-semibold"><span>Total</span><span>₹ 4,284,000</span></div>
            </CardBody>
          </Card>
        </div>
      </Section>

      <Section title="StatusPill" note="One mapping for every lifecycle state in the product.">
        <Card>
          <CardBody className="flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <StatusPill key={status} status={status} />
            ))}
          </CardBody>
        </Card>
      </Section>

      <Section title="Badge & Tag" note="Badge is system-authored; Tag is user-controlled.">
        <Card>
          <CardBody>
            <Row label="Badge">
              <Badge tone="brand" icon={<Check />}>Verified seller</Badge>
              <Badge tone="neutral">54 listings</Badge>
              <Badge tone="success">In stock</Badge>
              <Badge tone="warning">Low quantity</Badge>
              <Badge tone="danger">Hazard flagged</Badge>
              <Badge tone="copper">Action needed</Badge>
            </Row>
            <Row label="Tag">
              {tags.map((tag) => (
                <Tag key={tag} label={tag} onRemove={() => setTags((t) => t.filter((x) => x !== tag))}>
                  {tag}
                </Tag>
              ))}
              {tags.length === 0 ? (
                <Button size="sm" variant="ghost" onClick={() => setTags(["Metal Scrap", "Karnataka", "≥ 5 ton"])}>
                  Reset tags
                </Button>
              ) : null}
              <Tag>Static tag</Tag>
            </Row>
          </CardBody>
        </Card>
      </Section>

      <Section title="Modal" note="Focus is trapped, Escape closes, focus returns to the trigger.">
        <Card>
          <CardBody>
            <Row label="Triggers">
              <Button variant="secondary" onClick={() => setModalOpen(true)}>Open dialog</Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>Destructive confirm</Button>
            </Row>
          </CardBody>
        </Card>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Place a bid"
          description="The seller has 48 hours to respond before the offer expires."
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => { setModalOpen(false); toast({ tone: "success", title: "Bid placed", description: "Offer SYM-2026-0041 sent to the seller." }); }}>
                Place bid
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Input label="Quantity" type="number" defaultValue={25} suffix="ton" />
            <Input label="Price per unit" type="number" defaultValue={41000} suffix="₹" />
            <Textarea label="Terms" placeholder="Delivery, packaging, payment terms." rows={3} />
          </div>
        </Modal>

        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Cancel this order?"
          description="Reserved inventory returns to the listing. This cannot be undone."
          size="sm"
          dismissible={false}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Keep order</Button>
              <Button variant="danger" onClick={() => { setConfirmOpen(false); toast({ tone: "danger", title: "Order cancelled", description: "5 ton returned to available inventory." }); }}>
                Cancel order
              </Button>
            </>
          }
        />
      </Section>

      <Section title="Toast" note="Errors persist until dismissed; the rest auto-dismiss after 5s.">
        <Card>
          <CardBody>
            <Row label="Tones">
              <Button variant="secondary" size="sm" onClick={() => toast({ tone: "info", title: "Draft saved", description: "Autosaved a moment ago." })}>Info</Button>
              <Button variant="secondary" size="sm" onClick={() => toast({ tone: "success", title: "Listing published", description: "Live in the Karnataka catalogue." })}>Success</Button>
              <Button variant="secondary" size="sm" onClick={() => toast({ tone: "warning", title: "Verification pending", description: "Publish is blocked until GST is verified." })}>Warning</Button>
              <Button variant="secondary" size="sm" onClick={() => toast({ tone: "danger", title: "Inventory conflict", description: "Only 3 ton remain; the bid was not accepted." })}>Danger</Button>
            </Row>
          </CardBody>
        </Card>
      </Section>

      <Section title="Skeleton" note="Same footprint as the content it replaces, so nothing jumps.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard />
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton circle className="h-10 w-10" />
                <div className="flex-1">
                  <Skeleton className="mb-2 h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
          <Card className="overflow-hidden">
            <CardHeader title="Loading orders" />
            <SkeletonRows rows={4} columns={4} />
          </Card>
        </div>
      </Section>

      <Section title="EmptyState & Spinner" note="Say why it is empty and what to do next.">
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState
            icon={<PackageSearch />}
            title="No listings match these filters"
            description="Karnataka has 54 active listings. Widening the radius or clearing the price filter usually helps."
            action={<Button variant="primary" size="sm">Clear filters</Button>}
            secondaryAction={<Button variant="ghost" size="sm">Save this search</Button>}
          />
          <Card>
            <CardBody className="flex items-center gap-8">
              <div className="flex items-center gap-2 text-ink-700"><Spinner size="sm" /><span className="text-sm">Small</span></div>
              <div className="flex items-center gap-2 text-ink-700"><Spinner size="md" /><span className="text-sm">Medium</span></div>
              <div className="flex items-center gap-2 text-copper-700"><Spinner size="lg" /><span className="text-sm">Large</span></div>
            </CardBody>
          </Card>
        </div>
      </Section>
    </div>
  );
}

export default function StyleGuidePage() {
  return (
    <ToastProvider>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-12 border-b border-ink-200 pb-6">
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-copper-700">
            Symbi-OS design system
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-ink-900">
            Component kit
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600">
            Foundation pass. Tokens, type, and the reusable kit — no product
            surfaces have been migrated yet. Every interactive element here is
            keyboard operable; tab through to check the copper focus ring.
          </p>
        </header>
        <Demos />
        <footer className="mt-16 border-t border-ink-200 pt-6 text-[13px] text-ink-500">
          Documented in <code className="text-ink-700">DESIGN_SYSTEM.md</code>.
        </footer>
      </main>
    </ToastProvider>
  );
}
