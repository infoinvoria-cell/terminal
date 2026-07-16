import type { OrderPreviewOutput, OrderPreviewRow, OrderType, TradeDirection } from "@/lib/trading/types";

type AccountAllocationInput = {
  accountId: string;
  lots: number;
  estimatedRisk: number;
  estimatedReward: number;
};

type OrderPreviewInput = {
  activeAsset: string;
  direction: TradeDirection;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  accountAllocations: AccountAllocationInput[];
  orderType: OrderType;
};

function toFinite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildOrderPreview(input: OrderPreviewInput): OrderPreviewOutput {
  const errors: string[] = [];
  const orders: OrderPreviewRow[] = [];

  if (!input.activeAsset) errors.push("Asset missing");
  if (!(toFinite(input.entry) > 0)) errors.push("Entry invalid");
  if (!(toFinite(input.stopLoss) > 0)) errors.push("Stop loss invalid");
  if (!(toFinite(input.takeProfit) > 0)) errors.push("Take profit invalid");
  if (!Array.isArray(input.accountAllocations) || input.accountAllocations.length === 0) errors.push("No account allocation");

  for (const alloc of input.accountAllocations ?? []) {
    const lots = toFinite(alloc.lots);
    if (!(lots > 0)) continue;
    orders.push({
      accountId: alloc.accountId,
      symbol: input.activeAsset,
      direction: input.direction,
      orderType: input.orderType,
      entry: toFinite(input.entry),
      stopLoss: toFinite(input.stopLoss),
      takeProfit: toFinite(input.takeProfit),
      lots,
      estimatedRisk: toFinite(alloc.estimatedRisk),
      estimatedReward: toFinite(alloc.estimatedReward),
    });
  }

  if (!orders.length) errors.push("No valid account orders");

  return {
    valid: errors.length === 0,
    orders,
    errors,
  };
}
