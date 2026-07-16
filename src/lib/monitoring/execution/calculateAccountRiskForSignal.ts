import type { ExecutionBrokerSpec, TradeDirection } from "@/lib/trading/types";
import type { ExecutionAccountRiskProfile, ExecutionAssetGroup } from "@/lib/monitoring/execution/accountRiskProfiles";

export type SignalRiskInput = {
  symbol: string;
  direction: TradeDirection;
  entryPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  group: ExecutionAssetGroup | null;
};

export type AccountRiskCalculationInput = {
  signal: SignalRiskInput;
  accountProfile: ExecutionAccountRiskProfile;
  brokerSpec: ExecutionBrokerSpec;
};

export type AccountRiskCalculationOutput = {
  riskUsd: number | null;
  effectiveRiskPercent: number | null;
  priceRisk: number | null;
  priceReward: number | null;
  rr: number | null;
  positionSize: number | null;
  totalRiskUsd: number | null;
  potentialProfitUsd: number | null;
  status: "OK" | "nicht handelbar" | "Daten fehlen" | "Broker Specs fehlen";
  missingFields: string[];
  groupWeighting: number | null;
};

function toPositive(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeSymbol(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function resolveTradability(signal: SignalRiskInput, profile: ExecutionAccountRiskProfile): boolean {
  const symbol = normalizeSymbol(signal.symbol);
  if (profile.allowedSymbols?.length && !profile.allowedSymbols.map(normalizeSymbol).includes(symbol)) {
    return false;
  }
  if (profile.allowedGroups?.length && signal.group && !profile.allowedGroups.includes(signal.group)) {
    return false;
  }
  return true;
}

function resolveGroupWeight(signal: SignalRiskInput, profile: ExecutionAccountRiskProfile): number | null {
  if (!signal.group) return null;
  const fromGroup = profile.riskMultiplierByGroup?.[signal.group];
  if (Number.isFinite(Number(fromGroup))) return Number(fromGroup);
  return null;
}

function resolveSymbolWeight(signal: SignalRiskInput, profile: ExecutionAccountRiskProfile): number | null {
  const symbol = normalizeSymbol(signal.symbol);
  const symbolMultiplier = profile.riskMultiplierBySymbol?.[symbol];
  if (Number.isFinite(Number(symbolMultiplier))) return Number(symbolMultiplier);
  return null;
}

function clampToOrderStep(raw: number, step: number, min: number, max: number | null): number {
  let value = Math.floor(raw / step) * step;
  if (value < min) value = 0;
  if (max != null && value > max) value = Math.floor(max / step) * step;
  return value > 0 ? value : 0;
}

export function calculateAccountRiskForSignal(input: AccountRiskCalculationInput): AccountRiskCalculationOutput {
  const { signal, accountProfile: profile, brokerSpec } = input;
  const missingFields: string[] = [];

  if (!resolveTradability(signal, profile)) {
    return {
      riskUsd: null,
      effectiveRiskPercent: null,
      priceRisk: null,
      priceReward: null,
      rr: null,
      positionSize: null,
      totalRiskUsd: null,
      potentialProfitUsd: null,
      status: "nicht handelbar",
      missingFields: [],
      groupWeighting: resolveGroupWeight(signal, profile),
    };
  }

  const entry = toPositive(signal.entryPrice);
  const stop = toPositive(signal.stopLossPrice);
  const takeProfit = toPositive(signal.takeProfitPrice);
  const accountSize = toPositive(profile.accountSizeUsd);
  const defaultRiskPercent = toPositive(profile.defaultRiskPercent);
  const riskMultiplier = toPositive(profile.riskMultiplier);
  const groupWeighting = resolveGroupWeight(signal, profile);
  const symbolWeighting = resolveSymbolWeight(signal, profile);
  const maxRiskUsd = toPositive(profile.maxRiskUsd);

  if (entry == null) missingFields.push("entryPrice");
  if (stop == null) missingFields.push("stopLossPrice");
  if (takeProfit == null) missingFields.push("takeProfitPrice");
  if (accountSize == null) missingFields.push("accountSize");
  if (defaultRiskPercent == null && maxRiskUsd == null) missingFields.push("riskPercent/maxRiskUsd");
  if (riskMultiplier == null) missingFields.push("riskMultiplier");
  if (groupWeighting == null) missingFields.push("groupWeighting");
  if (symbolWeighting == null && profile.riskMultiplierBySymbol != null) missingFields.push("symbolWeighting");

  const priceRisk = entry != null && stop != null ? Math.abs(entry - stop) : null;
  const priceReward = entry != null && takeProfit != null ? Math.abs(takeProfit - entry) : null;
  const rr = priceRisk != null && priceReward != null && priceRisk > 0 ? priceReward / priceRisk : null;

  const effectiveRiskPercent =
    accountSize != null
    && defaultRiskPercent != null
    && riskMultiplier != null
    && groupWeighting != null
      ? defaultRiskPercent * riskMultiplier * groupWeighting * (symbolWeighting ?? 1)
      : null;

  const riskUsdFromPercent = accountSize != null && effectiveRiskPercent != null
    ? accountSize * (effectiveRiskPercent / 100)
    : null;
  const riskUsd = riskUsdFromPercent != null && maxRiskUsd != null
    ? Math.min(riskUsdFromPercent, maxRiskUsd)
    : (riskUsdFromPercent ?? maxRiskUsd ?? null);

  if (entry == null || stop == null || takeProfit == null || riskUsd == null) {
    return {
      riskUsd,
      effectiveRiskPercent,
      priceRisk,
      priceReward,
      rr,
      positionSize: null,
      totalRiskUsd: null,
      potentialProfitUsd: null,
      status: "Daten fehlen",
      missingFields,
      groupWeighting,
    };
  }

  const priceRiskValue = priceRisk;
  const priceRewardValue = priceReward ?? 0;
  if (priceRiskValue == null) {
    return {
      riskUsd,
      effectiveRiskPercent,
      priceRisk,
      priceReward,
      rr,
      positionSize: null,
      totalRiskUsd: null,
      potentialProfitUsd: null,
      status: "Daten fehlen",
      missingFields: [...missingFields, "priceRisk"],
      groupWeighting,
    };
  }

  const contractMultiplier = toPositive(brokerSpec.contractMultiplier) ?? 1;
  const tickSize = toPositive(brokerSpec.tickSize);
  const tickValue = toPositive(brokerSpec.tickValue);
  const pointValue = toPositive(brokerSpec.pointValue);
  const orderStep = toPositive(brokerSpec.orderStep);
  const minOrderSize = toPositive(brokerSpec.minOrderSize);
  const maxOrderSize = toPositive(brokerSpec.maxOrderSize);

  let riskPerUnitUsd: number | null = null;
  let rewardPerUnitUsd: number | null = null;
  if (pointValue != null) {
    riskPerUnitUsd = priceRiskValue * pointValue * contractMultiplier;
    rewardPerUnitUsd = priceRewardValue * pointValue * contractMultiplier;
  } else if (tickSize != null && tickValue != null) {
    riskPerUnitUsd = (priceRiskValue / tickSize) * tickValue * contractMultiplier;
    rewardPerUnitUsd = (priceRewardValue / tickSize) * tickValue * contractMultiplier;
  } else {
    missingFields.push("pointValue/tickSize/tickValue");
  }

  if (riskPerUnitUsd == null || !(riskPerUnitUsd > 0) || orderStep == null || minOrderSize == null) {
    if (orderStep == null) missingFields.push("orderStep");
    if (minOrderSize == null) missingFields.push("minOrderSize");
    return {
      riskUsd,
      effectiveRiskPercent,
      priceRisk,
      priceReward,
      rr,
      positionSize: null,
      totalRiskUsd: null,
      potentialProfitUsd: null,
      status: "Broker Specs fehlen",
      missingFields,
      groupWeighting,
    };
  }

  const rawSize = riskUsd / riskPerUnitUsd;
  const positionSize = clampToOrderStep(rawSize, orderStep, minOrderSize, maxOrderSize);
  const totalRiskUsd = positionSize > 0 ? positionSize * riskPerUnitUsd : 0;
  const potentialProfitUsd =
    positionSize > 0 && rewardPerUnitUsd != null
      ? positionSize * rewardPerUnitUsd
      : null;

  return {
    riskUsd,
    effectiveRiskPercent,
    priceRisk,
    priceReward,
    rr,
    positionSize: positionSize > 0 ? positionSize : null,
    totalRiskUsd: totalRiskUsd > 0 ? totalRiskUsd : null,
    potentialProfitUsd,
    status: positionSize > 0 ? "OK" : "Broker Specs fehlen",
    missingFields,
    groupWeighting,
  };
}
