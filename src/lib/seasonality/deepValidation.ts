import validationData from "@/data/capitalife/seasonality_validation.json";

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
