"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatEur, formatPct } from "@/lib/partner/partnerCalculations";
import { PARTNER_PROGRAM_CONFIG } from "@/lib/partner/partnerProgramConfig";
import { TIER_COLORS } from "@/lib/partner/tierColors";
import { PartnerWhiteboard } from "./PartnerWhiteboard";
import { PartnerCalculator } from "./PartnerCalculator";
import {
  CheckCircle2,
  XCircle,
  Layers,
  Maximize2,
  ArrowRight,
} from "lucide-react";

// ── Design tokens ──────────────────────────────────────────────────────────────

const CARD =
  "rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1F1F1F] to-[#13131A] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]";

const SECTION_LABEL =
  "text-[11px] font-semibold text-zinc-400 uppercase tracking-[0.08em] mb-4";

// ── SECTION: Performance-Fee Ablauf (compact) ──────────────────────────────────

interface FlowStep { label: string; sub: string; highlight?: boolean; muted?: boolean }

const FLOW_STEPS: FlowStep[] = [
  { label: "Investorengewinn",                 sub: "100.000 €" },
  { label: "Performance Fee 25 %",             sub: "= 25.000 €" },
  { label: "InnoInvest 12,5 %",               sub: "= 3.125 €",  muted: true },
  { label: "CL-Anteil 87,5 %",                sub: "= 21.875 €" },
  { label: "Partner Gold 40 %",               sub: "= 8.750 €",  highlight: true },
  { label: "CL verbleibend",                  sub: "= 13.125 €", muted: true },
];

function SectionGeldfluss() {
  return (
    <div className={cn(CARD, "p-4 flex-shrink-0")}>
      <div className={cn(SECTION_LABEL, "mb-2")}>Performance-Fee Ablauf (Beispiel)</div>

      {/* Horizontal on lg+ */}
      <div className="hidden lg:flex items-center gap-0">
        {FLOW_STEPS.map((step, i) => (
          <div key={i} className="flex items-center flex-1 gap-0 min-w-0">
            <div className={cn(
              "flex-1 rounded-[10px] border px-2 py-2 text-center min-h-[56px] flex flex-col justify-center",
              step.highlight ? "border-[#C9A84C]/40 bg-[#C9A84C]/10" : "border-white/[0.06] bg-white/[0.03]",
            )}>
              <div className={cn("text-[9px] font-semibold leading-tight",
                step.highlight ? "text-[#C9A84C]" : step.muted ? "text-zinc-500" : "text-zinc-300")}>
                {step.label}
              </div>
              <div className={cn("text-[11px] font-bold tabular-nums mt-0.5",
                step.highlight ? "text-[#C9A84C]" : step.muted ? "text-zinc-600" : "text-white")}>
                {step.sub}
              </div>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <ArrowRight size={12} className="text-zinc-600 flex-shrink-0 mx-1" />
            )}
          </div>
        ))}
      </div>

      {/* Vertical on < lg */}
      <div className="lg:hidden space-y-1">
        {FLOW_STEPS.map((step, i) => (
          <div key={i} className={cn(
            "flex items-center justify-between rounded-[8px] border px-3 py-1.5",
            step.highlight ? "border-[#C9A84C]/40 bg-[#C9A84C]/10" : "border-white/[0.06] bg-white/[0.03]",
          )}>
            <span className={cn("text-[10px] font-medium",
              step.highlight ? "text-[#C9A84C]" : step.muted ? "text-zinc-500" : "text-zinc-300")}>
              {step.label}
            </span>
            <span className={cn("text-[11px] font-bold tabular-nums",
              step.highlight ? "text-[#C9A84C]" : step.muted ? "text-zinc-600" : "text-white")}>
              {step.sub}
            </span>
          </div>
        ))}
      </div>

      <p className="text-zinc-600 text-[10px] mt-2 text-center">
        ≈ 8,75 % des Investorengewinns · 35 % der Performance Fee
      </p>
    </div>
  );
}

// ── SECTION: Partnerstufen ────────────────────────────────────────────────────

function SectionPartnerstufen() {
  const tiers = PARTNER_PROGRAM_CONFIG.tiers;

  return (
    <div className={cn(CARD, "p-5")}>
      <div className={SECTION_LABEL}>Partnerstufen — Übersicht</div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[480px] text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Stufe", "CL-Anteil", "Vol. (regulär)", "Vol. (Founder ★)", "Mgmt. Fee"].map((h) => (
                <th key={h} className="text-left text-[9px] font-semibold text-zinc-500 uppercase tracking-wider pb-2 px-2 first:pl-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => {
              const tc = TIER_COLORS[tier.id];
              return (
                <tr key={tier.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] transition-colors">
                  <td className="py-2.5 px-2 pl-0 font-semibold">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tc.stroke }} />
                      <span style={{ color: tc.text }}>{tc.label}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-[#C9A84C] font-bold tabular-nums">
                    {formatPct(tier.clShareRate)}
                  </td>
                  <td className="py-2.5 px-2 text-zinc-300 tabular-nums">
                    {tier.volThreshold === 0 ? "–" : formatEur(tier.volThreshold)}
                  </td>
                  <td className="py-2.5 px-2 text-[#C9A84C]/70 tabular-nums">
                    {tier.founderThreshold === 0 ? "–" : formatEur(tier.founderThreshold)}
                  </td>
                  <td className="py-2.5 px-2 text-zinc-500">
                    {tier.hasMgmtFeeShare
                      ? <span className="text-[#C9A84C]/70">Individuell *</span>
                      : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-zinc-600 text-[10px] mt-2">
        * Mgmt. Fee-Beteiligung ab Platin · gemäß Partnervereinbarung (TBD)
      </p>
    </div>
  );
}

// ── SECTION: Founder-Programm ─────────────────────────────────────────────────

function SectionFounder() {
  const tiers = PARTNER_PROGRAM_CONFIG.tiers;

  return (
    <div className={cn(CARD, "p-5")}>
      <div className={SECTION_LABEL}>Founder-Programm</div>
      <div className="rounded-[10px] border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-3 mb-4">
        <p className="text-[11px] text-zinc-300 leading-relaxed">
          Founder-Partner erhalten{" "}
          <span className="font-semibold text-white">keine höheren Provisionssätze</span>.
          Vorteil:{" "}
          <span className="text-[#C9A84C] font-semibold">50 % reduzierte Volumenschwellen</span>.
        </p>
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[300px] text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Stufe", "Regulär", "Founder (–50 %)"].map((h) => (
                <th key={h} className="text-left text-[9px] font-semibold text-zinc-500 uppercase tracking-wider pb-2 px-2 first:pl-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => {
              const tc = TIER_COLORS[tier.id];
              return (
                <tr key={tier.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="py-2 px-2 pl-0">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tc.stroke }} />
                      <span className="font-semibold" style={{ color: tc.text }}>{tc.label}</span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-zinc-400 tabular-nums">
                    {tier.volThreshold === 0 ? "–" : formatEur(tier.volThreshold)}
                  </td>
                  <td className="py-2 px-2 tabular-nums">
                    {tier.founderThreshold === 0
                      ? <span className="text-zinc-600">–</span>
                      : <span className="text-[#C9A84C] font-semibold">{formatEur(tier.founderThreshold)}</span>}
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
    <div className={cn(CARD, "p-5")}>
      <div className={SECTION_LABEL}>Verwaltungsgebühr (Mgmt. Fee)</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
          <div className="text-zinc-500 text-[9px] uppercase tracking-wider mb-1">Gesamt p.a.</div>
          <div className="text-white font-bold text-[13px]">{formatPct(cfg.managementFeeRate)}</div>
        </div>
        <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
          <div className="text-zinc-500 text-[9px] uppercase tracking-wider mb-1">InnoInvest</div>
          <div className="text-zinc-400 font-semibold text-[11px]">{(cfg.innoInvestMgmtRate * 100).toFixed(1)} %</div>
        </div>
        <div className="rounded-[10px] border border-[#C9A84C]/20 bg-[#C9A84C]/5 px-3 py-2.5">
          <div className="text-zinc-500 text-[9px] uppercase tracking-wider mb-1">Platin / Black</div>
          <div className="text-[#C9A84C]/80 font-semibold text-[11px]">Individuell</div>
        </div>
      </div>
      <p className="text-zinc-600 text-[10px] leading-relaxed">
        CL-Anteil finanziert Betrieb & AP. Platin/Black: individuelle Beteiligung möglich (TBD).
      </p>
    </div>
  );
}

// ── SECTION: Volumenberechnung (compact) ──────────────────────────────────────

const COUNTED     = ["Eigenes aktiv investiertes Kapital", "Aktives Kapital direkter Teampartner"];
const NOT_COUNTED = [
  "Gekündigte Investments",
  "Vollständig ausgezahlte Investments",
  "Nicht eingezahlte Zeichnungen",
  "Stornierte Vorgänge",
];

function SectionVolumen() {
  return (
    <div className={cn(CARD, "p-5")}>
      <div className={SECTION_LABEL}>Aktives Vertriebsvolumen</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">Wird berücksichtigt</div>
          <ul className="space-y-1.5">
            {COUNTED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[11px] text-zinc-300">
                <CheckCircle2 size={11} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[9px] font-semibold text-red-400 uppercase tracking-wider mb-2">Nicht berücksichtigt</div>
          <ul className="space-y-1.5">
            {NOT_COUNTED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[11px] text-zinc-400">
                <XCircle size={11} className="text-red-500 mt-0.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-zinc-600 text-[10px] mt-3">Teamstruktur: aktuell nur direkte Ebene (Tiefe 1)</p>
    </div>
  );
}

// ── Page header ────────────────────────────────────────────────────────────────

function PageHeader({ onWhiteboard }: { onWhiteboard: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-[10px] border border-[#C9A84C]/30 bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
          <Layers size={15} className="text-[#C9A84C]" />
        </div>
        <div>
          <h1 className="text-white text-[17px] font-semibold leading-tight">Partnerprogramm</h1>
          <p className="text-zinc-500 text-[12px]">Capitalife · Vergütungsstruktur &amp; Tier-Übersicht</p>
        </div>
      </div>
      <button
        onClick={onWhiteboard}
        className="flex items-center gap-2 px-4 py-2 rounded-[10px] border border-[#C9A84C]/30 bg-[#C9A84C]/[0.08] text-[#C9A84C] text-[12px] font-semibold hover:bg-[#C9A84C]/[0.15] transition-colors"
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
        <PartnerWhiteboard onClose={() => setShowWhiteboard(false)} />
      )}

      <div className="flex flex-col h-full overflow-hidden px-6 pt-4 pb-3 gap-4">
        {/* Header */}
        <PageHeader onWhiteboard={() => setShowWhiteboard(true)} />

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] gap-4 flex-1 min-h-0">

          {/* Left column */}
          <div className="flex flex-col gap-4 min-h-0 overflow-y-auto lg:overflow-hidden">
            {/* Fee flow — compact */}
            <SectionGeldfluss />

            {/* Calculator — fills remaining space */}
            <div className="flex-1 min-h-0">
              <PartnerCalculator />
            </div>
          </div>

          {/* Right column — scrollable */}
          <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pb-2">
            <SectionPartnerstufen />
            <SectionFounder />
            <SectionVolumen />
            <SectionMgmtFee />
          </div>
        </div>
      </div>
    </>
  );
}
