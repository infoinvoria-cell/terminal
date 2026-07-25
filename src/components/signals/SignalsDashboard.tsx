"use client";

import { useState, useEffect, useCallback } from "react";
import { useInterval } from "@/hooks/useInterval";

// ── Types ─────────────────────────────────────────────────────────────────────

type ForwardTrade = Record<string, string> & {
  lastClose?: number | null;
  unrealizedPct?: number | null;
};

type ForwardSignal = Record<string, string>;

type ForwardLoggerResponse = {
  available: boolean;
  asOf?: string;
  openTrades?: ForwardTrade[];
  activeSignals?: ForwardSignal[];
  recentClosed?: ForwardTrade[];
  counts?: { open: number; activeSignals: number; recentClosed: number };
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtPct(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function dirBadge(dir: string) {
  const upper = (dir ?? "").toUpperCase();
  if (upper === "LONG") return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
      LONG
    </span>
  );
  if (upper === "SHORT") return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-red-500/15 text-red-400 border border-red-500/25">
      SHORT
    </span>
  );
  return <span className="text-[#555] text-xs">{dir || "—"}</span>;
}

function pnlColor(v: number | null | undefined) {
  if (v == null) return "text-[#666]";
  return v >= 0 ? "text-emerald-400" : "text-red-400";
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-h-[90px] flex-col justify-between rounded-[16px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] px-4 pb-4 pt-3 shadow-[0_12px_28px_-10px_rgba(0,0,0,0.4)]">
      <p className="text-[12px] font-medium text-[#6b7280] [font-family:var(--font-montserrat),sans-serif]">
        {label}
      </p>
      <p className="text-[28px] font-bold leading-none text-white [font-family:var(--font-nunito),sans-serif]">
        {value}
      </p>
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-white/[0.06] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#555] [font-family:var(--font-montserrat),sans-serif]">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`border-b border-white/[0.04] px-3 py-2.5 text-[12px] text-[#c8cad0] [font-family:var(--font-montserrat),sans-serif] ${className}`}>
      {children}
    </td>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[13px] font-semibold text-[#c8cad0] [font-family:var(--font-montserrat),sans-serif]">
      {children}
    </p>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export function SignalsDashboard() {
  const [data, setData] = useState<ForwardLoggerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/monitoring/forward-logger");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ForwardLoggerResponse;
      setData(json);
      setLastRefresh(new Date());
    } catch {
      // keep stale data on error
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
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      {/* KPI row */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <KpiCard label="Offene Positionen" value={loading ? "…" : openTrades.length} />
        <KpiCard label="Aktive Signale heute" value={loading ? "…" : activeSignals.length} />
        <KpiCard label="Geschlossen (30 Tage)" value={loading ? "…" : recentClosed.length} />
      </div>

      {/* Refresh status */}
      <div className="mb-5 flex items-center gap-2 text-[11px] text-[#555] [font-family:var(--font-montserrat),sans-serif]">
        {loading && <span className="h-3 w-3 animate-spin rounded-full border border-[#555] border-t-transparent" />}
        {lastRefresh && <span>Aktualisiert: {lastRefresh.toLocaleTimeString("de-DE")}</span>}
        {data && !data.available && (
          <span className="text-amber-500">Keine Daten verfügbar</span>
        )}
      </div>

      {/* Open Trades */}
      <div className="mb-6 rounded-[16px] border border-white/[0.06] bg-[#10111a] overflow-hidden">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <SectionTitle>Offene Positionen</SectionTitle>
        </div>
        {openTrades.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-[#444]">Keine offenen Positionen</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <Th>Symbol</Th>
                  <Th>Richtung</Th>
                  <Th>Entry Price</Th>
                  <Th>Entry Datum</Th>
                  <Th>P&L (unrealized)</Th>
                  <Th>Strategie</Th>
                </tr>
              </thead>
              <tbody>
                {openTrades.map((t, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <Td><span className="font-semibold text-white">{t.symbol ?? "—"}</span></Td>
                    <Td>{dirBadge(t.direction ?? "")}</Td>
                    <Td>{t.entry_price ?? "—"}</Td>
                    <Td>{t.entry_date ?? "—"}</Td>
                    <Td>
                      <span className={pnlColor(t.unrealizedPct)}>
                        {fmtPct(t.unrealizedPct)}
                      </span>
                    </Td>
                    <Td className="text-[#888]">{t.strategy ?? t.strategy_id ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Active Signals */}
      <div className="mb-6 rounded-[16px] border border-white/[0.06] bg-[#10111a] overflow-hidden">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <SectionTitle>Aktive Signale</SectionTitle>
        </div>
        {activeSignals.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-[#444]">Keine aktiven Signale</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr>
                  <Th>Symbol</Th>
                  <Th>Strategie</Th>
                  <Th>Richtung</Th>
                  <Th>Timestamp</Th>
                </tr>
              </thead>
              <tbody>
                {activeSignals.map((s, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <Td><span className="font-semibold text-white">{s.symbol ?? "—"}</span></Td>
                    <Td className="text-[#888]">{s.strategy ?? s.strategy_id ?? "—"}</Td>
                    <Td>{dirBadge(s.direction ?? s.signal_direction ?? "")}</Td>
                    <Td className="text-[#666]">{s.timestamp ?? s.signal_date ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recently Closed */}
      <div className="rounded-[16px] border border-white/[0.06] bg-[#10111a] overflow-hidden">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <SectionTitle>Zuletzt geschlossen (30 Tage)</SectionTitle>
        </div>
        {recentClosed.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-[#444]">Keine geschlossenen Trades</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr>
                  <Th>Symbol</Th>
                  <Th>Richtung</Th>
                  <Th>PnL</Th>
                  <Th>Exit Datum</Th>
                  <Th>Strategie</Th>
                </tr>
              </thead>
              <tbody>
                {recentClosed.map((t, i) => {
                  const pnlRaw = t.pnl ?? t.gain_pct ?? t.pnl_pct;
                  const pnl = pnlRaw ? parseFloat(pnlRaw) : null;
                  return (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <Td><span className="font-semibold text-white">{t.symbol ?? "—"}</span></Td>
                      <Td>{dirBadge(t.direction ?? "")}</Td>
                      <Td>
                        <span className={pnlColor(pnl)}>{fmtPct(pnl)}</span>
                      </Td>
                      <Td className="text-[#666]">{t.exit_date ?? "—"}</Td>
                      <Td className="text-[#888]">{t.strategy ?? t.strategy_id ?? "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
