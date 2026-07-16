import type {
  ExecutionAccountSettings,
  ExecutionBlockerSettings,
  ExecutionBlockerStatus,
  ExecutionBrokerSpec,
  ExecutionParityStatus,
  ExecutionRiskOutput,
  TradeExecutionTicket,
  RiskEngineInput,
  RiskEngineOutput,
} from "@/lib/trading/types";

function toFinite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundByStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0;
  return Math.floor(value / step) * step;
}

export function calculateRisk(input: RiskEngineInput): RiskEngineOutput {
  const direction = input.direction;
  const entry = toFinite(input.entry);
  const stopLoss = toFinite(input.stopLoss);
  const takeProfit = toFinite(input.takeProfit);
  const accountEquity = Math.max(0, toFinite(input.accountEquity));
  const riskPercent = Math.max(0, toFinite(input.riskPercent));
  const pointValue = Math.max(0, toFinite(input.pointValue));
  const minLot = Math.max(0, toFinite(input.minLot));
  const lotStep = Math.max(0, toFinite(input.lotStep));
  const maxLot = Math.max(minLot, toFinite(input.maxLot));
  const contractMultiplier = Math.max(0, toFinite(input.contractMultiplier, 1));

  const errors: string[] = [];

  if (!(entry > 0)) errors.push("Entry missing");
  if (!(stopLoss > 0)) errors.push("Stop loss missing");
  if (!(takeProfit > 0)) errors.push("Take profit missing");
  if (!(accountEquity > 0)) errors.push("Account equity invalid");
  if (!(riskPercent > 0)) errors.push("Risk % invalid");
  if (!(pointValue > 0)) errors.push("Point value invalid");
  if (!(contractMultiplier > 0)) errors.push("Contract multiplier invalid");
  if (!(lotStep > 0)) errors.push("Lot step invalid");

  if (direction === "long") {
    if (!(stopLoss < entry)) errors.push("Long requires stop loss below entry");
    if (!(takeProfit > entry)) errors.push("Long requires take profit above entry");
  } else {
    if (!(stopLoss > entry)) errors.push("Short requires stop loss above entry");
    if (!(takeProfit < entry)) errors.push("Short requires take profit below entry");
  }

  const stopDistance = Math.abs(entry - stopLoss);
  const takeProfitDistance = Math.abs(takeProfit - entry);
  if (!(stopDistance > 0)) errors.push("Stop distance invalid");

  const riskAmount = accountEquity * (riskPercent / 100);
  const riskPerLot = stopDistance * pointValue * contractMultiplier;
  let rawLots = riskPerLot > 0 ? riskAmount / riskPerLot : 0;
  if (!Number.isFinite(rawLots) || rawLots < 0) rawLots = 0;

  let roundedLots = roundByStep(rawLots, lotStep);
  if (roundedLots < minLot && rawLots >= minLot) roundedLots = minLot;
  if (roundedLots > maxLot) roundedLots = maxLot;
  if (roundedLots < 0) roundedLots = 0;

  const maxLoss = roundedLots * riskPerLot;
  const rewardRiskRatio = stopDistance > 0 ? takeProfitDistance / stopDistance : 0;
  const valid = errors.length === 0;

  return {
    riskAmount,
    riskPercent,
    stopDistance,
    takeProfitDistance,
    rewardRiskRatio,
    rawLots,
    roundedLots,
    maxLoss,
    valid,
    errors,
  };
}

function toPositiveOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function calculateExecutionRisk(
  trade: TradeExecutionTicket,
  brokerSpec: ExecutionBrokerSpec,
  accountSettings: ExecutionAccountSettings,
): ExecutionRiskOutput {
  const errors: string[] = [];
  const entry = toPositiveOrNull(trade.entryPrice);
  const stop = toPositiveOrNull(trade.stopLossPrice);
  const takeProfit = toPositiveOrNull(trade.takeProfitPrice);
  const riskBudgetUsd = Math.max(0, Number(accountSettings.riskBudgetUsd || 0));
  const orderStep = toPositiveOrNull(brokerSpec.orderStep);
  const minOrderSize = toPositiveOrNull(brokerSpec.minOrderSize);
  const maxOrderSize = toPositiveOrNull(brokerSpec.maxOrderSize);
  const contractMultiplier = toPositiveOrNull(brokerSpec.contractMultiplier) ?? 1;
  const tickSize = toPositiveOrNull(brokerSpec.tickSize);
  const tickValue = toPositiveOrNull(brokerSpec.tickValue);
  const pointValue = toPositiveOrNull(brokerSpec.pointValue);
  const feePerContract = Math.max(0, Number(brokerSpec.commissionEstimate || 0));
  const slippagePerContract = Math.max(0, Number(brokerSpec.slippageEstimate || 0));

  if (entry == null) errors.push("Entry fehlt");
  if (stop == null) errors.push("Stop Loss fehlt");
  if (takeProfit == null) errors.push("Take Profit fehlt");
  if (!(riskBudgetUsd > 0)) errors.push("Risk budget USD fehlt oder ist 0");
  if (orderStep == null) errors.push("orderStep fehlt");
  if (minOrderSize == null) errors.push("minOrderSize fehlt");
  if (pointValue == null && (tickSize == null || tickValue == null)) {
    errors.push("Broker pointValue oder (tickSize + tickValue) fehlt");
  }

  if (errors.length > 0 || entry == null || stop == null || takeProfit == null || orderStep == null || minOrderSize == null) {
    return {
      valid: false,
      errors,
      stopDistance: entry != null && stop != null ? Math.abs(entry - stop) : null,
      takeProfitDistance: entry != null && takeProfit != null ? Math.abs(takeProfit - entry) : null,
      stopTicks: null,
      takeProfitTicks: null,
      riskPerContractUsd: null,
      rewardPerContractUsd: null,
      rr: null,
      positionSize: null,
      totalRiskUsd: null,
      potentialProfitUsd: null,
      estimatedFeesUsd: null,
      estimatedSlippageUsd: null,
    };
  }

  const stopDistance = Math.abs(entry - stop);
  const takeProfitDistance = Math.abs(takeProfit - entry);
  if (!(stopDistance > 0)) errors.push("Entry und Stop Loss identisch");
  if (!(takeProfitDistance > 0)) errors.push("Entry und Take Profit identisch");

  const stopTicks = tickSize != null ? stopDistance / tickSize : null;
  const takeProfitTicks = tickSize != null ? takeProfitDistance / tickSize : null;

  let riskPerContractUsd: number | null = null;
  let rewardPerContractUsd: number | null = null;
  if (pointValue != null) {
    riskPerContractUsd = stopDistance * pointValue * contractMultiplier;
    rewardPerContractUsd = takeProfitDistance * pointValue * contractMultiplier;
  } else if (tickSize != null && tickValue != null) {
    riskPerContractUsd = (stopDistance / tickSize) * tickValue * contractMultiplier;
    rewardPerContractUsd = (takeProfitDistance / tickSize) * tickValue * contractMultiplier;
  }

  if (riskPerContractUsd == null || rewardPerContractUsd == null || !(riskPerContractUsd > 0)) {
    errors.push("Risiko pro Kontrakt nicht berechenbar");
    return {
      valid: false,
      errors,
      stopDistance,
      takeProfitDistance,
      stopTicks,
      takeProfitTicks,
      riskPerContractUsd: riskPerContractUsd ?? null,
      rewardPerContractUsd: rewardPerContractUsd ?? null,
      rr: null,
      positionSize: null,
      totalRiskUsd: null,
      potentialProfitUsd: null,
      estimatedFeesUsd: null,
      estimatedSlippageUsd: null,
    };
  }

  const rawSize = riskBudgetUsd / riskPerContractUsd;
  const normalizedRaw = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 0;
  let positionSize = Math.floor(normalizedRaw / orderStep) * orderStep;
  if (positionSize < minOrderSize) positionSize = 0;
  if (maxOrderSize != null && positionSize > maxOrderSize) {
    positionSize = Math.floor(maxOrderSize / orderStep) * orderStep;
  }
  if (!(positionSize > 0)) errors.push("Positionsgroesse ergibt 0");

  const totalRiskUsd = positionSize * riskPerContractUsd;
  const potentialProfitUsd = positionSize * rewardPerContractUsd;
  const estimatedFeesUsd = positionSize * feePerContract;
  const estimatedSlippageUsd = positionSize * slippagePerContract;
  const rr = riskPerContractUsd > 0 ? rewardPerContractUsd / riskPerContractUsd : null;

  return {
    valid: errors.length === 0,
    errors,
    stopDistance,
    takeProfitDistance,
    stopTicks,
    takeProfitTicks,
    riskPerContractUsd,
    rewardPerContractUsd,
    rr,
    positionSize,
    totalRiskUsd,
    potentialProfitUsd,
    estimatedFeesUsd,
    estimatedSlippageUsd,
  };
}

export function evaluateExecutionBlockers(params: {
  trade: TradeExecutionTicket | null;
  risk: ExecutionRiskOutput;
  blockers: ExecutionBlockerSettings;
  brokerSpec: ExecutionBrokerSpec;
  parityStatus: ExecutionParityStatus;
  isMarketOpen: boolean;
  accountSettings: ExecutionAccountSettings;
  nowIso?: string;
}): ExecutionBlockerStatus[] {
  const nowMs = new Date(params.nowIso ?? new Date().toISOString()).getTime();
  const out: ExecutionBlockerStatus[] = [];
  const add = (key: string, label: string, status: "ok" | "warn" | "block", reason: string) => {
    out.push({ key, label, status, reason });
  };
  const trade = params.trade;

  add(
    "paper_enabled",
    "Paper Execution enabled",
    params.blockers.paperExecutionEnabled ? "ok" : "block",
    params.blockers.paperExecutionEnabled ? "aktiv" : "deaktiviert",
  );
  add(
    "manual_enabled",
    "Manual Ticket enabled",
    params.blockers.manualTicketEnabled ? "ok" : "block",
    params.blockers.manualTicketEnabled ? "aktiv" : "deaktiviert",
  );
  add(
    "live_enabled",
    "Live Execution enabled",
    params.blockers.liveExecutionEnabled ? "warn" : "block",
    params.blockers.liveExecutionEnabled ? "aktivierbar nach Broker-Adapter" : "standardmaessig deaktiviert",
  );

  if (!trade) {
    add("trade_selected", "Signal/Trade Auswahl", "block", "kein Trade ausgewaehlt");
  } else {
    add("trade_selected", "Signal/Trade Auswahl", "ok", trade.tradeId);
  }

  const hasEntry = trade?.entryPrice != null && Number.isFinite(Number(trade.entryPrice));
  add("entry_present", "Entry vorhanden", hasEntry ? "ok" : "block", hasEntry ? "ok" : "Entry fehlt");

  const hasSl = trade?.stopLossPrice != null && Number.isFinite(Number(trade.stopLossPrice));
  const slStatus = params.blockers.requireStopLoss ? (hasSl ? "ok" : "block") : (hasSl ? "ok" : "warn");
  add("sl_present", "Stop Loss vorhanden", slStatus, hasSl ? "ok" : "Stop Loss fehlt");

  const hasTp = trade?.takeProfitPrice != null && Number.isFinite(Number(trade.takeProfitPrice));
  const tpStatus = params.blockers.requireTakeProfit ? (hasTp ? "ok" : "block") : (hasTp ? "ok" : "warn");
  add("tp_present", "Take Profit vorhanden", tpStatus, hasTp ? "ok" : "Take Profit fehlt");

  if (params.blockers.requireFreshCandle) {
    const entryMs = trade?.entryTime ? new Date(trade.entryTime).getTime() : Number.NaN;
    const ageMinutes = Number.isFinite(entryMs) ? Math.max(0, (nowMs - entryMs) / 60000) : Number.POSITIVE_INFINITY;
    const isFresh = Number.isFinite(ageMinutes) && ageMinutes <= params.blockers.maxStaleMinutes;
    add(
      "fresh_candle",
      "Fresh candle",
      isFresh ? "ok" : "block",
      isFresh ? `Alter ${ageMinutes.toFixed(1)}m` : `zu alt (${Number.isFinite(ageMinutes) ? ageMinutes.toFixed(1) : "n/a"}m)`,
    );
  } else {
    add("fresh_candle", "Fresh candle", "warn", "deaktiviert");
  }

  const parityPass = params.parityStatus === "pass";
  const parityWarn = params.parityStatus === "warn";
  if (params.blockers.parityPolicy === "pass_only") {
    add("parity_status", "Parity Status", parityPass ? "ok" : "block", params.parityStatus);
  } else {
    add("parity_status", "Parity Status", parityPass || parityWarn ? "ok" : "block", params.parityStatus);
  }

  if (params.blockers.allowTradingOutsideMarketHours) {
    add("market_hours", "Market hours", "warn", "outside hours erlaubt");
  } else {
    add("market_hours", "Market hours", params.isMarketOpen ? "ok" : "block", params.isMarketOpen ? "offen" : "geschlossen");
  }

  const riskValid = params.risk.valid && params.risk.positionSize != null && params.risk.positionSize > 0;
  add("risk_valid", "Risk berechenbar", riskValid ? "ok" : "block", riskValid ? "ok" : (params.risk.errors[0] ?? "ungueltig"));

  if (params.risk.totalRiskUsd != null && Number.isFinite(params.risk.totalRiskUsd)) {
    add(
      "max_risk_usd",
      "Max Risk USD",
      params.risk.totalRiskUsd <= params.blockers.maxRiskPerTradeUsd ? "ok" : "block",
      `${params.risk.totalRiskUsd.toFixed(2)} / ${params.blockers.maxRiskPerTradeUsd.toFixed(2)} USD`,
    );
  } else {
    add("max_risk_usd", "Max Risk USD", "block", "nicht berechenbar");
  }

  const accountEquityUsd = Math.max(0, Number(params.accountSettings.accountEquityUsd || 0));
  const tradeRiskUsd = Math.max(0, Number(params.risk.totalRiskUsd || 0));
  if (accountEquityUsd > 0 && tradeRiskUsd > 0 && params.blockers.maxRiskPerTradePercent > 0) {
    const tradeRiskPercent = (tradeRiskUsd / accountEquityUsd) * 100;
    add(
      "max_risk_pct",
      "Max Risk %",
      tradeRiskPercent <= params.blockers.maxRiskPerTradePercent ? "ok" : "block",
      `${tradeRiskPercent.toFixed(2)}% / ${params.blockers.maxRiskPerTradePercent.toFixed(2)}%`,
    );
  } else {
    add("max_risk_pct", "Max Risk %", "warn", "Account Equity in Settings pruefen");
  }

  if (params.risk.positionSize != null && Number.isFinite(params.risk.positionSize)) {
    add(
      "max_contracts",
      "Max Contracts/Lots",
      params.risk.positionSize <= params.blockers.maxContracts ? "ok" : "block",
      `${params.risk.positionSize} / ${params.blockers.maxContracts}`,
    );
  } else {
    add("max_contracts", "Max Contracts/Lots", "block", "Positionsgroesse fehlt");
  }

  const hasOrderStep = Number(params.brokerSpec.orderStep) > 0;
  const hasMinOrder = Number(params.brokerSpec.minOrderSize) > 0;
  const hasTickModel = Number(params.brokerSpec.pointValue) > 0 || (Number(params.brokerSpec.tickSize) > 0 && Number(params.brokerSpec.tickValue) > 0);
  add("broker_spec", "Broker Specs vollstaendig", hasOrderStep && hasMinOrder && hasTickModel ? "ok" : "block", hasOrderStep && hasMinOrder && hasTickModel ? "ok" : "tick/point/orderSpec fehlt");

  add(
    "manual_confirmation",
    "Manual Confirmation",
    params.blockers.requireManualConfirmation ? "warn" : "ok",
    params.blockers.requireManualConfirmation ? "Pflicht bestaetigung aktiv" : "optional",
  );
  add(
    "second_live_confirmation",
    "Second Confirmation Live",
    params.blockers.requireSecondConfirmationForLive ? "warn" : "ok",
    params.blockers.requireSecondConfirmationForLive ? "aktiv" : "optional",
  );

  return out;
}
