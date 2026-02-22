/**
 * Symbi-OS — Circular Supply Chain Dataset Generator (v3 — Expanded)
 *
 * 30 industries · ~140 companies · ~100 waste materials · 18 regulations
 * Each waste material now includes a `category` field.
 *
 * Run:  node generate_dataset.js
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
//  Categories for waste materials
// ---------------------------------------------------------------------------

const CAT = {
  MET: "Metals & Alloys",
  CHM: "Chemicals",
  ORG: "Organic & Bio",
  EWS: "E-Waste",
  PLY: "Polymers & Plastics",
  MIN: "Minerals & Construction",
  NRG: "Energy Materials",
  TXF: "Textiles & Fibers",
};

// ---------------------------------------------------------------------------
//  Price ranges (USD per unit) by category
// ---------------------------------------------------------------------------

const PRICE_RANGES = {
  [CAT.MET]: [50, 5000],
  [CAT.CHM]: [10, 800],
  [CAT.ORG]: [5, 300],
  [CAT.EWS]: [20, 1200],
  [CAT.PLY]: [8, 500],
  [CAT.MIN]: [15, 600],
  [CAT.NRG]: [30, 2000],
  [CAT.TXF]: [5, 400],
};

function randomPrice(category) {
  const [min, max] = PRICE_RANGES[category] || [10, 500];
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function randomQuantity() {
  return 1 + Math.floor(Math.random() * 500);
}

// ---------------------------------------------------------------------------
//  GEOSPATIAL COORDINATES — [latitude, longitude] for each company location
// ---------------------------------------------------------------------------

const LOCATION_COORDS = {
  // India & South Asia
  "Surat, India": [21.17, 72.83], "Ahmedabad, India": [23.02, 72.57],
  "Dhaka, Bangladesh": [23.81, 90.41], "Jamshedpur, India": [22.80, 86.18],
  "Chennai, India": [13.08, 80.27], "Mumbai, India": [19.08, 72.88],
  "Bengaluru, India": [12.97, 77.59], "Hyderabad, India": [17.39, 78.49],
  "Pune, India": [18.52, 73.86], "Gurgaon, India": [28.46, 77.03],
  "Hirakud, India": [21.52, 83.87], "Mundra, India": [22.84, 69.72],
  "Mathura, India": [27.49, 77.67], "Kudankulam, India": [8.17, 77.72],
  "New Delhi, India": [28.61, 77.21], "Secunderabad, India": [17.43, 78.50],
  "Hangzhou, China": [30.27, 120.15], "Shanghai, China": [31.23, 121.47],
  // China
  "Ningde, China": [26.66, 119.55], "Jiangxi, China": [27.63, 115.89],
  "Changsha, China": [28.23, 112.94], "Binzhou, China": [37.38, 118.02],
  "Shangrao, China": [28.45, 117.97], "Urumqi, China": [43.83, 87.62],
  // Japan & Korea
  "Chiba, Japan": [35.61, 140.12], "Nagoya, Japan": [35.18, 136.91],
  "Kurume, Japan": [33.32, 130.51], "Gwangyang, South Korea": [34.94, 127.70],
  "Suwon, South Korea": [37.26, 127.03], "Pyeongtaek, South Korea": [36.99, 127.09],
  "Seoul, South Korea": [37.57, 126.98],
  // Taiwan
  "Hsinchu, Taiwan": [24.80, 120.97], "Taipei, Taiwan": [25.03, 121.57],
  // Europe — Scandinavia & Nordics
  "Borås, Sweden": [57.72, 12.94], "Skellefteå, Sweden": [64.75, 20.95],
  "Lund, Sweden": [55.70, 13.19], "Aarhus, Denmark": [56.16, 10.21],
  "Espoo, Finland": [60.21, 24.66], "Karmøy, Norway": [59.28, 5.31],
  // Europe — Western
  "Ghent, Belgium": [51.05, 3.72], "Paris, France": [48.86, 2.35],
  "Clermont-Ferrand, France": [45.78, 3.08], "Gravelines, France": [50.99, 2.13],
  "Rotterdam, Netherlands": [51.92, 4.48], "Amersfoort, Netherlands": [52.16, 5.39],
  "Dublin, Ireland": [53.35, -6.26], "Cork, Ireland": [51.90, -8.47],
  "Basel, Switzerland": [47.56, 7.59], "Lausanne, Switzerland": [46.52, 6.63],
  "Zurich, Switzerland": [47.38, 8.54], "Neuhausen, Switzerland": [47.69, 8.62],
  // Europe — Central & Southern
  "Munich, Germany": [48.14, 11.58], "Wolfsburg, Germany": [52.42, 10.79],
  "Ludwigshafen, Germany": [49.48, 8.44], "Leverkusen, Germany": [51.03, 6.98],
  "Heidelberg, Germany": [49.40, 8.69], "Hanover, Germany": [52.37, 9.74],
  "Vicenza, Italy": [45.55, 11.55], "Setúbal, Portugal": [38.52, -8.89],
  "Zamudio, Spain": [43.29, -2.87],
  // Europe — UK
  "Port Talbot, UK": [51.59, -3.78], "York, UK": [53.96, -1.08],
  "Grangemouth, UK": [56.00, -3.72],
  // Americas — USA
  "Pittsburgh, USA": [40.44, -79.99], "Detroit, USA": [42.33, -83.05],
  "Freeport, USA": [28.95, -95.36], "Chandler, USA": [33.30, -111.84],
  "New Brunswick, USA": [40.49, -74.45], "LaGrange, USA": [33.04, -85.03],
  "Midland, USA": [43.62, -84.25], "Milwaukee, USA": [43.04, -87.91],
  "Golden, USA": [39.76, -105.22], "Tempe, USA": [33.43, -111.94],
  "Trevose, USA": [40.14, -75.00], "Baytown, USA": [29.74, -94.98],
  "Chicago, USA": [41.88, -87.63], "Wayzata, USA": [44.97, -93.51],
  "Chesterfield, USA": [38.66, -90.58],
  // Americas — Canada & Latin
  "Sorel-Tracy, Canada": [46.04, -73.11], "Sudbury, Canada": [46.49, -81.00],
  "Guelph, Canada": [43.55, -80.25], "Deschambault, Canada": [46.67, -71.92],
  "São Luís, Brazil": [-2.53, -44.28], "Paulínia, Brazil": [-22.76, -47.15],
  "São Paulo, Brazil": [-23.55, -46.63], "Guadalajara, Mexico": [20.67, -103.35],
  // Middle East & Africa
  "Jubail, Saudi Arabia": [27.01, 49.66], "Ras Tanura, Saudi Arabia": [26.68, 50.03],
  "Abu Dhabi, UAE": [24.45, 54.65], "Khouribga, Morocco": [32.88, -6.91],
  "Kolwezi, DRC": [-10.72, 25.47],
  // Russia
  "Norilsk, Russia": [69.35, 88.19], "Novorossiysk, Russia": [44.72, 37.77],
  "Novovoronezh, Russia": [51.31, 39.22],
  // Asia-Pacific
  "Bangkok, Thailand": [13.76, 100.50], "Singapore": [1.35, 103.82],
  "Gladstone, Australia": [-23.85, 151.27], "Sydney, Australia": [-33.87, 151.21],
  // --- Additional locations (v4 patch) ---
  "Aachen, Germany": [50.78, 6.08], "Anand, India": [22.56, 72.95],
  "Antofagasta, Chile": [-23.65, -70.40], "Bangalore, India": [12.97, 77.59],
  "Beawar, India": [26.10, 74.32], "Bhilai, India": [21.21, 81.43],
  "Brussels, Belgium": [50.85, 4.35], "Casablanca, Morocco": [33.57, -7.59],
  "Coimbatore, India": [11.01, 76.96], "Everett, USA": [47.98, -122.20],
  "Fremont, USA": [37.55, -121.99], "Greater Sudbury, Canada": [46.49, -81.00],
  "Gujarat, India": [22.26, 71.19], "Gurugram, India": [28.46, 77.03],
  "Hamburg, Germany": [53.55, 9.99], "Hanau, Germany": [50.13, 8.92],
  "Helsinki, Finland": [60.17, 24.94], "Hoboken, Belgium": [51.18, 4.36],
  "Houston, USA": [29.76, -95.37], "Hwaseong, South Korea": [37.20, 126.83],
  "Icheon, South Korea": [37.27, 127.44], "Jamnagar, India": [22.47, 70.07],
  "Kalamazoo, USA": [42.29, -85.59], "Karnataka, India": [15.32, 75.71],
  "Kochi, India": [9.93, 76.27], "Lagos, Nigeria": [6.52, 3.38],
  "Limpopo, South Africa": [-23.40, 29.42], "London, UK": [51.51, -0.13],
  "Louvain-la-Neuve, Belgium": [50.67, 4.61], "Malta, USA": [42.98, -73.76],
  "Marin-Epagnier, Switzerland": [47.00, 6.97], "Memphis, USA": [35.15, -90.05],
  "Miyagi, Japan": [38.27, 140.87], "Monfalcone, Italy": [45.81, 13.53],
  "Montreal, Canada": [45.50, -73.57], "Nantucket, USA": [41.28, -70.10],
  "New Taipei, Taiwan": [25.01, 121.47], "Ochang, South Korea": [36.72, 127.43],
  "Osaka, Japan": [34.69, 135.50], "Oslo, Norway": [59.91, 10.75],
  "Perrysburg, USA": [41.56, -83.63], "Phoenix, USA": [33.45, -112.07],
  "Rajasthan, India": [27.02, 74.22], "Regensburg, Germany": [49.01, 12.10],
  "Riyadh, Saudi Arabia": [24.71, 46.68], "Shenzhen, China": [22.54, 114.06],
  "St. Petersburg, USA": [27.77, -82.64], "São José dos Campos, Brazil": [-23.18, -45.88],
  "Tampa, USA": [27.95, -82.46], "Tokyo, Japan": [35.68, 139.69],
  "Ulsan, South Korea": [35.54, 129.31], "Visakhapatnam, India": [17.69, 83.22],
  "Wuhu, China": [31.35, 118.38],
};

// ---------------------------------------------------------------------------
//  INDUSTRIES — 30 total
// ---------------------------------------------------------------------------

const INDUSTRIES = [
  // 1
  {
    name: "Textile Manufacturing",
    carbon_ratings: ["B", "C", "D"],
    companies: [
      { name: "TexWeave Industries", location: "Surat, India" },
      { name: "Nordic Fabrics AB", location: "Borås, Sweden" },
      { name: "Cottonova Mills", location: "Dhaka, Bangladesh" },
      { name: "Zhejiang Textile Group", location: "Hangzhou, China" },
      { name: "Arvind Limited", location: "Ahmedabad, India" },
    ],
    wastes: [
      { name: "Chemical Dye Runoff", toxicity_level: "high", base_element: "Chromium", category: CAT.CHM },
      { name: "Lint Fiber Residue", toxicity_level: "low", base_element: "Cellulose", category: CAT.TXF },
      { name: "Textile Sizing Waste", toxicity_level: "medium", base_element: "Polyvinyl Alcohol", category: CAT.TXF },
      { name: "Dyehouse Effluent Sludge", toxicity_level: "high", base_element: "Azo Compounds", category: CAT.CHM },
    ],
  },
  // 2
  {
    name: "Steel Production",
    carbon_ratings: ["C", "D"],
    companies: [
      { name: "ArcelorMittal Flat Carbon", location: "Ghent, Belgium" },
      { name: "Tata Steel Europe", location: "Port Talbot, UK" },
      { name: "Baosteel Group", location: "Shanghai, China" },
      { name: "POSCO Gwangyang", location: "Gwangyang, South Korea" },
      { name: "Nippon Steel Kimitsu", location: "Chiba, Japan" },
      { name: "JSW Steel Vijayanagar", location: "Karnataka, India" },
      { name: "SAIL Bhilai", location: "Bhilai, India" },
    ],
    wastes: [
      { name: "Blast Furnace Slag", toxicity_level: "medium", base_element: "Calcium Silicate", category: CAT.MET },
      { name: "Mill Scale", toxicity_level: "low", base_element: "Iron Oxide", category: CAT.MET },
      { name: "Steelmaking Dust", toxicity_level: "high", base_element: "Zinc Oxide", category: CAT.MET },
      { name: "Basic Oxygen Furnace Slag", toxicity_level: "medium", base_element: "Calcium Ferrite", category: CAT.MET },
    ],
  },
  // 3
  {
    name: "Cement Manufacturing",
    carbon_ratings: ["C", "D"],
    companies: [
      { name: "LafargeHolcim", location: "Zurich, Switzerland" },
      { name: "UltraTech Cement", location: "Mumbai, India" },
      { name: "HeidelbergCement", location: "Heidelberg, Germany" },
      { name: "Shree Cement", location: "Beawar, India" },
      { name: "Anhui Conch Cement", location: "Wuhu, China" },
      { name: "Dangote Cement", location: "Lagos, Nigeria" },
    ],
    wastes: [
      { name: "Cement Kiln Dust", toxicity_level: "medium", base_element: "Calcium Oxide", category: CAT.MIN },
      { name: "Clinker Bypass Dust", toxicity_level: "medium", base_element: "Alkali Chlorides", category: CAT.MIN },
    ],
  },
  // 4
  {
    name: "Electronics Manufacturing",
    carbon_ratings: ["B", "C"],
    companies: [
      { name: "Foxconn Precision", location: "Shenzhen, China" },
      { name: "Jabil Circuit", location: "St. Petersburg, USA" },
      { name: "Flextronics International", location: "Singapore" },
      { name: "Pegatron Corporation", location: "Taipei, Taiwan" },
      { name: "Samsung SDI", location: "Suwon, South Korea" },
      { name: "Wistron Corporation", location: "New Taipei, Taiwan" },
    ],
    wastes: [
      { name: "Printed Circuit Board Scrap", toxicity_level: "high", base_element: "Copper", category: CAT.EWS },
      { name: "Solder Dross", toxicity_level: "high", base_element: "Tin-Lead Alloy", category: CAT.EWS },
      { name: "LCD Panel Glass Waste", toxicity_level: "medium", base_element: "Indium", category: CAT.EWS },
      { name: "Electronic Component Rejects", toxicity_level: "medium", base_element: "Mixed Metals", category: CAT.EWS },
    ],
  },
  // 5
  {
    name: "Battery Manufacturing",
    carbon_ratings: ["B", "C", "D"],
    companies: [
      { name: "CATL Energy", location: "Ningde, China" },
      { name: "Northvolt AB", location: "Skellefteå, Sweden" },
      { name: "LG Energy Solution", location: "Ochang, South Korea" },
      { name: "Panasonic Energy", location: "Osaka, Japan" },
      { name: "BYD Battery", location: "Shenzhen, China" },
    ],
    wastes: [
      { name: "Electrolyte Sludge", toxicity_level: "high", base_element: "Lithium Carbonate", category: CAT.NRG },
      { name: "Cathode Black Mass", toxicity_level: "high", base_element: "Cobalt-Nickel Mix", category: CAT.NRG },
      { name: "Separator Film Scrap", toxicity_level: "low", base_element: "Polyethylene", category: CAT.PLY },
      { name: "Anode Graphite Dust", toxicity_level: "medium", base_element: "Graphite", category: CAT.NRG },
    ],
  },
  // 6
  {
    name: "Chemical Processing",
    carbon_ratings: ["C", "D"],
    companies: [
      { name: "BASF SE", location: "Ludwigshafen, Germany" },
      { name: "Dow Chemical", location: "Midland, USA" },
      { name: "Reliance Chemicals", location: "Jamnagar, India" },
      { name: "Mitsubishi Chemical", location: "Tokyo, Japan" },
      { name: "Sinopec Shanghai", location: "Shanghai, China" },
      { name: "Solvay Brussels", location: "Brussels, Belgium" },
    ],
    wastes: [
      { name: "Sulfuric Acid Waste", toxicity_level: "high", base_element: "Sulfur", category: CAT.CHM },
      { name: "Chlor-Alkali Brine Sludge", toxicity_level: "high", base_element: "Sodium Chloride", category: CAT.CHM },
      { name: "Phosphogypsum", toxicity_level: "medium", base_element: "Calcium Sulfate", category: CAT.CHM },
      { name: "Spent Catalyst Fines", toxicity_level: "high", base_element: "Vanadium Pentoxide", category: CAT.CHM },
    ],
  },
  // 7
  {
    name: "Automotive Manufacturing",
    carbon_ratings: ["B", "C"],
    companies: [
      { name: "BMW Group Regensburg", location: "Regensburg, Germany" },
      { name: "Toyota Motor East Japan", location: "Miyagi, Japan" },
      { name: "Tata Motors Pune", location: "Pune, India" },
      { name: "Volkswagen Wolfsburg", location: "Wolfsburg, Germany" },
      { name: "Hyundai Motor Ulsan", location: "Ulsan, South Korea" },
      { name: "Tesla Fremont", location: "Fremont, USA" },
    ],
    wastes: [
      { name: "Paint Sludge", toxicity_level: "high", base_element: "Titanium Dioxide", category: CAT.CHM },
      { name: "Stamping Metal Scrap", toxicity_level: "low", base_element: "Aluminum", category: CAT.MET },
      { name: "Used Cutting Fluid", toxicity_level: "medium", base_element: "Mineral Oil", category: CAT.CHM },
      { name: "Rubber Vulcanization Waste", toxicity_level: "medium", base_element: "Sulfur Compounds", category: CAT.PLY },
    ],
  },
  // 8
  {
    name: "Pharmaceutical Manufacturing",
    carbon_ratings: ["A", "B"],
    companies: [
      { name: "Novartis Basel", location: "Basel, Switzerland" },
      { name: "Dr. Reddys Laboratories", location: "Hyderabad, India" },
      { name: "Pfizer Global Supply", location: "Kalamazoo, USA" },
      { name: "Sun Pharmaceutical", location: "Mumbai, India" },
      { name: "Roche Pharma Basel", location: "Basel, Switzerland" },
    ],
    wastes: [
      { name: "Spent Solvent Mix", toxicity_level: "high", base_element: "Ethanol-Methanol", category: CAT.CHM },
      { name: "API Crystallization Residue", toxicity_level: "medium", base_element: "Organic Salts", category: CAT.ORG },
      { name: "Pharma Packaging Rejects", toxicity_level: "low", base_element: "PVC-Aluminum Foil", category: CAT.PLY },
      { name: "Bioreactor Cleaning Waste", toxicity_level: "medium", base_element: "Cell Culture Media", category: CAT.ORG },
    ],
  },
  // 9
  {
    name: "Mining & Metallurgy",
    carbon_ratings: ["D"],
    companies: [
      { name: "Rio Tinto Aluminium", location: "Montreal, Canada" },
      { name: "Vale Nickel Operations", location: "Sudbury, Canada" },
      { name: "Vedanta Zinc International", location: "Rajasthan, India" },
      { name: "BHP Group Escondida", location: "Antofagasta, Chile" },
      { name: "Glencore Sudbury", location: "Greater Sudbury, Canada" },
      { name: "Freeport McMoRan", location: "Phoenix, USA" },
      { name: "Anglo American Kumba", location: "Limpopo, South Africa" },
    ],
    wastes: [
      { name: "Red Mud (Bauxite Residue)", toxicity_level: "high", base_element: "Iron Oxide", category: CAT.MIN },
      { name: "Tailings Slurry", toxicity_level: "medium", base_element: "Silica", category: CAT.MIN },
      { name: "Slag from Smelting", toxicity_level: "medium", base_element: "Calcium Ferrite", category: CAT.MET },
      { name: "Acid Mine Drainage Precipitate", toxicity_level: "high", base_element: "Iron Hydroxide", category: CAT.CHM },
    ],
  },
  // 10
  {
    name: "Food & Beverage Processing",
    carbon_ratings: ["A", "B"],
    companies: [
      { name: "Nestlé Nantucket", location: "Nantucket, USA" },
      { name: "Olam Agri", location: "Lagos, Nigeria" },
      { name: "Unilever Rotterdam", location: "Rotterdam, Netherlands" },
      { name: "Amul Dairy", location: "Anand, India" },
      { name: "Danone Paris", location: "Paris, France" },
    ],
    wastes: [
      { name: "Brewers Spent Grain", toxicity_level: "low", base_element: "Cellulose-Protein", category: CAT.ORG },
      { name: "Citrus Peel Extract Residue", toxicity_level: "low", base_element: "Limonene", category: CAT.ORG },
      { name: "Whey Permeate Concentrate", toxicity_level: "low", base_element: "Lactose", category: CAT.ORG },
      { name: "Olive Mill Wastewater Solids", toxicity_level: "low", base_element: "Polyphenols", category: CAT.ORG },
      { name: "Coconut Shell Char", toxicity_level: "low", base_element: "Activated Carbon", category: CAT.ORG },
    ],
  },
  // 11
  {
    name: "Fertilizer Production",
    carbon_ratings: ["C", "D"],
    companies: [
      { name: "Yara International", location: "Oslo, Norway" },
      { name: "Coromandel International", location: "Visakhapatnam, India" },
      { name: "The Mosaic Company", location: "Tampa, USA" },
      { name: "IFFCO Kalol", location: "Gujarat, India" },
      { name: "OCP Group", location: "Casablanca, Morocco" },
    ],
    wastes: [
      { name: "Ammonia Scrubber Waste", toxicity_level: "high", base_element: "Ammonium Sulfate", category: CAT.CHM },
      { name: "Urea Prilling Dust", toxicity_level: "medium", base_element: "Urea Fines", category: CAT.CHM },
    ],
  },
  // 12
  {
    name: "Precious Metal Refining",
    carbon_ratings: ["B", "C"],
    companies: [
      { name: "Umicore Precious Metals", location: "Hoboken, Belgium" },
      { name: "Tanaka Holdings", location: "Tokyo, Japan" },
      { name: "Johnson Matthey", location: "London, UK" },
      { name: "Heraeus Hanau", location: "Hanau, Germany" },
      { name: "Metalor Technologies", location: "Marin-Epagnier, Switzerland" },
    ],
    wastes: [
      { name: "Refinery Anode Slime", toxicity_level: "high", base_element: "Selenium-Tellurium", category: CAT.MET },
      { name: "PGM Recovery Residue", toxicity_level: "high", base_element: "Platinum Group Metals", category: CAT.MET },
    ],
  },
  // 13
  {
    name: "Pulp & Paper Manufacturing",
    carbon_ratings: ["B", "C"],
    companies: [
      { name: "International Paper", location: "Memphis, USA" },
      { name: "UPM-Kymmene", location: "Helsinki, Finland" },
      { name: "ITC Paperboards", location: "Coimbatore, India" },
      { name: "Suzano Papel", location: "São Paulo, Brazil" },
    ],
    wastes: [
      { name: "Black Liquor Residue", toxicity_level: "medium", base_element: "Lignin", category: CAT.ORG },
      { name: "Paper Mill Sludge", toxicity_level: "low", base_element: "Calcium Carbonate", category: CAT.MIN },
      { name: "Deinking Residue", toxicity_level: "medium", base_element: "Clay-Ink Filler", category: CAT.TXF },
    ],
  },
  // 14
  {
    name: "Glass Manufacturing",
    carbon_ratings: ["B", "C"],
    companies: [
      { name: "Saint-Gobain Sekurit", location: "Aachen, Germany" },
      { name: "Owens-Illinois", location: "Perrysburg, USA" },
      { name: "AGC Glass Europe", location: "Louvain-la-Neuve, Belgium" },
      { name: "Asahi India Glass", location: "Gurugram, India" },
      { name: "Nippon Sheet Glass", location: "Tokyo, Japan" },
    ],
    wastes: [
      { name: "Cullet Dust", toxicity_level: "low", base_element: "Soda-Lime Silica", category: CAT.MIN },
      { name: "Glass Furnace Refractory Waste", toxicity_level: "medium", base_element: "Alumina-Zirconia", category: CAT.MIN },
      { name: "Batch Reject Powder", toxicity_level: "low", base_element: "Feldspar", category: CAT.MIN },
    ],
  },
  // 15
  {
    name: "Plastic & Polymer Manufacturing",
    carbon_ratings: ["C", "D"],
    companies: [
      { name: "SABIC Polymers", location: "Riyadh, Saudi Arabia" },
      { name: "LyondellBasell", location: "Houston, USA" },
      { name: "Indorama Ventures", location: "Bangkok, Thailand" },
      { name: "Reliance Polymers", location: "Jamnagar, India" },
    ],
    wastes: [
      { name: "Polymer Trim Waste", toxicity_level: "low", base_element: "Polyethylene", category: CAT.PLY },
      { name: "Off-Spec Pellet Rejects", toxicity_level: "low", base_element: "Polypropylene", category: CAT.PLY },
      { name: "Catalyst Residue from Cracking", toxicity_level: "high", base_element: "Chromium Oxide", category: CAT.CHM },
    ],
  },
  // 16
  {
    name: "Shipbuilding & Marine",
    carbon_ratings: ["C", "D"],
    companies: [
      { name: "Hyundai Heavy Industries", location: "Ulsan, South Korea" },
      { name: "Fincantieri Monfalcone", location: "Monfalcone, Italy" },
      { name: "Cochin Shipyard", location: "Kochi, India" },
    ],
    wastes: [
      { name: "Grit Blasting Waste", toxicity_level: "medium", base_element: "Copper Slag", category: CAT.MET },
      { name: "Marine Anti-Fouling Paint Residue", toxicity_level: "high", base_element: "Tributyltin", category: CAT.CHM },
      { name: "Welding Slag", toxicity_level: "low", base_element: "Manganese Silicate", category: CAT.MET },
      { name: "Ballast Water Sediment", toxicity_level: "medium", base_element: "Marine Silt", category: CAT.MIN },
    ],
  },
  // 17
  {
    name: "Aerospace Manufacturing",
    carbon_ratings: ["A", "B"],
    companies: [
      { name: "Airbus Hamburg", location: "Hamburg, Germany" },
      { name: "Boeing Everett", location: "Everett, USA" },
      { name: "HAL Bangalore", location: "Bangalore, India" },
      { name: "Embraer São José", location: "São José dos Campos, Brazil" },
    ],
    wastes: [
      { name: "Carbon Fiber Offcuts", toxicity_level: "low", base_element: "Carbon Fiber", category: CAT.PLY },
      { name: "Titanium Machining Chips", toxicity_level: "low", base_element: "Titanium Alloy", category: CAT.MET },
      { name: "Aerospace Sealant Waste", toxicity_level: "medium", base_element: "Polysulfide", category: CAT.CHM },
    ],
  },
  // 18
  {
    name: "Semiconductor Fabrication",
    carbon_ratings: ["A", "B"],
    companies: [
      { name: "TSMC Hsinchu", location: "Hsinchu, Taiwan" },
      { name: "Samsung Foundry", location: "Hwaseong, South Korea" },
      { name: "GlobalFoundries", location: "Malta, USA" },
      { name: "Intel Fab 42", location: "Chandler, USA" },
      { name: "SK Hynix Icheon", location: "Icheon, South Korea" },
    ],
    wastes: [
      { name: "Silicon Wafer Slurry", toxicity_level: "medium", base_element: "Silicon Carbide", category: CAT.EWS },
      { name: "CMP Waste Slurry", toxicity_level: "medium", base_element: "Cerium Oxide", category: CAT.EWS },
      { name: "Photoresist Sludge", toxicity_level: "high", base_element: "Organic Polymers", category: CAT.EWS },
    ],
  },
  // 19
  {
    name: "Solar Panel Manufacturing",
    carbon_ratings: ["A", "B"],
    companies: [
      { name: "First Solar", location: "Tempe, USA" },
      { name: "JinkoSolar", location: "Shangrao, China" },
      { name: "Adani Solar", location: "Mundra, India" },
      { name: "Canadian Solar", location: "Guelph, Canada" },
    ],
    wastes: [
      { name: "Silicon Kerf Loss", toxicity_level: "low", base_element: "Polysilicon", category: CAT.NRG },
      { name: "Cadmium Telluride Dust", toxicity_level: "high", base_element: "Cadmium Telluride", category: CAT.NRG },
      { name: "Encapsulant Trim Waste", toxicity_level: "low", base_element: "EVA Polymer", category: CAT.PLY },
    ],
  },
  // 20
  {
    name: "Water Treatment & Utilities",
    carbon_ratings: ["A", "B"],
    companies: [
      { name: "Veolia Environment", location: "Paris, France" },
      { name: "Suez Water Technologies", location: "Trevose, USA" },
      { name: "Tata Water Solutions", location: "Mumbai, India" },
    ],
    wastes: [
      { name: "Water Treatment Sludge", toxicity_level: "medium", base_element: "Aluminum Hydroxide", category: CAT.MIN },
      { name: "Spent Activated Carbon", toxicity_level: "medium", base_element: "Activated Carbon", category: CAT.MIN },
      { name: "Ion Exchange Resin Waste", toxicity_level: "medium", base_element: "Polystyrene Resin", category: CAT.PLY },
      { name: "Membrane Concentrate Brine", toxicity_level: "medium", base_element: "Dissolved Salts", category: CAT.CHM },
    ],
  },

  // ====== NEW INDUSTRIES (21–30) ==========================================

  // 21
  {
    name: "Wind Turbine Manufacturing",
    carbon_ratings: ["A", "B"],
    companies: [
      { name: "Vestas Wind Systems", location: "Aarhus, Denmark" },
      { name: "Siemens Gamesa", location: "Zamudio, Spain" },
      { name: "Goldwind Science", location: "Urumqi, China" },
      { name: "Suzlon Energy", location: "Pune, India" },
    ],
    wastes: [
      { name: "Fiberglass Blade Scrap", toxicity_level: "low", base_element: "Glass Fiber Composite", category: CAT.PLY },
      { name: "Rare Earth Magnet Waste", toxicity_level: "medium", base_element: "Neodymium-Iron-Boron", category: CAT.MET },
      { name: "Turbine Gearbox Oil Sludge", toxicity_level: "medium", base_element: "Synthetic Lubricant", category: CAT.CHM },
    ],
  },
  // 22
  {
    name: "Oil & Gas Refining",
    carbon_ratings: ["C", "D"],
    companies: [
      { name: "Shell Pernis Refinery", location: "Rotterdam, Netherlands" },
      { name: "ExxonMobil Baytown", location: "Baytown, USA" },
      { name: "Indian Oil Mathura", location: "Mathura, India" },
      { name: "Petrobras Paulinia", location: "Paulínia, Brazil" },
      { name: "Saudi Aramco Ras Tanura", location: "Ras Tanura, Saudi Arabia" },
    ],
    wastes: [
      { name: "FCC Catalyst Waste", toxicity_level: "high", base_element: "Zeolite-Vanadium", category: CAT.NRG },
      { name: "Petroleum Coke Fines", toxicity_level: "medium", base_element: "Carbon", category: CAT.NRG },
      { name: "Tank Bottom Sludge", toxicity_level: "high", base_element: "Heavy Hydrocarbons", category: CAT.NRG },
      { name: "Sulfur Recovery Tailgas Residue", toxicity_level: "high", base_element: "Elemental Sulfur", category: CAT.CHM },
    ],
  },
  // 23
  {
    name: "Leather & Tanning",
    carbon_ratings: ["C", "D"],
    companies: [
      { name: "Gruppo Mastrotto", location: "Vicenza, Italy" },
      { name: "Rahman Group Tanneries", location: "Dhaka, Bangladesh" },
      { name: "Chennai Leather Cluster", location: "Chennai, India" },
      { name: "Horween Leather Company", location: "Chicago, USA" },
    ],
    wastes: [
      { name: "Chrome Tanning Sludge", toxicity_level: "high", base_element: "Chromium III", category: CAT.CHM },
      { name: "Leather Shavings", toxicity_level: "low", base_element: "Collagen Fiber", category: CAT.TXF },
      { name: "Tannery Effluent Solids", toxicity_level: "high", base_element: "Organic-Metal Complex", category: CAT.CHM },
    ],
  },
  // 24
  {
    name: "Rubber & Tire Manufacturing",
    carbon_ratings: ["C", "D"],
    companies: [
      { name: "Bridgestone Kurume", location: "Kurume, Japan" },
      { name: "Michelin Clermont-Ferrand", location: "Clermont-Ferrand, France" },
      { name: "Apollo Tyres", location: "Gurgaon, India" },
      { name: "Continental AG Hanover", location: "Hanover, Germany" },
    ],
    wastes: [
      { name: "Tire Buffing Dust", toxicity_level: "medium", base_element: "Carbon Black", category: CAT.PLY },
      { name: "Vulcanization Fumes Residue", toxicity_level: "high", base_element: "Zinc Stearate", category: CAT.CHM },
      { name: "Rubber Crumb Rejects", toxicity_level: "low", base_element: "Styrene-Butadiene", category: CAT.PLY },
    ],
  },
  // 25
  {
    name: "Aluminum Smelting",
    carbon_ratings: ["C", "D"],
    companies: [
      { name: "Alcoa Deschambault", location: "Deschambault, Canada" },
      { name: "Norsk Hydro Karmøy", location: "Karmøy, Norway" },
      { name: "Hindalco Hirakud", location: "Hirakud, India" },
      { name: "Emirates Global Aluminium", location: "Abu Dhabi, UAE" },
    ],
    wastes: [
      { name: "Spent Pot Lining", toxicity_level: "high", base_element: "Cyanide-Carbon", category: CAT.MET },
      { name: "Aluminum Dross", toxicity_level: "medium", base_element: "Aluminum Oxide", category: CAT.MET },
      { name: "Anode Butt Carbon", toxicity_level: "low", base_element: "Petroleum Coke", category: CAT.MET },
    ],
  },
  // 26
  {
    name: "Nuclear Energy",
    carbon_ratings: ["A", "B"],
    companies: [
      { name: "EDF Gravelines", location: "Gravelines, France" },
      { name: "Rosatom Novovoronezh", location: "Novovoronezh, Russia" },
      { name: "NPCIL Kudankulam", location: "Kudankulam, India" },
    ],
    wastes: [
      { name: "Low-Level Radioactive Waste", toxicity_level: "high", base_element: "Mixed Radionuclides", category: CAT.NRG },
      { name: "Nuclear Ion Exchange Resins", toxicity_level: "high", base_element: "Contaminated Resin", category: CAT.NRG },
      { name: "Decontamination Sludge", toxicity_level: "high", base_element: "EDTA Complexes", category: CAT.CHM },
    ],
  },
  // 27
  {
    name: "Construction Materials",
    carbon_ratings: ["B", "C"],
    companies: [
      { name: "CRH Group", location: "Dublin, Ireland" },
      { name: "Boral Limited", location: "Sydney, Australia" },
      { name: "Dalmia Bharat", location: "New Delhi, India" },
      { name: "Siam Cement Group", location: "Bangkok, Thailand" },
    ],
    wastes: [
      { name: "Concrete Wash Water Solids", toxicity_level: "low", base_element: "Calcium Hydroxide", category: CAT.MIN },
      { name: "Asphalt Milling Reclaim", toxicity_level: "low", base_element: "Bitumen Aggregate", category: CAT.MIN },
      { name: "Mineral Wool Offcuts", toxicity_level: "low", base_element: "Basalt Fiber", category: CAT.MIN },
    ],
  },
  // 28
  {
    name: "Packaging & Printing",
    carbon_ratings: ["B", "C"],
    companies: [
      { name: "Amcor Flexibles", location: "Zurich, Switzerland" },
      { name: "Tetra Pak Lund", location: "Lund, Sweden" },
      { name: "Huhtamaki Oyj", location: "Espoo, Finland" },
      { name: "SIG Group", location: "Neuhausen, Switzerland" },
    ],
    wastes: [
      { name: "Ink Wash Solvents", toxicity_level: "high", base_element: "Toluene-Xylene", category: CAT.CHM },
      { name: "Laminate Trim Waste", toxicity_level: "low", base_element: "PE-Aluminum-Paper", category: CAT.PLY },
      { name: "Corrugated Board Rejects", toxicity_level: "low", base_element: "Recycled Fiber", category: CAT.TXF },
    ],
  },
  // 29
  {
    name: "Agricultural Processing",
    carbon_ratings: ["A", "B"],
    companies: [
      { name: "Cargill Incorporated", location: "Wayzata, USA" },
      { name: "Bunge Limited", location: "Chesterfield, USA" },
      { name: "Wilmar International", location: "Singapore" },
      { name: "ITC Agri Business", location: "Secunderabad, India" },
    ],
    wastes: [
      { name: "Rice Husk Ash", toxicity_level: "low", base_element: "Amorphous Silica", category: CAT.ORG },
      { name: "Sugarcane Bagasse Fiber", toxicity_level: "low", base_element: "Cellulose-Hemicellulose", category: CAT.ORG },
      { name: "Palm Oil Mill Effluent Solids", toxicity_level: "medium", base_element: "Organic Fatty Acids", category: CAT.ORG },
    ],
  },
  // 30
  {
    name: "Petrochemical Manufacturing",
    carbon_ratings: ["C", "D"],
    companies: [
      { name: "INEOS Grangemouth", location: "Grangemouth, UK" },
      { name: "Formosa Plastics", location: "Taipei, Taiwan" },
      { name: "Braskem SA", location: "São Paulo, Brazil" },
      { name: "Lotte Chemical", location: "Seoul, South Korea" },
    ],
    wastes: [
      { name: "Ethylene Cracker Tar", toxicity_level: "high", base_element: "Polycyclic Aromatics", category: CAT.NRG },
      { name: "Polymerization Catalyst Residue", toxicity_level: "high", base_element: "Titanium Chloride", category: CAT.CHM },
      { name: "Naphtha Reformer Coke", toxicity_level: "medium", base_element: "Amorphous Carbon", category: CAT.NRG },
    ],
  },
];

// ---------------------------------------------------------------------------
//  DESCRIPTION GENERATOR — rich text for vector embedding
// ---------------------------------------------------------------------------

const TOX_DESC = {
  low: "relatively low-hazard and safe to handle with standard precautions",
  medium: "moderately hazardous, requiring safety protocols and proper ventilation",
  high: "highly hazardous, demanding specialized containment, PPE, and regulatory compliance",
};

const CAT_CONTEXT = {
  [CAT.MET]: "a metallic residue valuable for smelting, alloying, or recovery of base and precious metals through pyrometallurgical or hydrometallurgical processes",
  [CAT.CHM]: "a chemical compound that can be neutralized, treated, or repurposed in industrial chemical synthesis and solvent recovery",
  [CAT.ORG]: "an organic material suitable for composting, anaerobic digestion, biogas generation, fermentation, or biochemical extraction",
  [CAT.EWS]: "an electronic waste component containing recoverable precious metals, semiconductor materials, and rare earth elements",
  [CAT.PLY]: "a polymer-based material amenable to mechanical recycling, chemical depolymerization, pyrolysis, or use as refuse-derived fuel",
  [CAT.MIN]: "a mineral byproduct usable as aggregate, supplementary cementitious material, geopolymer precursor, or construction fill",
  [CAT.NRG]: "an energy-sector byproduct with potential for heat recovery, fuel blending, carbon capture feedstock, or elemental reclamation",
  [CAT.TXF]: "a fiber-based waste suitable for mechanical fiber recovery, thermal insulation manufacture, non-woven textile production, or cellulose extraction",
};

function generateWasteDescription(waste, industryName) {
  return (
    `${waste.name}: An industrial waste stream generated during ${industryName.toLowerCase()} operations. ` +
    `Primarily composed of ${waste.base_element}, this material is ${TOX_DESC[waste.toxicity_level]}. ` +
    `Classified under ${waste.category}, it is ${CAT_CONTEXT[waste.category] || "a general industrial byproduct"}. ` +
    `Relevant to circular economy supply chains, industrial symbiosis, zero-waste manufacturing, and waste-to-value conversion programs.`
  );
}

// ---------------------------------------------------------------------------
//  UPCYCLE_MAP
// ---------------------------------------------------------------------------

const UPCYCLE_MAP = {
  "Cement Manufacturing": [
    "Blast Furnace Slag", "Red Mud (Bauxite Residue)", "Phosphogypsum",
    "Cement Kiln Dust", "Slag from Smelting", "Basic Oxygen Furnace Slag",
    "Water Treatment Sludge", "Paper Mill Sludge", "Grit Blasting Waste",
    "Rubber Vulcanization Waste", "Rice Husk Ash", "Concrete Wash Water Solids",
    "Aluminum Dross", "Fiberglass Blade Scrap",
  ],
  "Battery Manufacturing": [
    "Chemical Dye Runoff", "Printed Circuit Board Scrap", "Solder Dross",
    "Refinery Anode Slime", "Cathode Black Mass", "PGM Recovery Residue",
    "Silicon Wafer Slurry", "Anode Graphite Dust", "Rare Earth Magnet Waste",
  ],
  "Fertilizer Production": [
    "Phosphogypsum", "Brewers Spent Grain", "Citrus Peel Extract Residue",
    "API Crystallization Residue", "Chlor-Alkali Brine Sludge",
    "Whey Permeate Concentrate", "Olive Mill Wastewater Solids",
    "Paper Mill Sludge", "Black Liquor Residue", "Sugarcane Bagasse Fiber",
    "Palm Oil Mill Effluent Solids", "Urea Prilling Dust",
  ],
  "Chemical Processing": [
    "Electrolyte Sludge", "Spent Solvent Mix", "Used Cutting Fluid",
    "Sulfuric Acid Waste", "Ammonia Scrubber Waste", "Spent Catalyst Fines",
    "Photoresist Sludge", "Aerospace Sealant Waste", "Acid Mine Drainage Precipitate",
    "Ink Wash Solvents", "Turbine Gearbox Oil Sludge", "Vulcanization Fumes Residue",
    "Chrome Tanning Sludge", "Tannery Effluent Solids",
    "Sulfur Recovery Tailgas Residue", "Decontamination Sludge",
    "Membrane Concentrate Brine",
  ],
  "Steel Production": [
    "Mill Scale", "Stamping Metal Scrap", "Cathode Black Mass",
    "Titanium Machining Chips", "Welding Slag", "Basic Oxygen Furnace Slag",
    "Carbon Fiber Offcuts", "Aluminum Dross", "Anode Butt Carbon",
    "Spent Pot Lining", "Rare Earth Magnet Waste",
  ],
  "Automotive Manufacturing": [
    "Blast Furnace Slag", "LCD Panel Glass Waste", "Lint Fiber Residue",
    "Carbon Fiber Offcuts", "Polymer Trim Waste", "Cullet Dust",
    "Rubber Crumb Rejects", "Tire Buffing Dust", "Fiberglass Blade Scrap",
  ],
  "Electronics Manufacturing": [
    "Tailings Slurry", "Steelmaking Dust", "Refinery Anode Slime",
    "Silicon Kerf Loss", "CMP Waste Slurry", "Cadmium Telluride Dust",
    "Rare Earth Magnet Waste", "Electronic Component Rejects",
  ],
  "Precious Metal Refining": [
    "Printed Circuit Board Scrap", "Solder Dross", "Cathode Black Mass",
    "Electrolyte Sludge", "PGM Recovery Residue", "Electronic Component Rejects",
    "FCC Catalyst Waste", "Spent Catalyst Fines",
  ],
  "Pharmaceutical Manufacturing": [
    "Citrus Peel Extract Residue", "Brewers Spent Grain",
    "Spent Activated Carbon", "Ion Exchange Resin Waste",
    "Bioreactor Cleaning Waste", "Coconut Shell Char",
  ],
  "Food & Beverage Processing": [
    "Lint Fiber Residue", "Paper Mill Sludge", "Whey Permeate Concentrate",
    "Olive Mill Wastewater Solids", "Sugarcane Bagasse Fiber",
    "Coconut Shell Char", "Rice Husk Ash", "Corrugated Board Rejects",
  ],
  "Textile Manufacturing": [
    "Citrus Peel Extract Residue", "Paint Sludge", "Polymer Trim Waste",
    "Off-Spec Pellet Rejects", "Leather Shavings", "Deinking Residue",
  ],
  "Mining & Metallurgy": [
    "Cement Kiln Dust", "Steelmaking Dust", "Slag from Smelting",
    "Acid Mine Drainage Precipitate", "Grit Blasting Waste", "Welding Slag",
    "Spent Pot Lining", "Aluminum Dross", "Asphalt Milling Reclaim",
  ],
  "Pulp & Paper Manufacturing": [
    "Lint Fiber Residue", "Textile Sizing Waste", "Brewers Spent Grain",
    "Deinking Residue", "Olive Mill Wastewater Solids",
    "Sugarcane Bagasse Fiber", "Corrugated Board Rejects", "Leather Shavings",
  ],
  "Glass Manufacturing": [
    "Cullet Dust", "LCD Panel Glass Waste", "Silicon Kerf Loss",
    "Batch Reject Powder", "Glass Furnace Refractory Waste",
    "Fiberglass Blade Scrap",
  ],
  "Plastic & Polymer Manufacturing": [
    "Polymer Trim Waste", "Off-Spec Pellet Rejects", "Separator Film Scrap",
    "Encapsulant Trim Waste", "Pharma Packaging Rejects",
    "Rubber Vulcanization Waste", "Rubber Crumb Rejects",
    "Laminate Trim Waste", "Tire Buffing Dust",
  ],
  "Shipbuilding & Marine": [
    "Stamping Metal Scrap", "Blast Furnace Slag", "Welding Slag",
    "Paint Sludge", "Grit Blasting Waste",
  ],
  "Aerospace Manufacturing": [
    "Carbon Fiber Offcuts", "Titanium Machining Chips", "Stamping Metal Scrap",
    "Polymer Trim Waste", "Fiberglass Blade Scrap",
  ],
  "Semiconductor Fabrication": [
    "Silicon Kerf Loss", "Silicon Wafer Slurry", "CMP Waste Slurry",
    "Cadmium Telluride Dust", "Electronic Component Rejects",
    "Rare Earth Magnet Waste",
  ],
  "Solar Panel Manufacturing": [
    "Silicon Kerf Loss", "Silicon Wafer Slurry", "Encapsulant Trim Waste",
    "Cullet Dust", "Cadmium Telluride Dust",
  ],
  "Water Treatment & Utilities": [
    "Spent Activated Carbon", "Ion Exchange Resin Waste", "Water Treatment Sludge",
    "Acid Mine Drainage Precipitate", "Ammonia Scrubber Waste",
    "Urea Prilling Dust", "Membrane Concentrate Brine",
    "Tannery Effluent Solids", "Dyehouse Effluent Sludge",
  ],
  "Wind Turbine Manufacturing": [
    "Carbon Fiber Offcuts", "Fiberglass Blade Scrap",
    "Rare Earth Magnet Waste", "Polymer Trim Waste",
  ],
  "Oil & Gas Refining": [
    "FCC Catalyst Waste", "Petroleum Coke Fines", "Tank Bottom Sludge",
    "Sulfur Recovery Tailgas Residue", "Spent Catalyst Fines",
    "Ethylene Cracker Tar", "Naphtha Reformer Coke",
  ],
  "Leather & Tanning": [
    "Leather Shavings", "Lime Sludge" /* not in dataset — will be skipped */,
    "Coconut Shell Char", "Dyehouse Effluent Sludge",
  ],
  "Rubber & Tire Manufacturing": [
    "Tire Buffing Dust", "Rubber Crumb Rejects", "Carbon Fiber Offcuts",
    "Petroleum Coke Fines", "Anode Butt Carbon",
  ],
  "Aluminum Smelting": [
    "Spent Pot Lining", "Aluminum Dross", "Anode Butt Carbon",
    "Red Mud (Bauxite Residue)", "Blast Furnace Slag",
  ],
  "Nuclear Energy": [
    "Low-Level Radioactive Waste", "Nuclear Ion Exchange Resins",
    "Spent Activated Carbon", "Ion Exchange Resin Waste",
  ],
  "Construction Materials": [
    "Concrete Wash Water Solids", "Asphalt Milling Reclaim",
    "Mineral Wool Offcuts", "Blast Furnace Slag", "Rice Husk Ash",
    "Fiberglass Blade Scrap", "Rubber Crumb Rejects",
  ],
  "Packaging & Printing": [
    "Corrugated Board Rejects", "Laminate Trim Waste",
    "Deinking Residue", "Paper Mill Sludge", "Off-Spec Pellet Rejects",
  ],
  "Agricultural Processing": [
    "Rice Husk Ash", "Sugarcane Bagasse Fiber", "Palm Oil Mill Effluent Solids",
    "Brewers Spent Grain", "Coconut Shell Char", "Whey Permeate Concentrate",
  ],
  "Petrochemical Manufacturing": [
    "Ethylene Cracker Tar", "Naphtha Reformer Coke",
    "Petroleum Coke Fines", "FCC Catalyst Waste",
    "Spent Solvent Mix", "Tank Bottom Sludge",
  ],
};

// ---------------------------------------------------------------------------
//  COMPLEMENTS_MAP — Directional: handling A → often requires B (asymmetric)
// ---------------------------------------------------------------------------

const COMPLEMENTS_MAP = {
  // Steel / Metal chain
  "Blast Furnace Slag": ["Basic Oxygen Furnace Slag", "Steelmaking Dust", "Mill Scale"],
  "Mill Scale": ["Steelmaking Dust"],
  "Steelmaking Dust": ["Slag from Smelting"],
  "Aluminum Dross": ["Spent Pot Lining", "Anode Butt Carbon"],
  // Battery / Electronics chain
  "Cathode Black Mass": ["Electrolyte Sludge", "Separator Film Scrap"],
  "Printed Circuit Board Scrap": ["Solder Dross", "Electronic Component Rejects"],
  "Solder Dross": ["Electronic Component Rejects"],
  "Silicon Wafer Slurry": ["CMP Waste Slurry", "Photoresist Sludge"],
  // Textile chain
  "Chemical Dye Runoff": ["Dyehouse Effluent Sludge", "Textile Sizing Waste"],
  "Lint Fiber Residue": ["Textile Sizing Waste"],
  // Chemical chain
  "Sulfuric Acid Waste": ["Ammonia Scrubber Waste", "Chlor-Alkali Brine Sludge"],
  "Spent Solvent Mix": ["Spent Catalyst Fines"],
  // Cement / Construction chain
  "Cement Kiln Dust": ["Clinker Bypass Dust", "Concrete Wash Water Solids"],
  "Concrete Wash Water Solids": ["Asphalt Milling Reclaim", "Mineral Wool Offcuts"],
  // Mining chain
  "Red Mud (Bauxite Residue)": ["Tailings Slurry", "Acid Mine Drainage Precipitate"],
  "Tailings Slurry": ["Acid Mine Drainage Precipitate"],
  // Paper chain
  "Paper Mill Sludge": ["Black Liquor Residue", "Deinking Residue"],
  // Pharma chain
  "API Crystallization Residue": ["Bioreactor Cleaning Waste", "Pharma Packaging Rejects"],
  // Oil & Gas chain
  "FCC Catalyst Waste": ["Petroleum Coke Fines", "Tank Bottom Sludge"],
  "Ethylene Cracker Tar": ["Naphtha Reformer Coke", "Polymerization Catalyst Residue"],
  // Solar / Semiconductor chain
  "Silicon Kerf Loss": ["Cadmium Telluride Dust", "Encapsulant Trim Waste"],
  // Automotive / Rubber chain
  "Tire Buffing Dust": ["Rubber Crumb Rejects", "Vulcanization Fumes Residue"],
  // Marine chain
  "Marine Anti-Fouling Paint Residue": ["Grit Blasting Waste", "Ballast Water Sediment"],
  // Nuclear chain
  "Low-Level Radioactive Waste": ["Nuclear Ion Exchange Resins", "Decontamination Sludge"],
  // Organic chain
  "Brewers Spent Grain": ["Whey Permeate Concentrate", "Olive Mill Wastewater Solids"],
  "Rice Husk Ash": ["Sugarcane Bagasse Fiber", "Coconut Shell Char"],
  // Packaging chain
  "Ink Wash Solvents": ["Laminate Trim Waste", "Corrugated Board Rejects"],
  // Tanning chain
  "Chrome Tanning Sludge": ["Leather Shavings", "Tannery Effluent Solids"],
  // Wind / Aerospace chain
  "Carbon Fiber Offcuts": ["Fiberglass Blade Scrap", "Polymer Trim Waste"],
  "Titanium Machining Chips": ["Aerospace Sealant Waste"],
  // Glass chain
  "Cullet Dust": ["Batch Reject Powder", "Glass Furnace Refractory Waste"],
};

// ---------------------------------------------------------------------------
//  REGULATIONS — 18 total
// ---------------------------------------------------------------------------

const REGULATIONS = [
  {
    code: "EU-REACH-1907/2006",
    description: "EU REACH — regulates chemical substances manufactured or imported into the EU above 1 tonne/year.",
    appliesTo: [
      "Chemical Dye Runoff", "Sulfuric Acid Waste", "Chlor-Alkali Brine Sludge",
      "Electrolyte Sludge", "Spent Solvent Mix", "Spent Catalyst Fines",
      "Photoresist Sludge", "Marine Anti-Fouling Paint Residue",
      "Chrome Tanning Sludge", "Tannery Effluent Solids",
      "Dyehouse Effluent Sludge", "Polymerization Catalyst Residue",
    ],
  },
  {
    code: "EPA-RCRA-40CFR261",
    description: "US RCRA — governs the disposal of solid and hazardous waste.",
    appliesTo: [
      "Electrolyte Sludge", "Cathode Black Mass", "Printed Circuit Board Scrap",
      "Solder Dross", "Paint Sludge", "Sulfuric Acid Waste",
      "Spent Catalyst Fines", "Cadmium Telluride Dust", "Photoresist Sludge",
      "Tank Bottom Sludge", "FCC Catalyst Waste", "Spent Pot Lining",
    ],
  },
  {
    code: "BASEL-CONV-1989",
    description: "Basel Convention — restricts transboundary movements of hazardous wastes.",
    appliesTo: [
      "Red Mud (Bauxite Residue)", "Cathode Black Mass", "Printed Circuit Board Scrap",
      "Refinery Anode Slime", "Steelmaking Dust", "PGM Recovery Residue",
      "Cadmium Telluride Dust", "Marine Anti-Fouling Paint Residue",
      "Low-Level Radioactive Waste", "Chrome Tanning Sludge",
    ],
  },
  {
    code: "EU-WFD-2008/98/EC",
    description: "EU Waste Framework Directive — establishes the waste hierarchy and end-of-waste criteria.",
    appliesTo: [
      "Blast Furnace Slag", "Mill Scale", "Cement Kiln Dust",
      "Tailings Slurry", "Slag from Smelting", "Brewers Spent Grain",
      "Lint Fiber Residue", "Basic Oxygen Furnace Slag", "Paper Mill Sludge",
      "Deinking Residue", "Cullet Dust", "Polymer Trim Waste",
      "Water Treatment Sludge", "Concrete Wash Water Solids",
      "Asphalt Milling Reclaim", "Rice Husk Ash",
    ],
  },
  {
    code: "OSHA-HCS-29CFR1910.1200",
    description: "US OSHA HCS — requires SDS and labeling for hazardous chemicals.",
    appliesTo: [
      "Chemical Dye Runoff", "Sulfuric Acid Waste", "Spent Solvent Mix",
      "Used Cutting Fluid", "Ammonia Scrubber Waste", "Aerospace Sealant Waste",
      "Acid Mine Drainage Precipitate", "Catalyst Residue from Cracking",
      "Ink Wash Solvents", "Vulcanization Fumes Residue",
    ],
  },
  {
    code: "EU-RoHS-2011/65/EU",
    description: "EU RoHS — restricts hazardous materials in electrical and electronic equipment.",
    appliesTo: [
      "Solder Dross", "LCD Panel Glass Waste", "Printed Circuit Board Scrap",
      "Electronic Component Rejects", "Cadmium Telluride Dust",
    ],
  },
  {
    code: "CERCLA-42USC9601",
    description: "US Superfund Act — provides authority for hazardous waste site cleanup.",
    appliesTo: [
      "Red Mud (Bauxite Residue)", "Tailings Slurry", "Phosphogypsum",
      "Chlor-Alkali Brine Sludge", "Acid Mine Drainage Precipitate",
      "Grit Blasting Waste", "Spent Pot Lining", "Tank Bottom Sludge",
    ],
  },
  {
    code: "ISO-14001:2015",
    description: "ISO 14001 — environmental management systems framework.",
    appliesTo: [
      "Paint Sludge", "Stamping Metal Scrap", "Cement Kiln Dust",
      "API Crystallization Residue", "Ammonia Scrubber Waste",
      "Carbon Fiber Offcuts", "Titanium Machining Chips",
      "Water Treatment Sludge", "Paper Mill Sludge",
      "Concrete Wash Water Solids", "Mineral Wool Offcuts",
    ],
  },
  {
    code: "EU-BAT-IED-2010/75/EU",
    description: "EU IED BAT — emission limits for industrial installations based on best available techniques.",
    appliesTo: [
      "Blast Furnace Slag", "Steelmaking Dust", "Cement Kiln Dust",
      "Phosphogypsum", "Sulfuric Acid Waste", "Basic Oxygen Furnace Slag",
      "Clinker Bypass Dust", "Black Liquor Residue",
      "Ethylene Cracker Tar", "Naphtha Reformer Coke",
    ],
  },
  {
    code: "GHS-REV9-UN",
    description: "UN GHS Rev.9 — international standard for hazard classification and labelling.",
    appliesTo: [
      "Chemical Dye Runoff", "Electrolyte Sludge", "Refinery Anode Slime",
      "Citrus Peel Extract Residue", "Spent Catalyst Fines",
      "Marine Anti-Fouling Paint Residue", "Decontamination Sludge",
    ],
  },
  {
    code: "TSCA-15USC2601",
    description: "US TSCA — regulates introduction of new or existing chemicals in the US.",
    appliesTo: [
      "Polymer Trim Waste", "Off-Spec Pellet Rejects", "Catalyst Residue from Cracking",
      "Photoresist Sludge", "Rubber Vulcanization Waste", "Textile Sizing Waste",
      "Tire Buffing Dust", "Ethylene Cracker Tar",
    ],
  },
  {
    code: "EU-WEEE-2012/19/EU",
    description: "EU WEEE — collection, recycling and recovery targets for electronic waste.",
    appliesTo: [
      "Printed Circuit Board Scrap", "Solder Dross", "LCD Panel Glass Waste",
      "Electronic Component Rejects", "Silicon Wafer Slurry", "CMP Waste Slurry",
      "Separator Film Scrap", "Rare Earth Magnet Waste",
    ],
  },
  {
    code: "MARPOL-73/78",
    description: "MARPOL Convention — regulates marine pollution from ships.",
    appliesTo: [
      "Marine Anti-Fouling Paint Residue", "Grit Blasting Waste",
      "Welding Slag", "Paint Sludge", "Ballast Water Sediment",
      "Tank Bottom Sludge",
    ],
  },
  {
    code: "EU-ETS-2003/87/EC",
    description: "EU ETS — cap-and-trade system for greenhouse gas emissions.",
    appliesTo: [
      "Cement Kiln Dust", "Clinker Bypass Dust", "Blast Furnace Slag",
      "Steelmaking Dust", "Black Liquor Residue", "Glass Furnace Refractory Waste",
      "Petroleum Coke Fines", "Naphtha Reformer Coke",
    ],
  },
  {
    code: "STOCKHOLM-CONV-2001",
    description: "Stockholm Convention — bans or restricts persistent organic pollutants.",
    appliesTo: [
      "Chemical Dye Runoff", "Marine Anti-Fouling Paint Residue",
      "Rubber Vulcanization Waste", "Spent Solvent Mix", "Aerospace Sealant Waste",
      "Dyehouse Effluent Sludge", "Ethylene Cracker Tar",
    ],
  },
  {
    code: "EU-CLP-1272/2008",
    description: "EU CLP — aligns EU chemical classification with the GHS.",
    appliesTo: [
      "Sulfuric Acid Waste", "Chlor-Alkali Brine Sludge", "Ammonia Scrubber Waste",
      "Urea Prilling Dust", "Acid Mine Drainage Precipitate", "Photoresist Sludge",
      "Vulcanization Fumes Residue", "Ink Wash Solvents",
    ],
  },
  {
    code: "IAEA-GSR-PART3",
    description: "IAEA General Safety Requirements — radiation protection and safety of radioactive waste.",
    appliesTo: [
      "Low-Level Radioactive Waste", "Nuclear Ion Exchange Resins",
      "Decontamination Sludge", "Cadmium Telluride Dust",
    ],
  },
  {
    code: "EU-PPWD-94/62/EC",
    description: "EU Packaging and Packaging Waste Directive — sets recycling and recovery targets for packaging.",
    appliesTo: [
      "Laminate Trim Waste", "Corrugated Board Rejects", "Pharma Packaging Rejects",
      "Off-Spec Pellet Rejects", "Encapsulant Trim Waste", "Separator Film Scrap",
    ],
  },
];

// ---------------------------------------------------------------------------
//  GENERATOR
// ---------------------------------------------------------------------------

function generate() {
  const nodes = [];
  const edges = [];
  let nodeId = 1;
  let edgeId = 1;

  const companyNodes = [];
  const wasteNodesByName = new Map();
  const regulationNodesByCode = new Map();

  // 1. Company & WasteMaterial nodes + PRODUCES edges
  for (const industry of INDUSTRIES) {
    for (const company of industry.companies) {
      const carbonRating =
        industry.carbon_ratings[Math.floor(Math.random() * industry.carbon_ratings.length)];

      const companyId = `company_${nodeId}`;
      const coords = LOCATION_COORDS[company.location] || [0, 0];
      const capacity = 500 + Math.floor(Math.random() * 9500); // 500–10000 tonnes/year

      nodes.push({
        id: companyId,
        type: "Company",
        properties: {
          name: company.name,
          industry: industry.name,
          location: company.location,
          carbon_rating: carbonRating,
          latitude: coords[0],
          longitude: coords[1],
          capacity: capacity,
        },
      });
      companyNodes.push({ id: companyId, name: company.name, industry: industry.name });
      nodeId++;

      for (const waste of industry.wastes) {
        if (!wasteNodesByName.has(waste.name)) {
          const wasteId = `waste_${nodeId}`;
          nodes.push({
            id: wasteId,
            type: "WasteMaterial",
            properties: {
              name: waste.name,
              toxicity_level: waste.toxicity_level,
              base_element: waste.base_element,
              category: waste.category,
              description: generateWasteDescription(waste, industry.name),
              price: randomPrice(waste.category),
              quantity: randomQuantity(),
            },
          });
          wasteNodesByName.set(waste.name, wasteId);
          nodeId++;
        }

        edges.push({
          id: `edge_${edgeId}`,
          type: "PRODUCES",
          source: companyId,
          target: wasteNodesByName.get(waste.name),
          properties: { source_label: company.name, target_label: waste.name },
        });
        edgeId++;
      }
    }
  }

  // 2. Regulation nodes + REQUIRES_COMPLIANCE edges
  for (const reg of REGULATIONS) {
    const regId = `reg_${nodeId}`;
    nodes.push({
      id: regId,
      type: "Regulation",
      properties: { code: reg.code, description: reg.description },
    });
    regulationNodesByCode.set(reg.code, regId);
    nodeId++;

    for (const wasteName of reg.appliesTo) {
      const wasteId = wasteNodesByName.get(wasteName);
      if (!wasteId) {
        console.warn(`WARNING: Regulation ${reg.code} references unknown waste "${wasteName}"`);
        continue;
      }
      edges.push({
        id: `edge_${edgeId}`,
        type: "REQUIRES_COMPLIANCE",
        source: wasteId,
        target: regId,
        properties: { source_label: wasteName, target_label: reg.code },
      });
      edgeId++;
    }
  }

  // 3. CAN_UPCYCLE edges
  for (const [industryName, wasteNames] of Object.entries(UPCYCLE_MAP)) {
    const consumers = companyNodes.filter((c) => c.industry === industryName);
    for (const wasteName of wasteNames) {
      const wasteId = wasteNodesByName.get(wasteName);
      if (!wasteId) continue; // silently skip unknown wastes in upcycle map
      for (const consumer of consumers) {
        edges.push({
          id: `edge_${edgeId}`,
          type: "CAN_UPCYCLE",
          source: consumer.id,
          target: wasteId,
          properties: { source_label: consumer.name, target_label: wasteName },
        });
        edgeId++;
      }
    }
  }

  // 4. COMPLEMENTS edges (directional: waste A → waste B)
  for (const [sourceName, targetNames] of Object.entries(COMPLEMENTS_MAP)) {
    const sourceId = wasteNodesByName.get(sourceName);
    if (!sourceId) continue;
    for (const targetName of targetNames) {
      const targetId = wasteNodesByName.get(targetName);
      if (!targetId) continue;
      edges.push({
        id: `edge_${edgeId}`,
        type: "COMPLEMENTS",
        source: sourceId,
        target: targetId,
        properties: { source_label: sourceName, target_label: targetName },
      });
      edgeId++;
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
//  MAIN
// ---------------------------------------------------------------------------

const graph = generate();
const outputPath = path.join(__dirname, "supply_chain_graph.json");
fs.writeFileSync(outputPath, JSON.stringify(graph, null, 2), "utf-8");

const cc = graph.nodes.filter((n) => n.type === "Company").length;
const wc = graph.nodes.filter((n) => n.type === "WasteMaterial").length;
const rc = graph.nodes.filter((n) => n.type === "Regulation").length;
const pe = graph.edges.filter((e) => e.type === "PRODUCES").length;
const ue = graph.edges.filter((e) => e.type === "CAN_UPCYCLE").length;
const ce = graph.edges.filter((e) => e.type === "REQUIRES_COMPLIANCE").length;
const cm = graph.edges.filter((e) => e.type === "COMPLEMENTS").length;

console.log("=== Symbi-OS Dataset Generated (v4 — Hybrid Intelligence) ===");
console.log(`Output: ${outputPath}\n`);
console.log(`Nodes (${graph.nodes.length} total):`);
console.log(`  Company        : ${cc}`);
console.log(`  WasteMaterial  : ${wc}`);
console.log(`  Regulation     : ${rc}`);
console.log(`\nEdges (${graph.edges.length} total):`);
console.log(`  PRODUCES             : ${pe}`);
console.log(`  CAN_UPCYCLE          : ${ue}`);
console.log(`  REQUIRES_COMPLIANCE  : ${ce}`);
console.log(`  COMPLEMENTS          : ${cm}`);
