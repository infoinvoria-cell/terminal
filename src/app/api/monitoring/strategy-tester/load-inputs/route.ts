import { type NextRequest, NextResponse } from "next/server";
import { getAgricultureMvaBinding } from "@/lib/monitoring/strategyTester/engines/macroValuation/bindings";
import { AGRI_DISABLED_MACRO_SYMBOLS } from "@/lib/monitoring/strategyTester/constants";
import { loadMacroValuationInputs } from "@/lib/monitoring/strategyTester/engines/macroValuation/inputs";
import type { MonitoringStrategyLoadInputsResponse, MonitoringStrategyKind } from "@/lib/monitoring/strategyTester/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { symbol?: string; strategyKind?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const strategyKind = (body.strategyKind ?? "macro_valuation") as MonitoringStrategyKind;
  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }
  if (strategyKind !== "macro_valuation") {
    const resp: MonitoringStrategyLoadInputsResponse = {
      symbol,
      strategyKind,
      inputSet: null,
      inputAvailability: "not_applicable",
      error: `Strategy kind '${strategyKind}' is not supported here.`,
    };
    return NextResponse.json(resp);
  }
  if (AGRI_DISABLED_MACRO_SYMBOLS.includes(symbol as (typeof AGRI_DISABLED_MACRO_SYMBOLS)[number])) {
    const resp: MonitoringStrategyLoadInputsResponse = {
      symbol,
      strategyKind,
      inputSet: null,
      inputAvailability: "not_applicable",
      error: `${symbol} is disabled in the frozen agri macro system.`,
    };
    return NextResponse.json(resp);
  }

  const binding = getAgricultureMvaBinding(symbol);
  if (!binding) {
    const resp: MonitoringStrategyLoadInputsResponse = {
      symbol,
      strategyKind,
      inputSet: null,
      inputAvailability: "not_applicable",
    };
    return NextResponse.json(resp);
  }

  const { inputSet, inputAvailability } = loadMacroValuationInputs(binding);
  const resp: MonitoringStrategyLoadInputsResponse = {
    symbol,
    strategyKind,
    inputSet,
    inputAvailability,
  };
  return NextResponse.json(resp);
}
