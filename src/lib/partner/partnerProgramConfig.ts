// Central configuration for the Capitalife Partner Program.
// ALL percentages, thresholds and tier definitions live here.
// UI components must read from this config — no hard-coded values in JSX.

export type PartnerTierId = "bronze" | "silver" | "gold" | "platin" | "black";

export interface PartnerTier {
  id: PartnerTierId;
  label: string;
  /** Partner's share of the CL performance portion (after InnoInvest deduction). */
  clShareRate: number;
  /** Active volume threshold for regular partners (€). */
  volThreshold: number;
  /** Active volume threshold for Founder partners (€, = volThreshold * 0.5). */
  founderThreshold: number;
  /** Whether this tier has a potential Management Fee participation. */
  hasMgmtFeeShare: boolean;
  /** TBD = not yet finalised. */
  mgmtFeeShareNote: string | null;
}

export interface APRate {
  lockupYears: 1 | 3 | 5;
  /** Percentage of investment amount paid as Abschlussprovision. */
  rate: number;
}

export const PARTNER_PROGRAM_CONFIG = {
  // ── Fee split ────────────────────────────────────────────────────────────
  /** Fraction of investor profit charged as performance fee. */
  performanceFeeRate: 0.25,
  /** Fraction of the performance fee that goes to InnoInvest (Haftungsdach). */
  innoInvestRate: 0.125,
  /** Management fee rate per annum. */
  managementFeeRate: 0.03,
  /** Fraction of management fee that goes to InnoInvest. */
  innoInvestMgmtRate: 0.125,

  // ── Founder discount ─────────────────────────────────────────────────────
  /** Founder partners qualify at 50% of the regular volume threshold. */
  founderThresholdMultiplier: 0.5,

  // ── Partner tiers ────────────────────────────────────────────────────────
  tiers: [
    {
      id:               "bronze" as PartnerTierId,
      label:            "Bronze",
      clShareRate:      0.20,
      volThreshold:     0,
      founderThreshold: 0,
      hasMgmtFeeShare:  false,
      mgmtFeeShareNote: null,
    },
    {
      id:               "silver" as PartnerTierId,
      label:            "Silber",
      clShareRate:      0.30,
      volThreshold:     500_000,
      founderThreshold: 250_000,
      hasMgmtFeeShare:  false,
      mgmtFeeShareNote: null,
    },
    {
      id:               "gold" as PartnerTierId,
      label:            "Gold",
      clShareRate:      0.40,
      volThreshold:     1_000_000,
      founderThreshold: 500_000,
      hasMgmtFeeShare:  false,
      mgmtFeeShareNote: null,
    },
    {
      id:               "platin" as PartnerTierId,
      label:            "Platin",
      clShareRate:      0.50,
      volThreshold:     2_000_000,
      founderThreshold: 1_000_000,
      hasMgmtFeeShare:  true,
      mgmtFeeShareNote: "gemäß Partnervereinbarung (TBD)",
    },
    {
      id:               "black" as PartnerTierId,
      label:            "Black",
      clShareRate:      0.60,
      volThreshold:     5_000_000,
      founderThreshold: 2_500_000,
      hasMgmtFeeShare:  true,
      mgmtFeeShareNote: "gemäß Partnervereinbarung (TBD)",
    },
  ] as PartnerTier[],

  // ── Abschlussprovision ───────────────────────────────────────────────────
  apRates: [
    { lockupYears: 1 as const, rate: 0.005 },
    { lockupYears: 3 as const, rate: 0.010 },
    { lockupYears: 5 as const, rate: 0.015 },
  ] as APRate[],

  // ── TBD fields (not yet finalised — do not use in business logic) ────────
  tbd: {
    founderSlotsTotal:       null as number | null,  // TBD: max. Anzahl Founder-Plätze
    founderStatusPermanent:  null as boolean | null, // TBD: dauerhafter Founder-Status?
    clawbackRules:           null as string | null,  // TBD: Clawback bei Ausstieg?
    teamDepthLevels:         1,                      // currently only direct level
    mgmtFeeSharePlatin:      null as number | null,  // TBD: % für Platin
    mgmtFeeShareBlack:       null as number | null,  // TBD: % für Black
  },
} as const;
