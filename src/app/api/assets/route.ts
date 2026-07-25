export const runtime = "edge";
import { NextResponse } from "next/server";
import type { AssetItem, AssetsResponse } from "@/lib/globe/globe-types";

const GLOBE_ASSETS: AssetItem[] = [
  // ── White Swan Portfolio ──
  { id: "gld_etf", name: "GLD (Gold ETF)", category: "White Swan Portfolio", iconKey: "gold", tvSource: "NYSE:GLD", symbol: "GLD", lat: 40.7, lng: -74.0, country: "USA", color: "#eab308", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "gc1", name: "Gold Futures (GC1!)", category: "White Swan Portfolio", iconKey: "gold", tvSource: "COMEX:GC1!", symbol: "GC=F", lat: 40.7, lng: -74.0, country: "USA", color: "#f59e0b", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "ym1", name: "Dow Jones Futures (YM1!)", category: "White Swan Portfolio", iconKey: "us", tvSource: "CME_MINI:YM1!", symbol: "YM=F", lat: 41.9, lng: -87.6, country: "USA", color: "#D4AF37", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 41.9, lng: -87.6, label: "Chicago", weight: 1 }] },
  { id: "nq1", name: "Nasdaq Futures (NQ1!)", category: "White Swan Portfolio", iconKey: "us", tvSource: "CME_MINI:NQ1!", symbol: "NQ=F", lat: 40.7, lng: -74.0, country: "USA", color: "#D4AF37", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "ct1", name: "Cotton Futures (CT1!)", category: "White Swan Portfolio", iconKey: "cotton", tvSource: "ICEEUR:CT1!", symbol: "CT=F", lat: 34.0, lng: -81.0, country: "USA", color: "#e5e7eb", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 34.0, lng: -81.0, label: "Southeast USA", weight: 1 }] },
  { id: "ukx", name: "FTSE 100 (UKX)", category: "White Swan Portfolio", iconKey: "gb", tvSource: "ICEEUR:Z1!", symbol: "^FTSE", lat: 51.5, lng: -0.1, country: "UK", color: "#ef4444", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 51.5, lng: -0.1, label: "London", weight: 1 }] },

  // ── Intraday MT ──
  { id: "eurusd_30m", name: "EUR/USD (30M)", category: "Intraday MT", iconKey: "eu", tvSource: "FX:EURUSD", symbol: "EURUSD=X", lat: 50.1, lng: 8.7, country: "Eurozone", color: "#D4AF37", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 50.1, lng: 8.7, label: "Frankfurt", weight: 1 }] },
  { id: "dax_1h", name: "DAX (1H)", category: "Intraday MT", iconKey: "de", tvSource: "EUREX:FDAX1!", symbol: "^GDAXI", lat: 50.1, lng: 8.7, country: "Germany", color: "#f97316", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 50.1, lng: 8.7, label: "Frankfurt", weight: 1 }] },
  { id: "gbpusd_30m", name: "GBP/USD (30M)", category: "Intraday MT", iconKey: "gb", tvSource: "FX:GBPUSD", symbol: "GBPUSD=X", lat: 51.5, lng: -0.1, country: "UK", color: "#D4AF37", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 51.5, lng: -0.1, label: "London", weight: 1 }] },
  { id: "dax_2h", name: "DAX (2H)", category: "Intraday MT", iconKey: "de", tvSource: "EUREX:FDAX1!", symbol: "^GDAXI", lat: 50.1, lng: 8.7, country: "Germany", color: "#fb923c", defaultEnabled: false, showOnGlobe: false, locations: [{ lat: 50.1, lng: 8.7, label: "Frankfurt", weight: 1 }] },

  // ── Core Invest ──
  { id: "qqq", name: "QQQ (Nasdaq ETF)", category: "Core Invest", iconKey: "us", tvSource: "NASDAQ:QQQ", symbol: "QQQ", lat: 40.7, lng: -74.0, country: "USA", color: "#D4AF37", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "gld_ci", name: "GLD (Gold ETF)", category: "Core Invest", iconKey: "gold", tvSource: "NYSE:GLD", symbol: "GLD", lat: 40.7, lng: -74.0, country: "USA", color: "#eab308", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "spmo", name: "SPMO (Momentum ETF)", category: "Core Invest", iconKey: "us", tvSource: "NYSE:SPMO", symbol: "SPMO", lat: 40.7, lng: -74.0, country: "USA", color: "#22c55e", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "spy", name: "SPY (S&P 500 ETF)", category: "Core Invest", iconKey: "us", tvSource: "NYSE:SPY", symbol: "SPY", lat: 40.7, lng: -74.0, country: "USA", color: "#10b981", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "hg1", name: "Copper Futures (HG1!)", category: "Core Invest", iconKey: "copper", tvSource: "COMEX:HG1!", symbol: "HG=F", lat: -33.5, lng: -70.7, country: "Chile", color: "#f97316", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: -33.5, lng: -70.7, label: "Santiago", weight: 1 }] },
  { id: "6s1", name: "Swiss Franc (6S1!)", category: "Core Invest", iconKey: "ch", tvSource: "CME:6S1!", symbol: "CHF=X", lat: 46.9, lng: 7.4, country: "Switzerland", color: "#ec4899", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 46.9, lng: 7.4, label: "Bern", weight: 1 }] },
  { id: "glgg", name: "GLGG (Clean Water ETF)", category: "Core Invest", iconKey: "eu", tvSource: "LSE:GLGG", symbol: "GLGG.L", lat: 53.3, lng: -6.3, country: "Ireland", color: "#D4AF37", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 53.3, lng: -6.3, label: "Dublin", weight: 1 }] },
  { id: "fiw", name: "FIW (Water ETF)", category: "Core Invest", iconKey: "us", tvSource: "NYSE:FIW", symbol: "FIW", lat: 40.7, lng: -74.0, country: "USA", color: "#D4AF37", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },

  // ── Crypto ──
  { id: "btcusd", name: "Bitcoin (BTC/USD)", category: "Crypto", iconKey: "btc", tvSource: "BITSTAMP:BTCUSD", symbol: "BTC-USD", lat: 37.4, lng: -122.1, country: "USA", color: "#f97316", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 37.4, lng: -122.1, label: "San Francisco", weight: 1 }] },
  { id: "ethusd", name: "Ethereum (ETH/USD)", category: "Crypto", iconKey: "eth", tvSource: "BITSTAMP:ETHUSD", symbol: "ETH-USD", lat: 37.4, lng: -122.1, country: "USA", color: "#D4AF37", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 37.4, lng: -122.1, label: "San Francisco", weight: 1 }] },

  // ── Macro ──
  { id: "dxy", name: "DXY (Dollar Index)", category: "Macro", iconKey: "us", tvSource: "TVC:DXY", symbol: "DX-Y.NYB", lat: 40.7, lng: -74.0, country: "USA", color: "#64748b", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
  { id: "vix", name: "VIX (Volatility Index)", category: "Macro", iconKey: "us", tvSource: "CBOE:VIX", symbol: "^VIX", lat: 41.9, lng: -87.6, country: "USA", color: "#dc2626", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 41.9, lng: -87.6, label: "Chicago", weight: 1 }] },
  { id: "tnx", name: "TNX (10Y Treasury)", category: "Macro", iconKey: "us", tvSource: "TVC:TNX", symbol: "^TNX", lat: 38.9, lng: -77.0, country: "USA", color: "#a3e635", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 38.9, lng: -77.0, label: "Washington D.C.", weight: 1 }] },

  // ── Commodities ──
  { id: "crude", name: "Crude Oil (WTI)", category: "Commodities", iconKey: "oil", tvSource: "NYMEX:CL1!", symbol: "CL=F", lat: 26.3, lng: 50.1, country: "Saudi Arabia", color: "#78716c", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 26.3, lng: 50.1, label: "Dhahran", weight: 1 }, { lat: 29.7, lng: -95.4, label: "Houston", weight: 1 }] },
  { id: "brent", name: "Brent Oil", category: "Commodities", iconKey: "oil", tvSource: "ICEEUR:B1!", symbol: "BZ=F", lat: 61.0, lng: 2.0, country: "North Sea", color: "#a8a29e", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 61.0, lng: 2.0, label: "North Sea", weight: 1 }] },
  { id: "natgas", name: "Natural Gas", category: "Commodities", iconKey: "gas", tvSource: "NYMEX:NG1!", symbol: "NG=F", lat: 29.7, lng: -95.4, country: "USA", color: "#D4AF37", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 29.7, lng: -95.4, label: "Henry Hub", weight: 1 }] },
  { id: "silver", name: "Silver", category: "Commodities", iconKey: "silver", tvSource: "COMEX:SI1!", symbol: "SI=F", lat: 40.7, lng: -74.0, country: "USA", color: "#94a3b8", defaultEnabled: true, showOnGlobe: true, locations: [{ lat: 40.7, lng: -74.0, label: "New York", weight: 1 }] },
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
