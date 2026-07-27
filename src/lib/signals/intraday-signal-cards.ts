// Builds Signal-page cards for the 3 intraday MT components (DAX 2H, DAX 1H,
// Euro 30M) from the committed futures-priced strategy events. The latest trade
// provides the current direction / entry / SL / TP. GBP is excluded for now
// (not part of the portfolio — shown dimmed on Monitoring only).
import dax2h from "@/data/capitalife/monitoring-events/EUREX_FDAX1_2H_events.json";
import dax1h from "@/data/capitalife/monitoring-events/EUREX_FDAX1_1H_events.json";
import eur30m from "@/data/capitalife/monitoring-events/CME_6E1_30M_events.json";
import type { SignalCardModel, SignalCardStatus, SignalCardDirection } from "@/lib/signals/signal-types";
import type { MonitoringPrimaryTabId } from "@/config/monitoringTabConfig";

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
      price: typeof last.entry === "number" ? last.entry : undefined,
      tp: typeof last.tp === "number" ? last.tp : undefined,
      sl: typeof last.sl === "number" ? last.sl : undefined,
      dataStatus: "ok",
      nextSignalLabel: "täglich prüfen",
      monitoringTarget: { tab: "intraday_mt" as MonitoringPrimaryTabId, asset: def.monitoringAsset, strategyId: def.strategyId },
    });
  }
  return cards;
}
