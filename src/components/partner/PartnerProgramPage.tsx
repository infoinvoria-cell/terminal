"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { calcAP, formatEur, formatPct } from "@/lib/partner/partnerCalculations";
import { PARTNER_PROGRAM_CONFIG, type PartnerTierId } from "@/lib/partner/partnerProgramConfig";
import { PartnerWhiteboardModal } from "./PartnerWhiteboardModal";
import {
  CheckCircle2,
  XCircle,
  ChevronRight,
  Calculator,
  Layers,
  Maximize2,
  ArrowRight,
} from "lucide-react";

// ── Design tokens ──────────────────────────────────────────────────────────────

const CARD =
  "rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]";

const SECTION_LABEL =
  "text-[11px] font-semibold text-zinc-400 uppercase tracking-[0.08em] mb-4";

// ── Tier color map ─────────────────────────────────────────────────────────────

const TIER_STYLE: Record<PartnerTierId, { bg: string; text: string; border: string; label: string }> = {
  bronze: { bg: "bg-amber-900/30",  text: "text-amber-400",  border: "border-amber-700/50",  label: "Bronze" },
  silver: { bg: "bg-zinc-700/30",   text: "text-zinc-300",   border: "border-zinc-500/50",   label: "Silber" },
  gold:   { bg: "bg-yellow-900/30", text: "text-[#e2ca7a]",  border: "border-[#e2ca7a]/40",  label: "Gold"   },
  platin: { bg: "bg-blue-900/30",   text: "text-blue-300",   border: "border-blue-500/50",   label: "Platin" },
  black:  { bg: "bg-zinc-900/60",   text: "text-white",      border: "border-white/20",      label: "Black"  },
};

// ── SECTION: Performance-Fee Ablauf ──────────────────────────────────────────

interface FlowStep { label: string; sub: string; highlight?: boolean; muted?: boolean }

const FLOW_STEPS: FlowStep[] = [
  { label: "Investorengewinn",                sub: "100.000 €" },
  { label: "Performance Fee 25 %",            sub: "= 25.000 €" },
  { label: "InnoInvest 12,5 % (Haftungsdach)", sub: "= 3.125 €",  muted: true },
  { label: "CL-Anteil (87,5 % der PF)",       sub: "= 21.875 €" },
  { label: "Partneranteil (Bsp. Gold 40 %)", sub: "= 8.750 €",  highlight: true },
  { label: "CL verbleibend",                  sub: "= 13.125 €", muted: true },
];

function FlowStepCard({ step, isLast }: { step: FlowStep; isLast: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className={cn(
        "w-full rounded-[12px] border px-4 py-3 text-center",
        step.highlight ? "border-[#e2ca7a]/40 bg-[#e2ca7a]/10" : "border-white/[0.06] bg-white/[0.03]",
      )}>
        <div className={cn("text-[12px] font-semibold",
          step.highlight ? "text-[#e2ca7a]" : step.muted ? "text-zinc-500" : "text-zinc-200")}>
          {step.label}
        </div>
        <div className={cn("text-[14px] font-bold tabular-nums mt-0.5",
          step.highlight ? "text-[#e2ca7a]" : step.muted ? "text-zinc-600" : "text-white")}>
          {step.sub}
        </div>
      </div>
      {!isLast && (
        <div className="py-1 text-zinc-600">
          <ChevronRight size={14} className="rotate-90" />
        </div>
      )}
    </div>
  );
}

function SectionGeldfluss() {
  return (
    <div className={cn(CARD, "p-6")}>
      <div className={SECTION_LABEL}>Performance-Fee Ablauf (Beispiel)</div>
      <p className="text-zinc-500 text-[12px] mb-5">
        Der Partneranteil ist ein Anteil am CL-Ertrag — nicht direkt am Investorengewinn.
        Basis: 100.000 € Gewinn, Gold-Partner (40 %).
      </p>

      {/* Horizontal (lg+) */}
      <div className="hidden lg:flex items-center gap-0">
        {FLOW_STEPS.map((step, i) => (
          <div key={i} className="flex items-center flex-1 gap-0 min-w-0">
            <div className={cn(
              "flex-1 rounded-[12px] border px-3 py-3 text-center min-h-[68px] flex flex-col justify-center",
              step.highlight ? "border-[#e2ca7a]/40 bg-[#e2ca7a]/10" : "border-white/[0.06] bg-white/[0.03]",
            )}>
              <div className={cn("text-[10.5px] font-semibold leading-tight",
                step.highlight ? "text-[#e2ca7a]" : step.muted ? "text-zinc-500" : "text-zinc-200")}>
                {step.label}
              </div>
              <div className={cn("text-[13px] font-bold tabular-nums mt-1",
                step.highlight ? "text-[#e2ca7a]" : step.muted ? "text-zinc-600" : "text-white")}>
                {step.sub}
              </div>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <ArrowRight size={14} className="text-zinc-600 flex-shrink-0 mx-1.5" />
            )}
          </div>
        ))}
      </div>

      {/* Vertical (< lg) */}
      <div className="lg:hidden space-y-0.5">
        {FLOW_STEPS.map((step, i) => (
          <FlowStepCard key={i} step={step} isLast={i === FLOW_STEPS.length - 1} />
        ))}
      </div>

      <p className="text-zinc-600 text-[11px] mt-4 text-center">
        ≈ 8,75 % des Investorengewinns · 35 % der Performance Fee
      </p>
    </div>
  );
}

// ── SECTION: Partnerstufen ────────────────────────────────────────────────────

function SectionPartnerstufen() {
  const tiers = PARTNER_PROGRAM_CONFIG.tiers;

  return (
    <div className={cn(CARD, "p-6")}>
      <div className={SECTION_LABEL}>Partnerstufen — Übersicht</div>
      <div className="overflow-x-auto -mx-2">
        <table className="w-full min-w-[540px] text-[12px]">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Stufe", "CL-Anteil", "Vol. (regulär)", "Vol. (Founder ★)", "Mgmt. Fee"].map((h) => (
                <th key={h} className="text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wider pb-2.5 px-2 first:pl-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => {
              const s = TIER_STYLE[tier.id];
              return (
                <tr key={tier.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] transition-colors">
                  <td className="py-3 px-2 pl-3 font-semibold">
                    <span className={s.text}>{s.label}</span>
                  </td>
                  <td className="py-3 px-2 text-[#e2ca7a] font-bold tabular-nums">
                    {formatPct(tier.clShareRate)}
                  </td>
                  <td className="py-3 px-2 text-zinc-300 tabular-nums">
                    {tier.volThreshold === 0 ? "–" : formatEur(tier.volThreshold)}
                  </td>
                  <td className="py-3 px-2 text-[#e2ca7a]/70 tabular-nums">
                    {tier.founderThreshold === 0 ? "–" : formatEur(tier.founderThreshold)}
                  </td>
                  <td className="py-3 px-2 text-zinc-500">
                    {tier.hasMgmtFeeShare
                      ? <span className="text-[#e2ca7a]/70">Individuell *</span>
                      : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-zinc-600 text-[11px] mt-3">
        * Mgmt. Fee-Beteiligung ab Platin · gemäß Partnervereinbarung (TBD)
      </p>
    </div>
  );
}

// ── SECTION: Abschlussprovision ───────────────────────────────────────────────

const AP_LOCKUP_OPTIONS: Array<{ value: 1 | 3 | 5; label: string }> = [
  { value: 1, label: "1 Jahr"  },
  { value: 3, label: "3 Jahre" },
  { value: 5, label: "5 Jahre" },
];

const AP_AUSZAHLUNG = [
  "Kapital vollständig eingegangen",
  "KYC / AML abgeschlossen",
  "Vertrag aktiviert",
  "Widerrufsfrist abgelaufen",
  "Keine Stornierung",
];

function SectionAP() {
  const [amount, setAmount] = useState<number>(100_000);
  const [lockup, setLockup] = useState<1 | 3 | 5>(3);
  const result = calcAP(amount, lockup);

  return (
    <div className={cn(CARD, "p-6")}>
      <div className="flex items-center gap-2 mb-1">
        <Calculator size={14} className="text-[#e2ca7a]" />
        <div className={cn(SECTION_LABEL, "mb-0")}>Abschlussprovision (AP)</div>
      </div>
      <p className="text-zinc-500 text-[12px] mb-5">
        Wird direkt auf den Investitionsbetrag berechnet — unabhängig von Performance.
        Nur an den direkt vermittelnden Partner ausgezahlt.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* AP rates overview */}
        <div className="space-y-3">
          <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">AP-Sätze nach Bindungsdauer</div>
          {PARTNER_PROGRAM_CONFIG.apRates.map((ap) => (
            <div key={ap.lockupYears} className="flex items-center justify-between rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
              <span className="text-zinc-400 text-[12px]">{ap.lockupYears} Jahr{ap.lockupYears > 1 ? "e" : ""} Bindung</span>
              <span className="text-[#e2ca7a] font-bold tabular-nums text-[14px]">
                {(ap.rate * 100).toFixed(1)} %
              </span>
            </div>
          ))}
          <p className="text-zinc-600 text-[11px] leading-relaxed pt-1 border-t border-white/[0.05]">
            Die AP wird wirtschaftlich durch die Verwaltungsgebühr finanziert.
          </p>
        </div>

        {/* Calculator */}
        <div className="space-y-3">
          <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Rechner</div>
          <input
            type="number" min={0} step={10000} value={amount}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#e2ca7a]/40 tabular-nums"
            placeholder="Anlagebetrag (€)"
          />
          <div className="flex gap-2">
            {AP_LOCKUP_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setLockup(opt.value)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
                  lockup === opt.value
                    ? "border-[#e2ca7a]/40 bg-[#e2ca7a]/10 text-[#e2ca7a]"
                    : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-zinc-200",
                )}>
                {opt.label}
              </button>
            ))}
          </div>
          <div className="rounded-[12px] border border-[#e2ca7a]/30 bg-[#e2ca7a]/[0.08] px-4 py-3">
            <div className="text-zinc-400 text-[11px] font-medium uppercase tracking-wider mb-1">Voraussichtliche AP</div>
            <div className="text-[#e2ca7a] text-2xl font-bold tabular-nums">{formatEur(result.apAmount)}</div>
            <div className="text-zinc-600 text-[11px] mt-0.5">{formatPct(result.rate)} von {formatEur(amount)}</div>
          </div>
        </div>
      </div>

      {/* Auszahlungsvoraussetzungen */}
      <div className="mt-5 pt-4 border-t border-white/[0.05]">
        <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-3">Auszahlungsvoraussetzungen</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {AP_AUSZAHLUNG.map((item) => (
            <div key={item} className="flex items-center gap-2 text-[12px] text-zinc-300">
              <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── SECTION: Volumenberechnung ────────────────────────────────────────────────

const COUNTED     = ["Eigenes aktiv investiertes Kapital", "Aktives Kapital direkter Teampartner"];
const NOT_COUNTED = [
  "Gekündigte Investments",
  "Vollständig ausgezahlte Investments",
  "Noch nicht eingezahlte Zeichnungen",
  "Stornierte Vorgänge",
];

function SectionVolumen() {
  return (
    <div className={cn(CARD, "p-6")}>
      <div className={SECTION_LABEL}>Berechnung des aktiven Vertriebsvolumens</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-3">Wird berücksichtigt ✓</div>
          <ul className="space-y-2">
            {COUNTED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[12px] text-zinc-300">
                <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="text-[11px] font-semibold text-red-400 uppercase tracking-wider mb-3">Wird NICHT berücksichtigt ✗</div>
          <ul className="space-y-2">
            {NOT_COUNTED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[12px] text-zinc-400">
                <XCircle size={13} className="text-red-500 mt-0.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-zinc-600 text-[11px] mt-3">Teamstruktur: aktuell nur direkte Ebene (Tiefe 1)</p>
    </div>
  );
}

// ── SECTION: Founder-Programm ─────────────────────────────────────────────────

function SectionFounder() {
  const tiers = PARTNER_PROGRAM_CONFIG.tiers;

  return (
    <div className={cn(CARD, "p-6")}>
      <div className={SECTION_LABEL}>Founder-Programm</div>
      <div className="rounded-[12px] border border-[#e2ca7a]/20 bg-[#e2ca7a]/5 p-4 mb-5">
        <p className="text-[12px] text-zinc-300 leading-relaxed">
          Founder-Partner erhalten{" "}
          <span className="font-semibold text-white">keine höheren Provisionssätze</span>.
          Der Vorteil liegt im schnelleren Aufstieg durch{" "}
          <span className="text-[#e2ca7a] font-semibold">50 % reduzierte Volumenschwellen</span>.
        </p>
      </div>
      <div className="overflow-x-auto -mx-2">
        <table className="w-full min-w-[340px] text-[12px]">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Stufe", "Reguläre Schwelle", "Founder-Schwelle (–50 %)"].map((h) => (
                <th key={h} className="text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wider pb-2.5 px-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => {
              const s = TIER_STYLE[tier.id];
              return (
                <tr key={tier.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="py-2.5 px-2"><span className={cn("font-semibold", s.text)}>{s.label}</span></td>
                  <td className="py-2.5 px-2 text-zinc-400 tabular-nums">
                    {tier.volThreshold === 0 ? "–" : formatEur(tier.volThreshold)}
                  </td>
                  <td className="py-2.5 px-2 tabular-nums">
                    {tier.founderThreshold === 0
                      ? <span className="text-zinc-600">–</span>
                      : <span className="text-[#e2ca7a] font-semibold">{formatEur(tier.founderThreshold)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── SECTION: Verwaltungsgebühr ────────────────────────────────────────────────

function SectionMgmtFee() {
  const cfg = PARTNER_PROGRAM_CONFIG;

  return (
    <div className={cn(CARD, "p-6")}>
      <div className={SECTION_LABEL}>Verwaltungsgebühr (Mgmt. Fee)</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-4 py-3">
          <div className="text-zinc-500 text-[11px] uppercase tracking-wider mb-1">Gesamt p.a.</div>
          <div className="text-white font-bold">{formatPct(cfg.managementFeeRate)}</div>
        </div>
        <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-4 py-3">
          <div className="text-zinc-500 text-[11px] uppercase tracking-wider mb-1">InnoInvest</div>
          <div className="text-zinc-400 font-semibold">{(cfg.innoInvestMgmtRate * 100).toFixed(1)} % des Anteils</div>
        </div>
        <div className="rounded-[10px] border border-[#e2ca7a]/20 bg-[#e2ca7a]/5 px-4 py-3">
          <div className="text-zinc-500 text-[11px] uppercase tracking-wider mb-1">Platin / Black</div>
          <div className="text-[#e2ca7a]/80 font-semibold text-[12px]">Beteiligung gemäß Vereinbarung</div>
        </div>
      </div>
      <p className="text-zinc-600 text-[12px] leading-relaxed">
        Der verbleibende CL-Anteil finanziert Betrieb und Abschlussprovisionen.
        Platin- und Black-Partner können individuell an der Mgmt. Fee beteiligt werden (TBD).
      </p>
    </div>
  );
}

// ── Page header ────────────────────────────────────────────────────────────────

function PageHeader({ onWhiteboard }: { onWhiteboard: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-[10px] border border-[#e2ca7a]/30 bg-[#e2ca7a]/10 flex items-center justify-center flex-shrink-0">
          <Layers size={15} className="text-[#e2ca7a]" />
        </div>
        <div>
          <h1 className="text-white text-[17px] font-semibold leading-tight">Partnerprogramm</h1>
          <p className="text-zinc-500 text-[12px]">Capitalife · Vergütungsstruktur &amp; Tier-Übersicht</p>
        </div>
      </div>
      <button
        onClick={onWhiteboard}
        className="flex items-center gap-2 px-4 py-2 rounded-[10px] border border-[#e2ca7a]/30 bg-[#e2ca7a]/[0.08] text-[#e2ca7a] text-[12px] font-semibold hover:bg-[#e2ca7a]/[0.15] transition-colors"
      >
        <Maximize2 size={14} />
        Struktur-Whiteboard öffnen
      </button>
    </div>
  );
}

// ── Root export ────────────────────────────────────────────────────────────────

export function PartnerProgramPage() {
  const [showWhiteboard, setShowWhiteboard] = useState(false);

  return (
    <>
      {showWhiteboard && (
        <PartnerWhiteboardModal onClose={() => setShowWhiteboard(false)} />
      )}
      <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-8">
        <PageHeader onWhiteboard={() => setShowWhiteboard(true)} />
        <SectionGeldfluss />
        <SectionPartnerstufen />
        <SectionAP />
        <SectionVolumen />
        <SectionFounder />
        <SectionMgmtFee />
      </div>
    </>
  );
}
