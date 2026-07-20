"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { BarChart2, ChartNoAxesCombined } from "lucide-react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import MonitoringChart from "@/components/monitoring/MonitoringChart";
import StrategyTesterDrawdownChart from "@/components/monitoring/StrategyTesterDrawdownChart";
import StrategyTesterEquityChart from "@/components/monitoring/StrategyTesterEquityChart";
import { useClientMounted } from "@/hooks/use-client-mounted";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import { writeMonitoringSignalJump } from "@/lib/monitoring/monitoringSignalJump";
import type { SignalCardData, SignalCardFilter, SignalPageData, SignalPageSection } from "@/lib/signal/signalPageData";

// ── Anomaly equity data ────────────────────────────────────────────────────────
const ANOMALY_FILES: Record<string, string> = {
  "fp10-gc1-friday-long": "/data/anomaly/gc1_friday_long.json",
  "fp10-gld-thursday-long": "/data/anomaly/gld_thursday_long.json",
  "fp10-ym1-tat": "/data/anomaly/ym1_tat.json",
};

type AnomalyPoint = { time: string; value: number };
type AnomalyJson = {
  oosStartDate?: string;
  equityCurve: { full: AnomalyPoint[]; is_?: AnomalyPoint[]; oos?: AnomalyPoint[] };
  drawdownCurve?: { full?: AnomalyPoint[] };
  trades?: { pnl: number; exit_time: string }[];
  summary?: { full?: { cagr?: number; maxDrawdownPercent?: number; avgDrawdownPercent?: number; top5DrawdownsPercent?: number[]; totalReturnPercent?: number; sharpe?: number; avgLoss?: number } };
};
type EquitySeries = { date: string; equity: number | null; equityOos: number | null; dd: number | null }[];

const STORAGE_KEYS = {
  signalId: "capitalife.signal.selectedSignalId",
  whiteSwanFilter: "capitalife.signal.whiteSwanFilter",
  coreInvestFilter: "capitalife.signal.coreInvestFilter",
  monitoringContext: "capitalife.monitoring.context",
};

const FILTERS: SignalCardFilter[] = ["open", "all"];
const FILTER_LABELS: Record<SignalCardFilter, string> = {
  open: "AKTUELL", all: "ALLE", long: "LONG", short: "SHORT", cash: "CASH", validation: "VAL",
};

// Parse "Fr 25.07." / "Do 23.07." or ISO "2026-07-21" labels → days from today
function nextLabelDaysAhead(label: string | undefined): number | null {
  if (!label) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const date = new Date(`${label}T00:00:00`);
    if (!isFinite(date.getTime())) return null;
    return Math.floor((date.getTime() - today.getTime()) / 86_400_000);
  }
  // German format: "Fr 25.07." / "Do 23.07."
  const match = label.match(/(\d{2})\.(\d{2})\./);
  if (!match) return null;
  const [, dd, mm] = match;
  const date = new Date(`${today.getFullYear()}-${mm}-${dd}T00:00:00`);
  if (!isFinite(date.getTime())) return null;
  return Math.floor((date.getTime() - today.getTime()) / 86_400_000);
}

// Format ISO "2026-07-21" or German "Fr 25.07." label into short display form
function formatNextSignalDisplay(label: string | undefined): string | null {
  if (!label || label.includes("täglich")) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const date = new Date(`${label}T00:00:00`);
    if (!isFinite(date.getTime())) return null;
    const wd = date.toLocaleDateString("de-DE", { weekday: "short" });
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    return `${wd} ${dd}.${mm}.`;
  }
  return label;
}

// Status badge: MORGEN / WARTEN based on signal timing (AKTIV intentionally omitted)
function cardBadge(card: SignalCardData): { text: string; cls: string } | null {
  const days = nextLabelDaysAhead(card.nextSignalLabel);
  if (days === 0) return { text: "HEUTE", cls: "text-emerald-400 border-emerald-400/25 bg-emerald-400/10" };
  if (days === 1) {
    const dateLabel = formatNextSignalDisplay(card.nextSignalLabel);
    const text = dateLabel ? `MORGEN · ${dateLabel} 09:30` : "MORGEN";
    return { text, cls: "text-amber-400 border-amber-400/25 bg-amber-400/10" };
  }
  if (days != null && days >= 2 && days <= 7) return { text: "WARTEN", cls: "text-zinc-400 border-zinc-600/40 bg-zinc-700/20" };
  return null;
}

function matchesFilter(card: SignalCardData, filter: SignalCardFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") {
    // C1: active direction + recent signalDate
    if ((card.direction === "LONG" || card.direction === "SHORT") && card.signalDate != null) return true;
    // C2: concrete tp + sl present (open position with levels)
    if (card.tp != null && card.sl != null) return true;
    // C3: next signal is today or tomorrow
    const daysAhead = nextLabelDaysAhead(card.nextSignalLabel);
    if (daysAhead != null && daysAhead >= 0 && daysAhead <= 1) return true;
    return false;
  }
  if (filter === "long") return card.direction === "LONG";
  if (filter === "short") return card.direction === "SHORT";
  if (filter === "cash") return card.direction === "CASH" || card.direction === "PENDING";
  return card.status === "VALIDATION" || card.status === "PARITY_PENDING" || card.category === "research_validation";
}

function formatPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatPrice(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function directionClass(direction: SignalCardData["direction"]): string {
  if (direction === "LONG") return "text-emerald-400";
  if (direction === "SHORT") return "text-rose-400";
  if (direction === "PENDING") return "text-amber-400/80";
  return "text-zinc-500";
}

function changePctClass(pct: number | null | undefined): string {
  if (pct == null) return "text-zinc-600";
  return pct >= 0 ? "text-emerald-400/70" : "text-rose-400/70";
}


// ── Section lead ───────────────────────────────────────────────────────────────

function SectionLead({ section }: { section: SignalPageSection["id"] }) {
  if (section === "white_swan") {
    return (
      <div className="flex items-center gap-2">
        <Image
          src="/branding/white-swan-logo.png"
          alt="White Swan"
          width={18}
          height={18}
          style={{ objectFit: "contain" }}
          priority
        />
        <span className="text-[14px] font-semibold text-white/90">White Swan</span>
        <span className="text-[9px] text-zinc-600">Live Signals</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Image
        src="/branding/capitalife-favicon.png"
        alt="Capitalife"
        width={18}
        height={18}
        style={{ objectFit: "contain" }}
        priority
      />
      <span className="text-[14px] font-semibold text-white/90">Core Invest</span>
      <span className="text-[9px] text-zinc-600">Live Signals</span>
    </div>
  );
}

// ── Filter bar ─────────────────────────────────────────────────────────────────

function FilterBar({ active, onChange }: { active: SignalCardFilter; onChange: (f: SignalCardFilter) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          className={`rounded-full border px-2 py-[2px] text-[7.5px] font-semibold tracking-[0.10em] transition ${
            active === f
              ? "border-[#d8bc67]/30 bg-[#1a180e] text-[#d8bc67]/90"
              : "border-white/[0.06] bg-transparent text-zinc-600 hover:text-zinc-400"
          }`}
        >
          {FILTER_LABELS[f]}
        </button>
      ))}
    </div>
  );
}

// ── Asset icon ─────────────────────────────────────────────────────────────────

function AssetIcon({ iconKey, assetSymbol, assetName, displaySymbol, size, className }: {
  iconKey?: string; assetSymbol?: string; assetName?: string; displaySymbol?: string;
  size: number; className?: string;
}) {
  const url = getMonitoringAssetIconUrl({ code: assetSymbol ?? "", assetId: iconKey, name: assetName ?? "", displaySymbol: displaySymbol ?? "" });
  if (!url) return <div style={{ width: size, height: size }} className={`rounded bg-zinc-800 ${className ?? ""}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={assetName ?? ""} width={size} height={size} className={className} />;
}

// ── Signal card ────────────────────────────────────────────────────────────────

const SignalCard = ({ card, active, onSelect }: { card: SignalCardData; active: boolean; onSelect: (c: SignalCardData) => void }) => {
  const pct = card.changePct
  const pctText = pct == null ? "" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`

  const badge = cardBadge(card);

  return (
    <div
      onClick={() => onSelect(card)}
      className={`relative cursor-pointer rounded-xl p-3 flex flex-col gap-[5px] border transition-colors ${active ? "border-zinc-600 bg-gradient-to-b from-[#1c1d20] to-[#141517] shadow-[2px_2px_0_0_rgba(255,255,255,0.08)]" : "border-zinc-800 bg-gradient-to-b from-[#1c1d20] to-[#141517] hover:border-zinc-700"}`}
    >
      {badge && (
        <span className={`absolute top-2 right-2 text-[7px] font-bold tracking-wide px-1 py-[1px] rounded border ${badge.cls}`}>
          {badge.text}
        </span>
      )}
      {pct != null && (
        <span className={`absolute top-2.5 right-3 text-[11px] font-semibold ${pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pctText}</span>
      )}
      {/* Zeile 1: Icon · Symbol · AssetName */}
      <div className="flex items-center gap-2 pr-14">
        <AssetIcon
          assetSymbol={card.assetSymbol}
          iconKey={card.iconKey}
          assetName={card.assetName}
          displaySymbol={card.displaySymbol}
          size={20}
          className="rounded-[5px] border border-white/[0.08] object-cover flex-shrink-0"
        />
        <div className="min-w-0">
          <span className="text-[13px] font-bold text-white">{card.displaySymbol}</span>
          <span className="text-[9px] text-zinc-400 ml-1.5">{card.assetName}</span>
        </div>
      </div>

      {/* Zeile 2: Strategie-Name · Datum kompakt */}
      <div className="flex items-baseline gap-1 leading-tight min-w-0">
        <span className="text-[10px] font-semibold text-zinc-300 shrink-0 truncate max-w-[60%]">{card.strategyName}</span>
        {card.signalDate ? (
          <span className="text-[8.5px] text-zinc-500 truncate">· Signal: {card.signalDate}{card.ageDays != null ? ` vor ${card.ageDays}T` : ""}</span>
        ) : formatNextSignalDisplay(card.nextSignalLabel) ? (
          <span className="text-[8.5px] text-zinc-500 truncate">· nächste: {formatNextSignalDisplay(card.nextSignalLabel)}</span>
        ) : null}
      </div>

      {/* Zeile 3: TP/SL */}
      <div className="flex items-center gap-2">
        {card.tp != null && <span className="text-[8px] font-medium text-emerald-400">TP: {card.tp}</span>}
        {card.sl != null && <span className="text-[8px] font-medium text-rose-500">SL: {card.sl}</span>}
      </div>


      {/* Zeile 4: Badge · Chart-Icon */}
      <div className="flex items-center justify-between mt-0.5">
        {(card.direction === "LONG" || card.direction === "SHORT") ? (
          <span className={`text-[10px] font-bold flex items-center gap-1 ${card.direction === "LONG" ? "text-emerald-400" : "text-rose-400"}`}>
            {card.direction === "LONG" ? "▲" : "▼"} {card.direction}
          </span>
        ) : <span />}
        <BarChart2 size={12} className="text-zinc-600" />
      </div>
    </div>
  )
}

// ── Section block ──────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  selectedCardId,
  activeFilter,
  onFilterChange,
  onSelect,
  scrollCards = false,
}: {
  section: SignalPageSection;
  selectedCardId: string | null;
  activeFilter: SignalCardFilter;
  onFilterChange: (f: SignalCardFilter) => void;
  onSelect: (card: SignalCardData) => void;
  scrollCards?: boolean;
}) {
  const groups = useMemo(
    () =>
      section.groups.map((group) => ({
        ...group,
        visibleCards: group.cards.filter((card) => matchesFilter(card, activeFilter)),
      })),
    [activeFilter, section.groups],
  );

  const visibleGroups = groups.filter((g) => g.visibleCards.length > 0);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SectionLead section={section.id} />
        <FilterBar active={activeFilter} onChange={onFilterChange} />
      </div>

      <div className="grid min-h-0 gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(280px, 1fr))` }}>
        {visibleGroups.map((group) => (
          <div key={group.id} className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[11px] font-semibold text-zinc-300">{group.title}</h3>
              <span className="text-[9px] text-zinc-600">Open · {group.visibleCards.length}</span>
            </div>

            <div className={scrollCards ? "min-h-0 grid gap-2 overflow-y-auto pr-0.5" : "grid gap-2"} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              {group.visibleCards.length ? (
                group.visibleCards.map((card) => (
                  <SignalCard
                    key={card.id}
                    card={card}
                    active={selectedCardId === card.id}
                    onSelect={onSelect}
                  />
                ))
              ) : (
                <div className="rounded-[12px] border border-dashed border-white/[0.06] px-3 py-4 text-[9px] text-zinc-700">
                  Keine Signale
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────────

function PreviewMetric({ label, value }: { label: string; value: string; tone?: "positive" | "negative" | "neutral" }) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-zinc-800 bg-gradient-to-b from-[#1c1d20] to-[#141517] p-2 h-full">
      <div className="text-[9px] uppercase tracking-wider text-zinc-500 leading-none">{label}</div>
      <div className="text-[16px] font-bold leading-none text-white">{value}</div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function buildInitialCard(data: SignalPageData): string | null {
  return data.cards[0]?.id ?? null;
}

export default function SignalPage({ data }: { data: SignalPageData }) {
  const mounted = useClientMounted();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(() => buildInitialCard(data));
  const [whiteSwanFilter, setWhiteSwanFilter] = useState<SignalCardFilter>("open");
  const [coreInvestFilter, setCoreInvestFilter] = useState<SignalCardFilter>("open");
  const [equitySeries, setEquitySeries] = useState<EquitySeries | null>(null);
  const [anomalyPerf, setAnomalyPerf] = useState<{
    equityCurve: { time: string; value: number }[];
    drawdownCurve: { time: string; value: number }[];
    maxDrawdownPercent?: number;
  } | null>(null);

  const selectedCard = useMemo(
    () => data.cards.find((c) => c.id === selectedCardId) ?? data.cards[0] ?? null,
    [data.cards, selectedCardId],
  );
  const selectedPreview = selectedCard ? (data.previews[selectedCard.id] ?? null) : null;
  const selectedIconUrl = selectedCard
    ? getMonitoringAssetIconUrl({
        code: selectedCard.assetSymbol,
        assetId: selectedCard.iconKey,
        name: selectedCard.assetName,
        displaySymbol: selectedCard.displaySymbol,
      })
    : null;

  useEffect(() => {
    if (!mounted) return;
    const first = data.cards.find((c) => {
      const p = data.previews[c.id];
      return Boolean(p?.chart || p?.performance);
    });
    setSelectedCardId(first?.id ?? buildInitialCard(data));
    setWhiteSwanFilter("open");
    setCoreInvestFilter("open");
  }, [data.cards, mounted]);

  useEffect(() => {
    if (!mounted || !selectedCard) return;
    window.localStorage.setItem(STORAGE_KEYS.signalId, selectedCard.id);
  }, [mounted, selectedCard]);

  // Load anomaly equity data for selected card
  useEffect(() => {
    const filePath = selectedCardId ? ANOMALY_FILES[selectedCardId] : undefined;
    if (!filePath) { setEquitySeries(null); setAnomalyPerf(null); return; }
    let cancelled = false;
    fetch(filePath)
      .then((r) => r.json() as Promise<AnomalyJson>)
      .then((json) => {
        if (cancelled) return;
        // R-based equity + drawdown from trades (no compounding)
        const trades = json.trades ?? [];
        const rUnit = Math.abs(json.summary?.full?.avgLoss ?? 0) || 1;
        let cumR = 0;
        let peakR = 0;
        const equityCurve: { time: string; value: number }[] = [];
        const drawdownCurve: { time: string; value: number }[] = [];
        if (trades.length) {
          equityCurve.push({ time: trades[0]!.exit_time, value: 0 });
          drawdownCurve.push({ time: trades[0]!.exit_time, value: 0 });
        }
        for (const t of trades) {
          cumR += t.pnl / rUnit;
          if (cumR > peakR) peakR = cumR;
          equityCurve.push({ time: t.exit_time, value: cumR });
          drawdownCurve.push({ time: t.exit_time, value: cumR - peakR });
        }
        const maxDd = drawdownCurve.reduce((m, p) => Math.min(m, p.value), 0);
        // Equityseries for main chart (unchanged %-compounded)
        const oosStart = json.oosStartDate ?? "";
        const full = json.equityCurve.full ?? [];
        if (full.length) {
          const base = full[0]!.value;
          const ddFull = json.drawdownCurve?.full ?? [];
          const series: EquitySeries = full.map((p, i) => {
            const isOos = p.time >= oosStart;
            const eq = ((p.value / base) - 1) * 100;
            const dd = ddFull[i]?.value ?? 0;
            return { date: p.time, equity: isOos ? null : eq, equityOos: isOos ? eq : null, dd };
          });
          setEquitySeries(series);
        } else {
          setEquitySeries(null);
        }
        setAnomalyPerf({
          equityCurve,
          drawdownCurve,
          maxDrawdownPercent: maxDd,
        });
      })
      .catch(() => { if (!cancelled) { setEquitySeries(null); setAnomalyPerf(null); } });
    return () => { cancelled = true; };
  }, [selectedCardId]);

  const whiteSwan = data.sections.find((s) => s.id === "white_swan");
  const coreInvest = data.sections.find((s) => s.id === "core_invest");

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-[#09090b] px-6 py-4">
      <div className="grid min-h-0 w-full flex-1 overflow-hidden gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">

        {/* ── LEFT: signal groups ───────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-col overflow-hidden border-r border-white/[0.06] pr-5">

          {/* White Swan — top 60% */}
          <div className="flex min-h-0 flex-[3] flex-col overflow-hidden">
            {whiteSwan ? (
              <SectionBlock
                section={whiteSwan}
                selectedCardId={selectedCardId}
                activeFilter={whiteSwanFilter}
                onFilterChange={setWhiteSwanFilter}
                onSelect={(card) => setSelectedCardId(card.id)}
                scrollCards
              />
            ) : null}
          </div>

          <div className="my-4 h-px flex-shrink-0 bg-white/[0.06]" />

          {/* Core Invest — bottom 40% */}
          <div className="flex min-h-0 flex-[2] flex-col overflow-hidden">
            {coreInvest ? (
              <SectionBlock
                section={coreInvest}
                selectedCardId={selectedCardId}
                activeFilter={coreInvestFilter}
                onFilterChange={setCoreInvestFilter}
                onSelect={(card) => setSelectedCardId(card.id)}
                scrollCards
              />
            ) : null}
          </div>
        </div>

        {/* ── RIGHT: detail panel — 50/40/10 layout ───────────────────────── */}
        <div className="flex min-h-0 flex-col overflow-hidden">

          {/* Row 1 — Chart 50vh */}
          <div className="relative overflow-hidden border-b border-white/[0.04] bg-[#09090a]" style={{ height: "50vh" }}>
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-[10px] border border-white/[0.08] bg-black/60 px-2.5 py-1.5 backdrop-blur-sm">
              {selectedIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedIconUrl} alt="" className="h-5 w-5 flex-shrink-0 rounded-[5px] border border-white/[0.08] object-cover" />
              ) : (
                <div className="h-5 w-5 flex-shrink-0 rounded-[5px] border border-white/[0.07] bg-white/[0.04]" />
              )}
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-white leading-none">{selectedCard?.displaySymbol ?? "—"}</span>
                <span className="text-[9px] text-zinc-400 ml-1.5 leading-none">{selectedCard?.strategyName ?? ""}</span>
              </div>
            </div>
            {mounted && selectedPreview?.chart ? (
              <MonitoringChart data={selectedPreview.chart} maxBars={320} initialVisibleBars={56} />
            ) : (
              <div className="grid h-full place-items-center">
                <div className="text-center">
                  <div className="text-[10px] text-zinc-600">Keine OHLC-Daten für {selectedCard?.displaySymbol ?? "dieses Asset"}</div>
                  <div className="text-[8px] text-zinc-700 mt-0.5">{selectedCard?.strategyName ?? ""}</div>
                </div>
              </div>
            )}
          </div>

          {/* Row 2 — Equity + DD 40vh */}
          {(() => {
            const perf = anomalyPerf ?? (selectedPreview?.performance ? {
              equityCurve: selectedPreview.performance.equityCurve,
              drawdownCurve: selectedPreview.performance.drawdownCurve,
              cagr: selectedPreview.performance.summary.cagr,
              maxDrawdownPercent: selectedPreview.performance.summary.maxDrawdownPercent,
              totalReturnPercent: selectedPreview.performance.summary.totalReturnPercent,
              avgDrawdownPercent: selectedPreview.performance.summary.avgDrawdownPercent,
              top5DrawdownsPercent: selectedPreview.performance.summary.top5DrawdownsPercent,
            } : null);
            // For anomaly cards cagr/totalReturnPercent are not R-based; pass undefined
            const isAnomaly = Boolean(anomalyPerf);
            return (
              <div className="flex flex-col overflow-hidden border-b border-white/[0.04]" style={{ height: "40vh" }}>
                {mounted && perf ? (
                  <>
                    <div className="min-h-0 overflow-hidden p-1.5" style={{ height: "65%" }}>
                      <StrategyTesterEquityChart
                        data={perf.equityCurve}
                        totalReturnPercent={isAnomaly ? undefined : (perf as { totalReturnPercent?: number }).totalReturnPercent}
                        cagr={isAnomaly ? undefined : (perf as { cagr?: number }).cagr}
                        fillContainer
                      />
                    </div>
                    <div className="min-h-0 overflow-hidden border-t border-white/[0.04] p-1.5" style={{ height: "35%" }}>
                      <StrategyTesterDrawdownChart
                        data={perf.drawdownCurve}
                        maxDrawdownPercent={perf.maxDrawdownPercent}
                        avgDrawdownPercent={isAnomaly ? undefined : (perf as { avgDrawdownPercent?: number }).avgDrawdownPercent}
                        top5DrawdownsPercent={isAnomaly ? undefined : (perf as { top5DrawdownsPercent?: number[] }).top5DrawdownsPercent}
                        fillContainer
                      />
                    </div>
                  </>
                ) : (
                  <div className="grid h-full place-items-center">
                    <span className="text-[10px] text-zinc-700">Kein Backtest verfügbar</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Row 3 — KPI 5er reihe 7vh */}
          <div className="grid grid-cols-5 gap-2 p-2" style={{ height: "7vh" }}>
            {(selectedPreview?.kpis ?? []).slice(0, 5).map((metric) => (
              <PreviewMetric key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
