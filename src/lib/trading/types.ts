export type TradeDirection = "long" | "short";
export type OrderType = "market" | "limit" | "stop";
export type TradeMode = "signal" | "manual";
export type ExecutionMode = "paper" | "manual_ticket" | "broker_sandbox" | "live_broker";
export type ExecutionParityPolicy = "pass_only" | "pass_or_warn";
export type ExecutionParityStatus = "pass" | "warn" | "fail" | "unknown";

export type ManualTradeLevels = {
  direction: TradeDirection;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
};

export type SymbolSpec = {
  symbol: string;
  source: string;
  pointValue: number | null;
  minLot: number | null;
  lotStep: number | null;
  maxLot: number | null;
  contractMultiplier: number | null;
  specIncomplete?: boolean;
};

export type ExecutionBrokerSpec = {
  broker: string;
  routeSymbol: string;
  tickSize: number | null;
  tickValue: number | null;
  pointValue: number | null;
  contractMultiplier: number | null;
  minOrderSize: number | null;
  orderStep: number | null;
  maxOrderSize: number | null;
  currency: string;
  marginEstimate?: number | null;
  commissionEstimate?: number | null;
  slippageEstimate?: number | null;
};

export type ExecutionBlockerSettings = {
  liveExecutionEnabled: boolean;
  paperExecutionEnabled: boolean;
  manualTicketEnabled: boolean;
  maxRiskPerTradeUsd: number;
  maxRiskPerTradePercent: number;
  maxContracts: number;
  requireStopLoss: boolean;
  requireTakeProfit: boolean;
  requireFreshCandle: boolean;
  maxStaleMinutes: number;
  parityPolicy: ExecutionParityPolicy;
  allowTradingOutsideMarketHours: boolean;
  requireManualConfirmation: boolean;
  requireSecondConfirmationForLive: boolean;
};

export type ExecutionAccountSettings = {
  accountEquityUsd: number;
  riskBudgetUsd: number;
};

export type TradeExecutionTicket = {
  tradeId: string;
  strategyId: string | null;
  asset: string;
  symbol: string;
  timeframe: string | null;
  direction: TradeDirection;
  entryTime: string | null;
  entryPrice: number | null;
  exitTime: string | null;
  exitPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  source: string;
  isOpen: boolean;
};

export type ExecutionRiskOutput = {
  valid: boolean;
  errors: string[];
  stopDistance: number | null;
  takeProfitDistance: number | null;
  stopTicks: number | null;
  takeProfitTicks: number | null;
  riskPerContractUsd: number | null;
  rewardPerContractUsd: number | null;
  rr: number | null;
  positionSize: number | null;
  totalRiskUsd: number | null;
  potentialProfitUsd: number | null;
  estimatedFeesUsd: number | null;
  estimatedSlippageUsd: number | null;
};

export type ExecutionBlockerStatus = {
  key: string;
  label: string;
  status: "ok" | "warn" | "block";
  reason: string;
};

export type TradingAccount = {
  id: string;
  name: string;
  enabled: boolean;
  mode: "paper" | "live";
  equity: number;
  riskPercent: number;
  maxDailyLoss: number;
  maxOpenTrades: number;
};

export type RiskEngineInput = {
  direction: TradeDirection;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  accountEquity: number;
  riskPercent: number;
  pointValue: number;
  minLot: number;
  lotStep: number;
  maxLot: number;
  contractMultiplier: number;
  symbol: string;
};

export type RiskEngineOutput = {
  riskAmount: number;
  riskPercent: number;
  stopDistance: number;
  takeProfitDistance: number;
  rewardRiskRatio: number;
  rawLots: number;
  roundedLots: number;
  maxLoss: number;
  valid: boolean;
  errors: string[];
};

export type OrderPreviewRow = {
  accountId: string;
  symbol: string;
  direction: TradeDirection;
  orderType: OrderType;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  lots: number;
  estimatedRisk: number;
  estimatedReward: number;
};

export type OrderPreviewOutput = {
  valid: boolean;
  orders: OrderPreviewRow[];
  errors: string[];
};

export type PaperOrder = {
  id: string;
  createdAt: string;
  mode: "paper";
  accountId: string;
  symbol: string;
  direction: TradeDirection;
  orderType: OrderType;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  lots: number;
  status: "planned" | "open" | "cancelled" | "closed";
  source: "manual" | "signal";
};
