import { NextResponse } from "next/server";
import { CORE_INVEST_MODEL, getCoreInvestWeightTotal, CORE_INVEST_ETF_SYMBOLS, CORE_INVEST_MF_SYMBOLS } from "@/lib/core-invest/core-invest-model";

export const runtime = "edge";

export async function GET() {
  return NextResponse.json({
    portfolioName:   CORE_INVEST_MODEL.portfolioName,
    version:         CORE_INVEST_MODEL.version,
    status:          CORE_INVEST_MODEL.status,
    statusLabel:     CORE_INVEST_MODEL.statusLabel,
    frozenDate:      CORE_INVEST_MODEL.frozenDate,
    riskMultiplier:  CORE_INVEST_MODEL.riskMultiplier,
    longExposureCap: CORE_INVEST_MODEL.longExposureCap,
    grossLongExposure: CORE_INVEST_MODEL.grossLongExposure,
    cashFinancing:   CORE_INVEST_MODEL.cashFinancing,
    etfFactorSleeve: CORE_INVEST_MODEL.etfFactorSleeve,
    managedFuturesOverlay: CORE_INVEST_MODEL.managedFuturesOverlay,
    etfWeightTotal:  getCoreInvestWeightTotal(),
    ablationKpis:    CORE_INVEST_MODEL.ablationKpis,
    rebalance:       CORE_INVEST_MODEL.rebalance,
    constraints:     CORE_INVEST_MODEL.constraints,
    validation:      CORE_INVEST_MODEL.validation,
    etfSymbols:      CORE_INVEST_ETF_SYMBOLS,
    mfSymbols:       CORE_INVEST_MF_SYMBOLS,
    componentCount:  CORE_INVEST_MODEL.etfFactorSleeve.length + CORE_INVEST_MODEL.managedFuturesOverlay.length,
  });
}

export async function POST() {
  return NextResponse.json({ error: "not supported" }, { status: 405 });
}
