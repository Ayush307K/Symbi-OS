"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bell,
  Building2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  Factory,
  Gavel,
  Gauge,
  Heart,
  LayoutDashboard,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  ShoppingCart,
  Truck,
  X,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import ListingImage from "@/components/ListingImage";
import { cn } from "@/lib/cn";
import { useAuth } from "@/context/AuthContext";
import { CatalogSection } from "@/components/marketplace/CatalogSection";
import { Hero } from "@/components/marketplace/Hero";
import { PublicLanding } from "@/components/marketplace/PublicLanding";

const SELLER_SAFE_CATEGORIES = [
  "Agricultural Residue",
  "Fly Ash & Minerals",
  "Glass",
  "Metal Scrap",
  "Non-hazardous Chemicals",
  "Paper & Cardboard",
  "Plastic Scrap",
  "Rubber",
  "Textile Waste",
];

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

interface MarketplaceSearch {
  q: string;
  category: string;
  location: string;
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

interface AddressDraft {
  contactName: string;
  phone: string;
  pincode: string;
  street: string;
  buildingName: string;
  area: string;
  landmark: string;
}

const NAV_ITEMS = [
  { label: "Overview", view: "Home", icon: LayoutDashboard },
  { label: "Marketplace", view: "Marketplace", icon: Package },
  { label: "Bids & Deals", view: "Bids & Deals", icon: Gavel },
  { label: "Match Engine", view: "Match Engine", icon: Sparkles },
  { label: "Compliance", view: "Compliance", icon: ClipboardCheck },
  { label: "Logistics", view: "Logistics", icon: Truck },
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

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
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
    category: "Plastic Scrap",
    baseElement: "",
    toxicity: "none",
    description: "",
    price: "",
    quantity: "",
  });
  const [listingMessage, setListingMessage] = useState<string | null>(null);
  const [isCreatingListing, setIsCreatingListing] = useState(false);
  const [isRfqModalOpen, setIsRfqModalOpen] = useState(false);
  const [rfqQuery, setRfqQuery] = useState("");
  const [rfqCategory, setRfqCategory] = useState("Plastic Scrap");
  const [rfqQuantity, setRfqQuantity] = useState("1");
  const [rfqUnit, setRfqUnit] = useState("ton");
  const [rfqMaxPrice, setRfqMaxPrice] = useState("");
  const [rfqCity, setRfqCity] = useState("");
  const [rfqState, setRfqState] = useState("");
  const [rfqAvailableBy, setRfqAvailableBy] = useState("");
  const [rfqMatches, setRfqMatches] = useState<Array<{
    listingId: string;
    title: string;
    score: number;
    explanations: string[];
  }>>([]);
  const [rfqMessage, setRfqMessage] = useState<string | null>(null);
  const [isSubmittingRfq, setIsSubmittingRfq] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [checkoutListing, setCheckoutListing] = useState<MaterialListing | null>(null);
  const [addressDraft, setAddressDraft] = useState<AddressDraft>({
    contactName: user?.companyName ?? "",
    phone: "",
    pincode: "",
    street: "",
    buildingName: "",
    area: "",
    landmark: "",
  });
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [reviewListing, setReviewListing] = useState<MaterialListing | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMoreListings, setHasMoreListings] = useState(false);
  const [appliedSearch, setAppliedSearch] = useState<MarketplaceSearch>({
    q: "",
    category: "",
    location: "",
  });

  const fetchMaterials = useCallback(async (
    search: MarketplaceSearch = { q: "", category: "", location: "" },
    cursor?: string,
  ) => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams({ limit: "24" });
      if (search.q) params.set("q", search.q);
      if (search.category) params.set("category", search.category);
      if (search.location) params.set("location", search.location);
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/materials?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch marketplace listings");
      const payload = await res.json();
      const data: MaterialListing[] = Array.isArray(payload)
        ? payload
        : payload.items || [];
      setListings((current) => cursor ? [...current, ...data] : data);
      setNextCursor(payload.pageInfo?.nextCursor ?? null);
      setHasMoreListings(Boolean(payload.pageInfo?.hasMore));
      setAppliedSearch(search);
      setSelected((current) => {
        if (cursor && current) return current;
        return data.find((item) => item.id === current?.id) ?? data[0] ?? null;
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
    const params = new URLSearchParams(window.location.search);
    const initial: MarketplaceSearch = {
      q: params.get("q")?.trim() ?? "",
      category: params.get("category")?.trim() ?? "",
      location: params.get("location")?.trim() ?? "",
    };
    setQuery(initial.q);
    setCategory(initial.category || "All");
    if (initial.location) {
      setMarketplaceLocation({
        label: initial.location,
        query: initial.location,
      });
    }
    fetchMaterials(initial);
  }, [fetchMaterials]);

  const applyMarketplaceSearch = useCallback(
    async (overrides: Partial<MarketplaceSearch> = {}) => {
      const search: MarketplaceSearch = {
        q: overrides.q ?? query.trim(),
        category:
          overrides.category ??
          (category === "All" ? "" : category),
        location: overrides.location ?? marketplaceLocation.query.trim(),
      };
      const params = new URLSearchParams();
      if (search.q) params.set("q", search.q);
      if (search.category) params.set("category", search.category);
      if (search.location) params.set("location", search.location);
      window.history.replaceState(
        null,
        "",
        params.size ? `/?${params.toString()}` : "/",
      );
      setActiveView("Marketplace");
      await fetchMaterials(search);
    },
    [category, fetchMaterials, marketplaceLocation.query, query],
  );

  useEffect(() => {
    async function fetchWishlist() {
      try {
        const res = await fetch("/api/wishlist");
        if (!res.ok) return;
        const data = await res.json();
        setSavedIds(new Set((data.items ?? []).map((item: { listingId: string }) => item.listingId)));
      } catch {
        // Non-critical; action buttons still work.
      }
    }
    fetchWishlist();
  }, []);

  const categories = useMemo(() => {
    return [
      "All",
      ...Array.from(
        new Set([
          ...SELLER_SAFE_CATEGORIES,
          ...listings.map((item) => item.category),
        ]),
      ).sort(),
    ];
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
          item.sourceType,
          item.sourceName ?? "",
          item.sourceType.startsWith("real_public") ? "public source" : "",
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
          return imageScore || quantityScore;
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
      publicListings: filteredListings.filter((item) => item.sourceType.startsWith("real_public")).length,
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
      const nextCategory = match ?? "All";
      setCategory(nextCategory);
      setActiveView("Marketplace");
      void applyMarketplaceSearch({
        category: nextCategory === "All" ? "" : nextCategory,
      });
      document.getElementById("marketplace-listings")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    [applyMarketplaceSearch, categories]
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
        category: "Plastic Scrap",
        baseElement: "",
        toxicity: "none",
        description: "",
        price: "",
        quantity: "",
      });
      await fetchMaterials(appliedSearch);
      window.setTimeout(() => setIsListingModalOpen(false), 900);
    } catch (err) {
      setListingMessage(err instanceof Error ? err.message : "Unable to create listing");
    } finally {
      setIsCreatingListing(false);
    }
  }, [appliedSearch, fetchMaterials, listingDraft]);

  const submitRfq = useCallback(async () => {
    const demand = rfqQuery.trim();
    if (!demand) {
      setRfqMessage("Describe the material you want to source.");
      return;
    }
    setIsSubmittingRfq(true);
    setRfqMessage(null);
    setRfqMatches([]);

    try {
      const res = await fetch("/api/demand/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: demand,
          category: rfqCategory,
          subcategory: demand,
          quantity: Number(rfqQuantity),
          unit: rfqUnit,
          maxPrice: rfqMaxPrice ? Number(rfqMaxPrice) : undefined,
          city: rfqCity.trim() || undefined,
          state: rfqState.trim() || undefined,
          availableBy: rfqAvailableBy
            ? new Date(`${rfqAvailableBy}T23:59:59.999Z`).toISOString()
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to post RFQ");
      setRfqMessage(data.message ?? "RFQ posted.");
      setRfqMatches(data.results ?? []);
      if (data.results?.length) {
        setQuery(demand);
        setCategory(rfqCategory);
        setActiveView("Marketplace");
        void applyMarketplaceSearch({
          q: demand,
          category: rfqCategory,
          location: [rfqCity, rfqState].filter(Boolean).join(" "),
        });
      }
    } catch (err) {
      setRfqMessage(err instanceof Error ? err.message : "Unable to post RFQ");
    } finally {
      setIsSubmittingRfq(false);
    }
  }, [
    applyMarketplaceSearch,
    rfqAvailableBy,
    rfqCategory,
    rfqCity,
    rfqMaxPrice,
    rfqQuery,
    rfqQuantity,
    rfqState,
    rfqUnit,
  ]);

  const submitBid = useCallback(async () => {
    if (!bidTarget || !bidDraft.quantity || !bidDraft.pricePerUnit) return;
    setIsBidding(true);
    setBidMessage(null);

    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          listingId: bidTarget.id,
          quantity: Number(bidDraft.quantity),
          pricePerUnit: Number(bidDraft.pricePerUnit),
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

  const saveListing = useCallback(
    async (listing: MaterialListing) => {
      try {
        const alreadySaved = savedIds.has(listing.id);
        const res = await fetch(
          alreadySaved ? `/api/wishlist?listingId=${encodeURIComponent(listing.id)}` : "/api/wishlist",
          {
            method: alreadySaved ? "DELETE" : "POST",
            headers: alreadySaved ? undefined : { "Content-Type": "application/json" },
            body: alreadySaved ? undefined : JSON.stringify({ listingId: listing.id }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Unable to update saved products");
        setSavedIds((current) => {
          const next = new Set(current);
          if (alreadySaved) next.delete(listing.id);
          else next.add(listing.id);
          return next;
        });
        showToast(alreadySaved ? "Removed from saved products." : "Saved for later.");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Unable to update saved products.");
      }
    },
    [savedIds, showToast]
  );

  const addToCart = useCallback(
    async (listing: MaterialListing) => {
      try {
        const res = await fetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId: listing.id,
            quantity: Math.max(1, listing.minOrderQuantity || 1),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Unable to add to cart");
        showToast("Added to cart.");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Unable to add to cart.");
      }
    },
    [showToast]
  );

  const messageSeller = useCallback(
    async (listing: MaterialListing) => {
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId: listing.id,
            subject: `Enquiry for ${listing.title}`,
            body: `Hi, I am interested in ${listing.title}. Please share availability, latest price, MOQ, dispatch timeline, and GST invoice terms.`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Unable to message seller");
        showToast("Message thread created.");
        router.push(`/messages/${data.threadId}`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Unable to message seller.");
      }
    },
    [router, showToast]
  );

  const submitCheckout = useCallback(async () => {
    if (!checkoutListing) return;
    setIsCheckingOut(true);
    setCheckoutMessage(null);
    try {
      const addressRes = await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addressDraft,
          label: "Primary delivery",
          isDefaultShipping: true,
          isDefaultBilling: true,
        }),
      });
      const addressData = await addressRes.json();
      if (!addressRes.ok) throw new Error(addressData.error ?? "Unable to save address");

      const orderRes = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          listingId: checkoutListing.id,
          quantity: Math.max(1, checkoutListing.minOrderQuantity || 1),
          shippingAddressId: addressData.address.id,
          billingAddressId: addressData.address.id,
        }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error ?? "Unable to create order");
      setCheckoutMessage(
        `Order ${orderData.order.orderNumber} confirmed with sandbox payment. No real funds were transferred.`
      );
      showToast(`Order ${orderData.order.orderNumber} created.`);
      window.setTimeout(() => setCheckoutListing(null), 1200);
    } catch (err) {
      setCheckoutMessage(err instanceof Error ? err.message : "Unable to complete checkout.");
    } finally {
      setIsCheckingOut(false);
    }
  }, [addressDraft, checkoutListing, showToast]);

  const submitReview = useCallback(async () => {
    if (!reviewListing) return;
    setIsSubmittingReview(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: reviewListing.id,
          rating: reviewRating,
          body: reviewBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to submit review");
      showToast("Review submitted.");
      setReviewBody("");
      setReviewRating(5);
      setReviewListing(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Unable to submit review.");
    } finally {
      setIsSubmittingReview(false);
    }
  }, [reviewBody, reviewListing, reviewRating, showToast]);

  // Unauthenticated visitors get the public landing — hero, then the browsable
  // catalogue. Everything below is the signed-in workspace, unchanged.
  if (!user) {
    return <PublicLanding />;
  }

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
          void applyMarketplaceSearch({ location: location.query });
          showToast(
            location.query
              ? `Showing suppliers near ${location.label}.`
              : "Showing suppliers across all locations."
          );
        }}
        onSearchSubmit={() => void applyMarketplaceSearch()}
        onPostRfq={() => setIsRfqModalOpen(true)}
        onSell={() => router.push("/seller/listings/new")}
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
            onClick={() => router.push("/seller/listings/new")}
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
            // Migrated: the signed-in home is now the same hero + catalogue the
            // public landing uses, so both audiences browse identical surfaces.
            <div className="-mx-4 -my-5 sm:-mx-6 xl:-mx-8">
              <Hero
                onSearch={(nextQuery) => {
                  const params = new URLSearchParams(window.location.search);
                  if (nextQuery) params.set("q", nextQuery);
                  else params.delete("q");
                  window.history.pushState(
                    null,
                    "",
                    params.size ? `/?${params}` : "/",
                  );
                  window.dispatchEvent(new PopStateEvent("popstate"));
                  document
                    .getElementById("catalogue")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                listingCount={listings.length}
                isAuthenticated
              />
              <div className="py-10">
                <CatalogSection isAuthenticated />
              </div>
            </div>
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
                    onClick={() => {
                      setMarketplaceLocation({ label: "All locations", query: "" });
                      void applyMarketplaceSearch({ location: "" });
                    }}
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
                onClick={() => router.push("/seller/listings/new")}
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
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void applyMarketplaceSearch();
                        }}
                        placeholder="Search material, seller, city..."
                        className="h-10 w-full rounded-md border border-stone-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10 sm:w-72"
                      />
                    </div>
                    <select
                      value={category}
                      onChange={(event) => {
                        const nextCategory = event.target.value;
                        setCategory(nextCategory);
                        void applyMarketplaceSearch({
                          category: nextCategory === "All" ? "" : nextCategory,
                        });
                      }}
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
                        void applyMarketplaceSearch({ q: "public source" });
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
                          void applyMarketplaceSearch({
                            location: `${topLocation.city} ${topLocation.state}`,
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
                        void applyMarketplaceSearch({
                          q: "",
                          category: "",
                          location: "",
                        });
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
                  <p>{error}</p>
                  <button
                    onClick={() => void fetchMaterials(appliedSearch)}
                    className="mt-2 min-h-10 rounded-md border border-amber-300 px-3 text-xs font-semibold"
                  >
                    Retry marketplace search
                  </button>
                </div>
              )}

              {!isLoading && !error && visibleListings.length === 0 && (
                <div className="m-4 rounded-md border border-stone-200 bg-stone-50 p-8 text-center">
                  <p className="font-semibold text-stone-800">
                    No listings match these filters.
                  </p>
                  <button
                    onClick={() => {
                      setQuery("");
                      setCategory("All");
                      setMarketplaceLocation({
                        label: "All locations",
                        query: "",
                      });
                      void applyMarketplaceSearch({
                        q: "",
                        category: "",
                        location: "",
                      });
                    }}
                    className="mt-3 min-h-10 rounded-md border border-stone-300 px-3 text-sm font-semibold"
                  >
                    Clear search
                  </button>
                </div>
              )}

              {!isLoading && (
                <div>
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
                  {hasMoreListings && nextCursor && (
                    <div className="border-t border-stone-200 p-4 text-center">
                      <button
                        onClick={() => void fetchMaterials(appliedSearch, nextCursor)}
                        className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                      >
                        Load more listings
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            <aside className="space-y-5">
              <ListingDetail
                listing={selected}
                onBid={(listing) => openBidModal(listing)}
                onSave={saveListing}
                onAddToCart={addToCart}
                onBuyNow={setCheckoutListing}
                onMessage={messageSeller}
                onReview={setReviewListing}
                isSaved={selected ? savedIds.has(selected.id) : false}
              />
            </aside>
          </div>
          ) : (
            <WorkspacePanel
              activeView={activeView}
              listings={filteredListings}
              onPostRfq={() => setIsRfqModalOpen(true)}
              onCreateListing={() => router.push("/seller/listings/new")}
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
                  {SELLER_SAFE_CATEGORIES.map((item) => (
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
                  min="1"
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
                  value={listingDraft.toxicity ?? "none"}
                  onChange={(event) =>
                    setListingDraft((draft) => ({ ...draft, toxicity: event.target.value }))
                  }
                  className="mt-1 h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                >
                  <option value="none">Non-hazardous</option>
                  <option value="low">Low risk</option>
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
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-stone-700">Category</span>
                  <select
                    value={rfqCategory}
                    onChange={(event) => setRfqCategory(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
                  >
                    {SELLER_SAFE_CATEGORIES.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700">Required by</span>
                  <input
                    type="date"
                    value={rfqAvailableBy}
                    onChange={(event) => setRfqAvailableBy(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700">Quantity</span>
                  <input
                    type="number"
                    min="1"
                    value={rfqQuantity}
                    onChange={(event) => setRfqQuantity(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700">Unit</span>
                  <select
                    value={rfqUnit}
                    onChange={(event) => setRfqUnit(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
                  >
                    {["kg", "ton", "lot"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700">
                    Maximum price per unit
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={rfqMaxPrice}
                    onChange={(event) => setRfqMaxPrice(event.target.value)}
                    placeholder="Optional, INR"
                    className="mt-1 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700">City</span>
                  <input
                    value={rfqCity}
                    onChange={(event) => setRfqCity(event.target.value)}
                    placeholder="Optional"
                    className="mt-1 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-stone-700">State</span>
                  <input
                    value={rfqState}
                    onChange={(event) => setRfqState(event.target.value)}
                    placeholder="Optional"
                    className="mt-1 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700"
                  />
                </label>
              </div>
              {rfqMessage && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {rfqMessage}
                </div>
              )}
              {rfqMatches.length > 0 && (
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {rfqMatches.slice(0, 5).map((match) => (
                    <button
                      key={match.listingId}
                      onClick={() => {
                        setIsRfqModalOpen(false);
                        router.push(`/products/${match.listingId}`);
                      }}
                      className="w-full rounded-md border border-stone-200 p-3 text-left hover:border-emerald-300"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-stone-900">{match.title}</span>
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                          {match.score}% match
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-stone-500">
                        {match.explanations.slice(0, 2).join(" · ")}
                      </p>
                    </button>
                  ))}
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
                disabled={
                  isSubmittingRfq ||
                  !rfqQuery.trim() ||
                  !rfqCategory ||
                  Number(rfqQuantity) <= 0
                }
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

      {checkoutListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-stone-200 p-5">
              <div>
                <h3 className="text-lg font-semibold text-stone-950">Checkout</h3>
                <p className="mt-1 line-clamp-1 text-sm text-stone-500">
                  {checkoutListing.title}
                </p>
              </div>
              <button
                onClick={() => setCheckoutListing(null)}
                className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {[
                ["contactName", "Contact name", "Procurement manager"],
                ["phone", "Mobile number", "10-digit mobile"],
                ["pincode", "Pincode", "560001"],
                ["buildingName", "Building / company", "Plant or office name"],
                ["street", "Street address", "Road, industrial estate, plot number"],
                ["area", "Area / locality", "Peenya Industrial Area"],
                ["landmark", "Landmark", "Near main gate"],
              ].map(([key, label, placeholder]) => (
                <label key={key} className={key === "street" ? "block sm:col-span-2" : "block"}>
                  <span className="text-sm font-medium text-stone-700">{label}</span>
                  <input
                    value={addressDraft[key as keyof AddressDraft] ?? ""}
                    onChange={(event) =>
                      setAddressDraft((draft) => ({
                        ...draft,
                        [key]: event.target.value,
                      }))
                    }
                    className="mt-1 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                    placeholder={placeholder}
                  />
                </label>
              ))}

              <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700 sm:col-span-2">
                <p className="font-semibold">Sandbox order summary</p>
                <p className="mt-1">
                  {checkoutListing.minOrderQuantity} {checkoutListing.unit} ×{" "}
                  {formatMoney(checkoutListing.price)} ={" "}
                  {formatMoney(
                    (checkoutListing.price ?? 0) *
                      checkoutListing.minOrderQuantity,
                  )}
                </p>
                <p className="mt-1">
                  Buyer platform fee (1%):{" "}
                  {formatMoney(
                    (checkoutListing.price ?? 0) *
                      checkoutListing.minOrderQuantity *
                      0.01,
                  )}
                </p>
                <p>
                  Total:{" "}
                  {formatMoney(
                    (checkoutListing.price ?? 0) *
                      checkoutListing.minOrderQuantity *
                      1.01,
                  )}
                </p>
                <p className="mt-2 text-xs text-amber-800">
                  GST/TDS and shipping are not calculated in sandbox v0. No real
                  funds or settlement occur.
                </p>
              </div>

              {checkoutMessage && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:col-span-2">
                  {checkoutMessage}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-stone-200 p-5">
              <button
                onClick={() => setCheckoutListing(null)}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={submitCheckout}
                disabled={
                  isCheckingOut ||
                  !addressDraft.contactName ||
                  !addressDraft.phone ||
                  !addressDraft.pincode ||
                  !addressDraft.street
                }
                className="flex items-center gap-2 rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCheckingOut && <Loader2 size={16} className="animate-spin" />}
                Confirm order
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-stone-200 p-5">
              <div>
                <h3 className="text-lg font-semibold text-stone-950">Write review</h3>
                <p className="mt-1 line-clamp-1 text-sm text-stone-500">{reviewListing.title}</p>
              </div>
              <button
                onClick={() => setReviewListing(null)}
                className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Rating</span>
                <select
                  value={reviewRating}
                  onChange={(event) => setReviewRating(Number(event.target.value))}
                  className="mt-1 h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                >
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option key={rating} value={rating}>
                      {rating} star{rating === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Review</span>
                <textarea
                  value={reviewBody}
                  onChange={(event) => setReviewBody(event.target.value)}
                  className="mt-1 min-h-28 w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                  placeholder="Share product quality, packaging, dispatch, and seller communication."
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-stone-200 p-5">
              <button
                onClick={() => setReviewListing(null)}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={submitReview}
                disabled={isSubmittingReview || reviewBody.trim().length < 10}
                className="flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmittingReview && <Loader2 size={16} className="animate-spin" />}
                Submit review
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
  const isPublicSource = listing.sourceType.startsWith("real_public");

  return (
    <article
      className={cn(
        "flex min-h-[390px] flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition",
        isSelected
          ? "border-emerald-700 ring-2 ring-emerald-700/10"
          : "border-stone-200 hover:border-stone-300 hover:shadow-md"
      )}
    >
      <button onClick={onSelect} className="flex-1 text-left">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
          <ListingImage
            src={listing.imageUrl}
            alt={listing.name}
            className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]"
            loading="lazy"
          />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {isPublicSource && (
              <span className="rounded-sm bg-sky-600 px-2 py-1 text-[11px] font-bold text-white shadow-sm">
                India public source
              </span>
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                  {listing.sourceName ?? (isPublicSource ? "Public source" : "Seller listing")}
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

          <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-stone-950">
                {formatMoney(listing.price)}
              </span>
              {listing.price && listing.price > 0 && (
                <span className="text-xs text-stone-500">/ {listing.unit ?? "unit"}</span>
              )}
            </div>
            <div className="mt-1 text-xs text-stone-500">
              Quantity: {displayQuantity(listing)}
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-stone-600">
            <div className="flex items-center gap-2">
              <Factory size={15} className="text-stone-400" />
              <span className="truncate">{listing.producer}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={15} className="text-stone-400" />
              <span className="truncate">{listing.rawLocationText || `${listing.area}, ${listing.state}`}</span>
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
        <Link
          href={`/products/${listing.id}`}
          className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Details
        </Link>
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
  onSave,
  onAddToCart,
  onBuyNow,
  onMessage,
  onReview,
  isSaved,
}: {
  listing: MaterialListing | null;
  onBid: (listing: MaterialListing) => void;
  onSave: (listing: MaterialListing) => void;
  onAddToCart: (listing: MaterialListing) => void;
  onBuyNow: (listing: MaterialListing) => void;
  onMessage: (listing: MaterialListing) => void;
  onReview: (listing: MaterialListing) => void;
  isSaved: boolean;
}) {
  if (!listing) {
    return (
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-stone-500">Select a listing to inspect source details.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Source record
            </p>
            <h2 className="mt-1 text-xl font-semibold text-stone-950">
              {listing.title}
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              {listing.category} · {listing.subcategory}
            </p>
          </div>
          <span className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
            India public data
          </span>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
          <ListingImage
            src={listing.imageUrl}
            alt={listing.name}
            className="h-44 w-full object-cover"
            loading="lazy"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InfoBlock label="Price" value={formatMoney(listing.price)} />
          <InfoBlock label="Quantity" value={displayQuantity(listing)} />
          <InfoBlock label="Location" value={listing.rawLocationText || `${listing.city}, ${listing.state}`} />
          <InfoBlock label="Source" value={listing.sourceName ?? "Public source"} />
        </div>

        <div className="rounded-lg border border-stone-200 p-4">
          <h3 className="text-sm font-semibold text-stone-900">Supplier</h3>
          <div className="mt-3 space-y-2 text-sm text-stone-600">
            <div className="flex items-center gap-2">
              <Factory size={16} className="text-stone-400" />
              <span>{listing.producer}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-stone-400" />
              <span>{listing.area}, {listing.city}, {listing.state}, {listing.country}</span>
            </div>
            <div className="rounded-sm bg-stone-50 px-2 py-1 text-xs font-medium text-stone-600">
              Contact details are not copied into Symbi-OS. Use RFQ or open the source record.
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 p-4">
          <h3 className="text-sm font-semibold text-stone-900">Terms from source</h3>
          <div className="mt-3 space-y-2 text-sm text-stone-600">
            <div className="flex justify-between gap-3">
              <span>Packaging</span>
              <span className="font-medium text-stone-900">{listing.packaging}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Payment</span>
              <span className="font-medium text-stone-900">{listing.paymentTerms}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 p-4">
          <h3 className="text-sm font-semibold text-stone-900">Description from source</h3>
          <p className="mt-2 line-clamp-6 text-sm leading-6 text-stone-600">
            {listing.description}
          </p>
          {listing.sourceUrl && (
            <a
              href={listing.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block text-sm font-semibold text-sky-700 hover:text-sky-800"
            >
              View original public listing
            </a>
          )}
          <Link
            href={`/products/${listing.id}`}
            className="mt-3 block text-sm font-semibold text-orange-600 hover:text-orange-700"
          >
            Open full product page
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onSave(listing)}
            className="flex items-center justify-center gap-2 rounded-md border border-stone-300 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            <Heart size={16} className={isSaved ? "fill-red-500 text-red-500" : ""} />
            {isSaved ? "Saved" : "Save"}
          </button>
          <button
            onClick={() => onAddToCart(listing)}
            className="flex items-center justify-center gap-2 rounded-md border border-stone-300 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            <ShoppingCart size={16} />
            Cart
          </button>
          <button
            onClick={() => onMessage(listing)}
            className="flex items-center justify-center gap-2 rounded-md border border-stone-300 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            <MessageCircle size={16} />
            Message
          </button>
          <button
            onClick={() => onReview(listing)}
            className="flex items-center justify-center gap-2 rounded-md border border-stone-300 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            <Star size={16} />
            Review
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onBid(listing)}
            className="flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            <Gavel size={16} />
            Request quote
          </button>
          <button
            onClick={() => onBuyNow(listing)}
            className="flex items-center justify-center gap-2 rounded-md bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
          >
            <CreditCard size={16} />
            Buy now
          </button>
        </div>
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
      body: "Browse live India sell offers, inspect source records, and start RFQs.",
      primary: "Browse marketplace",
    },
    "Bids & Deals": {
      title: "Bids & Deals",
      body: "Track buyer quotes, seller responses, accepted bids, and open negotiations.",
      primary: "Post RFQ",
    },
    "Match Engine": {
      title: "Match Engine",
      body: "Use material category and supplier location to shortlist practical sourcing matches.",
      primary: "Find supply",
    },
    Compliance: {
      title: "Compliance",
      body: "Keep source links, terms, packaging, and descriptions visible before a buyer follows up.",
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
          value={`${Math.round((listings.filter((item) => item.sourceType.startsWith("real_public")).length / Math.max(listings.length, 1)) * 100)}%`}
          detail="Real imported inventory"
        />
        <MetricCard
          icon={Truck}
          label="India offers"
          value={listings.filter((item) => item.country === "India").length.toLocaleString("en-IN")}
          detail="Listings with India as source country"
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
