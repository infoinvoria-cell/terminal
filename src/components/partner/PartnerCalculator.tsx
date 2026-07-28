"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  calcPerformanceFeeDistribution,
  calcAP,
  calcMgmtFeeDistribution,
  calcGrandTotal,
  resolvePartnerTier,
  formatEur,
  formatPct,
} from "@/lib/partner/partnerCalculations";
import { PARTNER_PROGRAM_CONFIG, type PartnerTierId } from "@/lib/partner/partnerProgramConfig";
import { TIER_COLORS } from "@/lib/partner/tierColors";
import { CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────

const CARD =
  "rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]";

const SECTION_LABEL =
  "text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.08em] mb-3";

const INPUT_CLASS =
  "w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#e2ca7a]/40 tabular-nums";

// ── Constants ─────────────────────────────────────────────────────────────────

const TIERS = PARTNER_PROGRAM_CONFIG.tiers;
const LOCKUP_OPTIONS: Array<{ value: 1 | 3 | 5; label: string }> = [
  { value: 1, label: "1 Jahr"  },
  { value: 3, label: "3 Jahre" },
  { value: 5, label: "5 Jahre" },
];
const PRESETS = [
  { label: "50k",  value: 50_000   },
  { label: "100k", value: 100_000  },
  { label: "250k", value: 250_000  },
  { label: "500k", value: 500_000  },
  { label: "1 Mio", value: 1_000_000 },
];
const MAX_INVESTMENT = 50_000_000;
const DEFAULT_MF_RATE = PARTNER_PROGRAM_CONFIG.managementFeeRate;

// ── Sub helpers ───────────────────────────────────────────────────────────────

function clampInvestment(v: number): number {
  return Math.max(0, Math.min(MAX_INVESTMENT, v));
}

function numOrZero(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) || n < 0 ? 0 : n;
}

// ── Toggle button ─────────────────────────────────────────────────────────────

function ToggleBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors",
        active
          ? "border-[#e2ca7a]/40 bg-[#e2ca7a]/10 text-[#e2ca7a]"
          : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}

// ── Row in summary ────────────────────────────────────────────────────────────

function SummaryRow({
  label, value, highlight, muted, indent,
}: {
  label: string; value: string; highlight?: boolean; muted?: boolean; indent?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between py-1 text-[11px]",
      indent && "pl-3",
    )}>
      <span className={cn(
        muted ? "text-zinc-600" : highlight ? "text-[#e2ca7a]" : "text-zinc-400",
      )}>
        {label}
      </span>
      <span className={cn(
        "font-semibold tabular-nums",
        muted ? "text-zinc-600" : highlight ? "text-[#e2ca7a]" : "text-zinc-200",
      )}>
        {value}
      </span>
    </div>
  );
}

function SummaryDivider() {
  return <div className="border-t border-white/[0.05] my-1.5" />;
}

// ── Main component ────────────────────────────────────────────────────────────

export function PartnerCalculator() {
  // ── Section A: Investition ─────────────────────────────────────────────────
  const [investmentStr, setInvestmentStr] = useState("100000");
  const [lockup, setLockup] = useState<1 | 3 | 5>(3);
  const [manualTierId, setManualTierId] = useState<PartnerTierId | null>(null);
  const [isFounder, setIsFounder] = useState(false);

  // ── Section B: Performance Fee ─────────────────────────────────────────────
  const [profitStr, setProfitStr] = useState("25000");
  const [profitMode, setProfitMode] = useState<"eur" | "pct">("eur");
  const [profitPctStr, setProfitPctStr] = useState("25");

  // ── Section C: Management Fee ──────────────────────────────────────────────
  const [mfYears, setMfYears] = useState(1);
  const [mfRatePctStr, setMfRatePctStr] = useState(
    (DEFAULT_MF_RATE * 100).toFixed(1),
  );
  const [mfPartnerPctStr, setMfPartnerPctStr] = useState("");
  const [mfPartnerEnabled, setMfPartnerEnabled] = useState(false);

  // ── Derived values ─────────────────────────────────────────────────────────
  const investmentEur = clampInvestment(numOrZero(investmentStr));

  const autoTier = resolvePartnerTier(investmentEur, isFounder);
  const activeTierId: PartnerTierId = manualTierId ?? autoTier.id;

  const profitEur: number = (() => {
    if (profitMode === "pct") {
      const pct = numOrZero(profitPctStr) / 100;
      return Math.max(0, investmentEur * pct);
    }
    return Math.max(0, numOrZero(profitStr));
  })();

  const mfRatePct = numOrZero(mfRatePctStr) / 100;
  const mfPartnerRate = mfPartnerEnabled ? numOrZero(mfPartnerPctStr) / 100 : null;
  const mfYearsClamped = Math.max(1, Math.min(30, mfYears));

  const isHighTier = activeTierId === "platin" || activeTierId === "black";

  const pf = calcPerformanceFeeDistribution(profitEur, activeTierId);
  const ap = calcAP(investmentEur, lockup);
  const mf = calcMgmtFeeDistribution(investmentEur, mfYearsClamped, mfPartnerRate, mfRatePct);
  const gt = calcGrandTotal(pf, mf, ap);

  const checksumOk = Math.abs(gt.checksum - profitEur) < 0.02;

  const tierColor = TIER_COLORS[activeTierId];

  // ── Preset setter ─────────────────────────────────────────────────────────
  const applyPreset = useCallback((val: number) => {
    setInvestmentStr(String(val));
    setProfitStr(String(Math.round(val * 0.25)));
  }, []);

  const reset = useCallback(() => {
    setInvestmentStr("100000");
    setLockup(3);
    setManualTierId(null);
    setIsFounder(false);
    setProfitStr("25000");
    setProfitMode("eur");
    setProfitPctStr("25");
    setMfYears(1);
    setMfRatePctStr((DEFAULT_MF_RATE * 100).toFixed(1));
    setMfPartnerPctStr("");
    setMfPartnerEnabled(false);
  }, []);

  return (
    <div className={cn(CARD, "p-5 flex flex-col gap-5 h-full min-h-0 overflow-y-auto")}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="text-[13px] font-semibold text-white">Vergütungsrechner</div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RotateCcw size={11} />
          Zurücksetzen
        </button>
      </div>

      {/* Preset buttons */}
      <div className="flex gap-1.5 flex-shrink-0">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => applyPreset(p.value)}
            className={cn(
              "flex-1 py-1 rounded-lg text-[10px] font-semibold border transition-colors",
              investmentEur === p.value
                ? "border-[#e2ca7a]/40 bg-[#e2ca7a]/10 text-[#e2ca7a]"
                : "border-white/[0.08] bg-white/[0.02] text-zinc-500 hover:text-zinc-300",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Main grid: sections left, summary right */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_220px] gap-4 flex-1 min-h-0">
        {/* Left — sections */}
        <div className="flex flex-col gap-4">

          {/* A: Investition */}
          <section className="rounded-[12px] border border-white/[0.05] bg-white/[0.02] p-4">
            <div className={SECTION_LABEL}>A — Investition</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Anlagebetrag (€)</label>
                <input
                  type="number" min={0} max={MAX_INVESTMENT} step={10000}
                  value={investmentStr}
                  onChange={(e) => setInvestmentStr(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Bindungsdauer</label>
                <div className="flex gap-1.5">
                  {LOCKUP_OPTIONS.map((opt) => (
                    <ToggleBtn key={opt.value} active={lockup === opt.value} onClick={() => setLockup(opt.value)}>
                      {opt.label}
                    </ToggleBtn>
                  ))}
                </div>
              </div>
            </div>

            {/* Tier selector */}
            <div className="mt-3">
              <label className="text-[10px] text-zinc-500 mb-1.5 block">
                Partnerstufe{" "}
                {manualTierId === null && (
                  <span className="text-zinc-600">(auto: {autoTier.label})</span>
                )}
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {TIERS.map((t) => {
                  const tc = TIER_COLORS[t.id];
                  const isActive = activeTierId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setManualTierId(manualTierId === t.id ? null : t.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors"
                      style={{
                        borderColor: isActive ? tc.stroke : "rgba(255,255,255,0.07)",
                        background: isActive ? tc.bg : "rgba(255,255,255,0.02)",
                        color: isActive ? tc.text : "#71717a",
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: tc.stroke }}
                      />
                      {tc.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Founder toggle */}
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => setIsFounder(!isFounder)}
                className={cn(
                  "w-8 h-4 rounded-full transition-colors relative flex-shrink-0",
                  isFounder ? "bg-[#e2ca7a]/60" : "bg-white/10",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                    isFounder ? "translate-x-4" : "translate-x-0.5",
                  )}
                />
              </button>
              <span className="text-[11px] text-zinc-400">Founder-Partner (–50 % Schwellen)</span>
            </div>
          </section>

          {/* B: Performance Fee */}
          <section className="rounded-[12px] border border-white/[0.05] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className={cn(SECTION_LABEL, "mb-0")}>B — Performance Fee (Investorengewinn)</div>
              <div className="flex gap-1">
                <ToggleBtn active={profitMode === "eur"} onClick={() => setProfitMode("eur")}>€</ToggleBtn>
                <ToggleBtn active={profitMode === "pct"} onClick={() => setProfitMode("pct")}>%</ToggleBtn>
              </div>
            </div>

            {profitMode === "eur" ? (
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Investorengewinn (€)</label>
                <input
                  type="number" min={0} step={1000}
                  value={profitStr}
                  onChange={(e) => setProfitStr(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Rendite (%)</label>
                  <input
                    type="number" min={0} max={10000} step={1}
                    value={profitPctStr}
                    onChange={(e) => setProfitPctStr(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Entspricht</label>
                  <div className="py-2 px-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[#e2ca7a] font-semibold text-sm tabular-nums">
                    {formatEur(profitEur)}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-2.5 py-2">
                <div className="text-zinc-600 mb-0.5">PF 25 %</div>
                <div className="text-zinc-300 font-semibold tabular-nums">{formatEur(pf.performanceFee)}</div>
              </div>
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-2.5 py-2">
                <div className="text-zinc-600 mb-0.5">InnoInvest</div>
                <div className="text-zinc-400 font-semibold tabular-nums">{formatEur(pf.innoInvestShare)}</div>
              </div>
              <div className="rounded-lg bg-[#e2ca7a]/[0.06] border border-[#e2ca7a]/20 px-2.5 py-2">
                <div className="text-[#e2ca7a]/70 mb-0.5">Partner ({formatPct(TIERS.find(t => t.id === activeTierId)!.clShareRate)})</div>
                <div className="text-[#e2ca7a] font-bold tabular-nums">{formatEur(pf.partnerShare)}</div>
              </div>
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-2.5 py-2">
                <div className="text-zinc-600 mb-0.5">CL Rest</div>
                <div className="text-zinc-500 font-semibold tabular-nums">{formatEur(pf.clRemainder)}</div>
              </div>
            </div>
          </section>

          {/* C: Management Fee */}
          <section className="rounded-[12px] border border-white/[0.05] bg-white/[0.02] p-4">
            <div className={SECTION_LABEL}>C — Verwaltungsgebühr (Mgmt. Fee)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Zeitraum (Jahre)</label>
                <input
                  type="number" min={1} max={30} step={1}
                  value={mfYears}
                  onChange={(e) => setMfYears(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">MF-Satz p.a. (%)</label>
                <input
                  type="number" min={0} max={100} step={0.1}
                  value={mfRatePctStr}
                  onChange={(e) => setMfRatePctStr(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            {isHighTier && (
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setMfPartnerEnabled(!mfPartnerEnabled)}
                    className={cn(
                      "w-7 h-3.5 rounded-full transition-colors relative flex-shrink-0",
                      mfPartnerEnabled ? "bg-[#e2ca7a]/60" : "bg-white/10",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform",
                        mfPartnerEnabled ? "translate-x-3.5" : "translate-x-0.5",
                      )}
                    />
                  </button>
                  <span className="text-[10px] text-zinc-400">Individuelle Partner-Beteiligung ({tierColor.label} only)</span>
                </div>
                {mfPartnerEnabled && (
                  <div>
                    <label className="text-[10px] text-zinc-500 mb-1 block">Beteiligungsquote (%)</label>
                    <input
                      type="number" min={0} max={100} step={1}
                      value={mfPartnerPctStr}
                      onChange={(e) => setMfPartnerPctStr(e.target.value)}
                      placeholder="z.B. 20"
                      className={INPUT_CLASS}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-2.5 py-2">
                <div className="text-zinc-600 mb-0.5">Brutto MF</div>
                <div className="text-zinc-300 font-semibold tabular-nums">{formatEur(mf.grossMgmtFeeEur)}</div>
              </div>
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-2.5 py-2">
                <div className="text-zinc-600 mb-0.5">InnoInvest</div>
                <div className="text-zinc-400 font-semibold tabular-nums">{formatEur(mf.innoInvestShareEur)}</div>
              </div>
              <div className={cn(
                "rounded-lg px-2.5 py-2",
                mf.partnerShareEur > 0
                  ? "bg-[#e2ca7a]/[0.06] border border-[#e2ca7a]/20"
                  : "bg-white/[0.02] border border-white/[0.05]",
              )}>
                <div className="text-zinc-600 mb-0.5">Partner MF</div>
                <div className={cn(
                  "font-semibold tabular-nums",
                  mf.partnerShareEur > 0 ? "text-[#e2ca7a]" : "text-zinc-600",
                )}>
                  {formatEur(mf.partnerShareEur)}
                </div>
              </div>
            </div>
          </section>

          {/* D: AP */}
          <section className="rounded-[12px] border border-white/[0.05] bg-white/[0.02] p-4">
            <div className={SECTION_LABEL}>D — Abschlussprovision (AP)</div>
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-zinc-400">
                {formatPct(ap.rate)} von {formatEur(investmentEur)} ({ap.lockupYears} Jahr{ap.lockupYears > 1 ? "e" : ""} Bindung)
              </div>
              <div className="text-[#e2ca7a] font-bold text-[15px] tabular-nums">
                {formatEur(ap.apAmount)}
              </div>
            </div>
          </section>
        </div>

        {/* Right — summary */}
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.015] p-4 flex flex-col gap-0.5 self-start">
          <div className="text-[11px] font-semibold text-zinc-300 mb-2">Ergebnisübersicht</div>

          <div className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Performance Fee</div>
          <SummaryRow label="Investorgewinn netto" value={formatEur(gt.investorProfit)} />
          <SummaryRow label="InnoInvest (PF)" value={formatEur(pf.innoInvestShare)} muted indent />
          <SummaryRow label="Partner (PF)" value={formatEur(pf.partnerShare)} highlight indent />
          <SummaryRow label="CL (PF Rest)" value={formatEur(pf.clRemainder)} muted indent />

          <SummaryDivider />

          <div className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Abschlussprovision</div>
          <SummaryRow label={`AP (${ap.lockupYears}J)`} value={formatEur(ap.apAmount)} highlight />

          <SummaryDivider />

          <div className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">
            Mgmt. Fee ({mfYearsClamped}J)
          </div>
          <SummaryRow label="Brutto MF" value={formatEur(mf.grossMgmtFeeEur)} />
          <SummaryRow label="InnoInvest (MF)" value={formatEur(mf.innoInvestShareEur)} muted indent />
          <SummaryRow label="Partner (MF)" value={formatEur(mf.partnerShareEur)} highlight={mf.partnerShareEur > 0} muted={mf.partnerShareEur === 0} indent />
          <SummaryRow label="CL (MF Netto)" value={formatEur(mf.clNetEur)} muted indent />

          <SummaryDivider />

          <div className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Gesamtertrag</div>
          <div className="rounded-lg border border-[#e2ca7a]/30 bg-[#e2ca7a]/[0.08] px-3 py-2 mb-1">
            <div className="text-[9px] text-[#e2ca7a]/70 uppercase tracking-wider mb-0.5">Vermittler gesamt</div>
            <div className="text-[#e2ca7a] font-bold text-[14px] tabular-nums">
              {formatEur(gt.partnerTotal)}
            </div>
          </div>
          <SummaryRow label="InnoInvest gesamt" value={formatEur(gt.innoInvestTotal)} muted />
          <SummaryRow label="CL gesamt" value={formatEur(gt.clTotal)} muted />

          <SummaryDivider />

          {/* Checksum */}
          <div className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px]",
            checksumOk
              ? "border border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
              : "border border-red-500/20 bg-red-500/5 text-red-400",
          )}>
            {checksumOk
              ? <CheckCircle2 size={12} />
              : <AlertCircle size={12} />}
            <span className="flex-1">
              Kontrollsumme
            </span>
            <span className="font-semibold tabular-nums">
              {formatEur(gt.checksum)}
            </span>
          </div>
          {!checksumOk && (
            <div className="text-[9px] text-red-500/70 px-1">
              Soll: {formatEur(profitEur)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
