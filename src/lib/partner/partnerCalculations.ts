// Pure business-logic functions for the partner program.
// All monetary calculations use integer cent amounts to avoid floating-point drift.
// Results are converted back to euro for display only.

import { PARTNER_PROGRAM_CONFIG, type PartnerTier, type PartnerTierId } from "./partnerProgramConfig";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert euro to integer cents (avoids FP drift in multiplications). */
function eurToCents(eur: number): number {
  return Math.round(eur * 100);
}
/** Convert integer cents back to euro. */
function centsToEur(cents: number): number {
  return cents / 100;
}

// ── Performance fee distribution ─────────────────────────────────────────────

export interface PerformanceFeeDistribution {
  /** Investor profit (input). */
  investorProfit: number;
  /** Performance fee taken (25% of profit). */
  performanceFee: number;
  /** InnoInvest share of performance fee (12.5%). */
  innoInvestShare: number;
  /** CL portion before partner share (after InnoInvest). */
  clBase: number;
  /** Partner revenue share (clBase * tier.clShareRate). */
  partnerShare: number;
  /** CL remainder after partner share. */
  clRemainder: number;
  /** Tier used for the calculation. */
  tierId: PartnerTierId;
  /** Partner's effective share of the original investor profit (informational). */
  effectiveRateOfProfit: number;
}

export function calcPerformanceFeeDistribution(
  investorProfitEur: number,
  tierId: PartnerTierId,
): PerformanceFeeDistribution {
  const cfg = PARTNER_PROGRAM_CONFIG;
  const tier = cfg.tiers.find((t) => t.id === tierId);
  if (!tier) throw new Error(`Unknown tier: ${tierId}`);

  const profitCents        = eurToCents(investorProfitEur);
  const perfFeeCents       = Math.round(profitCents * cfg.performanceFeeRate);
  const innoInvestCents    = Math.round(perfFeeCents * cfg.innoInvestRate);
  const clBaseCents        = perfFeeCents - innoInvestCents;
  const partnerShareCents  = Math.round(clBaseCents * tier.clShareRate);
  const clRemainderCents   = clBaseCents - partnerShareCents;

  return {
    investorProfit:       centsToEur(profitCents),
    performanceFee:       centsToEur(perfFeeCents),
    innoInvestShare:      centsToEur(innoInvestCents),
    clBase:               centsToEur(clBaseCents),
    partnerShare:         centsToEur(partnerShareCents),
    clRemainder:          centsToEur(clRemainderCents),
    tierId,
    effectiveRateOfProfit: partnerShareCents / profitCents,
  };
}

// ── Abschlussprovision ────────────────────────────────────────────────────────

export interface APResult {
  investmentAmount: number;
  lockupYears: 1 | 3 | 5;
  rate: number;
  apAmount: number;
}

export function calcAP(investmentEur: number, lockupYears: 1 | 3 | 5): APResult {
  const apRate = PARTNER_PROGRAM_CONFIG.apRates.find((r) => r.lockupYears === lockupYears);
  if (!apRate) throw new Error(`No AP rate for ${lockupYears} years`);
  const investmentCents = eurToCents(investmentEur);
  const apCents = Math.round(investmentCents * apRate.rate);
  return {
    investmentAmount: investmentEur,
    lockupYears,
    rate: apRate.rate,
    apAmount: centsToEur(apCents),
  };
}

// ── Tier resolution ───────────────────────────────────────────────────────────

export function resolvePartnerTier(
  totalActiveVolumeEur: number,
  isFounder: boolean,
): PartnerTier {
  const tiers = [...PARTNER_PROGRAM_CONFIG.tiers].reverse(); // highest first
  const threshold = (tier: PartnerTier) =>
    isFounder ? tier.founderThreshold : tier.volThreshold;
  return (
    tiers.find((t) => totalActiveVolumeEur >= threshold(t)) ??
    PARTNER_PROGRAM_CONFIG.tiers[0]!
  );
}

/** Progress (0–1) toward the next tier. Returns 1 if already at highest. */
export function tierProgress(
  totalActiveVolumeEur: number,
  isFounder: boolean,
): { current: PartnerTier; next: PartnerTier | null; progress: number } {
  const current = resolvePartnerTier(totalActiveVolumeEur, isFounder);
  const tiers = PARTNER_PROGRAM_CONFIG.tiers;
  const currentIdx = tiers.findIndex((t) => t.id === current.id);
  const next = tiers[currentIdx + 1] ?? null;
  if (!next) return { current, next: null, progress: 1 };

  const lo = isFounder ? current.founderThreshold : current.volThreshold;
  const hi = isFounder ? next.founderThreshold : next.volThreshold;
  const progress = hi > lo ? Math.min((totalActiveVolumeEur - lo) / (hi - lo), 1) : 0;
  return { current, next, progress };
}

// ── Volume calculation ────────────────────────────────────────────────────────

export interface ActiveVolume {
  ownVolume: number;
  teamVolume: number;
  totalVolume: number;
}

export function calcActiveVolume(ownVolume: number, teamVolume: number): ActiveVolume {
  return {
    ownVolume,
    teamVolume,
    totalVolume: ownVolume + teamVolume,
  };
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** Format as German currency: 1.130.000 € */
export function formatEur(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format percentage: 40 % */
export function formatPct(rate: number): string {
  return `${Math.round(rate * 100)} %`;
}
