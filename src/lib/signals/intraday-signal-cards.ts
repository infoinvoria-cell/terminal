// Builds Signal-page cards for the 3 intraday MT components (DAX 2H, DAX 1H,
// Euro 30M) from the committed futures-priced strategy events. The latest trade
// provides the current direction / entry / SL / TP. GBP is excluded for now
// (not part of the portfolio — shown dimmed on Monitoring only).
import dax2h from "@/data/capitalife/monitoring-events/EUREX_FDAX1_2H_events.json";
import dax1h from "@/data/capitalife/monitoring-events/EUREX_FDAX1_1H_events.json";
import eur30m from "@/data/capitalife/monitoring-events/CME_6E1_30M_events.json";
import type { SignalCardModel, SignalCardStatus, SignalCardDirection, SignalCardPreview } from "@/lib/signals/signal-types";
import type { MonitoringPrimaryTabId } from "@/config/monitoringTabConfig";

// KPIs per intraday MT component = the ACTUAL LIVE performance on the futures that
// drive these signals (FDAX1!/6E1!), computed from the committed events. All three
// now carry the validated breakeven-off defect correction (the BE-at-1R rule was
// cutting the runners — see DAX2H_OPTIMIZATION_REPORT). After the fix: DAX 1H is
// solidly positive (recent PF 2.25), EUR 30M is positive but its sample is tiny
// (~3 months of 6E1! futures, n=14), and DAX 2H is break-even (long history, but
// only 1/5 OOS walk-forward folds). Not the 2007–2017 OANDA-CFD backtest shown on
// the Komponenten page (different instrument + period).
const VALIDATED_KPIS: Record<string, SignalCardPreview["kpis"]> = {
  "intraday-dax-2h": [
    { label: "Profit Factor", value: "1.06", tone: "neutral" },
    { label: "Winrate", value: "30.9%", tone: "neutral" },
    { label: "Net P&L", value: "+20.7R", tone: "positive" },
    { label: "Trades", value: "537", tone: "positive" },
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

type EvTrade = {
  direction?: string;
  entryTime?: string;
  exitTime?: string;
  entry?: number;
  sl?: number | null;
  tp?: number | null;
  exit?: number | null;
  exitReason?: string;
  pnl?: number;
};
type EvFile = { symbol?: string; strategyName?: string; timeframe?: string; trades?: EvTrade[] };

type IntradayDef = {
  file: EvFile;
  id: string;
  assetSymbol: string;
  displaySymbol: string;
  assetName: string;
  iconKey: string;
  strategyName: string;
  strategyId: string;
  monitoringAsset: string;
};

const INTRADAY_DEFS: IntradayDef[] = [
  {
    file: dax2h as EvFile,
    id: "intraday-dax-2h",
    assetSymbol: "FDAX1!",
    displaySymbol: "FDAX1! 2H",
    assetName: "DAX Future (2H)",
    iconKey: "dax",
    strategyName: "Trend Momentum DAX 2H",
    strategyId: "dax_2h",
    monitoringAsset: "FDAX1!",
  },
  {
    file: dax1h as EvFile,
    id: "intraday-dax-1h",
    assetSymbol: "FDAX1!",
    displaySymbol: "FDAX1! 1H",
    assetName: "DAX Future (1H)",
    iconKey: "dax",
    strategyName: "Trend Momentum DAX 1H",
    strategyId: "dax_1h",
    monitoringAsset: "FDAX1!",
  },
  {
    file: eur30m as EvFile,
    id: "intraday-eur-30m",
    assetSymbol: "6E1!",
    displaySymbol: "6E1! 30M",
    assetName: "Euro FX Future (30M)",
    iconKey: "eur",
    strategyName: "MT Euro 30M",
    strategyId: "eurusd_30m",
    monitoringAsset: "6E1!",
  },
];

function dayIso(value: string | undefined): string | undefined {
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

export function loadIntradaySignalCards(): SignalCardModel[] {
  const cards: SignalCardModel[] = [];
  for (const def of INTRADAY_DEFS) {
    const trades = Array.isArray(def.file.trades) ? def.file.trades : [];
    if (!trades.length) continue;
    const last = trades[trades.length - 1]!;
    const direction: SignalCardDirection = last.direction === "short" ? "SHORT" : last.direction === "long" ? "LONG" : "CASH";
    const signalDate = dayIso(last.exitTime ?? last.entryTime);
    const age = ageDays(signalDate);
    // The engine emits backtest trades; treat a very recent trade as an active
    // (paper) signal, otherwise it's a validated/closed one.
    const isRecent = age !== undefined && age <= 3;
    const status: SignalCardStatus = isRecent ? "OPEN" : "PAPER_ONLY";
    // The card renders tp/sl as a percentage, so express them as distance-from-entry
    // (not the absolute futures price, which would read as "TP: +25093%").
    const entryPx = typeof last.entry === "number" ? last.entry : undefined;
    const tpPct = entryPx && typeof last.tp === "number" ? ((last.tp - entryPx) / entryPx) * 100 : undefined;
    const slPct = entryPx && typeof last.sl === "number" ? ((last.sl - entryPx) / entryPx) * 100 : undefined;
    cards.push({
      id: def.id,
      group: "intraday",
      category: "intraday_mt",
      assetSymbol: def.assetSymbol,
      displaySymbol: def.displaySymbol,
      assetName: def.assetName,
      iconKey: def.iconKey,
      strategyName: def.strategyName,
      strategyId: def.strategyId,
      version: "1.2",
      direction,
      status,
      signalDate,
      ageDays: age,
      price: entryPx,
      tp: tpPct != null ? Number(tpPct.toFixed(2)) : undefined,
      sl: slPct != null ? Number(slPct.toFixed(2)) : undefined,
      dataStatus: "ok",
      nextSignalLabel: "täglich prüfen",
      monitoringTarget: { tab: "intraday_mt" as MonitoringPrimaryTabId, asset: def.monitoringAsset, strategyId: def.strategyId },
    });
  }
  return cards;
}
