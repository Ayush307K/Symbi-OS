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
  { city: "Agra", state: "Uttar Pradesh", latitude: 27.1767, longitude: 78.0081 },
  { city: "Ahmedabad", state: "Gujarat", latitude: 23.0225, longitude: 72.5714 },
  { city: "Amreli", state: "Gujarat", latitude: 21.6032, longitude: 71.2221 },
  { city: "Amroha", state: "Uttar Pradesh", latitude: 28.9044, longitude: 78.467 },
  { city: "Ballabgarh", state: "Haryana", latitude: 28.3414, longitude: 77.325 },
  { city: "Baraut", state: "Uttar Pradesh", latitude: 29.101, longitude: 77.2634 },
  { city: "Bareilly", state: "Uttar Pradesh", latitude: 28.367, longitude: 79.4304 },
  { city: "Bazpur", state: "Uttarakhand", latitude: 29.152, longitude: 79.108 },
  { city: "Begusarai", state: "Bihar", latitude: 25.4182, longitude: 86.1272 },
  { city: "Beldanga", state: "West Bengal", latitude: 23.9343, longitude: 88.2604 },
  { city: "Bengaluru", state: "Karnataka", latitude: 12.9716, longitude: 77.5946 },
  { city: "Belgaum", state: "Karnataka", latitude: 15.8497, longitude: 74.4977 },
  { city: "Berhampore", state: "West Bengal", latitude: 24.0988, longitude: 88.2679 },
  { city: "Bhavnagar", state: "Gujarat", latitude: 21.7645, longitude: 72.1519 },
  { city: "Bhopal", state: "Madhya Pradesh", latitude: 23.2599, longitude: 77.4126 },
  { city: "Chennai", state: "Tamil Nadu", latitude: 13.0827, longitude: 80.2707 },
  { city: "Coimbatore", state: "Tamil Nadu", latitude: 11.0168, longitude: 76.9558 },
  { city: "Chandannagar", state: "West Bengal", latitude: 22.8648, longitude: 88.3633 },
  { city: "Eluru", state: "Andhra Pradesh", latitude: 16.7107, longitude: 81.0952 },
  { city: "Faridabad", state: "Haryana", latitude: 28.4089, longitude: 77.3178 },
  { city: "Gandhidham", state: "Gujarat", latitude: 23.0753, longitude: 70.1337 },
  { city: "Ghaziabad", state: "Uttar Pradesh", latitude: 28.6692, longitude: 77.4538 },
  { city: "Goa Velha", state: "Goa", latitude: 15.4419, longitude: 73.8878 },
  { city: "Gurugram", state: "Haryana", latitude: 28.4595, longitude: 77.0266 },
  { city: "Gorakhpur", state: "Uttar Pradesh", latitude: 26.7606, longitude: 83.3732 },
  { city: "Guwahati", state: "Assam", latitude: 26.1445, longitude: 91.7362 },
  { city: "Hisar", state: "Haryana", latitude: 29.1492, longitude: 75.7217 },
  { city: "Hindupur", state: "Andhra Pradesh", latitude: 13.8281, longitude: 77.4914 },
  { city: "Hooghly", state: "West Bengal", latitude: 22.8963, longitude: 88.2461 },
  { city: "Howrah", state: "West Bengal", latitude: 22.5958, longitude: 88.2636 },
  { city: "Hyderabad", state: "Telangana", latitude: 17.385, longitude: 78.4867 },
  { city: "Indore", state: "Madhya Pradesh", latitude: 22.7196, longitude: 75.8577 },
  { city: "Jaipur", state: "Rajasthan", latitude: 26.9124, longitude: 75.7873 },
  { city: "Jamnagar", state: "Gujarat", latitude: 22.4707, longitude: 70.0577 },
  { city: "Jamshedpur", state: "Jharkhand", latitude: 22.8046, longitude: 86.2029 },
  { city: "Jodhpur", state: "Rajasthan", latitude: 26.2389, longitude: 73.0243 },
  { city: "Kalol", state: "Gujarat", latitude: 23.246, longitude: 72.496 },
  { city: "Kamrup", state: "Assam", latitude: 26.1445, longitude: 91.7362 },
  { city: "Kanpur", state: "Uttar Pradesh", latitude: 26.4499, longitude: 80.3319 },
  { city: "Kochi", state: "Kerala", latitude: 9.9312, longitude: 76.2673 },
  { city: "Kolkata", state: "West Bengal", latitude: 22.5726, longitude: 88.3639 },
  { city: "Ludhiana", state: "Punjab", latitude: 30.901, longitude: 75.8573 },
  { city: "Mandi Gobindgarh", state: "Punjab", latitude: 30.664, longitude: 76.291 },
  { city: "Meerut", state: "Uttar Pradesh", latitude: 28.9845, longitude: 77.7064 },
  { city: "Mehsana", state: "Gujarat", latitude: 23.588, longitude: 72.3693 },
  { city: "Moradabad", state: "Uttar Pradesh", latitude: 28.8386, longitude: 78.7733 },
  { city: "Mumbai", state: "Maharashtra", latitude: 19.076, longitude: 72.8777 },
  { city: "Muzaffarnagar", state: "Uttar Pradesh", latitude: 29.4727, longitude: 77.7085 },
  { city: "Mundra", state: "Gujarat", latitude: 22.8394, longitude: 69.7219 },
  { city: "Mysore", state: "Karnataka", latitude: 12.2958, longitude: 76.6394 },
  { city: "Nagpur", state: "Maharashtra", latitude: 21.1458, longitude: 79.0882 },
  { city: "Nashik", state: "Maharashtra", latitude: 19.9975, longitude: 73.7898 },
  { city: "Navi Mumbai", state: "Maharashtra", latitude: 19.033, longitude: 73.0297 },
  { city: "New Delhi", state: "Delhi", latitude: 28.6139, longitude: 77.209 },
  { city: "Nichlaul", state: "Uttar Pradesh", latitude: 27.3124, longitude: 83.7287 },
  { city: "Noida", state: "Uttar Pradesh", latitude: 28.5355, longitude: 77.391 },
  { city: "Greater Noida", state: "Uttar Pradesh", latitude: 28.4744, longitude: 77.504 },
  { city: "Panipat", state: "Haryana", latitude: 29.3909, longitude: 76.9635 },
  { city: "Pune", state: "Maharashtra", latitude: 18.5204, longitude: 73.8567 },
  { city: "Raipur", state: "Chhattisgarh", latitude: 21.2514, longitude: 81.6296 },
  { city: "Rajkot", state: "Gujarat", latitude: 22.3039, longitude: 70.8022 },
  { city: "Rohtak", state: "Haryana", latitude: 28.8955, longitude: 76.6066 },
  { city: "Surat", state: "Gujarat", latitude: 21.1702, longitude: 72.8311 },
  { city: "Thiruvananthapuram", state: "Kerala", latitude: 8.5241, longitude: 76.9366 },
  { city: "Vadodara", state: "Gujarat", latitude: 22.3072, longitude: 73.1812 },
  { city: "Udupi", state: "Karnataka", latitude: 13.3409, longitude: 74.7421 },
  { city: "Vellore", state: "Tamil Nadu", latitude: 12.9165, longitude: 79.1325 },
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
  "west godavari dist.": "eluru",
  "west godavari dist": "eluru",
  krishna: "eluru",
};

const INDEX = new Map(CITIES.map((entry) => [key(entry.city), entry]));

/** Look up a city centroid, or null when the name is not one we know. */
export function locateCity(city: string | null | undefined): CityPoint | null {
  if (!city) return null;
  const normalized = key(city);
  return INDEX.get(ALIASES[normalized] ?? normalized) ?? null;
}

export const KNOWN_CITIES = CITIES;
