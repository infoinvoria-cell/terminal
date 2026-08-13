// Builds Signal-page cards for the 3 intraday MT strategies (DAX 2H, DAX 1H,
// Euro 30M). Current state is read from engine_state/*.json (production runtime
// state written by the Python engine). Trade history comes from OANDA event
// files. Both are read at request time — Python engine updates are picked up
// on every Next.js server render without a rebuild.
import fs from "node:fs";
import path from "node:path";
import type { SignalCardModel, SignalCardStatus, SignalCardDirection, SignalCardPreview } from "@/lib/signals/signal-types";
import type { MonitoringPrimaryTabId } from "@/config/monitoringTabConfig";

const STRATEGIES_ROOT = path.join(process.cwd(), "public", "generated", "monitoring", "strategies");
const ENGINE_STATE_ROOT = path.join(process.cwd(), "public", "generated", "monitoring", "engine_state");

// —— Validated KPIs (static — from committed research, not recomputed) ———————

const VALIDATED_KPIS: Record<string, SignalCardPreview["kpis"]> = {
  "intraday-dax-2h": [
    { label: "Profit Factor", value: "1.06", tone: "neutral" },
    { label: "Winrate", value: "30.9%", tone: "neutral" },
    { label: "Net P&L", value: "+20.7R", tone: "positive" },
    { label: "OOS N", value: "537", tone: "positive" },
    { label: "Max Drawdown", value: "-30.6R", tone: "negative" },
    { label: "WF OOS Folds", value: "1/5", tone: "negative" },
  ],
  "intraday-dax-1h": [
    { label: "Profit Factor", value: "1.33", tone: "positive" },
    { label: "Winrate", value: "27.0%", tone: "neutral" },
    { label: "Net P&L", value: "+9.0R", tone: "positive" },
    { label: "Trades", value: "37", tone: "neutral" },
    { label: "Recent PF", value: "2.25", tone: "positive" },
    { label: "Exit-Fix", value: "BE off", tone: "positive" },
  ],
  "intraday-eur-30m": [
    { label: "Profit Factor", value: "1.67", tone: "positive" },
    { label: "Winrate", value: "35.7%", tone: "positive" },
    { label: "Net P&L", value: "+6.0R", tone: "neutral" },
    { label: "Trades", value: "14", tone: "negative" },
    { label: "Daten", value: "~3 Monate", tone: "negative" },
    { label: "Exit-Fix", value: "BE off", tone: "positive" },
  ],
};

export function loadIntradaySignalPreviews(): Record<string, SignalCardPreview> {
  const out: Record<string, SignalCardPreview> = {};
  for (const [id, kpis] of Object.entries(VALIDATED_KPIS)) {
    out[id] = { chart: null, performance: null, testerStatus: "validated", testerMessage: null, kpis };
  }
  return out;
}

// —— Event file types (OANDA format — trade history source) ——————————————————

export type EvTrade = {
  direction?: string;
  entryTime?: string;
  exitTime?: string | null;
  entry?: number | null;
  sl?: number | null;
  tp?: number | null;
  exit?: number | null;
  exitReason?: string | null;
  pnl?: number | null;
};

type SignalEvent = {
  id?: string;
  time?: string;
  type?: string;
  direction?: string;
  price?: number | null;
  entry?: number | null;
  sl?: number | null;
  tp?: number | null;
  reason?: string | null;
};

// openTrade may be boolean, object (trade data), or null depending on Python engine version.
// Normalize with normalizeOpenTrade() before use.
type EvFile = {
  symbol?: string;
  strategyName?: string;
  timeframe?: string;
  source?: string;
  generatedAt?: string;
  openTrade?: boolean | Record<string, unknown> | null;
  openTradeRow?: EvTrade | null;
  openCount?: number;
  trades?: EvTrade[];
  signalEvents?: SignalEvent[];
  activeSignal?: boolean | null;
  events?: unknown[];
};

// —— Engine state file types (production runtime state source) ————————————————

type EngineSignal = {
  direction?: string;
  entry?: number | null;
  sl?: number | null;
  tp?: number | null;
  be?: number | null;
  atr?: number | null;
};

type EngineStateFile = {
  strategyId?: string;
  symbol?: string;
  timeframe?: string;
  updatedAt?: string;
  updatedAtUtc?: string;
  lastEvaluatedCandle?: string;
  lastEvaluatedBarUtc?: string;
  nextCandleClose?: string | null;
  currentSignal?: EngineSignal | null;
  openTrades?: EngineSignal[];
  status?: string;
  freshness?: string;
};

// —— Strategy definitions ——————————————————————————————————————————————————————
//
// stateFilename  = engine_state/*.json   — production DE30EUR / EURUSD runtime state
// evFilename     = OANDA event file      — trade history for LETZTE 7 TAGE tab
// instrumentId   = production instrument ("de30eur" / "eurusd")
// marketVariant  = "DE30EUR_CFD" / "EURUSD_SPOT"
// strategyId     = canonical strategy name matching the engine_state strategyId prefix

type IntradayDef = {
  stateFilename: string;
  evFilename: string;
  id: string;
  instrumentId: string;
  assetSymbol: string;
  displaySymbol: string;
  assetName: string;
  iconKey: string;
  strategyName: string;
  strategyId: string;
  monitoringAsset: string;
  evaluationSchedule: string;
  marketVariant: string;
  tsAssetId: string;
  barHoursCet: readonly number[] | null;
  timeframe: "2H" | "1H" | "30M";
};

const INTRADAY_DEFS: IntradayDef[] = [
  {
    stateFilename: "trend_momentum_dax_2h_de30eur_2h_state.json",
    evFilename: "OANDA_DE30EUR_2H_events.json",
    id: "intraday-dax-2h",
    instrumentId: "de30eur",
    assetSymbol: "DE30EUR",
    displaySymbol: "DE30EUR 2H",
    assetName: "DAX 40 CFD (2H)",
    iconKey: "dax",
    strategyName: "Trend Momentum DAX 2H",
    strategyId: "trend_momentum_dax_2h",
    monitoringAsset: "DE30EUR",
    evaluationSchedule: "2H CET: 10,12,14,16,18,20",
    marketVariant: "DE30EUR_CFD",
    tsAssetId: "dax_2h",
    barHoursCet: [10, 12, 14, 16, 18, 20, 22] as const,
    timeframe: "2H",
  },
  {
    stateFilename: "mt_dax_1h_de30eur_1h_state.json",
    evFilename: "OANDA_DE30EUR_1H_events.json",
    id: "intraday-dax-1h",
    instrumentId: "de30eur",
    assetSymbol: "DE30EUR",
    displaySymbol: "DE30EUR 1H",
    assetName: "DAX 40 CFD (1H)",
    iconKey: "dax",
    strategyName: "MT DAX 1H",
    strategyId: "mt_dax_1h",
    monitoringAsset: "DE30EUR",
    evaluationSchedule: "1H CET: 08-22",
    marketVariant: "DE30EUR_CFD",
    tsAssetId: "dax_1h",
    barHoursCet: null,
    timeframe: "1H",
  },
  {
    stateFilename: "eurusd_mt_30m_eurusd_30m_state.json",
    evFilename: "OANDA_EURUSD_30M_events.json",
    id: "intraday-eur-30m",
    instrumentId: "eurusd",
    assetSymbol: "EURUSD",
    displaySymbol: "EURUSD 30M",
    assetName: "EUR/USD (30M)",
    iconKey: "eur",
    strategyName: "MT Euro 30M",
    strategyId: "eurusd_mt_30m",
    monitoringAsset: "EURUSD",
    evaluationSchedule: "30M",
    marketVariant: "EURUSD_SPOT",
    tsAssetId: "eurusd_30m",
    barHoursCet: null,
    timeframe: "30M",
  },
];

// —— Helpers ——————————————————————————————————————————————————————————————————

function readEvFile(filename: string): EvFile | null {
  try {
    const fp = path.join(STRATEGIES_ROOT, filename);
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as EvFile;
  } catch {
    return null;
  }
}

function readEngineState(filename: string): EngineStateFile | null {
  try {
    const fp = path.join(ENGINE_STATE_ROOT, filename);
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as EngineStateFile;
  } catch {
    return null;
  }
}


function dayIso(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function ageDays(dateText: string | undefined): number | undefined {
  if (!dateText) return undefined;
  const t = Date.parse(`${dateText}T00:00:00Z`);
  if (!Number.isFinite(t)) return undefined;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

// LIVE                 = engine current, market open (CURRENT from Python)
// CURRENT_MARKET_CLOSED = engine current, market closed (MARKET_CLOSED_CURRENT)
// STALE               = engine behind expected bar schedule
// UNAVAILABLE         = file missing or unreadable
export type FreshnessStatus = "LIVE" | "CURRENT_MARKET_CLOSED" | "STALE" | "UNAVAILABLE";

function ageToFreshness(ageMs: number): Exclude<FreshnessStatus, "UNAVAILABLE"> {
  const secs = ageMs / 1000;
  if (secs < 12 * 3600) return "LIVE";
  if (secs < 72 * 3600) return "CURRENT_MARKET_CLOSED";
  return "STALE";
}

function getEngineStateFreshness(state: EngineStateFile | null): {
  sourceUpdatedAtUtc: string | null;
  freshnessStatus: FreshnessStatus;
} {
  if (!state) return { sourceUpdatedAtUtc: null, freshnessStatus: "UNAVAILABLE" };
  const lastBarTs = state.lastEvaluatedBarUtc ?? state.lastEvaluatedCandle ?? null;
  if (!lastBarTs) {
    return { sourceUpdatedAtUtc: null, freshnessStatus: "STALE" };
  }
  // Prefer the Python engine's expected-bar-aware freshness classification over the
  // simple age threshold. The engine knows the market calendar and bar schedule.
  if (state.freshness) {
    const pyFreshness = state.freshness.toUpperCase();
    if (pyFreshness === "CURRENT") return { sourceUpdatedAtUtc: lastBarTs, freshnessStatus: "LIVE" };
    if (pyFreshness === "MARKET_CLOSED_CURRENT") return { sourceUpdatedAtUtc: lastBarTs, freshnessStatus: "CURRENT_MARKET_CLOSED" };
    if (pyFreshness === "STALE") return { sourceUpdatedAtUtc: lastBarTs, freshnessStatus: "STALE" };
  }
  // Fallback: simple age threshold (used when engine freshness field is absent).
  const lastBarMs = Date.parse(lastBarTs);
  if (!Number.isFinite(lastBarMs)) return { sourceUpdatedAtUtc: lastBarTs, freshnessStatus: "STALE" };
  return {
    sourceUpdatedAtUtc: lastBarTs,
    freshnessStatus: ageToFreshness(Date.now() - lastBarMs),
  };
}

function getEvFileFreshness(filename: string, ev: EvFile | null): {
  sourceUpdatedAtUtc: string | null;
  freshnessSeconds: number | null;
  freshnessStatus: FreshnessStatus;
} {
  // Prefer JSON generatedAt over file mtime for freshness honesty
  if (ev?.generatedAt) {
    const genMs = Date.parse(ev.generatedAt);
    if (Number.isFinite(genMs)) {
      const ageMs = Date.now() - genMs;
      return {
        sourceUpdatedAtUtc: ev.generatedAt,
        freshnessSeconds: Math.floor(ageMs / 1000),
        freshnessStatus: ageToFreshness(ageMs),
      };
    }
  }
  // Fallback to file mtime
  try {
    const fp = path.join(STRATEGIES_ROOT, filename);
    const mtime = fs.statSync(fp).mtimeMs;
    const ageMs = Date.now() - mtime;
    return {
      sourceUpdatedAtUtc: new Date(mtime).toISOString(),
      freshnessSeconds: Math.floor(ageMs / 1000),
      freshnessStatus: ageToFreshness(ageMs),
    };
  } catch {
    return { sourceUpdatedAtUtc: null, freshnessSeconds: null, freshnessStatus: "UNAVAILABLE" };
  }
}

function nextBarCloseUtc(timeframe: "2H" | "1H" | "30M", barHoursCet: readonly number[] | null): string {
  const nowMs = Date.now();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(nowMs).map((p) => [p.type, p.value]));
  const h = parseInt(parts["hour"] ?? "0", 10);
  const m = parseInt(parts["minute"] ?? "0", 10);

  if (timeframe === "2H" && barHoursCet) {
    const nextH = barHoursCet.find((bh) => bh > h) ?? (barHoursCet[0]! + 24);
    const minsAhead = (nextH > h ? nextH - h : nextH + 24 - h) * 60 - m;
    return new Date(nowMs + minsAhead * 60_000).toISOString();
  }
  if (timeframe === "1H") {
    return new Date(nowMs + (60 - m) * 60_000).toISOString();
  }
  const rem = (30 - (m % 30)) % 30 || 30;
  return new Date(nowMs + rem * 60_000).toISOString();
}

// —— Card builder ——————————————————————————————————————————————————————————————
//
// Current state is read from engine_state files (production DE30EUR / EURUSD).
// NONE semantics: currentSignal=null AND openTrades=[] → state=NONE, ALL risk
// fields null. No historical trade row is used as anchor for the current state.

export function loadIntradaySignalCards(): SignalCardModel[] {
  const cards: SignalCardModel[] = [];

  for (const def of INTRADAY_DEFS) {
    const state = readEngineState(def.stateFilename);
    const { sourceUpdatedAtUtc, freshnessStatus } = getEngineStateFreshness(state);

    if (!state) {
      cards.push({
        id: def.id,
        group: "white_swan",
        category: "intraday_mt",
        assetSymbol: def.assetSymbol,
        displaySymbol: def.displaySymbol,
        assetName: def.assetName,
        iconKey: def.iconKey,
        strategyName: def.strategyName,
        strategyId: def.strategyId,
        version: "1.2",
        direction: "NONE",
        status: "PAPER_ONLY",
        dataStatus: "missing",
        nextSignalLabel: "Engine offline",
        monitoringTarget: { tab: "intraday_mt" as MonitoringPrimaryTabId, asset: def.monitoringAsset, strategyId: def.strategyId },
        signalState: "NONE",
        marketVariant: def.marketVariant,
        timeframe: def.timeframe,
        evaluationSchedule: def.evaluationSchedule,
        nextEvaluationUtc: nextBarCloseUtc(def.timeframe, def.barHoursCet),
        // Extended fields
        sourceUpdatedAtUtc: null,
        freshnessStatus: "UNAVAILABLE",
        instrumentId: def.instrumentId,
      } as SignalCardModel & { sourceUpdatedAtUtc: string | null; freshnessStatus: FreshnessStatus; instrumentId: string });
      continue;
    }

    // Determine active signal from openTrades or currentSignal
    const openTrade = (state.openTrades?.length ?? 0) > 0 ? (state.openTrades![0] ?? null) : null;
    const sig: EngineSignal | null = openTrade ?? state.currentSignal ?? null;
    const isOpen = sig !== null;

    const activeDirection: SignalCardDirection = isOpen
      ? (sig!.direction === "short" ? "SHORT" : "LONG")
      : "NONE";

    const status: SignalCardStatus = isOpen ? "OPEN" : "CLOSED";

    // NONE semantics: no entry/sl/tp when not open — no historical trade anchor
    const entryPx = isOpen ? (sig!.entry ?? undefined) : undefined;
    const slAbs   = isOpen ? (sig!.sl ?? undefined) : undefined;
    const tpAbs   = isOpen ? (sig!.tp ?? undefined) : undefined;
    const beAbs   = isOpen ? (sig!.be ?? undefined) : undefined;

    const tpPct = entryPx && typeof sig?.tp === "number"
      ? ((sig.tp - entryPx) / entryPx) * 100 : undefined;
    const slPct = entryPx && typeof sig?.sl === "number"
      ? ((sig.sl - entryPx) / entryPx) * 100 : undefined;

    // signalDate only when actively open — no historical anchor contamination
    const signalDate = isOpen ? dayIso(state.lastEvaluatedCandle) : undefined;

    cards.push({
      id: def.id,
      group: "white_swan",
      category: "intraday_mt",
      assetSymbol: def.assetSymbol,
      displaySymbol: def.displaySymbol,
      assetName: def.assetName,
      iconKey: def.iconKey,
      strategyName: def.strategyName,
      strategyId: def.strategyId,
      version: "1.2",
      direction: activeDirection,
      status,
      signalDate,
      ageDays: ageDays(signalDate),
      price: entryPx,
      tp: tpPct != null ? Number(tpPct.toFixed(2)) : undefined,
      sl: slPct != null ? Number(slPct.toFixed(2)) : undefined,
      dataStatus: "ok",
      nextSignalLabel: "täglich prüfen",
      monitoringTarget: { tab: "intraday_mt" as MonitoringPrimaryTabId, asset: def.monitoringAsset, strategyId: def.strategyId },
      signalState: isOpen ? "ACTIVE" : "NONE",
      lastEvaluatedBar: state.lastEvaluatedBarUtc ?? state.lastEvaluatedCandle ?? undefined,
      nextEvaluationUtc: nextBarCloseUtc(def.timeframe, def.barHoursCet),
      evaluationSchedule: def.evaluationSchedule,
      entryAbsolute: entryPx,
      slAbsolute: slAbs != null ? Number(slAbs) : undefined,
      tpAbsolute: tpAbs != null ? Number(tpAbs) : undefined,
      beAbsolute: beAbs != null ? Number(beAbs) : undefined,
      marketVariant: def.marketVariant,
      timeframe: def.timeframe,
      // Extended fields (not in base type — attached for route mapping)
      sourceUpdatedAtUtc,
      freshnessStatus,
      instrumentId: def.instrumentId,
    } as SignalCardModel & { sourceUpdatedAtUtc: string | null; freshnessStatus: FreshnessStatus; instrumentId: string });
  }

  return cards;
}

// —— Trade history export (for Letzte 7 Tage tab) ————————————————————————————
//
// History comes from OANDA event files (production DE30EUR / EURUSD strategy
// validation data). Only trades within the last 60 days are returned to keep
// the payload lean — the UI filters to last 7 days client-side.

export type IntradayTradeSet = {
  strategyId: string;
  assetName: string;
  marketVariant: string;
  tsAssetId: string;
  timeframe: "2H" | "1H" | "30M";
  trades: EvTrade[];
  generatedAt: string;
  sourceUpdatedAtUtc: string | null;
  freshnessSeconds: number | null;
  freshnessStatus: FreshnessStatus;
};

export function loadIntradayTradeSets(): IntradayTradeSet[] {
  const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  return INTRADAY_DEFS.map((def) => {
    const ev = readEvFile(def.evFilename);
    const freshness = getEvFileFreshness(def.evFilename, ev);
    const allTrades = Array.isArray(ev?.trades) ? ev!.trades : [];
    // Filter to recent trades; empty when no trades in last 60 days (honest)
    const recentTrades = allTrades.filter((t) => {
      const ref = (t.exitTime || t.entryTime || "").slice(0, 10);
      return ref >= cutoff;
    });
    return {
      strategyId: def.strategyId,
      assetName: def.assetName,
      marketVariant: def.marketVariant,
      tsAssetId: def.tsAssetId,
      timeframe: def.timeframe,
      trades: recentTrades,
      generatedAt: ev?.generatedAt ?? "",
      ...freshness,
    };
  });
}
