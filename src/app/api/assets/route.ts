export const runtime = "edge";
import { NextResponse } from "next/server";
import type { AssetItem, AssetsResponse } from "@/lib/globe/globe-types";

const GLOBE_ASSETS: AssetItem[] = [
  // ── Agriculture ──
  { id: "corn", name: "Corn", category: "Agriculture", iconKey: "corn", tvSource: "CBOT:ZC1!", symbol: "ZC1!", lat: 41.9, lng: -87.6, country: "USA", color: "#eab308", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 41.9, lng: -87.6, label: "Chicago", weight: 1 }] },
  { id: "wheat", name: "Wheat", category: "Agriculture", iconKey: "wheat", tvSource: "CBOT:ZW1!", symbol: "ZW1!", lat: 37.7, lng: -97.3, country: "USA", color: "#d97706", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 37.7, lng: -97.3, label: "Kansas City", weight: 1 }] },
  { id: "soybeans", name: "Soybeans", category: "Agriculture", iconKey: "soy", tvSource: "CBOT:ZS1!", symbol: "ZS1!", lat: 41.9, lng: -87.6, country: "USA", color: "#84cc16", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 41.9, lng: -87.6, label: "Chicago", weight: 1 }] },
  { id: "coffee", name: "Coffee", category: "Agriculture", iconKey: "coffee", tvSource: "ICEEUR:KC1!", symbol: "KC1!", lat: -15.8, lng: -47.9, country: "Brazil", color: "#78350f", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: -15.8, lng: -47.9, label: "Brasília", weight: 1 }] },
  { id: "cocoa", name: "Cocoa", category: "Agriculture", iconKey: "cocoa", tvSource: "ICEEUR:CC1!", symbol: "CC1!", lat: 5.4, lng: -4.0, country: "Côte d'Ivoire", color: "#92400e", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 5.4, lng: -4.0, label: "Abidjan", weight: 1 }] },
  { id: "sugar", name: "Sugar", category: "Agriculture", iconKey: "sugar", tvSource: "ICEEUR:SB1!", symbol: "SB1!", lat: -23.5, lng: -46.6, country: "Brazil", color: "#f5f5f4", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: -23.5, lng: -46.6, label: "São Paulo", weight: 1 }] },
  { id: "cotton", name: "Cotton", category: "Agriculture", iconKey: "cotton", tvSource: "ICEEUR:CT1!", symbol: "CT1!", lat: 34.0, lng: -81.0, country: "USA", color: "#e5e7eb", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 34.0, lng: -81.0, label: "Southeast USA", weight: 1 }] },
  { id: "orange_juice", name: "Orange Juice", category: "Agriculture", iconKey: "oj", tvSource: "ICEEUR:OJ1!", symbol: "OJ1!", lat: 27.7, lng: -82.6, country: "USA", color: "#fb923c", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 27.7, lng: -82.6, label: "Florida", weight: 1 }] },

  // ── Metals ──
  { id: "gold", name: "Gold", category: "Metals", iconKey: "gold", tvSource: "COMEX:GC1!", symbol: "GC1!", lat: 40.7, lng: -74.0, country: "USA", color: "#f59e0b", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }, { lat: 51.5, lng: -0.1, label: "London", weight: 1 }] },
  { id: "silver", name: "Silver", category: "Metals", iconKey: "silver", tvSource: "COMEX:SI1!", symbol: "SI1!", lat: 40.7, lng: -74.0, country: "USA", color: "#94a3b8", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "platinum", name: "Platinum", category: "Metals", iconKey: "platinum", tvSource: "NYMEX:PL1!", symbol: "PL1!", lat: -25.7, lng: 28.2, country: "South Africa", color: "#e2e8f0", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: -25.7, lng: 28.2, label: "Pretoria", weight: 1 }] },
  { id: "palladium", name: "Palladium", category: "Metals", iconKey: "palladium", tvSource: "NYMEX:PA1!", symbol: "PA1!", lat: 55.8, lng: 37.6, country: "Russia", color: "#cbd5e1", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 55.8, lng: 37.6, label: "Moscow", weight: 1 }] },
  { id: "copper", name: "Copper", category: "Metals", iconKey: "copper", tvSource: "COMEX:HG1!", symbol: "HG1!", lat: -33.5, lng: -70.7, country: "Chile", color: "#f97316", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: -33.5, lng: -70.7, label: "Santiago", weight: 1 }] },

  // ── Energy ──
  { id: "crude", name: "Crude Oil WTI", category: "Energy", iconKey: "oil", tvSource: "NYMEX:CL1!", symbol: "CL1!", lat: 26.3, lng: 50.1, country: "Saudi Arabia", color: "#78716c", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 26.3, lng: 50.1, label: "Dhahran", weight: 1 }, { lat: 29.7, lng: -95.4, label: "Houston", weight: 1 }] },
  { id: "brent", name: "Brent Oil", category: "Energy", iconKey: "oil", tvSource: "ICEEUR:B1!", symbol: "B1!", lat: 61.0, lng: 2.0, country: "North Sea", color: "#a8a29e", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 61.0, lng: 2.0, label: "North Sea", weight: 1 }] },
  { id: "natgas", name: "Natural Gas", category: "Energy", iconKey: "gas", tvSource: "NYMEX:NG1!", symbol: "NG1!", lat: 29.7, lng: -95.4, country: "USA", color: "#60a5fa", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 29.7, lng: -95.4, label: "Henry Hub", weight: 1 }] },

  // ── Equities ──
  { id: "sp500", name: "S&P 500", category: "Equities", iconKey: "us", tvSource: "CME_MINI:ES1!", symbol: "ES1!", lat: 40.7, lng: -74.0, country: "USA", color: "#22c55e", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "nasdaq", name: "Nasdaq 100", category: "Equities", iconKey: "us", tvSource: "CME_MINI:NQ1!", symbol: "NQ1!", lat: 40.7, lng: -74.0, country: "USA", color: "#3b82f6", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "dax", name: "DAX", category: "Equities", iconKey: "de", tvSource: "EUREX:FDAX1!", symbol: "FDAX1!", lat: 50.1, lng: 8.7, country: "Germany", color: "#f97316", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 50.1, lng: 8.7, label: "Frankfurt", weight: 1 }] },
  { id: "dow", name: "Dow Jones", category: "Equities", iconKey: "us", tvSource: "CME_MINI:YM1!", symbol: "YM1!", lat: 40.7, lng: -74.0, country: "USA", color: "#6366f1", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "ftse", name: "FTSE 100", category: "Equities", iconKey: "gb", tvSource: "ICEEUR:Z1!", symbol: "UKX!", lat: 51.5, lng: -0.1, country: "UK", color: "#ef4444", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 51.5, lng: -0.1, label: "London", weight: 1 }] },

  // ── Major FX ──
  { id: "eurusd", name: "EUR/USD", category: "Major FX", iconKey: "eu", tvSource: "FX:EURUSD", symbol: "EURUSD", lat: 50.1, lng: 8.7, country: "Eurozone", color: "#3b82f6", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 50.1, lng: 8.7, label: "Frankfurt", weight: 1 }] },
  { id: "gbpusd", name: "GBP/USD", category: "Major FX", iconKey: "gb", tvSource: "FX:GBPUSD", symbol: "GBPUSD", lat: 51.5, lng: -0.1, country: "UK", color: "#8b5cf6", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 51.5, lng: -0.1, label: "London", weight: 1 }] },
  { id: "usdchf", name: "USD/CHF", category: "Major FX", iconKey: "ch", tvSource: "FX:USDCHF", symbol: "USDCHF", lat: 46.9, lng: 7.4, country: "Switzerland", color: "#ec4899", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 46.9, lng: 7.4, label: "Bern", weight: 1 }] },
  { id: "usdjpy", name: "USD/JPY", category: "Major FX", iconKey: "jp", tvSource: "FX:USDJPY", symbol: "USDJPY", lat: 35.7, lng: 139.7, country: "Japan", color: "#f59e0b", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 35.7, lng: 139.7, label: "Tokyo", weight: 1 }] },
  { id: "audusd", name: "AUD/USD", category: "Major FX", iconKey: "au", tvSource: "FX:AUDUSD", symbol: "AUDUSD", lat: -33.9, lng: 151.2, country: "Australia", color: "#06b6d4", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: -33.9, lng: 151.2, label: "Sydney", weight: 1 }] },
  { id: "usdcad", name: "USD/CAD", category: "Major FX", iconKey: "ca", tvSource: "FX:USDCAD", symbol: "USDCAD", lat: 43.7, lng: -79.4, country: "Canada", color: "#14b8a6", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 43.7, lng: -79.4, label: "Toronto", weight: 1 }] },

  // ── Crypto ──
  { id: "btcusd", name: "Bitcoin", category: "Crypto", iconKey: "btc", tvSource: "BITSTAMP:BTCUSD", symbol: "BTCUSD", lat: 37.4, lng: -122.1, country: "USA", color: "#f97316", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 37.4, lng: -122.1, label: "San Francisco", weight: 1 }] },
  { id: "ethusd", name: "Ethereum", category: "Crypto", iconKey: "eth", tvSource: "BITSTAMP:ETHUSD", symbol: "ETHUSD", lat: 37.4, lng: -122.1, country: "USA", color: "#818cf8", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 37.4, lng: -122.1, label: "San Francisco", weight: 1 }] },

  // ── Stocks ──
  { id: "aapl", name: "Apple", category: "Stocks", iconKey: "aapl", tvSource: "NASDAQ:AAPL", symbol: "AAPL", lat: 37.3, lng: -122.0, country: "USA", color: "#64748b", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 37.3, lng: -122.0, label: "Cupertino", weight: 1 }] },
  { id: "msft", name: "Microsoft", category: "Stocks", iconKey: "msft", tvSource: "NASDAQ:MSFT", symbol: "MSFT", lat: 47.6, lng: -122.1, country: "USA", color: "#3b82f6", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 47.6, lng: -122.1, label: "Redmond", weight: 1 }] },
  { id: "nvda", name: "NVIDIA", category: "Stocks", iconKey: "nvda", tvSource: "NASDAQ:NVDA", symbol: "NVDA", lat: 37.4, lng: -122.0, country: "USA", color: "#22c55e", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 37.4, lng: -122.0, label: "Santa Clara", weight: 1 }] },
  { id: "meta", name: "Meta", category: "Stocks", iconKey: "meta", tvSource: "NASDAQ:META", symbol: "META", lat: 37.5, lng: -122.2, country: "USA", color: "#3b82f6", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 37.5, lng: -122.2, label: "Menlo Park", weight: 1 }] },
  { id: "amzn", name: "Amazon", category: "Stocks", iconKey: "amzn", tvSource: "NASDAQ:AMZN", symbol: "AMZN", lat: 47.6, lng: -122.3, country: "USA", color: "#f97316", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 47.6, lng: -122.3, label: "Seattle", weight: 1 }] },
  { id: "googl", name: "Alphabet", category: "Stocks", iconKey: "googl", tvSource: "NASDAQ:GOOGL", symbol: "GOOGL", lat: 37.4, lng: -122.1, country: "USA", color: "#4ade80", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 37.4, lng: -122.1, label: "Mountain View", weight: 1 }] },

  // ── Bonds ──
  { id: "us10y", name: "US 10Y Treasury", category: "Bonds", iconKey: "us", tvSource: "CBOT:ZN1!", symbol: "ZN1!", lat: 38.9, lng: -77.0, country: "USA", color: "#a3e635", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 38.9, lng: -77.0, label: "Washington D.C.", weight: 1 }] },
];

export async function GET() {
  const response: AssetsResponse = {
    updatedAt: new Date().toISOString(),
    count: GLOBE_ASSETS.length,
    items: GLOBE_ASSETS,
  };
  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
