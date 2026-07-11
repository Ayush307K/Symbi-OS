"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Factory,
  Filter,
  Gavel,
  Gauge,
  LayoutDashboard,
  Loader2,
  MapPin,
  Package,
  Plus,
  Route,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { cn } from "@/lib/cn";
import { useAuth } from "@/context/AuthContext";

interface MaterialListing {
  id: string;
  materialId: string;
  title: string;
  name: string;
  toxicity: string;
  baseElement: string;
  category: string;
  subcategory: string;
  producer: string;
  producerId: string;
  sellerUserId: string | null;
  location: string;
  area: string;
  city: string;
  state: string;
  country: string;
  imageUrl: string;
  price: number | null;
  quantity: number | null;
  unit: string;
  minOrderQuantity: number;
  leadTimeDays: number;
  rating: number;
  responseRate: number;
  verified: boolean;
  tradeAssurance: boolean;
  yearsActive: number;
  ordersCompleted: number;
  description: string;
  packaging: string;
  paymentTerms: string;
  sourceType: string;
  sourceName: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  rawQuantityText: string | null;
  rawLocationText: string | null;
}

interface BidDraft {
  quantity: string;
  pricePerUnit: string;
}

type ActiveView =
  | "Home"
  | "Marketplace"
  | "Bids & Deals"
  | "Match Engine"
  | "Compliance"
  | "Logistics";

interface ListingDraft {
  name: string;
  category: string;
  baseElement: string;
  toxicity: string;
  description: string;
  price: string;
  quantity: string;
}

interface MarketplaceLocation {
  label: string;
  query: string;
}

const NAV_ITEMS = [
  { label: "Overview", view: "Home", icon: LayoutDashboard },
  { label: "Marketplace", view: "Marketplace", icon: Package },
  { label: "Bids & Deals", view: "Bids & Deals", icon: Gavel },
  { label: "Match Engine", view: "Match Engine", icon: Sparkles },
  { label: "Compliance", view: "Compliance", icon: ClipboardCheck },
  { label: "Logistics", view: "Logistics", icon: Truck },
];

const TOXICITY_STYLE: Record<string, string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-red-200 bg-red-50 text-red-700",
};

const CATEGORY_HINTS: Record<string, string> = {
  "Metals & Alloys": "High salvage value",
  Chemicals: "Docs required",
  "Minerals & Construction": "Bulk logistics",
  "Polymers & Plastics": "Grade sensitive",
  "Energy Materials": "Special handling",
  "E-Waste": "Verified buyers",
  "Organic & Bio": "Fast clearance",
  "Textiles & Fibers": "SME demand",
};

const HOME_FOOTER_COLUMNS = [
  {
    title: "About Symbi-OS",
    links: ["Why choose Symbi-OS", "Circular sourcing", "Verified network", "Sustainability"],
  },
  {
    title: "Order protections",
    links: ["Secure bids", "Quality documents", "Dispatch readiness", "Compliance trail"],
  },
  {
    title: "Source on Symbi-OS",
    links: ["Active suppliers", "Post bulk RFQ", "Industrial categories", "Location sourcing"],
  },
  {
    title: "Help Center",
    links: ["Buyer help", "Seller help", "Trade dispute", "Report a listing"],
  },
  {
    title: "Sell on Symbi-OS",
    links: ["Start selling", "Create listing", "Supplier verification", "Partnerships"],
  },
];

function formatMoney(value: number | null) {
  if (value == null || value <= 0) return "Ask quote";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatQuantity(value: number | null) {
  if (value == null) return "Qty on request";
  return `${value.toLocaleString("en-IN")} t`;
}

function displayQuantity(listing: MaterialListing) {
  return listing.rawQuantityText || formatQuantity(listing.quantity);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-IN", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function cleanToxicity(value: string) {
  return value ? value.toLowerCase() : "medium";
}

function HomeLanding({
  categories,
  featuredDeals,
  localDeals,
  suppliers,
  marketplaceStats,
  locationLabel,
  isLoading,
  onCategorySelect,
  onOpenMarketplace,
  onPostRfq,
  onCreateListing,
  onBid,
}: {
  categories: Array<{
    name: string;
    count: number;
    imageUrl: string;
    quantity: number;
    suppliers: number;
  }>;
  featuredDeals: MaterialListing[];
  localDeals: MaterialListing[];
  suppliers: Array<{
    name: string;
    location: string;
    listings: number;
    categories: Set<string>;
    rating: number;
  }>;
  marketplaceStats: {
    activeValue: number;
    verifiedSellers: number;
    totalQuantity: number;
    matchRate: number;
    totalListings: number;
    publicListings: number;
    sellerListings: number;
    categoryCount: number;
    sourceCount: number;
  };
  locationLabel: string;
  isLoading: boolean;
  onCategorySelect: (category: string) => void;
  onOpenMarketplace: () => void;
  onPostRfq: () => void;
  onCreateListing: () => void;
  onBid: (listing: MaterialListing) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative min-h-[330px] overflow-hidden rounded-lg border border-sky-100 bg-[#c8eaff] p-6 shadow-sm sm:p-8">
          <div className="relative z-10 max-w-xl">
            <h1 className="max-w-md text-3xl font-bold tracking-tight text-[#083b68] sm:text-4xl">
              Your shortcut to verified industrial suppliers
            </h1>
            <div className="mt-5 flex flex-wrap gap-7 text-[#063b66]">
              <div>
                <p className="text-2xl font-bold">
                  {formatCompactNumber(marketplaceStats.verifiedSellers)}
                </p>
                <p className="text-xs font-semibold">Active suppliers</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {formatCompactNumber(marketplaceStats.totalListings)}
                </p>
                <p className="text-xs font-semibold">Live listings</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {formatCompactNumber(marketplaceStats.categoryCount)}
                </p>
                <p className="text-xs font-semibold">Categories</p>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={onOpenMarketplace}
                className="rounded-full bg-[#073b68] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0b4c82]"
              >
                Explore now
              </button>
              <button
                onClick={onPostRfq}
                className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#073b68] hover:bg-sky-50"
              >
                Request quotation
              </button>
            </div>
          </div>

          <div className="absolute bottom-5 left-6 right-6 z-10 hidden items-center justify-end gap-8 text-sm font-bold text-white lg:flex">
            {["Smart material search", "Top supplier rankings", "Factory-direct samples"].map(
              (item) => (
                <button
                  key={item}
                  onClick={item.includes("search") ? onOpenMarketplace : onPostRfq}
                  className="flex items-center gap-4 text-left"
                >
                  <span>{item}</span>
                  <span className="h-9 w-9 rounded-full bg-white shadow-sm" />
                </button>
              )
            )}
          </div>

          <img
            src={featuredDeals[1]?.imageUrl ?? featuredDeals[0]?.imageUrl}
            alt="Verified industrial supplier"
            className="absolute bottom-0 right-0 h-56 w-[44%] object-cover opacity-20 mix-blend-multiply"
            loading="lazy"
          />
        </div>

        <aside className="rounded-lg border border-stone-200 bg-[#f4f4f4] p-5 shadow-sm">
          <h2 className="text-xl font-bold leading-tight text-stone-950">
            Other featured selections
          </h2>
          <div className="mt-5 space-y-4 text-sm font-medium text-stone-700">
            {[
              ["Order protections", onOpenMarketplace],
              ["RFQ center", onPostRfq],
              ["Fast customization", onCreateListing],
              ["Verified supplier programs", onOpenMarketplace],
            ].map(([label, action]) => (
              <button
                key={String(label)}
                onClick={action as () => void}
                className="block text-left hover:text-orange-600"
              >
                {String(label)}
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Package}
          label="Catalog depth"
          value={marketplaceStats.totalListings.toLocaleString("en-IN")}
          detail={`${marketplaceStats.publicListings.toLocaleString("en-IN")} public-source records`}
        />
        <MetricCard
          icon={Factory}
          label="Active suppliers"
          value={String(marketplaceStats.verifiedSellers)}
          detail={`${marketplaceStats.sourceCount} data source${marketplaceStats.sourceCount === 1 ? "" : "s"}`}
        />
        <MetricCard
          icon={Truck}
          label="Available quantity"
          value={marketplaceStats.totalQuantity.toLocaleString("en-IN")}
          detail="Parsed quantity units"
        />
        <MetricCard
          icon={Gauge}
          label="Catalog coverage"
          value={`${marketplaceStats.matchRate}%`}
          detail="Listings with category and location"
        />
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-stone-950">
              Source by category
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Start broad, then enter filtered marketplace results.
            </p>
          </div>
          <button
            onClick={onOpenMarketplace}
            className="hidden rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 sm:block"
          >
            All categories
          </button>
        </div>
        {isLoading ? (
          <div className="mt-5 flex h-44 items-center justify-center text-stone-500">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((item) => (
              <button
                key={item.name}
                onClick={() => onCategorySelect(item.name)}
                className="group overflow-hidden rounded-lg border border-stone-200 bg-white text-left shadow-sm transition hover:border-orange-300 hover:shadow-md"
              >
                <div className="aspect-[5/3] overflow-hidden bg-stone-100">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="line-clamp-1 text-sm font-semibold text-stone-950">
                      {item.name}
                    </h3>
                    <ArrowUpRight size={15} className="shrink-0 text-stone-400" />
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {item.count.toLocaleString("en-IN")} listings · {item.suppliers} suppliers
                  </p>
                  <p className="mt-2 text-xs font-medium text-orange-700">
                    {Math.round(item.quantity / 1000).toLocaleString("en-IN")}k t available
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-stone-950">
                Curated for bulk buyers
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                A short row of verified offers, not the whole catalog.
              </p>
            </div>
            <button
              onClick={onOpenMarketplace}
              className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
            >
              View all
            </button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {featuredDeals.slice(0, 6).map((listing) => (
              <CompactListingCard
                key={listing.id}
                listing={listing}
                onBid={() => onBid(listing)}
              />
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight text-stone-950">
            RFQ match lane
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            Use this when you do not know exact material names or need suppliers to
            respond with specs, price, MOQ, and lead time.
          </p>
          <div className="mt-5 space-y-3">
            {["Describe requirement", "Match existing supply", "Notify seller network"].map(
              (step, index) => (
                <div key={step} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-stone-700">{step}</span>
                </div>
              )
            )}
          </div>
          <button
            onClick={onPostRfq}
            className="mt-5 w-full rounded-md bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
          >
            Request quotation
          </button>
        </aside>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight text-stone-950">
            Active sourcing lanes
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Real public listings grouped by current inventory and location signals.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {localDeals.slice(0, 4).map((listing) => (
              <button
                key={listing.id}
                onClick={() => onBid(listing)}
                className="flex gap-3 rounded-lg border border-stone-200 p-3 text-left hover:border-orange-300 hover:bg-orange-50"
              >
                <img
                  src={listing.imageUrl}
                  alt={listing.name}
                  className="h-16 w-16 rounded-md object-cover"
                  loading="lazy"
                />
                <span className="min-w-0">
                  <span className="line-clamp-2 text-sm font-semibold text-stone-900">
                    {listing.title}
                  </span>
                  <span className="mt-1 block text-xs text-stone-500">
                    {listing.city}, {listing.state}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-orange-700">
                    {formatMoney(listing.price)} / {listing.unit}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight text-stone-950">
            Active source clusters
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Locations and suppliers with the most marketplace inventory right now.
          </p>
          <div className="mt-5 divide-y divide-stone-100">
            {suppliers.map((supplier) => (
              <div key={supplier.name} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-stone-900">
                    {supplier.name}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {supplier.location} · {supplier.categories.size} categories
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-stone-950">
                    {supplier.listings}
                  </p>
                  <p className="text-xs text-stone-500">listings</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MarketplaceFooter
        onPostRfq={onPostRfq}
        onCreateListing={onCreateListing}
        onOpenMarketplace={onOpenMarketplace}
      />
    </div>
  );
}

function HomeAction({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border border-stone-200 bg-white p-4 text-left hover:border-orange-300 hover:bg-orange-50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-700">
        <Icon size={18} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-stone-950">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-stone-500">{body}</span>
      </span>
    </button>
  );
}

function CompactListingCard({
  listing,
  onBid,
}: {
  listing: MaterialListing;
  onBid: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="aspect-[4/3] overflow-hidden bg-stone-100">
        <img
          src={listing.imageUrl}
          alt={listing.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-stone-950">
          {listing.title}
        </p>
        <p className="mt-1 text-xs text-stone-500">
          {listing.category} · {displayQuantity(listing)}
        </p>
        {listing.sourceType === "real_public" && (
          <p className="mt-2 w-fit rounded-sm bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
            Public source
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-stone-950">
            {formatMoney(listing.price)}
          </span>
          <button
            onClick={onBid}
            className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-600"
          >
            RFQ
          </button>
        </div>
      </div>
    </article>
  );
}

function MarketplaceFooter({
  onPostRfq,
  onCreateListing,
  onOpenMarketplace,
}: {
  onPostRfq: () => void;
  onCreateListing: () => void;
  onOpenMarketplace: () => void;
}) {
  return (
    <footer className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="grid gap-8 p-6 md:grid-cols-2 xl:grid-cols-5">
        {HOME_FOOTER_COLUMNS.map((column) => (
          <div key={column.title}>
            <h3 className="text-sm font-bold text-stone-950">{column.title}</h3>
            <div className="mt-4 space-y-3">
              {column.links.map((link) => (
                <button
                  key={link}
                  onClick={
                    link.includes("RFQ")
                      ? onPostRfq
                      : link.includes("selling") || link.includes("listing")
                        ? onCreateListing
                        : onOpenMarketplace
                  }
                  className="block text-left text-sm text-stone-600 hover:text-orange-700"
                >
                  {link}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-stone-200 bg-[#fbfaf7] px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-500">
            {["GST-ready suppliers", "Escrow supported", "Verified documents", "Dispatch monitoring"].map(
              (item) => (
                <span key={item} className="rounded-sm border border-stone-200 bg-white px-2 py-1">
                  {item}
                </span>
              )
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onPostRfq}
              className="rounded-md bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600"
            >
              Post RFQ
            </button>
            <button
              onClick={onCreateListing}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:bg-white"
            >
              Sell material
            </button>
          </div>
        </div>
        <p className="mt-5 text-xs text-stone-500">
          Symbi-OS marketplace infrastructure for circular industrial sourcing.
        </p>
      </div>
    </footer>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [listings, setListings] = useState<MaterialListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [marketplaceLocation, setMarketplaceLocation] =
    useState<MarketplaceLocation>({
      label: "All locations",
      query: "",
    });
  const [activeView, setActiveView] = useState<ActiveView>("Home");
  const [selected, setSelected] = useState<MaterialListing | null>(null);
  const [bidTarget, setBidTarget] = useState<MaterialListing | null>(null);
  const [bidDraft, setBidDraft] = useState<BidDraft>({
    quantity: "",
    pricePerUnit: "",
  });
  const [isBidding, setIsBidding] = useState(false);
  const [bidMessage, setBidMessage] = useState<string | null>(null);
  const [isListingModalOpen, setIsListingModalOpen] = useState(false);
  const [listingDraft, setListingDraft] = useState<ListingDraft>({
    name: "",
    category: "Polymers & Plastics",
    baseElement: "",
    toxicity: "medium",
    description: "",
    price: "",
    quantity: "",
  });
  const [listingMessage, setListingMessage] = useState<string | null>(null);
  const [isCreatingListing, setIsCreatingListing] = useState(false);
  const [isRfqModalOpen, setIsRfqModalOpen] = useState(false);
  const [rfqQuery, setRfqQuery] = useState("");
  const [rfqMessage, setRfqMessage] = useState<string | null>(null);
  const [isSubmittingRfq, setIsSubmittingRfq] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchMaterials = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch("/api/materials");
      if (!res.ok) throw new Error("Failed to fetch marketplace listings");
      const data: MaterialListing[] = await res.json();
      setListings(data);
      setSelected((current) => {
        if (!current) return data[0] ?? null;
        return data.find((item) => item.id === current.id) ?? data[0] ?? null;
      });
    } catch (err) {
      setListings([]);
      setSelected(null);
      setError(
        err instanceof Error
          ? `${err.message}. Run npm run ingest to load the real generated marketplace dataset.`
          : "Run npm run ingest to load the real generated marketplace dataset."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const categories = useMemo(() => {
    return ["All", ...Array.from(new Set(listings.map((item) => item.category))).sort()];
  }, [listings]);

  const filteredListings = useMemo(() => {
    const term = query.trim().toLowerCase();
    const locationTerm = marketplaceLocation.query.trim().toLowerCase();
    return listings.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const locationHaystack = [
        item.area,
        item.city,
        item.state,
        item.country,
        item.location,
      ]
        .join(" ")
        .toLowerCase();
      const matchesLocation =
        !locationTerm ||
        locationTerm
          .split(/\s+/)
          .filter(Boolean)
          .every((part) => locationHaystack.includes(part));
      const matchesQuery =
        !term ||
        [
          item.title,
          item.name,
          item.category,
          item.baseElement,
          item.producer,
          item.location,
          item.area,
          item.city,
          item.state,
          item.country,
          item.verified ? "verified supplier buyer protection" : "",
          item.tradeAssurance ? "trade assurance buyer protection" : "",
          item.sourceType,
          item.sourceName ?? "",
          item.rawQuantityText ?? "",
          item.rawLocationText ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);
      return matchesCategory && matchesLocation && matchesQuery;
    });
  }, [category, listings, marketplaceLocation.query, query]);

  const visibleListings = useMemo(
    () => filteredListings.slice(0, 60),
    [filteredListings]
  );

  const homeCategoryCards = useMemo(() => {
    const summary = new Map<
      string,
      { count: number; imageUrl: string; quantity: number; supplierCount: Set<string> }
    >();

    for (const listing of listings) {
      const current =
        summary.get(listing.category) ??
        {
          count: 0,
          imageUrl: listing.imageUrl,
          quantity: 0,
          supplierCount: new Set<string>(),
        };
      current.count += 1;
      current.quantity += listing.quantity ?? 0;
      current.supplierCount.add(listing.producer);
      if (listing.imageUrl.includes("upload_images_listings")) current.imageUrl = listing.imageUrl;
      summary.set(listing.category, current);
    }

    return Array.from(summary.entries())
      .map(([name, value]) => ({
        name,
        count: value.count,
        imageUrl: value.imageUrl,
        quantity: value.quantity,
        suppliers: value.supplierCount.size,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [listings]);

  const featuredDeals = useMemo(
    () =>
      listings
        .slice()
        .sort((a, b) => {
          const imageScore = Number(b.imageUrl.includes("upload_images_listings")) - Number(a.imageUrl.includes("upload_images_listings"));
          const quantityScore = (b.quantity ?? 0) - (a.quantity ?? 0);
          return imageScore || quantityScore || b.rating - a.rating;
        })
        .slice(0, 10),
    [listings]
  );

  const localDeals = useMemo(() => {
    const locationTerm = marketplaceLocation.query.trim().toLowerCase();
    const pool = locationTerm
      ? listings.filter((listing) =>
          [listing.area, listing.city, listing.state, listing.country, listing.location]
            .join(" ")
            .toLowerCase()
            .includes(locationTerm)
        )
      : listings;

    return pool
      .slice()
      .sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0))
      .slice(0, 8);
  }, [listings, marketplaceLocation.query]);

  const supplierHighlights = useMemo(() => {
    const bySupplier = new Map<
      string,
      { name: string; location: string; listings: number; categories: Set<string>; rating: number }
    >();

    for (const listing of listings) {
      const current =
        bySupplier.get(listing.producer) ??
        {
          name: listing.producer,
          location: `${listing.city}, ${listing.state}`,
          listings: 0,
          categories: new Set<string>(),
          rating: listing.rating,
        };
      current.listings += 1;
      current.categories.add(listing.category);
      current.rating = Math.max(current.rating, listing.rating);
      bySupplier.set(listing.producer, current);
    }

    return Array.from(bySupplier.values())
      .sort((a, b) => b.listings - a.listings)
      .slice(0, 6);
  }, [listings]);

  const marketplaceStats = useMemo(() => {
    const activeValue = filteredListings.reduce(
      (sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 0),
      0
    );
    const verifiedSellers = new Set(filteredListings.map((item) => item.producer)).size;
    const totalQuantity = filteredListings.reduce(
      (sum, item) => sum + (item.quantity ?? 0),
      0
    );
    const completeListings = filteredListings.filter(
      (item) => item.category && item.city && item.state
    ).length;

    return {
      activeValue,
      verifiedSellers,
      totalQuantity,
      matchRate:
        filteredListings.length > 0
          ? Math.round((completeListings / filteredListings.length) * 100)
          : 0,
      totalListings: filteredListings.length,
      publicListings: filteredListings.filter((item) => item.sourceType === "real_public").length,
      sellerListings: filteredListings.filter((item) => item.sourceType === "seller_submitted").length,
      categoryCount: new Set(filteredListings.map((item) => item.category).filter(Boolean)).size,
      sourceCount: new Set(
        filteredListings.map((item) => item.sourceName ?? item.sourceType).filter(Boolean)
      ).size,
    };
  }, [filteredListings]);

  const openBidModal = useCallback((listing: MaterialListing) => {
    setBidTarget(listing);
    setBidDraft({
      quantity: listing.quantity ? String(Math.min(listing.quantity, listing.minOrderQuantity)) : "",
      pricePerUnit: listing.price ? String(Math.round(listing.price)) : "",
    });
    setBidMessage(null);
  }, []);

  const handleCategorySelect = useCallback(
    (value: string) => {
      const match = categories.find(
        (item) =>
          item === value ||
          item.toLowerCase().includes(value.toLowerCase()) ||
          value.toLowerCase().includes(item.toLowerCase().split(" ")[0])
      );
      setCategory(match ?? "All");
      setActiveView("Marketplace");
      document.getElementById("marketplace-listings")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    [categories]
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const submitListing = useCallback(async () => {
    if (!listingDraft.name.trim()) {
      setListingMessage("Add a material name first.");
      return;
    }
    setIsCreatingListing(true);
    setListingMessage(null);

    try {
      const res = await fetch("/api/materials/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: listingDraft.name,
          category: listingDraft.category,
          baseElement: listingDraft.baseElement || "Mixed",
          toxicity: listingDraft.toxicity,
          description: listingDraft.description,
          price: listingDraft.price ? Number(listingDraft.price) : undefined,
          quantity: listingDraft.quantity ? Number(listingDraft.quantity) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to create listing");
      setListingMessage(data.message ?? "Listing created.");
      setListingDraft({
        name: "",
        category: "Polymers & Plastics",
        baseElement: "",
        toxicity: "medium",
        description: "",
        price: "",
        quantity: "",
      });
      await fetchMaterials();
      window.setTimeout(() => setIsListingModalOpen(false), 900);
    } catch (err) {
      setListingMessage(err instanceof Error ? err.message : "Unable to create listing");
    } finally {
      setIsCreatingListing(false);
    }
  }, [fetchMaterials, listingDraft]);

  const submitRfq = useCallback(async () => {
    const demand = rfqQuery.trim();
    if (!demand) {
      setRfqMessage("Describe the material you want to source.");
      return;
    }
    setIsSubmittingRfq(true);
    setRfqMessage(null);

    try {
      const res = await fetch("/api/demand/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: demand }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to post RFQ");
      setRfqMessage(data.message ?? "RFQ posted.");
      if (data.results?.length) {
        setQuery(demand);
        setActiveView("Marketplace");
      }
    } catch (err) {
      setRfqMessage(err instanceof Error ? err.message : "Unable to post RFQ");
    } finally {
      setIsSubmittingRfq(false);
    }
  }, [rfqQuery]);

  const submitBid = useCallback(async () => {
    if (!bidTarget || !bidDraft.quantity || !bidDraft.pricePerUnit) return;
    setIsBidding(true);
    setBidMessage(null);

    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialName: bidTarget.name,
          materialId: bidTarget.materialId,
          quantity: Number(bidDraft.quantity),
          pricePerUnit: Number(bidDraft.pricePerUnit),
          sellerUserId: bidTarget.sellerUserId || undefined,
          producerId: bidTarget.producerId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to place bid");
      setBidMessage("Bid placed. The seller can review it from Bids & Deals.");
      setTimeout(() => setBidTarget(null), 1000);
    } catch (err) {
      setBidMessage(err instanceof Error ? err.message : "Unable to place bid");
    } finally {
      setIsBidding(false);
    }
  }, [bidDraft.pricePerUnit, bidDraft.quantity, bidTarget]);

  return (
    <div className="min-h-screen bg-[#f4f2ed] text-stone-950">
      <NavBar
        query={query}
        locationLabel={marketplaceLocation.label}
        listingCount={listings.length}
        onQueryChange={setQuery}
        onCategorySelect={handleCategorySelect}
        onLocationChange={(location) => {
          setMarketplaceLocation(location);
          showToast(
            location.query
              ? `Showing suppliers near ${location.label}.`
              : "Showing suppliers across all locations."
          );
        }}
        onSearchSubmit={() => setActiveView("Marketplace")}
        onPostRfq={() => setIsRfqModalOpen(true)}
        onSell={() => setIsListingModalOpen(true)}
        onHelp={() =>
          showToast("Use search, category tabs, Request quote, or Create listing to start a workflow.")
        }
      />

      {toast && (
        <div className="fixed right-4 top-32 z-50 rounded-md border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-800 shadow-xl">
          {toast}
        </div>
      )}

      <div className="flex min-h-[calc(100vh-64px)]">
        {activeView !== "Home" && (
        <aside className="hidden w-64 shrink-0 border-r border-stone-200 bg-[#fbfaf7] px-4 py-5 lg:block">
          <button
            onClick={() => setIsListingModalOpen(true)}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
          >
            <Plus size={16} />
            List material
          </button>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                onClick={() => setActiveView(item.view as ActiveView)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition",
                  activeView === item.view
                    ? "bg-emerald-50 text-emerald-900"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
                )}
              >
                <span className="flex items-center gap-2">
                  <item.icon size={16} />
                  {item.label}
                </span>
                {activeView === item.view && <ChevronRight size={14} />}
              </button>
            ))}
          </nav>

          <div className="mt-8 rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
              <ShieldCheck size={16} className="text-emerald-700" />
              Verification queue
            </div>
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
              Complete GST, material specs, and safety docs to lift seller trust scores.
            </p>
            <div className="mt-3 h-2 rounded-full bg-stone-100">
              <div className="h-2 w-2/3 rounded-full bg-emerald-700" />
            </div>
          </div>
        </aside>
        )}

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 xl:px-8">
          {activeView === "Home" ? (
            <HomeLanding
              categories={homeCategoryCards}
              featuredDeals={featuredDeals}
              localDeals={localDeals}
              suppliers={supplierHighlights}
              marketplaceStats={marketplaceStats}
              locationLabel={marketplaceLocation.label}
              isLoading={isLoading}
              onCategorySelect={handleCategorySelect}
              onOpenMarketplace={() => setActiveView("Marketplace")}
              onPostRfq={() => setIsRfqModalOpen(true)}
              onCreateListing={() => setIsListingModalOpen(true)}
              onBid={openBidModal}
            />
          ) : (
            <>
          <section className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-stone-950">
                Marketplace command center
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-stone-600">
                Source live secondary materials, compare public-source and seller-added
                inventory, place RFQs, and turn industrial surplus into transparent deal flow.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 shadow-sm">
                <MapPin size={15} className="text-orange-600" />
                <span>
                  Delivery location:{" "}
                  <strong className="font-semibold text-stone-950">
                    {marketplaceLocation.label}
                  </strong>
                </span>
                {marketplaceLocation.query && (
                  <button
                    onClick={() =>
                      setMarketplaceLocation({ label: "All locations", query: "" })
                    }
                    className="ml-1 text-xs font-semibold text-orange-700 hover:text-orange-800"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setIsRfqModalOpen(true)}
                className="flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50"
              >
                <Bell size={16} />
                Demand alerts
              </button>
              <button
                onClick={() => setIsListingModalOpen(true)}
                className="flex items-center gap-2 rounded-md bg-stone-950 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-stone-800"
              >
                <Plus size={16} />
                Create listing
              </button>
            </div>
          </section>

          <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={CircleDollarSign}
              label="Active marketplace value"
              value={
                marketplaceStats.activeValue > 0
                  ? `₹${Math.round(marketplaceStats.activeValue / 100000).toLocaleString("en-IN")}L`
                  : "Quote-led"
              }
              detail="Visible inventory pipeline"
            />
            <MetricCard
              icon={Factory}
              label="Active suppliers"
              value={String(marketplaceStats.verifiedSellers)}
              detail="Across industrial categories"
            />
            <MetricCard
              icon={Package}
              label="Available quantity"
              value={`${marketplaceStats.totalQuantity.toLocaleString("en-IN")} t`}
              detail="Listed surplus capacity"
            />
            <MetricCard
              icon={Gauge}
              label="Catalog coverage"
              value={`${marketplaceStats.matchRate}%`}
              detail="Category and location completeness"
            />
          </section>

          {activeView === "Marketplace" ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section
              id="marketplace-listings"
              className="min-w-0 scroll-mt-36 rounded-lg border border-stone-200 bg-white shadow-sm"
            >
              <div className="border-b border-stone-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-stone-950">
                      Live marketplace listings
                    </h2>
                    <p className="text-sm text-stone-500">
                      {filteredListings.length.toLocaleString("en-IN")} wholesale offers available
                      {filteredListings.length > visibleListings.length
                        ? ` · showing top ${visibleListings.length}`
                        : ""}
                      {marketplaceLocation.query
                        ? ` · near ${marketplaceLocation.label}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative">
                      <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                      />
                      <input
                        value={query ?? ""}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search material, seller, city..."
                        className="h-10 w-full rounded-md border border-stone-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10 sm:w-72"
                      />
                    </div>
                    <select
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                    >
                      {categories.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setFiltersOpen((open) => !open)}
                      className="flex h-10 items-center justify-center gap-2 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 hover:bg-stone-50"
                    >
                      <SlidersHorizontal size={16} />
                      Filters
                    </button>
                  </div>
                </div>
                {filtersOpen && (
                  <div className="mt-4 grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm sm:grid-cols-3">
                    <button
                      onClick={() => {
                        setQuery("public source");
                        showToast("Showing public-source marketplace listings.");
                      }}
                      className="rounded-md border border-stone-200 bg-white px-3 py-2 text-left font-medium text-stone-700 hover:border-orange-300"
                    >
                      Public source
                    </button>
                    <button
                      onClick={() => {
                        const topLocation =
                          listings.find((item) => item.state && item.state !== "Industrial Region") ??
                          listings[0];
                        if (topLocation) {
                          setMarketplaceLocation({
                            label: `${topLocation.city}, ${topLocation.state}`,
                            query: `${topLocation.city} ${topLocation.state}`,
                          });
                          showToast(`Filtered toward ${topLocation.city}, ${topLocation.state}.`);
                        }
                      }}
                      className="rounded-md border border-stone-200 bg-white px-3 py-2 text-left font-medium text-stone-700 hover:border-orange-300"
                    >
                      Top location
                    </button>
                    <button
                      onClick={() => {
                        setQuery("");
                        setCategory("All");
                        setMarketplaceLocation({ label: "All locations", query: "" });
                        setFiltersOpen(false);
                      }}
                      className="rounded-md border border-stone-200 bg-white px-3 py-2 text-left font-medium text-stone-700 hover:border-orange-300"
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>

              {isLoading && (
                <div className="flex h-80 items-center justify-center text-stone-500">
                  <Loader2 size={22} className="animate-spin" />
                </div>
              )}

              {error && (
                <div className="m-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {error}
                </div>
              )}

              {!isLoading && (
                <div className="grid gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {visibleListings.map((listing) => (
                    <ListingCard
                      key={`${listing.id}-${listing.producerId}`}
                      listing={listing}
                      isSelected={selected?.id === listing.id}
                      onSelect={() => setSelected(listing)}
                      onBid={() => openBidModal(listing)}
                    />
                  ))}
                </div>
              )}
            </section>

            <aside className="space-y-5">
              <ListingDetail
                listing={selected}
                onBid={(listing) => openBidModal(listing)}
              />
              <DealFlowPanel userCompany={user?.companyName ?? "Your company"} />
            </aside>
          </div>
          ) : (
            <WorkspacePanel
              activeView={activeView}
              listings={filteredListings}
              onPostRfq={() => setIsRfqModalOpen(true)}
              onCreateListing={() => setIsListingModalOpen(true)}
              onOpenMarketplace={() => setActiveView("Marketplace")}
            />
          )}
            </>
          )}
        </main>
      </div>

      {isListingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-stone-200 p-5">
              <div>
                <h3 className="text-lg font-semibold text-stone-950">
                  Create wholesale listing
                </h3>
                <p className="mt-1 text-sm text-stone-500">
                  Add a surplus material to the marketplace catalog.
                </p>
              </div>
              <button
                onClick={() => setIsListingModalOpen(false)}
                className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-stone-700">Material name</span>
                <input
                  value={listingDraft.name ?? ""}
                  onChange={(event) =>
                    setListingDraft((draft) => ({ ...draft, name: event.target.value }))
                  }
                  className="mt-1 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                  placeholder="Example: HDPE regrind flakes"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Category</span>
                <select
                  value={listingDraft.category ?? ""}
                  onChange={(event) =>
                    setListingDraft((draft) => ({ ...draft, category: event.target.value }))
                  }
                  className="mt-1 h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                >
                  {categories.filter((item) => item !== "All").map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Base material</span>
                <input
                  value={listingDraft.baseElement ?? ""}
                  onChange={(event) =>
                    setListingDraft((draft) => ({ ...draft, baseElement: event.target.value }))
                  }
                  className="mt-1 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                  placeholder="Polymer, copper, silica..."
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Price per ton</span>
                <input
                  value={listingDraft.price ?? ""}
                  onChange={(event) =>
                    setListingDraft((draft) => ({ ...draft, price: event.target.value }))
                  }
                  type="number"
                  min="0"
                  className="mt-1 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                  placeholder="INR"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Available quantity</span>
                <input
                  value={listingDraft.quantity ?? ""}
                  onChange={(event) =>
                    setListingDraft((draft) => ({ ...draft, quantity: event.target.value }))
                  }
                  type="number"
                  min="1"
                  className="mt-1 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                  placeholder="Tonnes"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Risk level</span>
                <select
                  value={listingDraft.toxicity ?? "medium"}
                  onChange={(event) =>
                    setListingDraft((draft) => ({ ...draft, toxicity: event.target.value }))
                  }
                  className="mt-1 h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-stone-700">Description</span>
                <textarea
                  value={listingDraft.description ?? ""}
                  onChange={(event) =>
                    setListingDraft((draft) => ({ ...draft, description: event.target.value }))
                  }
                  className="mt-1 min-h-24 w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                  placeholder="Add grade, condition, origin, packaging, and handling notes."
                />
              </label>

              {listingMessage && (
                <div className="sm:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {listingMessage}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-stone-200 p-5">
              <button
                onClick={() => setIsListingModalOpen(false)}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={submitListing}
                disabled={isCreatingListing || !listingDraft.name.trim()}
                className="flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreatingListing && <Loader2 size={16} className="animate-spin" />}
                Publish listing
              </button>
            </div>
          </div>
        </div>
      )}

      {isRfqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-stone-200 p-5">
              <div>
                <h3 className="text-lg font-semibold text-stone-950">Post bulk RFQ</h3>
                <p className="mt-1 text-sm text-stone-500">
                  Register demand or jump to matching supply.
                </p>
              </div>
              <button
                onClick={() => setIsRfqModalOpen(false)}
                className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Material requirement</span>
                <input
                  value={rfqQuery ?? ""}
                  onChange={(event) => setRfqQuery(event.target.value)}
                  className="mt-1 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                  placeholder="Example: copper cable scrap, HDPE flakes"
                />
              </label>
              {rfqMessage && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {rfqMessage}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-stone-200 p-5">
              <button
                onClick={() => setIsRfqModalOpen(false)}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={submitRfq}
                disabled={isSubmittingRfq || !rfqQuery.trim()}
                className="flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmittingRfq && <Loader2 size={16} className="animate-spin" />}
                Submit RFQ
              </button>
            </div>
          </div>
        </div>
      )}

      {bidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-stone-200 p-5">
              <div>
                <h3 className="text-lg font-semibold text-stone-950">
                  Place bid
                </h3>
                <p className="mt-1 text-sm text-stone-500">{bidTarget.name}</p>
              </div>
              <button
                onClick={() => setBidTarget(null)}
                className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Quantity</span>
                <input
                  value={bidDraft.quantity ?? ""}
                  onChange={(event) =>
                    setBidDraft((draft) => ({
                      ...draft,
                      quantity: event.target.value,
                    }))
                  }
                  type="number"
                  min="1"
                  className="mt-1 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                  placeholder="Tonnes"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-stone-700">
                  Bid price per tonne
                </span>
                <input
                  value={bidDraft.pricePerUnit ?? ""}
                  onChange={(event) =>
                    setBidDraft((draft) => ({
                      ...draft,
                      pricePerUnit: event.target.value,
                    }))
                  }
                  type="number"
                  min="1"
                  className="mt-1 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                  placeholder="INR"
                />
              </label>

              {bidMessage && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {bidMessage}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-stone-200 p-5">
              <button
                onClick={() => setBidTarget(null)}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={submitBid}
                disabled={isBidding || !bidDraft.quantity || !bidDraft.pricePerUnit}
                className="flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBidding && <Loader2 size={16} className="animate-spin" />}
                Submit bid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
          {label}
        </p>
        <Icon size={18} className="text-emerald-700" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">
        {value}
      </p>
      <p className="mt-1 text-sm text-stone-500">{detail}</p>
    </div>
  );
}

function ListingCard({
  listing,
  isSelected,
  onSelect,
  onBid,
}: {
  listing: MaterialListing;
  isSelected: boolean;
  onSelect: () => void;
  onBid: () => void;
}) {
  const toxicity = cleanToxicity(listing.toxicity);

  return (
    <article
      className={cn(
        "flex min-h-[430px] flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition",
        isSelected
          ? "border-emerald-700 ring-2 ring-emerald-700/10"
          : "border-stone-200 hover:border-stone-300 hover:shadow-md"
      )}
    >
      <button onClick={onSelect} className="flex-1 text-left">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
          <img
            src={listing.imageUrl}
            alt={listing.name}
            className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]"
            loading="lazy"
          />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {listing.tradeAssurance && (
              <span className="rounded-sm bg-orange-500 px-2 py-1 text-[11px] font-bold text-white shadow-sm">
                Trade Assurance
              </span>
            )}
            {listing.verified && (
              <span className="rounded-sm bg-white/95 px-2 py-1 text-[11px] font-bold text-emerald-800 shadow-sm">
                Verified Supplier
              </span>
            )}
            {listing.sourceType === "real_public" && (
              <span className="rounded-sm bg-sky-600 px-2 py-1 text-[11px] font-bold text-white shadow-sm">
                Public Source
              </span>
            )}
          </div>
        </div>

        <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
                  TOXICITY_STYLE[toxicity] ?? TOXICITY_STYLE.medium
                )}
              >
                {toxicity} risk
              </span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs font-medium",
                  listing.sourceType === "real_public"
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-blue-200 bg-blue-50 text-blue-700"
                )}
              >
                {listing.sourceType === "real_public" ? "Public source" : "Verified"}
              </span>
            </div>
            <h3 className="line-clamp-2 text-base font-semibold leading-snug text-stone-950">
              {listing.title}
            </h3>
          </div>
          <ArrowUpRight size={17} className="shrink-0 text-stone-400" />
        </div>

        <p className="mt-2 line-clamp-1 text-sm text-stone-500">
          {listing.category} · {listing.subcategory || listing.baseElement}
        </p>

        <div className="mt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-stone-950">
              {formatMoney(listing.price)}
            </span>
            <span className="text-xs text-stone-500">/ {listing.unit ?? "ton"}</span>
          </div>
          <div className="mt-1 text-xs text-stone-500">
            MOQ: {listing.minOrderQuantity} {listing.unit} · Stock: {displayQuantity(listing)}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <InfoBlock label="Rating" value={`${listing.rating.toFixed(1)}/5`} />
          <InfoBlock label="Response" value={`${listing.responseRate}%`} />
          <InfoBlock label="Lead" value={`${listing.leadTimeDays}d`} />
        </div>

        <div className="mt-4 space-y-2 text-sm text-stone-600">
          <div className="flex items-center gap-2">
            <Factory size={15} className="text-stone-400" />
            <span className="truncate">{listing.producer}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin size={15} className="text-stone-400" />
            <span className="truncate">{listing.area}, {listing.state}</span>
          </div>
          <div className="text-xs text-stone-500">
            {listing.yearsActive} yrs active · {listing.ordersCompleted.toLocaleString("en-IN")} completed orders
          </div>
        </div>
        </div>
      </button>

      <div className="flex gap-2 border-t border-stone-100 p-4 pt-3">
        <button
          onClick={onBid}
          className="flex flex-1 items-center justify-center gap-2 rounded-md bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Gavel size={15} />
          Request quote
        </button>
        <button
          onClick={onSelect}
          className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Details
        </button>
      </div>
    </article>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function ListingDetail({
  listing,
  onBid,
}: {
  listing: MaterialListing | null;
  onBid: (listing: MaterialListing) => void;
}) {
  if (!listing) {
    return (
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-stone-500">Select a listing to inspect specs.</p>
      </section>
    );
  }

  const hint = CATEGORY_HINTS[listing.category] ?? "Match ready";

  return (
    <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Listing detail
            </p>
            <h2 className="mt-1 text-xl font-semibold text-stone-950">
              {listing.title}
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              {listing.category} · {listing.subcategory}
            </p>
          </div>
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            {hint}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
          <img
            src={listing.imageUrl}
            alt={listing.name}
            className="h-44 w-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InfoBlock label="Ask price" value={formatMoney(listing.price)} />
          <InfoBlock label="MOQ" value={`${listing.minOrderQuantity} ${listing.unit}`} />
          <InfoBlock label="Available" value={displayQuantity(listing)} />
          <InfoBlock label="Lead time" value={`${listing.leadTimeDays} days`} />
        </div>

        <div className="rounded-lg border border-stone-200 p-4">
          <h3 className="text-sm font-semibold text-stone-900">Supplier</h3>
          <div className="mt-3 space-y-2 text-sm text-stone-600">
            <div className="flex items-center gap-2">
              <BadgeCheck size={16} className="text-emerald-700" />
              <span>{listing.producer}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-stone-400" />
              <span>{listing.area}, {listing.city}, {listing.state}</span>
            </div>
            <div className="flex items-center justify-between pt-2 text-xs">
              <span className="rounded-sm bg-orange-50 px-2 py-1 font-semibold text-orange-700">
                {listing.sourceType === "real_public"
                  ? "Public source"
                  : listing.tradeAssurance
                    ? "Trade Assurance"
                    : "Direct Deal"}
              </span>
              <span className="rounded-sm bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                {listing.responseRate}% response rate
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 p-4">
          <h3 className="text-sm font-semibold text-stone-900">Wholesale terms</h3>
          <div className="mt-3 space-y-2 text-sm text-stone-600">
            <div className="flex justify-between gap-3">
              <span>Packaging</span>
              <span className="font-medium text-stone-900">{listing.packaging}</span>
            </div>
          <div className="flex justify-between gap-3">
            <span>Payment</span>
            <span className="font-medium text-stone-900">{listing.paymentTerms}</span>
          </div>
          {listing.sourceUrl && (
            <a
              href={listing.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-sm font-semibold text-sky-700 hover:text-sky-800"
            >
              View original public listing
            </a>
          )}
            <div className="flex justify-between gap-3">
              <span>Completed orders</span>
              <span className="font-medium text-stone-900">{listing.ordersCompleted.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 p-4">
          <h3 className="text-sm font-semibold text-stone-900">Deal readiness</h3>
          <div className="mt-3 space-y-3">
            {[
              ["Specs captured", true],
              ["Seller verified", true],
              ["Compliance review", listing.toxicity !== "high"],
              ["Route estimate", true],
            ].map(([label, ok]) => (
              <div key={String(label)} className="flex items-center justify-between text-sm">
                <span className="text-stone-600">{label}</span>
                {ok ? (
                  <CheckCircle2 size={16} className="text-emerald-700" />
                ) : (
                  <Filter size={16} className="text-amber-600" />
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => onBid(listing)}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
        >
          <Gavel size={16} />
          Place bid
        </button>
      </div>
    </section>
  );
}

function DealFlowPanel({ userCompany }: { userCompany: string }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-stone-950">Deal flow</h2>
          <p className="text-sm text-stone-500">{userCompany}</p>
        </div>
        <Route size={18} className="text-emerald-700" />
      </div>

      <div className="mt-4 space-y-3">
        {[
          {
            title: "Split-match candidate",
            body: "Large mineral lots can be divided across nearby SME buyers.",
            tone: "emerald",
          },
          {
            title: "Compliance watch",
            body: "High-risk chemical listings need documentation before close.",
            tone: "amber",
          },
          {
            title: "Buyer demand gap",
            body: "Polymer and e-waste searches are rising in the current inventory.",
            tone: "blue",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-md border border-stone-200 p-3">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-1 h-2 w-2 rounded-full",
                  item.tone === "emerald" && "bg-emerald-700",
                  item.tone === "amber" && "bg-amber-500",
                  item.tone === "blue" && "bg-blue-600"
                )}
              />
              <div>
                <p className="text-sm font-semibold text-stone-900">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-stone-500">
                  {item.body}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkspacePanel({
  activeView,
  listings,
  onPostRfq,
  onCreateListing,
  onOpenMarketplace,
}: {
  activeView: Exclude<ActiveView, "Home">;
  listings: MaterialListing[];
  onPostRfq: () => void;
  onCreateListing: () => void;
  onOpenMarketplace: () => void;
}) {
  const topCategories = Array.from(
    listings.reduce((map, item) => {
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const copy: Record<Exclude<ActiveView, "Home">, { title: string; body: string; primary: string }> = {
    Marketplace: {
      title: "Marketplace",
      body: "Browse live wholesale listings and source verified industrial materials.",
      primary: "Browse marketplace",
    },
    "Bids & Deals": {
      title: "Bids & Deals",
      body: "Track buyer quotes, seller responses, accepted bids, and open negotiations.",
      primary: "Post RFQ",
    },
    "Match Engine": {
      title: "Match Engine",
      body: "Use material category, supplier location, risk, and demand signals to discover circular supply matches.",
      primary: "Find supply",
    },
    Compliance: {
      title: "Compliance",
      body: "Prioritize listings that are verified, lower risk, and ready for documentation review.",
      primary: "Review listings",
    },
    Logistics: {
      title: "Logistics",
      body: "Compare supply clusters, lead times, and nearby industrial zones before starting procurement.",
      primary: "Browse routes",
    },
  };

  const content = copy[activeView];

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-800">{activeView}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">
            {content.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
            {content.body}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={activeView === "Bids & Deals" ? onPostRfq : onOpenMarketplace}
            className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
          >
            {content.primary}
          </button>
          <button
            onClick={onCreateListing}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            Create listing
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <MetricCard
          icon={Package}
          label="Listings in view"
          value={listings.length.toLocaleString("en-IN")}
          detail="Filtered marketplace scope"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Public-source share"
          value={`${Math.round((listings.filter((item) => item.sourceType === "real_public").length / Math.max(listings.length, 1)) * 100)}%`}
          detail="Real imported inventory"
        />
        <MetricCard
          icon={Truck}
          label="Avg lead time"
          value={`${Math.round(listings.reduce((sum, item) => sum + item.leadTimeDays, 0) / Math.max(listings.length, 1))}d`}
          detail="Catalog average"
        />
      </div>

      <div className="mt-6 rounded-lg border border-stone-200">
        <div className="border-b border-stone-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-stone-900">Top active categories</h3>
        </div>
        <div className="divide-y divide-stone-100">
          {topCategories.map(([name, count]) => (
            <div key={name} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-medium text-stone-800">{name}</span>
              <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-600">
                {count.toLocaleString("en-IN")} listings
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
