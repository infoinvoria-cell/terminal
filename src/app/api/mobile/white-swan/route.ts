import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { isPublicPreview } from "@/lib/server/app-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type MobileWhiteSwanSummary = {
  available: boolean;
  status: string;
  generatedDate: string | null;
  validationState: "VALIDATED" | "RESEARCH_CANDIDATE" | "UNKNOWN";
  ibkrCostsVerified: boolean;
  ibkrCostsVerifiedDate: string | null;
  elapsedYears: number | null;
  minimumCapitalEur: number | null;
  conservativeMarginEur: number | null;
  capitalLevels: {
    capital: number;
    assessment: string;
    finalCandidates: number;
    recommendation: {
      oosCAGR: number | null;
      sharpe: number | null;
      maxDD: number | null;
      marginPct: number | null;
      totalMarginEur: number | null;
      sizingTier: string | null;
      validated: boolean;
    } | null;
  }[];
  mode: "public-preview" | "local-private";
  updatedAt: string | null;
  stale: boolean;
};

function readSummary(): Record<string, unknown> | null {
  const paths = [
    path.join(process.cwd(), "workspace", "output", "white-swan", "final-normalized", "summary.json"),
    path.join(process.cwd(), "public", "data", "white-swan", "final-normalized", "summary.json"),
  ];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch { /* try next */ }
  }
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse<MobileWhiteSwanSummary>> {
  const preview = isPublicPreview();
  const capitalParam = request.nextUrl.searchParams.get("capital");

  const raw = readSummary();
  if (!raw) {
    return NextResponse.json({
      available: false,
      status: "NO_DATA",
      generatedDate: null,
      validationState: "UNKNOWN",
      ibkrCostsVerified: false,
      ibkrCostsVerifiedDate: null,
      elapsedYears: null,
      minimumCapitalEur: null,
      conservativeMarginEur: null,
      capitalLevels: [],
      mode: preview ? "public-preview" : "local-private",
      updatedAt: null,
      stale: true,
    });
  }

  const capitalLevels = raw.capitalLevels as Record<string, Record<string, unknown>> | undefined ?? {};
  const levelsArray = Object.entries(capitalLevels)
    .filter(([cap]) => !capitalParam || cap === capitalParam)
    .map(([cap, level]) => {
      const rec = level.finalRecommendation as Record<string, unknown> | null | undefined ?? null;
      // Only expose validated candidates (assessment === PASS)
      const validated = level.capitalAssessment === "PASS" && (level.finalCandidates as number ?? 0) > 0;
      return {
        capital: parseInt(cap, 10),
        assessment: String(level.capitalAssessment ?? "UNKNOWN"),
        finalCandidates: Number(level.finalCandidates ?? 0),
        recommendation: rec ? {
          oosCAGR:        typeof rec.oosCAGR === "number" ? rec.oosCAGR : null,
          sharpe:         typeof rec.sharpe === "number" ? rec.sharpe : null,
          maxDD:          typeof rec.maxDD === "number" ? rec.maxDD : null,
          marginPct:      typeof rec.marginPct === "number" ? rec.marginPct : null,
          totalMarginEur: typeof rec.totalMargin_EUR === "number" ? rec.totalMargin_EUR : null,
          sizingTier:     typeof rec.sizingTier === "string" ? rec.sizingTier : null,
          validated,
        } : null,
      };
    });

  const generatedDate = typeof raw.generatedDate === "string" ? raw.generatedDate : null;
  const stale = generatedDate ? (Date.now() - new Date(generatedDate).getTime()) > 30 * 24 * 60 * 60 * 1000 : true;

  return NextResponse.json({
    available: true,
    status: String(raw.status ?? "UNKNOWN"),
    generatedDate,
    validationState: raw.status === "LIVE" ? "VALIDATED" : raw.status === "RESEARCH_CANDIDATE" ? "RESEARCH_CANDIDATE" : "UNKNOWN",
    ibkrCostsVerified: !!raw.ibkrCostsVerifiedDate,
    ibkrCostsVerifiedDate: typeof raw.ibkrCostsVerifiedDate === "string" ? raw.ibkrCostsVerifiedDate : null,
    elapsedYears: typeof raw.elapsedYears === "number" ? raw.elapsedYears : null,
    minimumCapitalEur: typeof raw.minimumCapitalFor30pctRule_EUR === "number" ? raw.minimumCapitalFor30pctRule_EUR : null,
    conservativeMarginEur: typeof raw.conservativeMarginTotal_EUR === "number" ? raw.conservativeMarginTotal_EUR : null,
    capitalLevels: levelsArray,
    mode: preview ? "public-preview" : "local-private",
    updatedAt: generatedDate,
    stale,
  });
}
