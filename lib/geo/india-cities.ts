/**
 * Coordinates and canonical state for the Indian cities that appear in listing
 * data, keyed by a normalised city name.
 *
 * Distance matching needs a latitude and longitude on the listing; the importer
 * supplies neither, so every radius-limited RFQ was excluded at the first hard
 * filter. City centroids are approximate by nature — good enough to rank by
 * freight distance, not to route a truck, which is all the matcher claims.
 *
 * The state is carried alongside because the scraped state column is unreliable
 * ("Mumbai / Rajasthan", "New Delhi / British Columbia") and location scoring
 * compares against it.
 */
export interface CityPoint {
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

const CITIES: CityPoint[] = [
  { city: "Ahmedabad", state: "Gujarat", latitude: 23.0225, longitude: 72.5714 },
  { city: "Bengaluru", state: "Karnataka", latitude: 12.9716, longitude: 77.5946 },
  { city: "Bhopal", state: "Madhya Pradesh", latitude: 23.2599, longitude: 77.4126 },
  { city: "Chennai", state: "Tamil Nadu", latitude: 13.0827, longitude: 80.2707 },
  { city: "Coimbatore", state: "Tamil Nadu", latitude: 11.0168, longitude: 76.9558 },
  { city: "Gandhidham", state: "Gujarat", latitude: 23.0753, longitude: 70.1337 },
  { city: "Ghaziabad", state: "Uttar Pradesh", latitude: 28.6692, longitude: 77.4538 },
  { city: "Goa Velha", state: "Goa", latitude: 15.4419, longitude: 73.8878 },
  { city: "Gurugram", state: "Haryana", latitude: 28.4595, longitude: 77.0266 },
  { city: "Hyderabad", state: "Telangana", latitude: 17.385, longitude: 78.4867 },
  { city: "Indore", state: "Madhya Pradesh", latitude: 22.7196, longitude: 75.8577 },
  { city: "Jaipur", state: "Rajasthan", latitude: 26.9124, longitude: 75.7873 },
  { city: "Jamnagar", state: "Gujarat", latitude: 22.4707, longitude: 70.0577 },
  { city: "Kanpur", state: "Uttar Pradesh", latitude: 26.4499, longitude: 80.3319 },
  { city: "Kochi", state: "Kerala", latitude: 9.9312, longitude: 76.2673 },
  { city: "Kolkata", state: "West Bengal", latitude: 22.5726, longitude: 88.3639 },
  { city: "Ludhiana", state: "Punjab", latitude: 30.901, longitude: 75.8573 },
  { city: "Moradabad", state: "Uttar Pradesh", latitude: 28.8386, longitude: 78.7733 },
  { city: "Mumbai", state: "Maharashtra", latitude: 19.076, longitude: 72.8777 },
  { city: "Mundra", state: "Gujarat", latitude: 22.8394, longitude: 69.7219 },
  { city: "Mysore", state: "Karnataka", latitude: 12.2958, longitude: 76.6394 },
  { city: "Nagpur", state: "Maharashtra", latitude: 21.1458, longitude: 79.0882 },
  { city: "Nashik", state: "Maharashtra", latitude: 19.9975, longitude: 73.7898 },
  { city: "New Delhi", state: "Delhi", latitude: 28.6139, longitude: 77.209 },
  { city: "Panipat", state: "Haryana", latitude: 29.3909, longitude: 76.9635 },
  { city: "Pune", state: "Maharashtra", latitude: 18.5204, longitude: 73.8567 },
  { city: "Raipur", state: "Chhattisgarh", latitude: 21.2514, longitude: 81.6296 },
  { city: "Rajkot", state: "Gujarat", latitude: 22.3039, longitude: 70.8022 },
  { city: "Rohtak", state: "Haryana", latitude: 28.8955, longitude: 76.6066 },
  { city: "Surat", state: "Gujarat", latitude: 21.1702, longitude: 72.8311 },
  { city: "Thiruvananthapuram", state: "Kerala", latitude: 8.5241, longitude: 76.9366 },
  { city: "Vadodara", state: "Gujarat", latitude: 22.3072, longitude: 73.1812 },
  { city: "Visakhapatnam", state: "Andhra Pradesh", latitude: 17.6868, longitude: 83.2185 },
];

const key = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

// A few names the sources use interchangeably with the entry above.
const ALIASES: Record<string, string> = {
  bangalore: "bengaluru",
  bombay: "mumbai",
  calcutta: "kolkata",
  madras: "chennai",
  delhi: "new delhi",
  gurgaon: "gurugram",
  mysuru: "mysore",
  trivandrum: "thiruvananthapuram",
  baroda: "vadodara",
  cochin: "kochi",
  vizag: "visakhapatnam",
};

const INDEX = new Map(CITIES.map((entry) => [key(entry.city), entry]));

/** Look up a city centroid, or null when the name is not one we know. */
export function locateCity(city: string | null | undefined): CityPoint | null {
  if (!city) return null;
  const normalized = key(city);
  return INDEX.get(ALIASES[normalized] ?? normalized) ?? null;
}

export const KNOWN_CITIES = CITIES;
