"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart2, ChartNoAxesCombined } from "lucide-react";
import { useRouter } from "next/navigation";
import MonitoringChart from "@/components/monitoring/MonitoringChart";
import StrategyTesterDrawdownChart from "@/components/monitoring/StrategyTesterDrawdownChart";
import StrategyTesterEquityChart from "@/components/monitoring/StrategyTesterEquityChart";
import { useClientMounted } from "@/hooks/use-client-mounted";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import { writeMonitoringSignalJump } from "@/lib/monitoring/monitoringSignalJump";
import type { SignalCardData, SignalCardFilter, SignalPageData, SignalPageSection } from "@/lib/signal/signalPageData";

const STORAGE_KEYS = {
  signalId: "capitalife.signal.selectedSignalId",
  whiteSwanFilter: "capitalife.signal.whiteSwanFilter",
  coreInvestFilter: "capitalife.signal.coreInvestFilter",
  monitoringContext: "capitalife.monitoring.context",
};

const FILTERS: SignalCardFilter[] = ["open", "all", "long", "short", "cash", "validation"];
const FILTER_LABELS: Record<SignalCardFilter, string> = {
  open: "AKTUELL", all: "ALLE", long: "LONG", short: "SHORT", cash: "CASH", validation: "VAL",
};

// Parse "Fr 25.07." / "Do 23.07." labels → days from today (null if no concrete date found)
function nextLabelDaysAhead(label: string | undefined): number | null {
  if (!label) return null;
  const match = label.match(/(\d{2})\.(\d{2})\./);
  if (!match) return null;
  const [, dd, mm] = match;
  const year = new Date().getFullYear();
  const date = new Date(`${year}-${mm}-${dd}T00:00:00`);
  if (!isFinite(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((date.getTime() - today.getTime()) / 86_400_000);
}

function matchesFilter(card: SignalCardData, filter: SignalCardFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") {
    // C1: active direction + recent signalDate
    if ((card.direction === "LONG" || card.direction === "SHORT") && card.signalDate != null) return true;
    // C2: concrete tp + sl present (open position with levels)
    if (card.tp != null && card.sl != null) return true;
    // C3: next signal is within 3 days (concrete date in label)
    const daysAhead = nextLabelDaysAhead(card.nextSignalLabel);
    if (daysAhead != null && daysAhead >= 0 && daysAhead <= 3) return true;
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

function metricTone(tone?: "positive" | "negative" | "neutral"): string {
  if (tone === "positive") return "text-emerald-300/90";
  if (tone === "negative") return "text-rose-300/90";
  return "text-white/90";
}

// ── Section lead ───────────────────────────────────────────────────────────────

function SectionLead({ section }: { section: SignalPageSection["id"] }) {
  if (section === "white_swan") {
    return (
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/white-swan-logo.png"
          alt="White Swan"
          width={18}
          height={18}
          style={{ width: 18, height: 18, objectFit: "contain" }}
        />
        <span className="text-[14px] font-semibold text-white/90">White Swan</span>
        <span className="text-[9px] text-zinc-600">Live Signals</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-4 w-4 items-center justify-center rounded-full border border-[#d8bc67]/40 text-[8px] font-bold text-[#d8bc67]/80">
        CI
      </div>
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

  return (
    <div
      onClick={() => onSelect(card)}
      className={`cursor-pointer rounded-xl p-3 flex flex-col gap-[5px] border transition-colors ${active ? "border-zinc-600 bg-gradient-to-b from-[#1c1d20] to-[#141517] shadow-[2px_2px_0_0_rgba(255,255,255,0.08)]" : "border-zinc-800 bg-gradient-to-b from-[#1c1d20] to-[#141517] hover:border-zinc-700"}`}
    >
      {/* Zeile 1: Symbol fett groß · AssetName · % rechts */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[13px] font-bold text-white">{card.displaySymbol}</span>
          <span className="text-[9px] text-zinc-400 ml-1.5">{card.assetName}</span>
        </div>
        {pct != null && (
          <span className={`text-[11px] font-semibold ${pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pctText}</span>
        )}
      </div>

      {/* Zeile 2: Strategie-Name */}
      <div className="text-[10px] font-semibold text-zinc-300 leading-tight truncate">{card.strategyName}</div>

      {/* Zeile 3: TP/SL + Signal-Datum */}
      <div className="flex items-center gap-2">
        {card.tp != null && <span className="text-[8px] font-medium text-emerald-400">TP: {card.tp}</span>}
        {card.sl != null && <span className="text-[8px] font-medium text-rose-500">SL: {card.sl}</span>}
        <span className="text-[8.5px] text-zinc-500">
          {card.signalDate
            ? `${card.signalDate}${card.ageDays != null ? ` · ${card.ageDays}T` : ""}`
            : (card.nextSignalLabel && !card.nextSignalLabel.includes("täglich"))
              ? `nächste: ${card.nextSignalLabel}`
              : null}
        </span>
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

  const colCount = section.id === "core_invest" ? 2 : 3;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SectionLead section={section.id} />
        <FilterBar active={activeFilter} onChange={onFilterChange} />
      </div>

      <div className={`grid min-h-0 gap-4`} style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0,1fr))` }}>
        {groups.map((group) => (
          <div key={group.id} className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[11px] font-semibold text-zinc-300">{group.title}</h3>
              <span className="text-[9px] text-zinc-600">Open · {group.visibleCards.length}</span>
            </div>

            <div className={scrollCards ? "min-h-0 space-y-2 overflow-y-auto pr-0.5" : "space-y-2"}>
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

function PreviewMetric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" | "neutral" }) {
  return (
    <div className="rounded-[10px] border border-white/[0.06] bg-[#111216] px-3 py-2">
      <div className="truncate text-[7px] uppercase tracking-[0.10em] text-zinc-600">{label}</div>
      <div className={`mt-1 text-[12px] font-semibold leading-none ${metricTone(tone)}`}>{value}</div>
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

        {/* ── RIGHT: detail panel ───────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">

          {/* Chart — 43% */}
          <div className="relative flex-[43] min-h-0 overflow-hidden rounded-[16px] border border-white/[0.06] bg-[#09090a]">
            {/* asset badge */}
            <div className="pointer-events-none absolute right-4 top-4 z-10 flex items-center gap-2 rounded-[12px] border border-white/[0.08] bg-black/50 px-2.5 py-1.5 backdrop-blur-sm">
              {selectedIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedIconUrl} alt="" className="h-6 w-6 flex-shrink-0 rounded-[7px] border border-white/[0.08] object-cover" />
              ) : (
                <div className="h-6 w-6 flex-shrink-0 rounded-[7px] border border-white/[0.07] bg-white/[0.03]" />
              )}
              <div className="min-w-0">
                <div className="truncate text-[10px] font-bold text-white leading-none">{selectedCard?.displaySymbol ?? "—"}</div>
                <div className="truncate text-[8px] text-zinc-500 leading-none mt-0.5">{selectedCard?.assetName ?? "Keine Auswahl"}</div>
              </div>
            </div>

            <div className="h-full w-full">
              {mounted && selectedPreview?.chart ? (
                <MonitoringChart data={selectedPreview.chart} maxBars={320} initialVisibleBars={56} />
              ) : (
                <div className="grid h-full place-items-center text-[10px] text-zinc-700">Keine Chart-Daten</div>
              )}
            </div>
          </div>

          {/* Strategy Tester — 38% */}
          <div className="flex-[38] min-h-0 flex flex-col overflow-hidden rounded-[16px] border border-white/[0.06] bg-[#0b0c0f]">
            <div className="flex-shrink-0 border-b border-white/[0.06] px-4 py-2">
              <span className="text-[10px] font-semibold text-white/70">Strategie Tester</span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {mounted && selectedPreview?.performance ? (
                <div className="grid h-full min-h-0 grid-rows-[1.44fr_1fr] gap-2 p-2">
                  <div className="min-h-0 overflow-hidden rounded-[12px] border border-white/[0.05] bg-[#0a0c0f] p-1.5">
                    <StrategyTesterEquityChart
                      data={selectedPreview.performance.equityCurve}
                      totalReturnPercent={selectedPreview.performance.summary.totalReturnPercent}
                      cagr={selectedPreview.performance.summary.cagr}
                      fillContainer
                    />
                  </div>
                  <div className="min-h-0 overflow-hidden rounded-[12px] border border-white/[0.05] bg-[#0a0c0f] p-1.5">
                    <StrategyTesterDrawdownChart
                      data={selectedPreview.performance.drawdownCurve}
                      maxDrawdownPercent={selectedPreview.performance.summary.maxDrawdownPercent}
                      avgDrawdownPercent={selectedPreview.performance.summary.avgDrawdownPercent}
                      top5DrawdownsPercent={selectedPreview.performance.summary.top5DrawdownsPercent}
                      fillContainer
                    />
                  </div>
                </div>
              ) : (
                <div className="grid h-full place-items-center text-[10px] text-zinc-700">Tester-Daten fehlen</div>
              )}
            </div>
          </div>

          {/* KPI row — 19% */}
          <div className="flex-[19] min-h-0 grid grid-cols-3 gap-2 content-start overflow-hidden">
            {(selectedPreview?.kpis ?? []).slice(0, 6).map((metric) => (
              <PreviewMetric key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
