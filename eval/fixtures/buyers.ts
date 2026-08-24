export type EvalBuyerFixture = {
  key: string;
  companyName: string;
  industry: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  orders: Array<{ listingKeys: string[]; ageDays: number }>;
  cart?: string[];
  wishlist?: string[];
};

export const EVAL_BUYERS: EvalBuyerFixture[] = [
  { key: "cold-start", companyName: "Eval Cold Start Buyer", industry: "General recycling", city: "Delhi", state: "Delhi", latitude: 28.6139, longitude: 77.209, orders: [] },
  { key: "metal-heavy", companyName: "Eval Metal Heavy Buyer", industry: "Metal remelting", city: "Ahmedabad", state: "Gujarat", latitude: 23.0225, longitude: 72.5714, orders: [{ listingKeys: ["al-tata-6063-clean", "cu-berry-bare-bright"], ageDays: 7 }, { listingKeys: ["al-toto-6061"], ageDays: 21 }, { listingKeys: ["cu-barley-no1"], ageDays: 42 }] },
  { key: "plastic-heavy", companyName: "Eval Plastic Heavy Buyer", industry: "Polymer reprocessing", city: "Surat", state: "Gujarat", latitude: 21.1702, longitude: 72.8311, orders: [{ listingKeys: ["pe-film-grade-a", "hdpe-bottle-natural-a"], ageDays: 5 }, { listingKeys: ["pe-film-grade-b"], ageDays: 18 }, { listingKeys: ["hdpe-drum-blue"], ageDays: 35 }] },
  { key: "rubber-only", companyName: "Eval Rubber Only Buyer", industry: "Rubber products", city: "Jaipur", state: "Rajasthan", latitude: 26.9124, longitude: 75.7873, orders: [{ listingKeys: ["decoy-rubber-crumb"], ageDays: 12 }, { listingKeys: ["attack-rubber"], ageDays: 40 }] },
  { key: "mixed-copurchase", companyName: "Eval Mixed Co-purchase Buyer", industry: "Industrial recycling", city: "Mumbai", state: "Maharashtra", latitude: 19.076, longitude: 72.8777, orders: [{ listingKeys: ["cu-berry-bare-bright", "pe-film-grade-a", "decoy-rubber-crumb"], ageDays: 9 }] },
  { key: "mixed-affinity", companyName: "Eval Mixed Affinity Buyer", industry: "Circular manufacturing", city: "Pune", state: "Maharashtra", latitude: 18.5204, longitude: 73.8567, orders: [{ listingKeys: ["al-tata-6063-clean"], ageDays: 15 }, { listingKeys: ["hdpe-bottle-natural-a"], ageDays: 17 }] },
  { key: "stale-history", companyName: "Eval Stale History Buyer", industry: "Commodity trading", city: "Kolkata", state: "West Bengal", latitude: 22.5726, longitude: 88.3639, orders: [{ listingKeys: ["cu-candy-no2", "pe-film-grade-c"], ageDays: 540 }] },
  { key: "repeat-buyer", companyName: "Eval Repeat Buyer", industry: "Secondary metals", city: "Jamnagar", state: "Gujarat", latitude: 22.4707, longitude: 70.0577, orders: [{ listingKeys: ["cu-berry-bare-bright"], ageDays: 3 }, { listingKeys: ["cu-berry-bare-bright"], ageDays: 11 }, { listingKeys: ["cu-berry-bare-bright"], ageDays: 25 }, { listingKeys: ["cu-barley-no1"], ageDays: 31 }] },
  { key: "local-price", companyName: "Eval Local Price Buyer", industry: "Plastic compounding", city: "Hyderabad", state: "Telangana", latitude: 17.385, longitude: 78.4867, orders: [{ listingKeys: ["hdpe-bottle-mixed-b"], ageDays: 8 }], cart: ["hdpe-bottle-natural-a"] },
  { key: "intent-only", companyName: "Eval Intent Only Buyer", industry: "Packaging recovery", city: "Chennai", state: "Tamil Nadu", latitude: 13.0827, longitude: 80.2707, orders: [], cart: ["pe-film-grade-a"], wishlist: ["hdpe-drum-blue", "pe-film-grade-b"] },
];

export const EVAL_BUYER_ID = (key: string) => `eval_buyer_${key}`;
