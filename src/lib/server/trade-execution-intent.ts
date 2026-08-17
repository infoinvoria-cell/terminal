import { createHash } from "node:crypto";

export type TradeExecutionIntentInput = {
  mode: "paper" | "manual";
  asset: string;
  strategyId: string | null;
  direction: "long" | "short";
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskUsd: number | null;
  quantity: number | null;
  brokerSpec: unknown;
  status: "paper_created" | "manual_marked_executed" | "manual_ticket_copied";
};

export function buildTradeExecutionIntentId(input: TradeExecutionIntentInput): string {
  const routeSymbol = input.brokerSpec && typeof input.brokerSpec === "object"
    ? (input.brokerSpec as { routeSymbol?: unknown }).routeSymbol
    : null;
  const digest = createHash("sha256")
    .update(JSON.stringify({
      mode: input.mode,
      asset: input.asset,
      strategyId: input.strategyId,
      direction: input.direction,
      entry: input.entry,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      riskUsd: input.riskUsd,
      quantity: input.quantity,
      routeSymbol: routeSymbol ?? null,
      status: input.status,
    }))
    .digest("hex");
  return `te_${digest.slice(0, 20)}`;
}
