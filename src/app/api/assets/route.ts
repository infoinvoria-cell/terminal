import { NextResponse } from "next/server";
import type { AssetItem, AssetsResponse } from "@/lib/globe/globe-types";

const GLOBE_ASSETS: AssetItem[] = [
  // ── Major FX ──
  { id: "eurusd", name: "EUR/USD", category: "Major FX", iconKey: "eu", tvSource: "FX:EURUSD", symbol: "EURUSD", lat: 50.1, lng: 8.7, country: "Eurozone", color: "#3b82f6", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 50.1, lng: 8.7, label: "Frankfurt", weight: 1 }] },
  { id: "gbpusd", name: "GBP/USD", category: "Major FX", iconKey: "gb", tvSource: "FX:GBPUSD", symbol: "GBPUSD", lat: 51.5, lng: -0.1, country: "UK", color: "#3b82f6", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 51.5, lng: -0.1, label: "London", weight: 1 }] },
  { id: "usdjpy", name: "USD/JPY", category: "Major FX", iconKey: "jp", tvSource: "FX:USDJPY", symbol: "USDJPY", lat: 35.7, lng: 139.7, country: "Japan", color: "#3b82f6", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 35.7, lng: 139.7, label: "Tokyo", weight: 1 }] },
  { id: "usdchf", name: "USD/CHF", category: "Major FX", iconKey: "ch", tvSource: "FX:USDCHF", symbol: "USDCHF", lat: 46.9, lng: 7.4, country: "Switzerland", color: "#3b82f6", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 46.9, lng: 7.4, label: "Bern", weight: 1 }] },
  { id: "audusd", name: "AUD/USD", category: "Major FX", iconKey: "au", tvSource: "FX:AUDUSD", symbol: "AUDUSD", lat: -33.9, lng: 151.2, country: "Australia", color: "#3b82f6", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: -33.9, lng: 151.2, label: "Sydney", weight: 1 }] },
  { id: "usdcad", name: "USD/CAD", category: "Major FX", iconKey: "ca", tvSource: "FX:USDCAD", symbol: "USDCAD", lat: 43.7, lng: -79.4, country: "Canada", color: "#3b82f6", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 43.7, lng: -79.4, label: "Toronto", weight: 1 }] },
  { id: "nzdusd", name: "NZD/USD", category: "Major FX", iconKey: "nz", tvSource: "FX:NZDUSD", symbol: "NZDUSD", lat: -36.9, lng: 174.8, country: "New Zealand", color: "#3b82f6", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: -36.9, lng: 174.8, label: "Auckland", weight: 1 }] },

  // ── FX ──
  { id: "eurgbp", name: "EUR/GBP", category: "FX", iconKey: "eu", tvSource: "FX:EURGBP", symbol: "EURGBP", lat: 50.1, lng: 8.7, country: "Eurozone", color: "#6366f1", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "eurjpy", name: "EUR/JPY", category: "FX", iconKey: "eu", tvSource: "FX:EURJPY", symbol: "EURJPY", lat: 50.1, lng: 8.7, country: "Eurozone", color: "#6366f1", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "eurchf", name: "EUR/CHF", category: "FX", iconKey: "eu", tvSource: "FX:EURCHF", symbol: "EURCHF", lat: 50.1, lng: 8.7, country: "Eurozone", color: "#6366f1", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "gbpjpy", name: "GBP/JPY", category: "FX", iconKey: "gb", tvSource: "FX:GBPJPY", symbol: "GBPJPY", lat: 51.5, lng: -0.1, country: "UK", color: "#6366f1", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "usdsgd", name: "USD/SGD", category: "FX", iconKey: "sg", tvSource: "FX:USDSGD", symbol: "USDSGD", lat: 1.3, lng: 103.8, country: "Singapore", color: "#6366f1", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 1.3, lng: 103.8, label: "Singapore", weight: 1 }] },
  { id: "usdhkd", name: "USD/HKD", category: "FX", iconKey: "hk", tvSource: "FX:USDHKD", symbol: "USDHKD", lat: 22.3, lng: 114.2, country: "Hong Kong", color: "#6366f1", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 22.3, lng: 114.2, label: "Hong Kong", weight: 1 }] },
  { id: "usdcnh", name: "USD/CNH", category: "FX", iconKey: "cn", tvSource: "FX:USDCNH", symbol: "USDCNH", lat: 31.2, lng: 121.5, country: "China", color: "#6366f1", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 31.2, lng: 121.5, label: "Shanghai", weight: 1 }] },
  { id: "usdmxn", name: "USD/MXN", category: "FX", iconKey: "mx", tvSource: "FX:USDMXN", symbol: "USDMXN", lat: 19.4, lng: -99.1, country: "Mexico", color: "#6366f1", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 19.4, lng: -99.1, label: "Mexico City", weight: 1 }] },
  { id: "usdzar", name: "USD/ZAR", category: "FX", iconKey: "za", tvSource: "FX:USDZAR", symbol: "USDZAR", lat: -26.2, lng: 28.0, country: "South Africa", color: "#6366f1", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: -26.2, lng: 28.0, label: "Johannesburg", weight: 1 }] },

  // ── Metals ──
  { id: "gold", name: "Gold", category: "Metals", iconKey: "gold", tvSource: "COMEX:GC1!", symbol: "GC1!", lat: 40.7, lng: -74.0, country: "USA", color: "#f59e0b", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }, { lat: 51.5, lng: -0.1, label: "London", weight: 1 }] },
  { id: "silver", name: "Silver", category: "Metals", iconKey: "silver", tvSource: "COMEX:SI1!", symbol: "SI1!", lat: 40.7, lng: -74.0, country: "USA", color: "#94a3b8", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "platinum", name: "Platinum", category: "Metals", iconKey: "platinum", tvSource: "NYMEX:PL1!", symbol: "PL1!", lat: -25.7, lng: 28.2, country: "South Africa", color: "#e2e8f0", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: -25.7, lng: 28.2, label: "Pretoria", weight: 1 }] },
  { id: "palladium", name: "Palladium", category: "Metals", iconKey: "palladium", tvSource: "NYMEX:PA1!", symbol: "PA1!", lat: 55.8, lng: 37.6, country: "Russia", color: "#cbd5e1", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 55.8, lng: 37.6, label: "Moscow", weight: 1 }] },
  { id: "copper", name: "Copper", category: "Metals", iconKey: "copper", tvSource: "COMEX:HG1!", symbol: "HG1!", lat: -33.5, lng: -70.7, country: "Chile", color: "#f97316", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: -33.5, lng: -70.7, label: "Santiago", weight: 1 }] },

  // ── Energy ──
  { id: "crude", name: "Crude Oil", category: "Energy", iconKey: "oil", tvSource: "NYMEX:CL1!", symbol: "CL1!", lat: 26.3, lng: 50.1, country: "Saudi Arabia", color: "#78716c", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 26.3, lng: 50.1, label: "Dhahran", weight: 1 }, { lat: 29.7, lng: -95.4, label: "Houston", weight: 1 }] },
  { id: "brent", name: "Brent Oil", category: "Energy", iconKey: "oil", tvSource: "ICEEUR:B1!", symbol: "B1!", lat: 61.0, lng: 2.0, country: "North Sea", color: "#78716c", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 61.0, lng: 2.0, label: "North Sea", weight: 1 }] },
  { id: "natgas", name: "Natural Gas", category: "Energy", iconKey: "gas", tvSource: "NYMEX:NG1!", symbol: "NG1!", lat: 29.7, lng: -95.4, country: "USA", color: "#60a5fa", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 29.7, lng: -95.4, label: "Henry Hub", weight: 1 }] },
  { id: "heating_oil", name: "Heating Oil", category: "Energy", iconKey: "oil", tvSource: "NYMEX:HO1!", symbol: "HO1!", lat: 40.7, lng: -74.0, country: "USA", color: "#78716c", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "gasoline", name: "Gasoline RBOB", category: "Energy", iconKey: "oil", tvSource: "NYMEX:RB1!", symbol: "RB1!", lat: 29.7, lng: -95.4, country: "USA", color: "#78716c", defaultEnabled: false, showOnGlobe: false, locations: [] },

  // ── Agriculture ──
  { id: "corn", name: "Corn", category: "Agriculture", iconKey: "corn", tvSource: "CBOT:ZC1!", symbol: "ZC1!", lat: 41.9, lng: -87.6, country: "USA", color: "#eab308", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 41.9, lng: -87.6, label: "Chicago", weight: 1 }] },
  { id: "wheat", name: "Wheat", category: "Agriculture", iconKey: "wheat", tvSource: "CBOT:ZW1!", symbol: "ZW1!", lat: 37.7, lng: -97.3, country: "USA", color: "#d97706", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 37.7, lng: -97.3, label: "Kansas City", weight: 1 }] },
  { id: "soybeans", name: "Soybeans", category: "Agriculture", iconKey: "soy", tvSource: "CBOT:ZS1!", symbol: "ZS1!", lat: 41.9, lng: -87.6, country: "USA", color: "#84cc16", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 41.9, lng: -87.6, label: "Chicago", weight: 1 }] },
  { id: "soybean_oil", name: "Soybean Oil", category: "Agriculture", iconKey: "soy", tvSource: "CBOT:ZL1!", symbol: "ZL1!", lat: 41.9, lng: -87.6, country: "USA", color: "#a3e635", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "rice", name: "Rough Rice", category: "Agriculture", iconKey: "rice", tvSource: "CBOT:ZR1!", symbol: "ZR1!", lat: 16.0, lng: 108.0, country: "Vietnam", color: "#bef264", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 16.0, lng: 108.0, label: "Da Nang", weight: 1 }] },

  // ── Softs ──
  { id: "cocoa", name: "Cocoa", category: "Softs", iconKey: "cocoa", tvSource: "ICEEUR:CC1!", symbol: "CC1!", lat: 5.4, lng: -4.0, country: "Côte d'Ivoire", color: "#92400e", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 5.4, lng: -4.0, label: "Abidjan", weight: 1 }] },
  { id: "coffee", name: "Coffee", category: "Softs", iconKey: "coffee", tvSource: "ICEEUR:KC1!", symbol: "KC1!", lat: -15.8, lng: -47.9, country: "Brazil", color: "#78350f", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: -15.8, lng: -47.9, label: "Brasília", weight: 1 }] },
  { id: "sugar", name: "Sugar #11", category: "Softs", iconKey: "sugar", tvSource: "ICEEUR:SB1!", symbol: "SB1!", lat: -23.5, lng: -46.6, country: "Brazil", color: "#f5f5f4", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: -23.5, lng: -46.6, label: "São Paulo", weight: 1 }] },
  { id: "cotton", name: "Cotton", category: "Softs", iconKey: "cotton", tvSource: "ICEEUR:CT1!", symbol: "CT1!", lat: 34.0, lng: -81.0, country: "USA", color: "#e5e7eb", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "orange_juice", name: "Orange Juice", category: "Softs", iconKey: "oj", tvSource: "ICEEUR:OJ1!", symbol: "OJ1!", lat: 27.7, lng: -82.6, country: "USA", color: "#fb923c", defaultEnabled: false, showOnGlobe: false, locations: [] },

  // ── Crypto ──
  { id: "btcusd", name: "Bitcoin", category: "Crypto", iconKey: "btc", tvSource: "BITSTAMP:BTCUSD", symbol: "BTCUSD", lat: 37.4, lng: -122.1, country: "USA", color: "#f97316", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 37.4, lng: -122.1, label: "San Francisco", weight: 1 }] },
  { id: "ethusd", name: "Ethereum", category: "Crypto", iconKey: "eth", tvSource: "BITSTAMP:ETHUSD", symbol: "ETHUSD", lat: 37.4, lng: -122.1, country: "USA", color: "#818cf8", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 37.4, lng: -122.1, label: "San Francisco", weight: 1 }] },
  { id: "solusd", name: "Solana", category: "Crypto", iconKey: "sol", tvSource: "COINBASE:SOLUSD", symbol: "SOLUSD", lat: 37.4, lng: -122.1, country: "USA", color: "#8b5cf6", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "xrpusd", name: "XRP", category: "Crypto", iconKey: "xrp", tvSource: "BITSTAMP:XRPUSD", symbol: "XRPUSD", lat: 37.4, lng: -122.1, country: "USA", color: "#06b6d4", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "bnbusd", name: "BNB", category: "Crypto", iconKey: "bnb", tvSource: "BINANCE:BNBUSDT", symbol: "BNBUSDT", lat: 1.3, lng: 103.8, country: "Singapore", color: "#fbbf24", defaultEnabled: false, showOnGlobe: false, locations: [] },

  // ── Equities ──
  { id: "sp500", name: "S&P 500", category: "Equities", iconKey: "us", tvSource: "CME_MINI:ES1!", symbol: "ES1!", lat: 40.7, lng: -74.0, country: "USA", color: "#22c55e", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "nasdaq", name: "Nasdaq 100", category: "Equities", iconKey: "us", tvSource: "CME_MINI:NQ1!", symbol: "NQ1!", lat: 40.7, lng: -74.0, country: "USA", color: "#3b82f6", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "dow", name: "Dow Jones", category: "Equities", iconKey: "us", tvSource: "CME_MINI:YM1!", symbol: "YM1!", lat: 40.7, lng: -74.0, country: "USA", color: "#6366f1", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "dax", name: "DAX", category: "Equities", iconKey: "de", tvSource: "EUREX:FDAX1!", symbol: "FDAX1!", lat: 50.1, lng: 8.7, country: "Germany", color: "#f97316", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 50.1, lng: 8.7, label: "Frankfurt", weight: 1 }] },
  { id: "ftse", name: "FTSE 100", category: "Equities", iconKey: "gb", tvSource: "ICEEUR:Z1!", symbol: "Z1!", lat: 51.5, lng: -0.1, country: "UK", color: "#ef4444", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 51.5, lng: -0.1, label: "London", weight: 1 }] },
  { id: "nikkei", name: "Nikkei 225", category: "Equities", iconKey: "jp", tvSource: "OSE:NK1!", symbol: "NK1!", lat: 35.7, lng: 139.7, country: "Japan", color: "#ef4444", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 35.7, lng: 139.7, label: "Tokyo", weight: 1 }] },
  { id: "sse", name: "Shanghai Comp.", category: "Equities", iconKey: "cn", tvSource: "SSE:000001", symbol: "000001", lat: 31.2, lng: 121.5, country: "China", color: "#ef4444", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 31.2, lng: 121.5, label: "Shanghai", weight: 1 }] },
  { id: "hangseng", name: "Hang Seng", category: "Equities", iconKey: "hk", tvSource: "HKEX:HSI", symbol: "HSI", lat: 22.3, lng: 114.2, country: "Hong Kong", color: "#ef4444", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 22.3, lng: 114.2, label: "Hong Kong", weight: 1 }] },

  // ── Bonds ──
  { id: "us10y", name: "US 10Y Treasury", category: "Bonds", iconKey: "us", tvSource: "CBOT:ZN1!", symbol: "ZN1!", lat: 38.9, lng: -77.0, country: "USA", color: "#a3e635", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 38.9, lng: -77.0, label: "Washington D.C.", weight: 1 }] },
  { id: "us2y", name: "US 2Y Treasury", category: "Bonds", iconKey: "us", tvSource: "CBOT:ZT1!", symbol: "ZT1!", lat: 38.9, lng: -77.0, country: "USA", color: "#86efac", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "us30y", name: "US 30Y Treasury", category: "Bonds", iconKey: "us", tvSource: "CBOT:ZB1!", symbol: "ZB1!", lat: 38.9, lng: -77.0, country: "USA", color: "#4ade80", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "bund", name: "German Bund", category: "Bonds", iconKey: "de", tvSource: "EUREX:FGBL1!", symbol: "FGBL1!", lat: 50.1, lng: 8.7, country: "Germany", color: "#fbbf24", defaultEnabled: false, showOnGlobe: false, locations: [] },

  // ── Livestock ──
  { id: "live_cattle", name: "Live Cattle", category: "Livestock", iconKey: "cattle", tvSource: "CME:LE1!", symbol: "LE1!", lat: 41.9, lng: -87.6, country: "USA", color: "#dc2626", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "lean_hogs", name: "Lean Hogs", category: "Livestock", iconKey: "hog", tvSource: "CME:HE1!", symbol: "HE1!", lat: 41.9, lng: -87.6, country: "USA", color: "#f87171", defaultEnabled: false, showOnGlobe: false, locations: [] },
  { id: "feeder_cattle", name: "Feeder Cattle", category: "Livestock", iconKey: "cattle", tvSource: "CME:GF1!", symbol: "GF1!", lat: 35.5, lng: -97.5, country: "USA", color: "#fca5a5", defaultEnabled: false, showOnGlobe: false, locations: [] },

  // ── Stocks ──
  { id: "aapl", name: "Apple", category: "Stocks", iconKey: "aapl", tvSource: "NASDAQ:AAPL", symbol: "AAPL", lat: 37.3, lng: -122.0, country: "USA", color: "#64748b", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 37.3, lng: -122.0, label: "Cupertino", weight: 1 }] },
  { id: "nvda", name: "NVIDIA", category: "Stocks", iconKey: "nvda", tvSource: "NASDAQ:NVDA", symbol: "NVDA", lat: 37.4, lng: -122.0, country: "USA", color: "#22c55e", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 37.4, lng: -122.0, label: "Santa Clara", weight: 1 }] },
  { id: "msft", name: "Microsoft", category: "Stocks", iconKey: "msft", tvSource: "NASDAQ:MSFT", symbol: "MSFT", lat: 47.6, lng: -122.1, country: "USA", color: "#3b82f6", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 47.6, lng: -122.1, label: "Redmond", weight: 1 }] },
  { id: "tsla", name: "Tesla", category: "Stocks", iconKey: "tsla", tvSource: "NASDAQ:TSLA", symbol: "TSLA", lat: 30.2, lng: -97.7, country: "USA", color: "#ef4444", defaultEnabled: false, showOnGlobe: true, locations: [{ lat: 30.2, lng: -97.7, label: "Austin", weight: 1 }] },
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
