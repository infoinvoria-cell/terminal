import validationData from "@/data/capitalife/seasonality_validation.json";
import deepResultsData from "@/data/capitalife/deep_validation_results.json";

export interface DeepValidationPattern {
  id: string;
  name: string;
  asset: string;
  direction: "LONG" | "SHORT";
  source: string;
  grade: string;
  score: number;
  verdict: string;
  sharpe: number;
  cagr: number;
  max_dd: number;
  win_rate: number;
  profit_factor: number;
  trades: number;
  avg_trade_days: number;
  wf_efficiency: number;
  stress_passed: number;
  stress_total: number;
  after_costs_profitable: boolean;
  mc_p5_sharpe: number;
  mc_p50_sharpe: number;
  mc_prob_loss_pct: number;
  brain_quality: number;
  last_validated: string;
  deep_score?: number;
  deep_grade?: string;
  wf_strict_pct?: number;
  bonferroni_significant?: boolean;
  bonferroni_p?: number;
  param_stability_pct?: number;
  decades_profitable?: number;
  forward_pass?: boolean;
  forward_sharpe?: number;
  forward_wr?: number;
}

export interface DeepValidationMeta {
  date: string;
  tests: number;
  candidates: number;
  results: Record<string, number>;
}

const patterns = validationData.patterns as DeepValidationPattern[];
const deepMeta = validationData.deep_validation as DeepValidationMeta;

const byId = new Map<string, DeepValidationPattern>();
for (const p of patterns) byId.set(p.id, p);

const deepValidated = patterns.filter(
  (p): p is DeepValidationPattern & { deep_score: number; deep_grade: string } =>
    p.deep_score !== undefined,
);

export function getDeepValidationById(id: string): DeepValidationPattern | undefined {
  return byId.get(id);
}

export function getAllPatterns(): DeepValidationPattern[] {
  return patterns;
}

export function getDeepValidatedPatterns() {
  return deepValidated;
}

export function getDeepValidationMeta(): DeepValidationMeta {
  return deepMeta;
}

export function gradeColor(grade: string): string {
  switch (grade) {
    case "A+": return "#22C55E";
    case "A": return "#22C55E";
    case "B": return "#DCC476";
    case "C": return "#F59E0B";
    case "D": return "#EF4444";
    default: return "#6B7280";
  }
}

export function gradeBg(grade: string): string {
  switch (grade) {
    case "A+": return "rgba(34,197,94,0.12)";
    case "A": return "rgba(34,197,94,0.10)";
    case "B": return "rgba(220,196,118,0.10)";
    case "C": return "rgba(245,158,11,0.10)";
    case "D": return "rgba(239,68,68,0.10)";
    default: return "rgba(107,114,128,0.08)";
  }
}

/* ─── Deep Validation Detail Results ──────────────────────────────── */

export interface WfFold {
  oos_start: string;
  oos_end: string;
  sharpe: number;
  pnl: number;
  trades: number;
  positive: boolean | string;
}

export interface RegimeDetail {
  trades: number;
  sharpe: number;
  pnl: number;
  positive: boolean;
}

export interface CostLevel {
  pnl: number;
  sharpe: number;
  profitable: boolean;
}

export interface DecadeDetail {
  trades: number;
  sharpe: number;
  pnl: number;
  win_rate: number;
  profitable: boolean;
}

export interface DeepDetailResult {
  id: string;
  name: string;
  asset: string;
  direction: "LONG" | "SHORT";
  source: string;
  deep_score: number;
  deep_grade: string;
  t1_wf_strict: {
    wf_strict_pct: number;
    folds: number;
    positive_folds: number;
    fold_details: WfFold[];
    pass: boolean;
  };
  t2_bonferroni: {
    p_raw: number;
    p_bonferroni: number;
    significant: boolean;
    real_sharpe: number;
    random_sharpe_mean: number;
    random_sharpe_std: number;
  };
  t3_stability: {
    stability_pct: number;
    robust: boolean;
    n_variants: number;
    positive_variants: number;
    pass: boolean;
  };
  t4_regime: {
    regimes: Record<string, RegimeDetail>;
    regimes_positive: number;
    total_regimes: number;
    pass: boolean;
  };
  t5_costs: {
    cost_levels: Record<string, CostLevel>;
    break_even_range: string;
    pass: boolean;
  };
  t6_decades: {
    decades: Record<string, DecadeDetail>;
    decades_profitable: number;
    total: number;
    pass: boolean;
  };
  t7_forward: {
    trades: number;
    sharpe: number;
    win_rate: number;
    pnl: number;
    profit_factor: number;
    pass: boolean;
  };
  last_validated: string;
}

const deepResults = (deepResultsData as any).candidates as DeepDetailResult[];
const deepDetailById = new Map<string, DeepDetailResult>();
for (const c of deepResults) deepDetailById.set(c.id, c);

export function getDeepDetailById(id: string): DeepDetailResult | undefined {
  return deepDetailById.get(id);
}

export function getAllDeepDetails(): DeepDetailResult[] {
  return deepResults;
}

export function getNextSignals(): { id: string; name: string; asset: string; direction: string; deep_grade: string; deep_score: number; entry_month: number; entry_day: number; holding_days: number; days_away: number; status: string }[] {
  const now = new Date();
  const todayCal = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + 1;

  return deepResults
    .filter(p => p.deep_grade === "A+" || p.deep_grade === "A")
    .map(p => {
      const m = p.id.match(/_(\d{2})(\d{2})_(\d+)$/);
      if (!m) return null;
      const month = parseInt(m[1], 10);
      const day = parseInt(m[2], 10);
      const hold = parseInt(m[3], 10);
      const entryDate = new Date(now.getFullYear(), month - 1, day);
      let entryCal = Math.floor((entryDate.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
      if (entryCal < todayCal - 14) entryCal += 365;
      const daysAway = entryCal - todayCal;
      return {
        id: p.id, name: p.name, asset: p.asset, direction: p.direction,
        deep_grade: p.deep_grade, deep_score: p.deep_score,
        entry_month: month, entry_day: day, holding_days: hold,
        days_away: daysAway < 0 ? daysAway + 365 : daysAway,
        status: daysAway >= 0 && daysAway <= hold * 1.45 ? "ACTIVE" : "UPCOMING",
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.days_away - b.days_away) as any[];
}

export type RevalidationResult = Record<string, unknown>;

export function getRevalidationById(_id: string): RevalidationResult | undefined {
  return undefined;
}
