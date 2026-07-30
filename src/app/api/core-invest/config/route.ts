import { NextResponse } from "next/server";
import { CORE_INVEST_MODEL, getCoreInvestWeightTotal } from "@/lib/core-invest/core-invest-model";

export const runtime = "edge";

export async function GET() {
  return NextResponse.json({
    portfolioName: CORE_INVEST_MODEL.portfolioName,
    version: CORE_INVEST_MODEL.version,
    status: CORE_INVEST_MODEL.status,
    statusLabel: CORE_INVEST_MODEL.statusLabel,
    frozenDate: CORE_INVEST_MODEL.frozenDate,
    components: CORE_INVEST_MODEL.components,
    componentCount: CORE_INVEST_MODEL.components.length,
    weightTotal: getCoreInvestWeightTotal(),
    rebalance: CORE_INVEST_MODEL.rebalance,
    constraints: CORE_INVEST_MODEL.constraints,
    validation: CORE_INVEST_MODEL.validation,
  });
}
export async function POST() { return NextResponse.json({ error: "unavailable in cloud preview" }, { status: 503 }); }
