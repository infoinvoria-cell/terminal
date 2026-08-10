import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import type { SignalCardModel, SignalCardDirection } from "@/lib/signals/signal-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STRATEGIES_DIR = path.join(process.cwd(), "public", "generated", "monitoring", "strategies");

type EvFile = {
  symbol?: string;
  tvSymbol?: string;
  strategyName?: string;
  status?: string;
  openTrade?: boolean | Record<string, unknown> | null;
  events?: Array<{ type?: string; time?: string; price?: number; entry?: number; sl?: number; tp?: number }>;
  trades?: unknown[];
};

// Which file to use per symbol — prefer v2 / specific
const PREFERRED_FILES: Record<string, string> = {
  "ZC1!":    "CBOT_ZC1_v2_events.json",
  "ZW1!":    "CBOT_ZW1_v2_events.json",
  "ZS1!":    "CBOT_ZS1_v2_events.json",
  "CC1!":    "ICEUS_CC1_v2_events.json",
  "KC1!":    "ICEUS_KC1_v2_events.json",
  "OJ1!":    "ICEUS_OJ1_v2_events.json",
  "SB1!":    "ICEUS_SB1_v2_events.json",
  "CT1!":    "ICEUS_CT1_v2_events.json",
  "GC1!":    "COMEX_GC1_events.json",
  "SI1!":    "COMEX_SI1_events.json",
  "HG1!":    "COMEX_HG1_events.json",
  "PA1!":    "NYMEX_PA1_events.json",
  "PL1!":    "NYMEX_PL1_events.json",
  "CL1!":    "NYMEX_CL1_events.json",
  "NG1!":    "NYMEX_NG1_events.json",
  "YM1!":    "CBOT_MINI_YM1_events.json",
  "ES1!":    "CME_MINI_ES1_events.json",
  "NQ1!":    "CME_MINI_NQ1_events.json",
  "FDAX1!":  "EUREX_FDAX1_events.json",
  "UKX!":    "TVC_UKX_events.json",
  "EURGBP":  "VANTAGE_EURGBP_events.json",
  "GBPJPY":  "VANTAGE_GBPJPY_events.json",
  "MXNUSD":  "FX_IDC_MXNUSD_events.json",
  "NOKUSD":  "CME_NOK1_events.json",
  "CLPUSD":  "FX_IDC_CLPUSD_events.json",
  "SEKUSD":  "FX_IDC_SEKUSD_events.json",
  "BRLUSD":  "FX_IDC_BRLUSD_events.json",
  "ZARUSD":  "FX_IDC_ZARUSD_events.json",
  "6S1!":    "CME_6S1_events.json",
  "GLD":     "ARCA_GLD_thursday_long_events.json",
  "QQQ":     "BATS_QQQ_pine1_events.json",
  "AAPL":    "NASDAQ_AAPL_events.json",
  "AMZN":    "NASDAQ_AMZN_events.json",
  "GOOGL":   "NASDAQ_GOOGL_events.json",
  "META":    "NASDAQ_META_events.json",
  "MSFT":    "NASDAQ_MSFT_events.json",
  "NVDA":    "NASDAQ_NVDA_events.json",
};

// Symbol → human-readable name
const ASSET_NAMES: Record<string, string> = {
  "ZC1!": "Corn", "ZW1!": "Wheat", "ZS1!": "Soybeans",
  "CC1!": "Cocoa", "KC1!": "Coffee", "OJ1!": "Orange Juice",
  "SB1!": "Sugar", "CT1!": "Cotton",
  "GC1!": "Gold", "SI1!": "Silver", "HG1!": "Copper",
  "PA1!": "Palladium", "PL1!": "Platinum",
  "CL1!": "Crude Oil", "NG1!": "Nat Gas", "RB1!": "Gasoline",
  "YM1!": "Dow Jones", "ES1!": "S&P 500", "NQ1!": "Nasdaq 100",
  "FDAX1!": "DAX", "UKX!": "FTSE 100",
  "EURGBP": "EUR/GBP", "GBPJPY": "GBP/JPY",
  "MXNUSD": "MXN/USD", "NOKUSD": "NOK/USD",
  "CLPUSD": "CLP/USD", "SEKUSD": "SEK/USD",
  "BRLUSD": "BRL/USD", "ZARUSD": "ZAR/USD",
  "6S1!": "CHF Futures", "GLD": "Gold ETF",
  "QQQ": "QQQ ETF", "SPY": "SPY ETF",
  "AAPL": "Apple", "AMZN": "Amazon",
  "GOOGL": "Alphabet", "META": "Meta",
  "MSFT": "Microsoft", "NVDA": "NVIDIA",
};

// Symbol → group
const CORE_INVEST_SYMS = new Set(["QQQ", "SPY", "AAPL", "AMZN", "GOOGL", "META", "MSFT", "NVDA", "GLD", "NAS100USD"]);

function getGroup(sym: string): "white_swan" | "core_invest" {
  return CORE_INVEST_SYMS.has(sym) ? "core_invest" : "white_swan";
}

function getCategory(sym: string): SignalCardModel["category"] {
  if (["CC1!", "KC1!", "OJ1!", "SB1!", "CT1!", "ZC1!", "ZW1!", "ZS1!"].includes(sym)) return "seasonal";
  if (["CL1!", "NG1!", "RB1!"].includes(sym)) return "seasonal";
  if (["EURGBP", "GBPJPY", "MXNUSD", "NOKUSD", "CLPUSD", "SEKUSD", "BRLUSD", "ZARUSD", "6S1!"].includes(sym)) return "macro";
  if (["YM1!", "ES1!", "NQ1!", "FDAX1!", "UKX!"].includes(sym)) return "macro";
  if (CORE_INVEST_SYMS.has(sym)) return "valuation";
  return "seasonal";
}

function resolveDirection(ev: EvFile): SignalCardDirection {
  const openTrade = ev.openTrade;
  if (!openTrade) {
    // No open trade — check last event for recent direction context
    const events = ev.events ?? [];
    for (let i = events.length - 1; i >= 0; i--) {
      const t = events[i].type ?? "";
      if (t.includes("long")) return "LONG";
      if (t.includes("short")) return "SHORT";
    }
    return "NONE";
  }
  // openTrade is truthy (either bool true or an object)
  const events = ev.events ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    const t = events[i].type ?? "";
    if (t.includes("entry")) {
      if (t.includes("long")) return "LONG";
      if (t.includes("short")) return "SHORT";
    }
  }
  return "LONG"; // default for open trade
}

function resolveSignalState(ev: EvFile): "ACTIVE" | "NONE" {
  return ev.openTrade ? "ACTIVE" : "NONE";
}

function lastEventDate(ev: EvFile): string | undefined {
  const events = ev.events ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].time) return events[i].time;
  }
  return undefined;
}

function loadEventsFile(filename: string): EvFile | null {
  const fp = path.join(STRATEGIES_DIR, filename);
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf8")) as EvFile;
  } catch {
    return null;
  }
}

export async function GET() {
  const cards: SignalCardModel[] = [];

  for (const [sym, filename] of Object.entries(PREFERRED_FILES)) {
    const ev = loadEventsFile(filename);
    if (!ev) continue;

    const direction = resolveDirection(ev);
    const signalState = resolveSignalState(ev);
    const signalDate = lastEventDate(ev);
    const group = getGroup(sym);
    const category = getCategory(sym);
    const name = ASSET_NAMES[sym] ?? sym;
    const strategyName = ev.strategyName ?? `${name} Strategy`;

    const card: SignalCardModel = {
      id: `ws-${sym.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`,
      group,
      category,
      assetSymbol: sym,
      displaySymbol: sym,
      assetName: name,
      iconKey: sym.replace(/!/g, "").toLowerCase(),
      strategyName,
      strategyId: `ws_${sym.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`,
      direction,
      status: signalState === "ACTIVE" ? "OPEN" : "CLOSED",
      signalDate,
      dataStatus: ev.events?.length ? "ok" : "missing",
      signalState,
      monitoringTarget: {
        tab: "agrar",
        asset: sym,
      },
    };

    cards.push(card);
  }

  // Sort: ACTIVE first, then by last signal date descending
  cards.sort((a, b) => {
    const aActive = a.signalState === "ACTIVE" ? 0 : 1;
    const bActive = b.signalState === "ACTIVE" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const aDate = a.signalDate ?? "";
    const bDate = b.signalDate ?? "";
    return bDate.localeCompare(aDate);
  });

  return NextResponse.json({ cards, count: cards.length });
}
