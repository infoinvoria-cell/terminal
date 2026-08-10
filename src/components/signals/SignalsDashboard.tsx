"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getEntityHref } from "@/lib/navigation/entity-resolver";
import StrategyTesterEquityChart from "@/components/monitoring/StrategyTesterEquityChart";
import StrategyTesterDrawdownChart from "@/components/monitoring/StrategyTesterDrawdownChart";
import { SignalStrategyChart } from "./SignalStrategyChart";
import type { SignalCardModel } from "@/lib/signals/signal-types";
import type { IntradayTradeSet, EvTrade } from "@/lib/signals/intraday-signal-cards";
import type { PerformanceCurvePoint, DrawdownCurvePoint } from "@/lib/monitoring/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type IntradayCard = SignalCardModel & { freshnessStatus?: string };

type IntradayApiResponse = {
  cards: IntradayCard[];
  tradeSets: IntradayTradeSet[];
  generatedAtUtc: string;
  sourceStatus: "ok" | "stale" | "unavailable";
};

type TabId = "aktuell" | "letzte7" | "ausstehend";

const FONT = "var(--font-montserrat,'Montserrat',sans-serif)";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(v: number | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v >= 100 ? v.toFixed(decimals > 2 ? 2 : 0) : v.toFixed(decimals);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

// Returns "LAST COMPLETED · HH:MM" where HH:MM is bar close time in Europe/Berlin.
// barOpenIso = BAR OPEN UTC (lastEvaluatedBarUtc convention).
function fmtLastBarClose(barOpenIso: string | undefined, timeframe: string | undefined): string {
  if (!barOpenIso) return "";
  const tfMin = timeframe === "2H" ? 120 : timeframe === "1H" ? 60 : 30;
  const closeMs = Date.parse(barOpenIso) + tfMin * 60_000;
  if (!Number.isFinite(closeMs)) return "";
  const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false });
  const todayBln = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(Date.now());
  const closeDayBln = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(closeMs);
  const timeStr = timeFmt.format(closeMs);
  if (closeDayBln === todayBln) return `LAST COMPLETED · ${timeStr}`;
  const md = closeDayBln.slice(5); // MM-DD
  return `LAST COMPLETED · ${md} ${timeStr}`;
}

function fmtFreshness(freshnessStatus: string | undefined): { label: string; color: string } {
  switch (freshnessStatus) {
    case "LIVE":                  return { label: "LIVE",                    color: "rgba(74,222,128,0.75)" };
    case "CURRENT_MARKET_CLOSED": return { label: "CURRENT · MARKET CLOSED", color: "rgba(214,178,74,0.65)" };
    case "STALE":                 return { label: "STALE",                   color: "rgba(251,146,60,0.75)" };
    case "UNAVAILABLE":           return { label: "UNAVAILABLE",             color: "rgba(239,68,68,0.75)" };
    default:                      return { label: "",                         color: "transparent" };
  }
}

function last7Days(trades: EvTrade[]): EvTrade[] {
  const cutoff = Date.now() - 7 * 86_400_000;
  return trades.filter(t => {
    const ts = t.exitTime ?? t.entryTime;
    if (!ts) return false;
    return new Date(ts).getTime() >= cutoff;
  });
}

function buildEquityCurve(trades: EvTrade[]): PerformanceCurvePoint[] {
  let cumR = 0;
  return trades
    .filter(t => t.pnl != null && t.exitTime)
    .map(t => {
      cumR += t.pnl!;
      return { time: t.exitTime!.slice(0, 10), value: cumR };
    });
}

function buildDrawdownCurve(trades: EvTrade[]): DrawdownCurvePoint[] {
  let cumR = 0;
  let peak = 0;
  return trades
    .filter(t => t.pnl != null && t.exitTime)
    .map(t => {
      cumR += t.pnl!;
      peak = Math.max(peak, cumR);
      const dd = peak > 0 ? ((cumR - peak) / peak) * 100 : 0;
      return { time: t.exitTime!.slice(0, 10), value: dd };
    });
}

// ── Signal state badge ────────────────────────────────────────────────────────

function StateBadge({ state, direction }: { state?: SignalCardModel["signalState"]; direction: SignalCardModel["direction"] }) {
  if (state === "ACTIVE") {
    const isLong = direction === "LONG";
    return (
      <span style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
        letterSpacing: "0.08em", fontFamily: FONT,
        background: isLong ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        color: isLong ? "#4ADE80" : "#F87171",
        border: `1px solid ${isLong ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
      }}>
        {isLong ? "▲ LONG" : "▼ SHORT"}
      </span>
    );
  }
  if (state === "POTENTIAL") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
        letterSpacing: "0.06em", fontFamily: FONT,
        background: "rgba(214,178,74,0.1)", color: "#D6B24A",
        border: "1px solid rgba(214,178,74,0.22)",
      }}>
        POTENTIAL
      </span>
    );
  }
  return (
    <span style={{ fontFamily: FONT, fontSize: 10, color: "rgba(180,192,210,0.38)", letterSpacing: "0.04em" }}>
      NEUTRAL
    </span>
  );
}

// ── Market variant chip ───────────────────────────────────────────────────────

function MarketChip({ variant }: { variant?: string }) {
  const label = variant === "DE30EUR_CFD" ? "DE30EUR" : variant === "EURUSD_SPOT" ? "EURUSD" : (variant ?? "");
  return (
    <span style={{
      fontFamily: FONT, fontSize: 9, fontWeight: 600, letterSpacing: "0.1em",
      padding: "1px 5px", borderRadius: 4,
      background: "rgba(255,255,255,0.05)", color: "rgba(200,210,224,0.55)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      {label}
    </span>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "aktuell", label: "Aktuell" },
    { id: "letzte7", label: "Letzte 7 Tage" },
    { id: "ausstehend", label: "Ausstehend" },
  ];
  return (
    <div style={{ display: "flex", gap: 2, padding: "6px 14px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          style={{
            fontFamily: FONT, fontSize: 11, fontWeight: active === t.id ? 700 : 500,
            letterSpacing: "0.04em", color: active === t.id ? "#F5F7FA" : "rgba(180,192,210,0.45)",
            background: "none", border: "none", cursor: "pointer",
            padding: "6px 10px 8px",
            borderBottom: active === t.id ? "2px solid #D6B24A" : "2px solid transparent",
            marginBottom: -1,
            transition: "color 150ms ease",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Strategy row (Aktuell tab) ────────────────────────────────────────────────

function StrategyRow({
  card,
  selected,
  onClick,
}: {
  card: IntradayCard;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", gap: 10,
        background: selected ? "rgba(255,255,255,0.04)" : "transparent",
        borderLeft: selected ? "2px solid #D6B24A" : "2px solid transparent",
        cursor: "pointer", transition: "background 140ms ease",
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.025)"; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      {/* Left: icon + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, flex: 1 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/asset-icons/${card.iconKey ?? "default"}.png`}
          alt=""
          style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0, borderRadius: "50%", opacity: 0.9 }}
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#E8EDF4", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {card.assetName}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
            <MarketChip variant={card.marketVariant} />
            <span style={{ fontFamily: FONT, fontSize: 10, color: "rgba(180,192,210,0.4)" }}>{card.evaluationSchedule}</span>
          </div>
        </div>
      </div>

      {/* Right: state + levels + timestamp */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <StateBadge state={card.signalState} direction={card.direction} />
        {card.signalState === "ACTIVE" && (
          <div style={{ display: "flex", gap: 8, fontFamily: FONT, fontSize: 10, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: "#94A3B8" }}>E: <span style={{ color: "#E8EDF4" }}>{fmtPrice(card.entryAbsolute)}</span></span>
            <span style={{ color: "#94A3B8" }}>SL: <span style={{ color: "#F87171" }}>{fmtPrice(card.slAbsolute)}</span></span>
            <span style={{ color: "#94A3B8" }}>TP: <span style={{ color: "#4ADE80" }}>{fmtPrice(card.tpAbsolute)}</span></span>
          </div>
        )}
        {card.lastEvaluatedBar && (
          <span style={{ fontFamily: FONT, fontSize: 9, color: "rgba(180,192,210,0.35)", letterSpacing: "0.03em" }}>
            {fmtLastBarClose(card.lastEvaluatedBar, card.timeframe)}
          </span>
        )}
        {(() => { const f = fmtFreshness(card.freshnessStatus); return f.label ? (
          <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 600, letterSpacing: "0.07em", color: f.color }}>
            {f.label}
          </span>
        ) : null; })()}
      </div>
    </div>
  );
}

// ── Trade history row (Letzte 7 Tage tab) ────────────────────────────────────

function TradeHistoryRows({ tradeSets }: { tradeSets: IntradayTradeSet[] }) {
  const rows: { trade: EvTrade; strategyName: string; variant: string }[] = [];
  for (const ts of tradeSets) {
    for (const t of last7Days(ts.trades)) {
      rows.push({ trade: t, strategyName: ts.assetName, variant: ts.marketVariant });
    }
  }
  rows.sort((a, b) => {
    const ta = a.trade.exitTime ?? a.trade.entryTime ?? "";
    const tb = b.trade.exitTime ?? b.trade.entryTime ?? "";
    return tb.localeCompare(ta);
  });

  if (!rows.length) {
    return (
      <div style={{ padding: "24px 14px", textAlign: "center", fontFamily: FONT, fontSize: 12, color: "rgba(180,192,210,0.35)" }}>
        Keine Trades in den letzten 7 Tagen
      </div>
    );
  }

  return (
    <div style={{ overflow: "auto" }}>
      {rows.map((r, i) => {
        const t = r.trade;
        const isLong = t.direction === "long";
        const pnlPos = t.pnl != null && t.pnl >= 0;
        return (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "1fr auto auto auto",
            gap: 8, padding: "8px 14px", alignItems: "center",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            fontFamily: FONT, fontSize: 11,
          }}>
            <div>
              <span style={{ fontWeight: 700, color: "#E8EDF4" }}>{r.strategyName}</span>
              <span style={{ color: "rgba(180,192,210,0.4)", marginLeft: 6, fontSize: 10 }}>{r.variant.replace("_CFD", "").replace("_SPOT", "")}</span>
            </div>
            <span style={{
              padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: isLong ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              color: isLong ? "#4ADE80" : "#F87171",
            }}>
              {isLong ? "L" : "S"}
            </span>
            <span style={{ color: "rgba(180,192,210,0.5)", fontSize: 10 }}>
              {fmtDate(t.exitTime ?? t.entryTime)}
            </span>
            <span style={{ fontWeight: 600, color: pnlPos ? "#4ADE80" : "#F87171", fontVariantNumeric: "tabular-nums" }}>
              {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(1)}R` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Panel shell ────────────────────────────────────────────────────────────────

function PanelShell({ title, badge, children, style }: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background: "linear-gradient(to bottom, #1c1d22, #111114)",
      border: "1px solid rgba(255,255,255,0.065)",
      borderRadius: 10, overflow: "hidden",
      display: "flex", flexDirection: "column",
      ...style,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.065)",
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#F5F7FA", textTransform: "uppercase" }}>
          {title}
        </span>
        {badge}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

// ── Stale/unavailable banner ──────────────────────────────────────────────────

function SourceBanner({ sourceStatus, generatedAt }: { sourceStatus: string; generatedAt: string }) {
  if (sourceStatus === "ok") return null;
  return (
    <div style={{
      padding: "7px 14px", fontFamily: FONT, fontSize: 11,
      background: sourceStatus === "unavailable" ? "rgba(239,68,68,0.08)" : "rgba(214,178,74,0.08)",
      borderBottom: `1px solid ${sourceStatus === "unavailable" ? "rgba(239,68,68,0.2)" : "rgba(214,178,74,0.2)"}`,
      color: sourceStatus === "unavailable" ? "#F87171" : "#D6B24A",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ fontWeight: 700 }}>{sourceStatus === "unavailable" ? "SIGNAL ENGINE UNAVAILABLE" : "LAST KNOWN"}</span>
      <span style={{ opacity: 0.6, fontSize: 10 }}>{fmtDate(generatedAt)} {generatedAt.slice(11, 16)} UTC</span>
    </div>
  );
}

// ── Right detail panel ────────────────────────────────────────────────────────

function DetailPanel({
  card,
  tradeSet,
}: {
  card: SignalCardModel | null;
  tradeSet: IntradayTradeSet | null;
}) {
  const trades = tradeSet?.trades ?? [];
  const equityCurve = useMemo(() => buildEquityCurve(trades), [trades]);
  const drawdownCurve = useMemo(() => buildDrawdownCurve(trades), [trades]);

  const kpis: Array<{ label: string; value: string; tone?: "positive" | "negative" | "neutral" }> = (() => {
    if (!card?.id) return [];
    const map: Record<string, typeof kpis> = {
      "intraday-dax-2h": [
        { label: "Profit Factor", value: "1.06", tone: "neutral" },
        { label: "Winrate", value: "30.9%", tone: "neutral" },
        { label: "Net P&L", value: "+20.7R", tone: "positive" },
        { label: "OOS N", value: "537", tone: "positive" },
        { label: "Max DD", value: "-30.6R", tone: "negative" },
      ],
      "intraday-dax-1h": [
        { label: "Profit Factor", value: "1.33", tone: "positive" },
        { label: "Winrate", value: "27.0%", tone: "neutral" },
        { label: "Net P&L", value: "+9.0R", tone: "positive" },
        { label: "Trades", value: "37", tone: "neutral" },
        { label: "Recent PF", value: "2.25", tone: "positive" },
      ],
      "intraday-eur-30m": [
        { label: "Profit Factor", value: "1.67", tone: "positive" },
        { label: "Winrate", value: "35.7%", tone: "positive" },
        { label: "Net P&L", value: "+6.0R", tone: "neutral" },
        { label: "Trades", value: "14", tone: "negative" },
        { label: "Daten", value: "~3 Mon.", tone: "negative" },
      ],
    };
    return map[card.id] ?? [];
  })();

  if (!card) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: FONT, fontSize: 12, color: "rgba(180,192,210,0.3)" }}>
        Strategie auswählen
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.065)",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/asset-icons/${card.iconKey ?? "default"}.png`}
          alt=""
          style={{ width: 22, height: 22, objectFit: "contain", borderRadius: "50%", opacity: 0.85 }}
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#E8EDF4" }}>{card.assetName}</span>
        <MarketChip variant={card.marketVariant} />
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <StateBadge state={card.signalState} direction={card.direction} />
          {(() => {
            const href = getEntityHref(card.id, "ENGINE");
            if (!href) return null;
            return (
              <Link href={href} style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "2px 7px", borderRadius: 5,
                border: "1px solid rgba(214,178,74,0.22)",
                background: "rgba(214,178,74,0.06)",
                fontSize: 8.5, fontFamily: FONT, fontWeight: 700,
                letterSpacing: "0.07em", textTransform: "uppercase",
                color: "rgba(214,178,74,0.85)", textDecoration: "none",
                whiteSpace: "nowrap",
              }}>
                Engine ↗
              </Link>
            );
          })()}
        </span>
      </div>

      {/* Candlestick */}
      <div style={{ flexShrink: 0 }}>
        <SignalStrategyChart
          assetId={tradeSet?.tsAssetId ?? "eurusd_30m"}
          tf={card.timeframe ?? "30M"}
          symbol={card.displaySymbol}
          monitoringSymbol={card.assetSymbol}
          height={210}
        />
      </div>

      {/* Equity curve */}
      {equityCurve.length > 1 && (
        <div style={{ flexShrink: 0, height: 130, background: "#0d0d10", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <StrategyTesterEquityChart data={equityCurve} fillContainer />
        </div>
      )}

      {/* Drawdown */}
      {drawdownCurve.length > 1 && (
        <div style={{ flexShrink: 0, height: 100, background: "#0d0d10", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <StrategyTesterDrawdownChart data={drawdownCurve} fillContainer />
        </div>
      )}

      {/* KPI cards */}
      {kpis.length > 0 && (
        <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.065)" }}>
          {kpis.map(kpi => (
            <div key={kpi.label} style={{
              display: "flex", flexDirection: "column", gap: 2,
              padding: "5px 9px", borderRadius: 7, minWidth: 72,
              background: "rgba(12,14,18,0.92)",
              border: `1px solid ${kpi.tone === "positive" ? "rgba(34,197,94,0.18)" : kpi.tone === "negative" ? "rgba(239,68,68,0.18)" : "rgba(232,237,244,0.12)"}`,
            }}>
              <span style={{ fontFamily: FONT, fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(180,192,210,0.5)" }}>
                {kpi.label}
              </span>
              <span style={{
                fontFamily: FONT, fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                color: kpi.tone === "positive" ? "#4ADE80" : kpi.tone === "negative" ? "#F87171" : "#D6B24A",
              }}>
                {kpi.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function SignalsDashboard() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<IntradayApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("aktuell");

  function resolveInitialSignalId(): string {
    const param = searchParams.get("strategy");
    if (param) {
      // accept both "intraday-dax-2h" style and "DAX_2H" engine key style
      const known = ["intraday-dax-2h", "intraday-dax-1h", "intraday-eur-30m"];
      if (known.includes(param)) return param;
      if (param === "DAX_2H") return "intraday-dax-2h";
      if (param === "DAX_1H") return "intraday-dax-1h";
      if (param === "EUR_30M") return "intraday-eur-30m";
    }
    return "intraday-dax-2h";
  }

  const [selectedId, setSelectedId] = useState<string>(resolveInitialSignalId);

  const fetchData = useCallback(async () => {
    try {
      const [intradayRes, wsRes] = await Promise.allSettled([
        fetch("/api/signals/intraday").then(r => r.ok ? r.json() as Promise<IntradayApiResponse> : null),
        fetch("/api/signals/white-swan").then(r => r.ok ? r.json() as Promise<{ cards: SignalCardModel[] }> : null),
      ]);

      const intraday = intradayRes.status === "fulfilled" ? intradayRes.value : null;
      const ws = wsRes.status === "fulfilled" ? wsRes.value : null;

      const intradayCards: SignalCardModel[] = intraday?.cards ?? [];
      const wsCards: SignalCardModel[] = ws?.cards ?? [];

      // Merge: intraday cards first, then white swan (avoiding duplication by id)
      const intradayIds = new Set(intradayCards.map(c => c.id));
      const merged = [...intradayCards, ...wsCards.filter(c => !intradayIds.has(c.id))];

      setData({
        cards: merged,
        tradeSets: intraday?.tradeSets ?? [],
        generatedAtUtc: intraday?.generatedAtUtc ?? new Date().toISOString(),
        sourceStatus: intraday?.sourceStatus ?? "ok",
      });
    } catch {
      // keep stale on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const allWhiteSwanCards = data?.cards.filter(c => c.group === "white_swan") ?? [];
  const coreInvestCards = data?.cards.filter(c => c.group === "core_invest") ?? [];

  function isRelevantToday(card: SignalCardModel): boolean {
    if (!card.signalDate) return true;
    const diff = (new Date(card.signalDate).getTime() - Date.now()) / 86_400_000;
    return diff <= 1;
  }

  const whiteSwanCards = allWhiteSwanCards.filter(isRelevantToday);
  const pendingCards = allWhiteSwanCards.filter(c => !isRelevantToday(c));

  const selectedCard = data?.cards.find(c => c.id === selectedId) ?? null;
  const selectedTradeSet = data?.tradeSets.find(ts => ts.strategyId === selectedCard?.strategyId) ?? null;

  const activeCount = whiteSwanCards.filter(c => c.signalState === "ACTIVE").length;

  return (
    <div style={{ display: "flex", gap: 10, height: "100%", padding: "14px 16px 16px", minHeight: 0 }}>

      {/* ── Left panel ── */}
      <div style={{ flex: "0 0 50%", minWidth: 320, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>

        {/* White Swan (60%) */}
        <PanelShell
          title="White Swan"
          badge={
            activeCount > 0 ? (
              <span style={{
                padding: "1px 7px", borderRadius: 20, fontSize: 9, fontWeight: 700,
                background: "rgba(34,197,94,0.12)", color: "#4ADE80",
                border: "1px solid rgba(34,197,94,0.22)", letterSpacing: "0.06em",
              }}>
                {activeCount} AKTIV
              </span>
            ) : null
          }
          style={{ flex: "0 0 60%", minHeight: 280 }}
        >
          {data && (
            <SourceBanner sourceStatus={data.sourceStatus} generatedAt={data.generatedAtUtc} />
          )}
          <TabBar active={tab} onChange={setTab} />

          {loading && (
            <div style={{ padding: "24px 14px", textAlign: "center", fontFamily: FONT, fontSize: 12, color: "rgba(180,192,210,0.35)" }}>
              <span className="animate-pulse">Lade Signale…</span>
            </div>
          )}

          {!loading && tab === "aktuell" && (
            <div>
              {whiteSwanCards.length === 0 && (
                <div style={{ padding: "24px 14px", textAlign: "center", fontFamily: FONT, fontSize: 12, color: "rgba(180,192,210,0.35)" }}>
                  Keine Strategien verfügbar
                </div>
              )}
              {whiteSwanCards.map(card => (
                <StrategyRow
                  key={card.id}
                  card={card}
                  selected={selectedId === card.id}
                  onClick={() => setSelectedId(card.id)}
                />
              ))}
            </div>
          )}

          {!loading && tab === "letzte7" && (
            <TradeHistoryRows tradeSets={data?.tradeSets.filter(ts =>
              whiteSwanCards.some(c => c.strategyId === ts.strategyId)
            ) ?? []} />
          )}

          {!loading && tab === "ausstehend" && (
            <div>
              {pendingCards.length === 0 ? (
                <div style={{ padding: "24px 14px", textAlign: "center", fontFamily: FONT, fontSize: 12, color: "rgba(180,192,210,0.35)" }}>
                  Keine ausstehenden Signale
                </div>
              ) : (
                pendingCards.map(card => (
                  <StrategyRow
                    key={card.id}
                    card={card}
                    selected={selectedId === card.id}
                    onClick={() => setSelectedId(card.id)}
                  />
                ))
              )}
            </div>
          )}
        </PanelShell>

        {/* Core Invest (40%) */}
        <PanelShell
          title="Core Invest"
          style={{ flex: "0 0 40%", minHeight: 160 }}
        >
          {coreInvestCards.length === 0 ? (
            <div style={{ padding: "24px 14px", textAlign: "center", fontFamily: FONT, fontSize: 12, color: "rgba(180,192,210,0.35)" }}>
              Keine Core-Invest-Signale aktiv
            </div>
          ) : (
            coreInvestCards.map(card => (
              <StrategyRow
                key={card.id}
                card={card}
                selected={selectedId === card.id}
                onClick={() => setSelectedId(card.id)}
              />
            ))
          )}
        </PanelShell>
      </div>

      {/* ── Right panel ── */}
      <div style={{
        flex: "0 0 50%", minWidth: 320,
        background: "linear-gradient(to bottom, #1c1d22, #111114)",
        border: "1px solid rgba(255,255,255,0.065)",
        borderRadius: 10, overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        <DetailPanel card={selectedCard} tradeSet={selectedTradeSet} />
      </div>

    </div>
  );
}
