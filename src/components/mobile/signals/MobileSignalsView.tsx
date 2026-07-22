"use client";

import { useState, useCallback, useEffect } from "react";
import { useInterval } from "@/hooks/useInterval";
// ── Types ─────────────────────────────────────────────────────────────────────

type ForwardTrade = Record<string, string> & {
  lastClose?: number | null;
  unrealizedPct?: number | null;
};

type ForwardSignal = Record<string, string>;

type ForwardLoggerResponse = {
  available: boolean;
  openTrades?: ForwardTrade[];
  activeSignals?: ForwardSignal[];
  recentClosed?: ForwardTrade[];
};

type Tab = "open" | "signals" | "closed";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtPct(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function DirBadge({ dir }: { dir: string }) {
  const upper = (dir ?? "").toUpperCase();
  if (upper === "LONG")
    return (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
        LONG
      </span>
    );
  if (upper === "SHORT")
    return (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide bg-red-500/15 text-red-400 border border-red-500/25">
        SHORT
      </span>
    );
  return <span className="text-[#666] text-[10px]">{dir || "—"}</span>;
}

// ── Trade Card ─────────────────────────────────────────────────────────────────

function TradeCard({ trade, showPnl = false }: { trade: ForwardTrade; showPnl?: boolean }) {
  const pnlRaw = showPnl
    ? (trade.pnl ?? trade.gain_pct ?? trade.pnl_pct)
    : null;
  const pnl = pnlRaw != null ? parseFloat(String(pnlRaw)) : null;

  return (
    <div className="rounded-[14px] border border-white/[0.07] bg-[#13141a] p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[17px] font-bold leading-tight text-white [font-family:var(--font-nunito),sans-serif]">
          {trade.symbol ?? "—"}
        </span>
        <DirBadge dir={trade.direction ?? ""} />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#888] [font-family:var(--font-montserrat),sans-serif]">
        {trade.entry_price && (
          <span>
            <span className="text-[#555]">Entry </span>
            <span className="text-[#c8cad0]">{trade.entry_price}</span>
          </span>
        )}
        {trade.entry_date && (
          <span>
            <span className="text-[#555]">Datum </span>
            <span className="text-[#c8cad0]">{trade.entry_date}</span>
          </span>
        )}
        {trade.exit_date && (
          <span>
            <span className="text-[#555]">Exit </span>
            <span className="text-[#c8cad0]">{trade.exit_date}</span>
          </span>
        )}
        {showPnl && pnl != null && (
          <span className={pnl >= 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
            {fmtPct(pnl)}
          </span>
        )}
        {!showPnl && trade.unrealizedPct != null && (
          <span className={trade.unrealizedPct >= 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
            {fmtPct(trade.unrealizedPct)} unreal.
          </span>
        )}
        {(trade.strategy ?? trade.strategy_id) && (
          <span className="text-[#555]">{trade.strategy ?? trade.strategy_id}</span>
        )}
      </div>
    </div>
  );
}

// ── Signal Card ────────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: ForwardSignal }) {
  return (
    <div className="rounded-[14px] border border-white/[0.07] bg-[#13141a] p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[17px] font-bold leading-tight text-white [font-family:var(--font-nunito),sans-serif]">
          {signal.symbol ?? "—"}
        </span>
        <DirBadge dir={signal.direction ?? signal.signal_direction ?? ""} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#888] [font-family:var(--font-montserrat),sans-serif]">
        {(signal.strategy ?? signal.strategy_id) && (
          <span className="text-[#666]">{signal.strategy ?? signal.strategy_id}</span>
        )}
        {(signal.timestamp ?? signal.signal_date) && (
          <span className="text-[#555]">{signal.timestamp ?? signal.signal_date}</span>
        )}
      </div>
    </div>
  );
}

// ── Tab Button ─────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, label, count }: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors [font-family:var(--font-montserrat),sans-serif] ${
        active
          ? "border-b-2 border-[#e2ca7a] text-white"
          : "border-b-2 border-transparent text-[#555]"
      }`}
    >
      {label}
      {count > 0 && (
        <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-[#e2ca7a]/20 text-[#e2ca7a]" : "bg-white/[0.06] text-[#555]"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Main View ──────────────────────────────────────────────────────────────────

export function MobileSignalsView() {
  const [data, setData] = useState<ForwardLoggerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("open");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/monitoring/forward-logger");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as ForwardLoggerResponse);
    } catch {
      // keep stale
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useInterval(fetchData, 5000);

  const openTrades = data?.openTrades ?? [];
  const activeSignals = data?.activeSignals ?? [];
  const recentClosed = data?.recentClosed ?? [];

  return (
    <div className="flex h-[100dvh] flex-col bg-[#07080b] text-white">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-safe pt-4 pb-0">
        <div className="flex items-center justify-between">
          <h1 className="text-[18px] font-bold [font-family:var(--font-nunito),sans-serif]">
            Live Signale
          </h1>
          {loading && (
            <span className="h-4 w-4 animate-spin rounded-full border border-[#555] border-t-transparent" />
          )}
        </div>
        {/* Swipeable Tabs */}
        <div className="mt-3 flex border-b border-white/[0.06]">
          <TabBtn active={tab === "open"} onClick={() => setTab("open")} label="Offen" count={openTrades.length} />
          <TabBtn active={tab === "signals"} onClick={() => setTab("signals")} label="Signale" count={activeSignals.length} />
          <TabBtn active={tab === "closed"} onClick={() => setTab("closed")} label="Geschlossen" count={recentClosed.length} />
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[80px]">
        {tab === "open" && (
          openTrades.length === 0
            ? <Empty text="Keine offenen Positionen" />
            : <div className="flex flex-col gap-3">
                {openTrades.map((t, i) => <TradeCard key={i} trade={t} showPnl={false} />)}
              </div>
        )}
        {tab === "signals" && (
          activeSignals.length === 0
            ? <Empty text="Keine aktiven Signale" />
            : <div className="flex flex-col gap-3">
                {activeSignals.map((s, i) => <SignalCard key={i} signal={s} />)}
              </div>
        )}
        {tab === "closed" && (
          recentClosed.length === 0
            ? <Empty text="Keine geschlossenen Trades (30 Tage)" />
            : <div className="flex flex-col gap-3">
                {recentClosed.map((t, i) => <TradeCard key={i} trade={t} showPnl />)}
              </div>
        )}
      </div>

    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-40 items-center justify-center">
      <p className="text-[12px] text-[#444] [font-family:var(--font-montserrat),sans-serif]">{text}</p>
    </div>
  );
}
