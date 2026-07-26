export interface WorldPort {
  id: string;
  name: string;
  countryIso: string;
  lat: number;
  lng: number;
  type: "mega" | "major" | "regional";
  teu?: number; // annual TEU capacity (millions)
}

export const WORLD_PORTS: WorldPort[] = [
  // ── Asia Pacific Mega Ports ──────────────────────────────────────
  { id: "p-sha", name: "Shanghai", countryIso: "CN", lat: 31.22, lng: 121.65, type: "mega", teu: 47 },
  { id: "p-sin", name: "Singapore", countryIso: "SG", lat: 1.26, lng: 103.82, type: "mega", teu: 37 },
  { id: "p-nsb", name: "Ningbo-Zhoushan", countryIso: "CN", lat: 29.87, lng: 121.55, type: "mega", teu: 33 },
  { id: "p-szx", name: "Shenzhen", countryIso: "CN", lat: 22.52, lng: 113.90, type: "mega", teu: 29 },
  { id: "p-gzh", name: "Guangzhou", countryIso: "CN", lat: 23.08, lng: 113.26, type: "mega", teu: 25 },
  { id: "p-qin", name: "Qingdao", countryIso: "CN", lat: 36.07, lng: 120.33, type: "mega", teu: 22 },
  { id: "p-bus", name: "Busan", countryIso: "KR", lat: 35.10, lng: 129.04, type: "mega", teu: 22 },
  { id: "p-hkg", name: "Hong Kong", countryIso: "HK", lat: 22.29, lng: 114.17, type: "mega", teu: 18 },
  { id: "p-tia", name: "Tianjin", countryIso: "CN", lat: 38.99, lng: 117.72, type: "major", teu: 21 },
  { id: "p-xia", name: "Xiamen", countryIso: "CN", lat: 24.48, lng: 118.07, type: "major", teu: 12 },
  { id: "p-pks", name: "Port Klang", countryIso: "MY", lat: 3.00, lng: 101.40, type: "major", teu: 13 },
  { id: "p-tpe", name: "Kaohsiung", countryIso: "TW", lat: 22.62, lng: 120.27, type: "major", teu: 10 },
  { id: "p-tok", name: "Tokyo", countryIso: "JP", lat: 35.63, lng: 139.78, type: "major", teu: 4 },
  { id: "p-osa", name: "Osaka/Kobe", countryIso: "JP", lat: 34.68, lng: 135.20, type: "major", teu: 3 },
  { id: "p-jak", name: "Tanjung Priok (Jakarta)", countryIso: "ID", lat: -6.10, lng: 106.88, type: "major", teu: 6 },
  { id: "p-syd", name: "Sydney", countryIso: "AU", lat: -33.86, lng: 151.22, type: "regional", teu: 3 },

  // ── Europe ───────────────────────────────────────────────────────
  { id: "p-rot", name: "Rotterdam", countryIso: "NL", lat: 51.92, lng: 4.48, type: "mega", teu: 15 },
  { id: "p-ant", name: "Antwerp-Bruges", countryIso: "BE", lat: 51.23, lng: 4.42, type: "mega", teu: 12 },
  { id: "p-ham", name: "Hamburg", countryIso: "DE", lat: 53.54, lng: 9.99, type: "major", teu: 9 },
  { id: "p-bre", name: "Bremen/Bremerhaven", countryIso: "DE", lat: 53.57, lng: 8.57, type: "major", teu: 5 },
  { id: "p-fel", name: "Felixstowe", countryIso: "GB", lat: 51.96, lng: 1.35, type: "major", teu: 4 },
  { id: "p-val", name: "Valencia", countryIso: "ES", lat: 39.43, lng: -0.33, type: "major", teu: 5 },
  { id: "p-pir", name: "Piraeus", countryIso: "GR", lat: 37.94, lng: 23.63, type: "major", teu: 5 },
  { id: "p-gen", name: "Genoa", countryIso: "IT", lat: 44.41, lng: 8.93, type: "major", teu: 2 },
  { id: "p-bar", name: "Barcelona", countryIso: "ES", lat: 41.35, lng: 2.17, type: "major", teu: 4 },
  { id: "p-gdansk", name: "Gdańsk", countryIso: "PL", lat: 54.41, lng: 18.66, type: "regional", teu: 2 },

  // ── Americas ─────────────────────────────────────────────────────
  { id: "p-lax", name: "Los Angeles/Long Beach", countryIso: "US", lat: 33.74, lng: -118.26, type: "mega", teu: 20 },
  { id: "p-nyc", name: "New York/New Jersey", countryIso: "US", lat: 40.67, lng: -74.08, type: "major", teu: 9 },
  { id: "p-sav", name: "Savannah", countryIso: "US", lat: 32.08, lng: -81.09, type: "major", teu: 5 },
  { id: "p-sea", name: "Seattle/Tacoma", countryIso: "US", lat: 47.56, lng: -122.33, type: "major", teu: 4 },
  { id: "p-hou", name: "Houston", countryIso: "US", lat: 29.74, lng: -95.27, type: "major", teu: 2 },
  { id: "p-mia", name: "Miami", countryIso: "US", lat: 25.77, lng: -80.13, type: "major", teu: 1 },
  { id: "p-van", name: "Vancouver", countryIso: "CA", lat: 49.29, lng: -123.11, type: "major", teu: 4 },
  { id: "p-col", name: "Colón (Panama)", countryIso: "PA", lat: 9.36, lng: -79.90, type: "major", teu: 5 },
  { id: "p-sao", name: "Santos", countryIso: "BR", lat: -23.96, lng: -46.33, type: "major", teu: 4 },
  { id: "p-bue", name: "Buenos Aires", countryIso: "AR", lat: -34.60, lng: -58.37, type: "regional", teu: 2 },

  // ── Middle East / Africa ─────────────────────────────────────────
  { id: "p-jea", name: "Jebel Ali (Dubai)", countryIso: "AE", lat: 24.99, lng: 55.07, type: "mega", teu: 14 },
  { id: "p-abd", name: "Abu Dhabi (Khalifa)", countryIso: "AE", lat: 24.80, lng: 54.64, type: "major", teu: 2 },
  { id: "p-djb", name: "Djibouti", countryIso: "DJ", lat: 11.59, lng: 43.14, type: "major", teu: 1 },
  { id: "p-mom", name: "Mombasa", countryIso: "KE", lat: -4.04, lng: 39.67, type: "regional", teu: 1 },
  { id: "p-dur", name: "Durban", countryIso: "ZA", lat: -29.87, lng: 31.03, type: "major", teu: 3 },
  { id: "p-lag", name: "Lagos (Apapa)", countryIso: "NG", lat: 6.45, lng: 3.38, type: "regional", teu: 1 },
  { id: "p-ale", name: "Alexandria", countryIso: "EG", lat: 31.20, lng: 29.88, type: "regional", teu: 1 },
  { id: "p-dam", name: "Dammam", countryIso: "SA", lat: 26.43, lng: 50.10, type: "major", teu: 2 },
];
