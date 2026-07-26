export type CityType = "financial" | "capital" | "port" | "commodity";

export interface WorldCity {
  id: string;
  name: string;
  countryIso: string;
  countryName: string;
  lat: number;
  lng: number;
  weight: number; // 0–1 financial/economic importance
  type: CityType;
  indexAssetId?: string; // matching asset ID in assets/route.ts
  region: string;
}

export const WORLD_CITIES: WorldCity[] = [
  // ── North America ────────────────────────────────────────────────
  { id: "nyc", name: "New York", countryIso: "US", countryName: "United States", lat: 40.71, lng: -74.01, weight: 1.0, type: "financial", indexAssetId: "sp500_idx", region: "North America" },
  { id: "lax", name: "Los Angeles", countryIso: "US", countryName: "United States", lat: 34.05, lng: -118.24, weight: 0.6, type: "port", region: "North America" },
  { id: "chi", name: "Chicago", countryIso: "US", countryName: "United States", lat: 41.88, lng: -87.63, weight: 0.7, type: "financial", indexAssetId: "dow_idx", region: "North America" },
  { id: "sf", name: "San Francisco", countryIso: "US", countryName: "United States", lat: 37.77, lng: -122.42, weight: 0.7, type: "financial", region: "North America" },
  { id: "hou", name: "Houston", countryIso: "US", countryName: "United States", lat: 29.76, lng: -95.37, weight: 0.55, type: "commodity", region: "North America" },
  { id: "was", name: "Washington D.C.", countryIso: "US", countryName: "United States", lat: 38.91, lng: -77.04, weight: 0.6, type: "capital", region: "North America" },
  { id: "tor", name: "Toronto", countryIso: "CA", countryName: "Canada", lat: 43.65, lng: -79.38, weight: 0.65, type: "financial", region: "North America" },
  { id: "van", name: "Vancouver", countryIso: "CA", countryName: "Canada", lat: 49.28, lng: -123.12, weight: 0.4, type: "port", region: "North America" },
  { id: "mex", name: "Mexico City", countryIso: "MX", countryName: "Mexico", lat: 19.43, lng: -99.13, weight: 0.5, type: "capital", region: "North America" },

  // ── South America ────────────────────────────────────────────────
  { id: "sao", name: "São Paulo", countryIso: "BR", countryName: "Brazil", lat: -23.55, lng: -46.63, weight: 0.7, type: "financial", region: "South America" },
  { id: "rio", name: "Rio de Janeiro", countryIso: "BR", countryName: "Brazil", lat: -22.91, lng: -43.17, weight: 0.4, type: "port", region: "South America" },
  { id: "bue", name: "Buenos Aires", countryIso: "AR", countryName: "Argentina", lat: -34.60, lng: -58.38, weight: 0.45, type: "capital", region: "South America" },
  { id: "bog", name: "Bogotá", countryIso: "CO", countryName: "Colombia", lat: 4.71, lng: -74.07, weight: 0.35, type: "capital", region: "South America" },
  { id: "lim", name: "Lima", countryIso: "PE", countryName: "Peru", lat: -12.05, lng: -77.04, weight: 0.35, type: "capital", region: "South America" },

  // ── Europe ───────────────────────────────────────────────────────
  { id: "lon", name: "London", countryIso: "GB", countryName: "United Kingdom", lat: 51.51, lng: -0.13, weight: 1.0, type: "financial", indexAssetId: "ukx", region: "Europe" },
  { id: "fra", name: "Frankfurt", countryIso: "DE", countryName: "Germany", lat: 50.11, lng: 8.68, weight: 0.9, type: "financial", indexAssetId: "dax_idx", region: "Europe" },
  { id: "ber", name: "Berlin", countryIso: "DE", countryName: "Germany", lat: 52.52, lng: 13.41, weight: 0.6, type: "capital", indexAssetId: "dax_idx", region: "Europe" },
  { id: "par", name: "Paris", countryIso: "FR", countryName: "France", lat: 48.86, lng: 2.35, weight: 0.85, type: "financial", indexAssetId: "cac40_idx", region: "Europe" },
  { id: "zur", name: "Zurich", countryIso: "CH", countryName: "Switzerland", lat: 47.38, lng: 8.54, weight: 0.85, type: "financial", region: "Europe" },
  { id: "ams", name: "Amsterdam", countryIso: "NL", countryName: "Netherlands", lat: 52.37, lng: 4.90, weight: 0.65, type: "financial", region: "Europe" },
  { id: "mad", name: "Madrid", countryIso: "ES", countryName: "Spain", lat: 40.42, lng: -3.70, weight: 0.55, type: "capital", indexAssetId: "ibex_idx", region: "Europe" },
  { id: "mil", name: "Milan", countryIso: "IT", countryName: "Italy", lat: 45.46, lng: 9.19, weight: 0.55, type: "financial", indexAssetId: "mib_idx", region: "Europe" },
  { id: "rom", name: "Rome", countryIso: "IT", countryName: "Italy", lat: 41.90, lng: 12.50, weight: 0.4, type: "capital", region: "Europe" },
  { id: "stk", name: "Stockholm", countryIso: "SE", countryName: "Sweden", lat: 59.33, lng: 18.07, weight: 0.5, type: "financial", region: "Europe" },
  { id: "cop", name: "Copenhagen", countryIso: "DK", countryName: "Denmark", lat: 55.68, lng: 12.57, weight: 0.45, type: "capital", region: "Europe" },
  { id: "osl", name: "Oslo", countryIso: "NO", countryName: "Norway", lat: 59.91, lng: 10.75, weight: 0.45, type: "commodity", region: "Europe" },
  { id: "bru", name: "Brussels", countryIso: "BE", countryName: "Belgium", lat: 50.85, lng: 4.35, weight: 0.45, type: "capital", region: "Europe" },
  { id: "vie", name: "Vienna", countryIso: "AT", countryName: "Austria", lat: 48.21, lng: 16.37, weight: 0.45, type: "capital", region: "Europe" },
  { id: "war", name: "Warsaw", countryIso: "PL", countryName: "Poland", lat: 52.23, lng: 21.01, weight: 0.45, type: "capital", region: "Europe" },
  { id: "mos", name: "Moscow", countryIso: "RU", countryName: "Russia", lat: 55.75, lng: 37.62, weight: 0.7, type: "financial", region: "Europe" },
  { id: "ist", name: "Istanbul", countryIso: "TR", countryName: "Turkey", lat: 41.01, lng: 28.95, weight: 0.55, type: "financial", region: "Europe" },
  { id: "kyi", name: "Kyiv", countryIso: "UA", countryName: "Ukraine", lat: 50.45, lng: 30.52, weight: 0.35, type: "capital", region: "Europe" },

  // ── Middle East ──────────────────────────────────────────────────
  { id: "dub", name: "Dubai", countryIso: "AE", countryName: "United Arab Emirates", lat: 25.20, lng: 55.27, weight: 0.8, type: "financial", region: "Middle East" },
  { id: "abi", name: "Abu Dhabi", countryIso: "AE", countryName: "United Arab Emirates", lat: 24.47, lng: 54.37, weight: 0.65, type: "commodity", region: "Middle East" },
  { id: "riy", name: "Riyadh", countryIso: "SA", countryName: "Saudi Arabia", lat: 24.69, lng: 46.72, weight: 0.65, type: "commodity", region: "Middle East" },
  { id: "teh", name: "Tehran", countryIso: "IR", countryName: "Iran", lat: 35.69, lng: 51.39, weight: 0.35, type: "capital", region: "Middle East" },
  { id: "tel", name: "Tel Aviv", countryIso: "IL", countryName: "Israel", lat: 32.09, lng: 34.79, weight: 0.5, type: "financial", region: "Middle East" },
  { id: "doh", name: "Doha", countryIso: "QA", countryName: "Qatar", lat: 25.29, lng: 51.53, weight: 0.55, type: "commodity", region: "Middle East" },

  // ── Africa ───────────────────────────────────────────────────────
  { id: "lag", name: "Lagos", countryIso: "NG", countryName: "Nigeria", lat: 6.52, lng: 3.38, weight: 0.4, type: "financial", region: "Africa" },
  { id: "joh", name: "Johannesburg", countryIso: "ZA", countryName: "South Africa", lat: -26.20, lng: 28.04, weight: 0.5, type: "financial", region: "Africa" },
  { id: "cai", name: "Cairo", countryIso: "EG", countryName: "Egypt", lat: 30.04, lng: 31.24, weight: 0.4, type: "capital", region: "Africa" },
  { id: "cas", name: "Casablanca", countryIso: "MA", countryName: "Morocco", lat: 33.59, lng: -7.62, weight: 0.35, type: "port", region: "Africa" },
  { id: "nai", name: "Nairobi", countryIso: "KE", countryName: "Kenya", lat: -1.29, lng: 36.82, weight: 0.3, type: "capital", region: "Africa" },

  // ── Asia Pacific ─────────────────────────────────────────────────
  { id: "tok", name: "Tokyo", countryIso: "JP", countryName: "Japan", lat: 35.68, lng: 139.69, weight: 1.0, type: "financial", indexAssetId: "nikkei_idx", region: "Asia Pacific" },
  { id: "osa", name: "Osaka", countryIso: "JP", countryName: "Japan", lat: 34.69, lng: 135.50, weight: 0.4, type: "port", region: "Asia Pacific" },
  { id: "hkg", name: "Hong Kong", countryIso: "HK", countryName: "Hong Kong", lat: 22.32, lng: 114.17, weight: 0.9, type: "financial", indexAssetId: "hsi_idx", region: "Asia Pacific" },
  { id: "sha", name: "Shanghai", countryIso: "CN", countryName: "China", lat: 31.23, lng: 121.47, weight: 0.85, type: "financial", region: "Asia Pacific" },
  { id: "bei", name: "Beijing", countryIso: "CN", countryName: "China", lat: 39.91, lng: 116.39, weight: 0.75, type: "capital", region: "Asia Pacific" },
  { id: "shn", name: "Shenzhen", countryIso: "CN", countryName: "China", lat: 22.54, lng: 114.06, weight: 0.55, type: "financial", region: "Asia Pacific" },
  { id: "sin", name: "Singapore", countryIso: "SG", countryName: "Singapore", lat: 1.35, lng: 103.82, weight: 0.9, type: "financial", region: "Asia Pacific" },
  { id: "seo", name: "Seoul", countryIso: "KR", countryName: "South Korea", lat: 37.57, lng: 126.98, weight: 0.7, type: "financial", region: "Asia Pacific" },
  { id: "syd", name: "Sydney", countryIso: "AU", countryName: "Australia", lat: -33.87, lng: 151.21, weight: 0.7, type: "financial", indexAssetId: "asx200_idx", region: "Asia Pacific" },
  { id: "mel", name: "Melbourne", countryIso: "AU", countryName: "Australia", lat: -37.81, lng: 144.96, weight: 0.5, type: "financial", region: "Asia Pacific" },
  { id: "mum", name: "Mumbai", countryIso: "IN", countryName: "India", lat: 19.08, lng: 72.88, weight: 0.7, type: "financial", region: "Asia Pacific" },
  { id: "del", name: "New Delhi", countryIso: "IN", countryName: "India", lat: 28.61, lng: 77.21, weight: 0.55, type: "capital", region: "Asia Pacific" },
  { id: "ban", name: "Bangkok", countryIso: "TH", countryName: "Thailand", lat: 13.76, lng: 100.50, weight: 0.45, type: "capital", region: "Asia Pacific" },
  { id: "kul", name: "Kuala Lumpur", countryIso: "MY", countryName: "Malaysia", lat: 3.14, lng: 101.69, weight: 0.45, type: "financial", region: "Asia Pacific" },
  { id: "jak", name: "Jakarta", countryIso: "ID", countryName: "Indonesia", lat: -6.21, lng: 106.85, weight: 0.5, type: "capital", region: "Asia Pacific" },
  { id: "tai", name: "Taipei", countryIso: "TW", countryName: "Taiwan", lat: 25.05, lng: 121.56, weight: 0.55, type: "financial", region: "Asia Pacific" },
  { id: "man", name: "Manila", countryIso: "PH", countryName: "Philippines", lat: 14.60, lng: 120.98, weight: 0.35, type: "capital", region: "Asia Pacific" },
  { id: "kar", name: "Karachi", countryIso: "PK", countryName: "Pakistan", lat: 24.86, lng: 67.01, weight: 0.35, type: "port", region: "Asia Pacific" },
  { id: "col", name: "Colombo", countryIso: "LK", countryName: "Sri Lanka", lat: 6.93, lng: 79.85, weight: 0.3, type: "port", region: "Asia Pacific" },
  { id: "dha", name: "Dhaka", countryIso: "BD", countryName: "Bangladesh", lat: 23.81, lng: 90.41, weight: 0.35, type: "capital", region: "Asia Pacific" },
  { id: "ran", name: "Rangoon", countryIso: "MM", countryName: "Myanmar", lat: 16.87, lng: 96.19, weight: 0.25, type: "port", region: "Asia Pacific" },
  { id: "han", name: "Hanoi", countryIso: "VN", countryName: "Vietnam", lat: 21.03, lng: 105.83, weight: 0.35, type: "capital", region: "Asia Pacific" },
  { id: "hcm", name: "Ho Chi Minh", countryIso: "VN", countryName: "Vietnam", lat: 10.82, lng: 106.63, weight: 0.4, type: "port", region: "Asia Pacific" },
  { id: "pnp", name: "Phnom Penh", countryIso: "KH", countryName: "Cambodia", lat: 11.57, lng: 104.92, weight: 0.22, type: "capital", region: "Asia Pacific" },
  { id: "per", name: "Perth", countryIso: "AU", countryName: "Australia", lat: -31.95, lng: 115.86, weight: 0.4, type: "commodity", region: "Asia Pacific" },
  { id: "akl", name: "Auckland", countryIso: "NZ", countryName: "New Zealand", lat: -36.87, lng: 174.77, weight: 0.35, type: "financial", region: "Asia Pacific" },
  { id: "pvg", name: "Port Moresby", countryIso: "PG", countryName: "Papua New Guinea", lat: -9.44, lng: 147.18, weight: 0.2, type: "capital", region: "Asia Pacific" },
  { id: "ala", name: "Almaty", countryIso: "KZ", countryName: "Kazakhstan", lat: 43.24, lng: 76.89, weight: 0.3, type: "financial", region: "Asia Pacific" },
  { id: "tas", name: "Tashkent", countryIso: "UZ", countryName: "Uzbekistan", lat: 41.30, lng: 69.24, weight: 0.25, type: "capital", region: "Asia Pacific" },
  { id: "bak", name: "Baku", countryIso: "AZ", countryName: "Azerbaijan", lat: 40.41, lng: 49.87, weight: 0.3, type: "commodity", region: "Middle East" },
  { id: "kuw", name: "Kuwait City", countryIso: "KW", countryName: "Kuwait", lat: 29.36, lng: 47.98, weight: 0.35, type: "commodity", region: "Middle East" },
  { id: "mus", name: "Muscat", countryIso: "OM", countryName: "Oman", lat: 23.59, lng: 58.59, weight: 0.3, type: "commodity", region: "Middle East" },
  { id: "bag", name: "Baghdad", countryIso: "IQ", countryName: "Iraq", lat: 33.34, lng: 44.40, weight: 0.3, type: "capital", region: "Middle East" },
  { id: "khi", name: "Kartoum", countryIso: "SD", countryName: "Sudan", lat: 15.55, lng: 32.53, weight: 0.2, type: "capital", region: "Africa" },
  { id: "acc", name: "Accra", countryIso: "GH", countryName: "Ghana", lat: 5.56, lng: -0.20, weight: 0.28, type: "capital", region: "Africa" },
  { id: "abi2", name: "Abidjan", countryIso: "CI", countryName: "Côte d'Ivoire", lat: 5.36, lng: -4.00, weight: 0.27, type: "port", region: "Africa" },
  { id: "dak", name: "Dakar", countryIso: "SN", countryName: "Senegal", lat: 14.72, lng: -17.47, weight: 0.25, type: "port", region: "Africa" },
  { id: "luo", name: "Luanda", countryIso: "AO", countryName: "Angola", lat: -8.84, lng: 13.23, weight: 0.28, type: "commodity", region: "Africa" },
  { id: "dse", name: "Dar es Salaam", countryIso: "TZ", countryName: "Tanzania", lat: -6.78, lng: 39.27, weight: 0.25, type: "port", region: "Africa" },
  { id: "add", name: "Addis Ababa", countryIso: "ET", countryName: "Ethiopia", lat: 9.03, lng: 38.74, weight: 0.28, type: "capital", region: "Africa" },
  { id: "kla", name: "Kampala", countryIso: "UG", countryName: "Uganda", lat: 0.31, lng: 32.58, weight: 0.2, type: "capital", region: "Africa" },
  { id: "har", name: "Harare", countryIso: "ZW", countryName: "Zimbabwe", lat: -17.83, lng: 31.05, weight: 0.2, type: "capital", region: "Africa" },
  { id: "map", name: "Maputo", countryIso: "MZ", countryName: "Mozambique", lat: -25.97, lng: 32.59, weight: 0.2, type: "port", region: "Africa" },
  { id: "tun", name: "Tunis", countryIso: "TN", countryName: "Tunisia", lat: 36.82, lng: 10.17, weight: 0.25, type: "capital", region: "Africa" },
  { id: "tri", name: "Tripoli", countryIso: "LY", countryName: "Libya", lat: 32.90, lng: 13.18, weight: 0.22, type: "capital", region: "Africa" },
  { id: "alg", name: "Algiers", countryIso: "DZ", countryName: "Algeria", lat: 36.74, lng: 3.06, weight: 0.28, type: "capital", region: "Africa" },
  { id: "san", name: "Santiago", countryIso: "CL", countryName: "Chile", lat: -33.46, lng: -70.65, weight: 0.4, type: "capital", region: "South America" },
  { id: "car", name: "Caracas", countryIso: "VE", countryName: "Venezuela", lat: 10.49, lng: -66.88, weight: 0.28, type: "commodity", region: "South America" },
  { id: "qui", name: "Quito", countryIso: "EC", countryName: "Ecuador", lat: -0.23, lng: -78.52, weight: 0.25, type: "capital", region: "South America" },
  { id: "mon", name: "Montevideo", countryIso: "UY", countryName: "Uruguay", lat: -34.90, lng: -56.19, weight: 0.28, type: "financial", region: "South America" },
  { id: "pam", name: "Panama City", countryIso: "PA", countryName: "Panama", lat: 8.99, lng: -79.52, weight: 0.35, type: "port", region: "North America" },
  { id: "hav", name: "Havana", countryIso: "CU", countryName: "Cuba", lat: 23.13, lng: -82.38, weight: 0.2, type: "capital", region: "North America" },
  { id: "mia", name: "Miami", countryIso: "US", countryName: "United States", lat: 25.77, lng: -80.19, weight: 0.5, type: "financial", region: "North America" },
  { id: "atl", name: "Atlanta", countryIso: "US", countryName: "United States", lat: 33.75, lng: -84.39, weight: 0.4, type: "financial", region: "North America" },
  { id: "dfw", name: "Dallas", countryIso: "US", countryName: "United States", lat: 32.78, lng: -96.80, weight: 0.45, type: "financial", region: "North America" },
  { id: "sea", name: "Seattle", countryIso: "US", countryName: "United States", lat: 47.61, lng: -122.33, weight: 0.45, type: "financial", region: "North America" },
  { id: "bos", name: "Boston", countryIso: "US", countryName: "United States", lat: 42.36, lng: -71.06, weight: 0.5, type: "financial", region: "North America" },
  { id: "hel", name: "Helsinki", countryIso: "FI", countryName: "Finland", lat: 60.17, lng: 24.94, weight: 0.4, type: "capital", region: "Europe" },
  { id: "dub2", name: "Dublin", countryIso: "IE", countryName: "Ireland", lat: 53.33, lng: -6.25, weight: 0.45, type: "financial", region: "Europe" },
  { id: "lis", name: "Lisbon", countryIso: "PT", countryName: "Portugal", lat: 38.72, lng: -9.14, weight: 0.4, type: "capital", region: "Europe" },
  { id: "ath", name: "Athens", countryIso: "GR", countryName: "Greece", lat: 37.98, lng: 23.73, weight: 0.38, type: "capital", region: "Europe" },
  { id: "buc", name: "Bucharest", countryIso: "RO", countryName: "Romania", lat: 44.44, lng: 26.10, weight: 0.35, type: "capital", region: "Europe" },
  { id: "pra", name: "Prague", countryIso: "CZ", countryName: "Czech Republic", lat: 50.07, lng: 14.44, weight: 0.4, type: "financial", region: "Europe" },
  { id: "bud", name: "Budapest", countryIso: "HU", countryName: "Hungary", lat: 47.50, lng: 19.04, weight: 0.38, type: "capital", region: "Europe" },
];

export const CITY_BY_ID = new Map<string, WorldCity>(WORLD_CITIES.map((c) => [c.id, c]));
export const CITY_BY_COUNTRY = new Map<string, WorldCity[]>();
for (const city of WORLD_CITIES) {
  const arr = CITY_BY_COUNTRY.get(city.countryIso) ?? [];
  arr.push(city);
  CITY_BY_COUNTRY.set(city.countryIso, arr);
}
