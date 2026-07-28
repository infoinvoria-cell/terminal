"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useUser } from "@/context/user-context";
import { getPartnerProfile } from "@/lib/partner/partnerMockData";
import {
  tierProgress,
  calcAP,
  formatEur,
  formatPct,
} from "@/lib/partner/partnerCalculations";
import { PARTNER_PROGRAM_CONFIG, type PartnerTierId } from "@/lib/partner/partnerProgramConfig";
import {
  CheckCircle2,
  XCircle,
  ChevronRight,
  TrendingUp,
  Users,
  BarChart3,
  Star,
  Calculator,
  Layers,
  ArrowRight,
} from "lucide-react";

// ── Design tokens ──────────────────────────────────────────────────────────────

const CARD =
  "rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]";

const SECTION_LABEL =
  "text-[11px] font-semibold text-zinc-400 uppercase tracking-[0.08em] mb-4";

// ── Tier color map ─────────────────────────────────────────────────────────────

const TIER_STYLE: Record<
  PartnerTierId,
  { bg: string; text: string; border: string; label: string }
> = {
  bronze: {
    bg: "bg-amber-900/30",
    text: "text-amber-400",
    border: "border-amber-700/50",
    label: "Bronze",
  },
  silver: {
    bg: "bg-zinc-700/30",
    text: "text-zinc-300",
    border: "border-zinc-500/50",
    label: "Silber",
  },
  gold: {
    bg: "bg-yellow-900/30",
    text: "text-[#e2ca7a]",
    border: "border-[#e2ca7a]/40",
    label: "Gold",
  },
  platin: {
    bg: "bg-blue-900/30",
    text: "text-blue-300",
    border: "border-blue-500/50",
    label: "Platin",
  },
  black: {
    bg: "bg-zinc-900/60",
    text: "text-white",
    border: "border-white/20",
    label: "Black",
  },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: PartnerTierId }) {
  const s = TIER_STYLE[tier];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-widest border",
        s.bg,
        s.text,
        s.border,
      )}
    >
      {s.label}
    </span>
  );
}

function KpiBox({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex-1 min-w-0 rounded-[12px] border border-white/[0.06] bg-white/[0.03] px-4 py-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] font-medium uppercase tracking-wider">
        <Icon size={11} />
        {label}
      </div>
      <div className="text-white text-[15px] font-semibold tabular-nums truncate">
        {value}
      </div>
    </div>
  );
}

// ── SECTION A: Partner Status ──────────────────────────────────────────────────

function SectionStatus() {
  const { user } = useUser();
  const profile = getPartnerProfile(user?.id ?? "demo");

  const totalVolume = profile.ownActiveVolume + profile.teamActiveVolume;
  const { current, next, progress } = tierProgress(totalVolume, profile.founderStatus);

  return (
    <div className={cn(CARD, "p-6 space-y-5")}>
      {/* Header row */}
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="space-y-1.5">
          <div className="text-white text-lg font-semibold">{profile.userName}</div>
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge tier={current.id} />
            {profile.founderStatus && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#e2ca7a]/40 bg-[#e2ca7a]/10 text-[#e2ca7a] text-[10px] font-bold uppercase tracking-widest">
                <Star size={9} />
                FOUNDER · 50% reduzierte Schwellen
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-zinc-500 text-[12px]">
          <div>CL-Anteil</div>
          <div className="text-[#e2ca7a] text-xl font-bold tabular-nums">
            {formatPct(current.clShareRate)}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="flex gap-3 flex-wrap">
        <KpiBox
          label="Eigenes Volumen"
          value={formatEur(profile.ownActiveVolume)}
          icon={TrendingUp}
        />
        <KpiBox
          label="Team-Volumen"
          value={formatEur(profile.teamActiveVolume)}
          icon={Users}
        />
        <KpiBox
          label="Gesamt"
          value={formatEur(totalVolume)}
          icon={BarChart3}
        />
      </div>

      {/* Progress bar */}
      {next ? (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[12px]">
            <span className="text-zinc-400">
              Fortschritt zu{" "}
              <span className={cn("font-semibold", TIER_STYLE[next.id].text)}>
                {TIER_STYLE[next.id].label}
              </span>
            </span>
            <span className="text-zinc-500 tabular-nums">
              {formatEur(totalVolume)}{" "}
              <span className="text-zinc-600">von</span>{" "}
              {formatEur(
                profile.founderStatus ? next.founderThreshold : next.volThreshold,
              )}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#e2ca7a] transition-all duration-500"
              style={{ width: `${Math.min(progress * 100, 100).toFixed(1)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="text-[#e2ca7a] text-[12px] font-medium">
          Höchste Stufe erreicht — Black Partner
        </div>
      )}
    </div>
  );
}

// ── SECTION B: Geldfluss der Performance Fee ──────────────────────────────────

interface FlowStep {
  label: string;
  sub: string;
  highlight?: boolean;
  muted?: boolean;
}

const FLOW_STEPS: FlowStep[] = [
  { label: "Investorengewinn", sub: "100.000 €" },
  {
    label: "Performance Fee 25 %",
    sub: "= 25.000 €",
  },
  {
    label: "InnoInvest (Haftungsdach) 12,5 %",
    sub: "von 25.000 € = 3.125 €",
    muted: true,
  },
  {
    label: "CL-Anteil vor Vermittlervergütung",
    sub: "= 21.875 €",
  },
  {
    label: "Gold-Partner 40 %",
    sub: "von 21.875 € = 8.750 €",
    highlight: true,
  },
  {
    label: "CL verbleibend",
    sub: "= 13.125 €",
    muted: true,
  },
];

function FlowStep({ step, isLast }: { step: FlowStep; isLast: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0">
      <div
        className={cn(
          "w-full rounded-[12px] border px-4 py-3 text-center",
          step.highlight
            ? "border-[#e2ca7a]/40 bg-[#e2ca7a]/10"
            : "border-white/[0.06] bg-white/[0.03]",
        )}
      >
        <div
          className={cn(
            "text-[12px] font-semibold",
            step.highlight
              ? "text-[#e2ca7a]"
              : step.muted
                ? "text-zinc-500"
                : "text-zinc-200",
          )}
        >
          {step.label}
        </div>
        <div
          className={cn(
            "text-[14px] font-bold tabular-nums mt-0.5",
            step.highlight
              ? "text-[#e2ca7a]"
              : step.muted
                ? "text-zinc-600"
                : "text-white",
          )}
        >
          {step.sub}
        </div>
      </div>
      {!isLast && (
        <div className="flex items-center justify-center py-1 text-zinc-600">
          <ChevronRight size={14} className="rotate-90" />
        </div>
      )}
    </div>
  );
}

function SectionGeldfluss() {
  return (
    <div className={cn(CARD, "p-6")}>
      <div className={SECTION_LABEL}>Geldfluss der Performance Fee</div>
      <p className="text-zinc-500 text-[12px] mb-5">
        Die Partnervergütung ist ein Anteil am CL-Ertrag — nicht direkt am
        Investorengewinn.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-0">
        {/* On smaller screens, stack vertically; on lg, show horizontally */}
        <div className="hidden lg:contents">
          {FLOW_STEPS.map((step, i) => (
            <div key={i} className="flex items-center gap-0 col-span-1">
              <div
                className={cn(
                  "flex-1 rounded-[12px] border px-3 py-3 text-center min-h-[72px] flex flex-col justify-center",
                  step.highlight
                    ? "border-[#e2ca7a]/40 bg-[#e2ca7a]/10"
                    : "border-white/[0.06] bg-white/[0.03]",
                )}
              >
                <div
                  className={cn(
                    "text-[11px] font-semibold leading-tight",
                    step.highlight
                      ? "text-[#e2ca7a]"
                      : step.muted
                        ? "text-zinc-500"
                        : "text-zinc-200",
                  )}
                >
                  {step.label}
                </div>
                <div
                  className={cn(
                    "text-[13px] font-bold tabular-nums mt-1",
                    step.highlight
                      ? "text-[#e2ca7a]"
                      : step.muted
                        ? "text-zinc-600"
                        : "text-white",
                  )}
                >
                  {step.sub}
                </div>
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <ArrowRight size={14} className="text-zinc-600 flex-shrink-0 mx-1" />
              )}
            </div>
          ))}
        </div>
        {/* Vertical stack for smaller screens */}
        <div className="lg:hidden col-span-full space-y-0.5">
          {FLOW_STEPS.map((step, i) => (
            <FlowStep key={i} step={step} isLast={i === FLOW_STEPS.length - 1} />
          ))}
        </div>
      </div>
      <p className="text-zinc-600 text-[11px] mt-4 text-center">
        ≈ 8,75 % des Investorengewinns · 35 % der Performance Fee
      </p>
    </div>
  );
}

// ── SECTION C: Partnerstufen table ────────────────────────────────────────────

function SectionPartnerstufen() {
  const { user } = useUser();
  const profile = getPartnerProfile(user?.id ?? "demo");
  const tiers = PARTNER_PROGRAM_CONFIG.tiers;

  return (
    <div className={cn(CARD, "p-6")}>
      <div className={SECTION_LABEL}>Partnerstufen</div>
      <div className="overflow-x-auto -mx-2">
        <table className="w-full min-w-[520px] text-[12px]">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Stufe", "CL-Anteil", "Normales Volumen", "Founder-Volumen", "Mgmt. Fee"].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wider pb-2.5 px-2 first:pl-2"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => {
              const isActive = tier.id === profile.partnerTier;
              const s = TIER_STYLE[tier.id];
              return (
                <tr
                  key={tier.id}
                  className={cn(
                    "border-b border-white/[0.04] last:border-0",
                    isActive && "bg-white/[0.025]",
                  )}
                >
                  <td
                    className={cn(
                      "py-3 px-2 pl-3 font-semibold",
                      isActive ? "border-l-2 border-[#e2ca7a] -ml-px" : "border-l-2 border-transparent",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={s.text}>{s.label}</span>
                      {isActive && (
                        <span className="text-[9px] text-zinc-500 font-normal">
                          ← aktuell
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-2 text-[#e2ca7a] font-bold tabular-nums">
                    {formatPct(tier.clShareRate)}
                  </td>
                  <td className="py-3 px-2 text-zinc-300 tabular-nums">
                    {tier.volThreshold === 0 ? "–" : formatEur(tier.volThreshold)}
                  </td>
                  <td className="py-3 px-2 text-zinc-400 tabular-nums">
                    {tier.founderThreshold === 0
                      ? "–"
                      : formatEur(tier.founderThreshold)}
                  </td>
                  <td className="py-3 px-2 text-zinc-500">
                    {tier.hasMgmtFeeShare ? (
                      <span className="text-[#e2ca7a]/70">Individuell*</span>
                    ) : (
                      "–"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-zinc-600 text-[11px] mt-3">
        * Gemäß Partnervereinbarung (TBD)
      </p>
    </div>
  );
}

// ── SECTION D: Volumenberechnung ──────────────────────────────────────────────

const COUNTED = [
  "Eigenes aktiv investiertes Kapital",
  "Aktives Kapital direkter Teampartner",
];

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
        {/* Counted */}
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-3">
            Wird berücksichtigt ✓
          </div>
          <ul className="space-y-2">
            {COUNTED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[12px] text-zinc-300">
                <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        {/* Not counted */}
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="text-[11px] font-semibold text-red-400 uppercase tracking-wider mb-3">
            Wird NICHT berücksichtigt ✗
          </div>
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
      <p className="text-zinc-600 text-[11px] mt-3">
        Teamstruktur: aktuell nur direkte Ebene (Tiefe 1)
      </p>
    </div>
  );
}

// ── SECTION E: Founder-Programm ───────────────────────────────────────────────

function SectionFounder() {
  const tiers = PARTNER_PROGRAM_CONFIG.tiers;

  return (
    <div className={cn(CARD, "p-6")}>
      <div className={SECTION_LABEL}>Founder-Programm</div>

      {/* Info card */}
      <div className="rounded-[12px] border border-[#e2ca7a]/20 bg-[#e2ca7a]/5 p-4 mb-5">
        <div className="flex items-start gap-2">
          <Star size={14} className="text-[#e2ca7a] mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-zinc-300 leading-relaxed">
            Founder-Partner erhalten{" "}
            <span className="font-semibold text-white">
              keine höheren Provisionssätze
            </span>
            . Der Vorteil liegt im schnelleren Aufstieg durch{" "}
            <span className="text-[#e2ca7a] font-semibold">
              50 % reduzierte Volumenschwellen
            </span>
            .
          </p>
        </div>
      </div>

      {/* Threshold comparison table */}
      <div className="overflow-x-auto -mx-2">
        <table className="w-full min-w-[360px] text-[12px]">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Stufe", "Reguläre Schwelle", "Founder-Schwelle"].map((h) => (
                <th
                  key={h}
                  className="text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wider pb-2.5 px-2"
                >
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
                  <td className="py-2.5 px-2">
                    <span className={cn("font-semibold", s.text)}>{s.label}</span>
                  </td>
                  <td className="py-2.5 px-2 text-zinc-400 tabular-nums">
                    {tier.volThreshold === 0 ? "–" : formatEur(tier.volThreshold)}
                  </td>
                  <td className="py-2.5 px-2 tabular-nums">
                    {tier.founderThreshold === 0 ? (
                      <span className="text-zinc-600">–</span>
                    ) : (
                      <span className="text-[#e2ca7a] font-semibold">
                        {formatEur(tier.founderThreshold)}
                      </span>
                    )}
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

// ── SECTION F: Management Fee ─────────────────────────────────────────────────

function SectionMgmtFee() {
  const { user } = useUser();
  const profile = getPartnerProfile(user?.id ?? "demo");
  const currentTier = PARTNER_PROGRAM_CONFIG.tiers.find(
    (t) => t.id === profile.partnerTier,
  );

  return (
    <div className={cn(CARD, "p-6")}>
      <div className={SECTION_LABEL}>Management Fee</div>
      <div className="space-y-4">
        {/* Info row */}
        <div className="flex flex-wrap gap-3">
          <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-[12px] text-zinc-300">
            Management Fee:{" "}
            <span className="text-white font-semibold">
              {formatPct(PARTNER_PROGRAM_CONFIG.managementFeeRate)} p.a.
            </span>
          </div>
          <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-[12px] text-zinc-300">
            InnoInvest:{" "}
            <span className="text-white font-semibold">
              {formatPct(PARTNER_PROGRAM_CONFIG.innoInvestMgmtRate)} des Anteils
            </span>
          </div>
        </div>
        {/* Note */}
        <p className="text-zinc-500 text-[12px] leading-relaxed">
          Der verbleibende Anteil verbleibt bei CL und finanziert u.a. Betrieb und
          Abschlussprovisionen.
        </p>
        {/* Tier-specific content */}
        {currentTier?.hasMgmtFeeShare ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full border border-[#e2ca7a]/40 bg-[#e2ca7a]/10 text-[#e2ca7a] text-[11px] font-semibold">
              Mögliche Beteiligung: gemäß Partnervereinbarung (TBD)
            </span>
          </div>
        ) : (
          <div className="text-zinc-600 text-[12px]">
            Management Fee-Beteiligung: –{" "}
            <span className="text-zinc-700">(ab Platin-Stufe)</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SECTION G: AP Calculator ──────────────────────────────────────────────────

const AP_LOCKUP_OPTIONS: Array<{ value: 1 | 3 | 5; label: string }> = [
  { value: 1, label: "1 Jahr" },
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

function SectionAPCalculator() {
  const [amount, setAmount] = useState<number>(100_000);
  const [lockup, setLockup] = useState<1 | 3 | 5>(3);

  const result = calcAP(amount, lockup);

  return (
    <div className={cn(CARD, "p-6")}>
      <div className="flex items-center gap-2 mb-1">
        <Calculator size={14} className="text-[#e2ca7a]" />
        <div className={cn(SECTION_LABEL, "mb-0")}>Abschlussprovision (AP) Rechner</div>
      </div>
      <p className="text-zinc-500 text-[12px] mb-5">
        Die AP wird nur an den direkt vermittelnden Vermittler ausgezahlt.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="space-y-4">
          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Anlagebetrag (€)
            </label>
            <input
              type="number"
              min={0}
              step={10000}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#e2ca7a]/40 tabular-nums"
            />
          </div>

          {/* Lockup */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Lock-up Dauer
            </label>
            <div className="flex gap-2">
              {AP_LOCKUP_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLockup(opt.value)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
                    lockup === opt.value
                      ? "border-[#e2ca7a]/40 bg-[#e2ca7a]/10 text-[#e2ca7a]"
                      : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-zinc-200 hover:border-white/[0.15]",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Result */}
          <div className="rounded-[12px] border border-[#e2ca7a]/30 bg-[#e2ca7a]/8 px-4 py-3">
            <div className="text-zinc-400 text-[11px] font-medium uppercase tracking-wider mb-1">
              Voraussichtliche AP
            </div>
            <div className="text-[#e2ca7a] text-2xl font-bold tabular-nums">
              {formatEur(result.apAmount)}
            </div>
            <div className="text-zinc-600 text-[11px] mt-0.5">
              {formatPct(result.rate)} von {formatEur(amount)}
            </div>
          </div>
        </div>

        {/* Auszahlungsvoraussetzungen */}
        <div className="space-y-3">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Auszahlungsvoraussetzungen
          </div>
          <ul className="space-y-2">
            {AP_AUSZAHLUNG.map((item) => (
              <li key={item} className="flex items-center gap-2 text-[12px] text-zinc-300">
                <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-zinc-600 text-[11px] leading-relaxed pt-1 border-t border-white/[0.04]">
            Die AP kommt von CL und wird wirtschaftlich durch die Management Fee ermöglicht.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Page header ────────────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-[10px] border border-[#e2ca7a]/30 bg-[#e2ca7a]/10 flex items-center justify-center flex-shrink-0">
        <Layers size={15} className="text-[#e2ca7a]" />
      </div>
      <div>
        <h1 className="text-white text-[17px] font-semibold leading-tight">
          Partnerprogramm
        </h1>
        <p className="text-zinc-500 text-[12px]">
          Capitalife · Vergütungsstruktur &amp; Tier-Übersicht
        </p>
      </div>
    </div>
  );
}

// ── Root export ────────────────────────────────────────────────────────────────

export function PartnerProgramPage() {
  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-8">
      <PageHeader />
      <SectionStatus />
      <SectionGeldfluss />
      <SectionPartnerstufen />
      <SectionVolumen />
      <SectionFounder />
      <SectionMgmtFee />
      <SectionAPCalculator />
    </div>
  );
}
