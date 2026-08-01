import { NextResponse } from "next/server";
import validationData from "@/data/capitalife/seasonality_validation.json";

export async function GET() {
  const patterns = validationData.patterns;
  const deepValidated = patterns.filter((p: any) => p.deep_score !== undefined);
  const meta = (validationData as any).deep_validation ?? null;

  return NextResponse.json({
    total: patterns.length,
    deep_validated: deepValidated.length,
    meta,
    patterns: deepValidated.map((p: any) => ({
      id: p.id,
      name: p.name,
      asset: p.asset,
      direction: p.direction,
      deep_score: p.deep_score,
      deep_grade: p.deep_grade,
      wf_strict_pct: p.wf_strict_pct,
      bonferroni_significant: p.bonferroni_significant,
      bonferroni_p: p.bonferroni_p,
      param_stability_pct: p.param_stability_pct,
      decades_profitable: p.decades_profitable,
      forward_pass: p.forward_pass,
      forward_sharpe: p.forward_sharpe,
      forward_wr: p.forward_wr,
      grade: p.grade,
      score: p.score,
      win_rate: p.win_rate,
      sharpe: p.sharpe,
    })),
  });
}
