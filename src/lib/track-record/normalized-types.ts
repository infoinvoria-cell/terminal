/**
 * Normalized Track Record types — shared across MT4 and MT5 normalizers.
 * Pure types/interfaces only — no classes, no runtime code.
 */

export type TradeSource = "mt4_file" | "mt5_python";
export type TradeSide = "buy" | "sell";
export type TradeStatus = "closed" | "open";
export type CashFlowType = "deposit" | "withdrawal" | "credit" | "fee" | "adjustment" | "other";

export interface NormalizedAccountSnapshot {
  accountId: string;
  platform: "MT4" | "MT5";
  broker: string;
  loginMasked: string;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  floatingProfit: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  leverage: number;
  connected: boolean;
  generatedAtUtc: string;   // ISO-8601 UTC "Z" suffix
  generatedAtEpoch: number; // unix seconds
  source: TradeSource;
  sourceFresh: boolean;     // false if older than 24h
}

export interface NormalizedTrade {
  id: string;               // "{accountId}_{sourceTicket}"
  accountId: string;
  sourceTicket: number;
  platform: "MT4" | "MT5";
  broker: string;
  symbol: string;
  side: TradeSide;
  volume: number;
  openTimeUtc: string;
  openTimeEpoch: number;
  closeTimeUtc: string;
  closeTimeEpoch: number;
  openPrice: number;
  closePrice: number;
  stopLoss: number;
  takeProfit: number;
  grossProfit: number;   // raw profit field
  commission: number;
  swap: number;
  fees: number;
  netProfit: number;     // grossProfit + commission + swap + fees
  magicNumber: number;
  comment: string;
  status: TradeStatus;
  source: TradeSource;
  sourceDealIds?: number[]; // MT5: deal tickets that make up this trade
}

export interface NormalizedCashFlow {
  id: string;
  accountId: string;
  sourceTicket: number;
  type: CashFlowType;
  timeUtc: string;
  timeEpoch: number;
  amount: number;
  currency: string;
  comment: string;
  source: TradeSource;
}

export interface NormalizedOpenPosition {
  id: string;
  accountId: string;
  sourceTicket: number;
  symbol: string;
  side: TradeSide;
  volume: number;
  openTimeUtc: string;
  openTimeEpoch: number;
  openPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  swap: number;
  floatingProfit: number;
  source: TradeSource;
}

export interface EquitySnapshot {
  accountId: string;
  timeUtc: string;
  timeEpoch: number;
  equity: number;
  balance: number;
  source: TradeSource;
}

export interface BalanceCurvePoint {
  timeEpoch: number;
  timeUtc: string;
  balance: number;
  eventType: "trade" | "deposit" | "withdrawal" | "credit" | "fee" | "adjustment" | "other";
  amount: number;
  runningBalance: number;
  accountId: string;
}

export interface PerformanceKpis {
  accountId: string;
  currency: string;
  closedTradeCount: number;
  winners: number;
  losers: number;
  winRate: number | null;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  profitFactor: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
  averageTrade: number | null;
  payoffRatio: number | null;
  currentBalance: number | null;
  currentEquity: number | null;
  currentFloatingPnl: number | null;
  totalDeposits: number;
  totalWithdrawals: number;
  balanceDrawdown: number | null;
  balanceDrawdownReason: string | null;
  equityDrawdown: number | null;
  equityDrawdownReason: string | null;
}

export interface NormalizedTrackRecord {
  schemaVersion: number;
  generatedAtUtc: string;
  generatedAtEpoch: number;
  accounts: NormalizedAccountSnapshot[];
  closedTrades: NormalizedTrade[];
  openPositions: NormalizedOpenPosition[];
  cashFlows: NormalizedCashFlow[];
  balanceCurves: Record<string, BalanceCurvePoint[]>; // keyed by accountId, plus "combined"
  equitySnapshots: EquitySnapshot[];
  kpis: Record<string, PerformanceKpis>; // keyed by accountId
  warnings: string[];
  sourceStatus: Record<string, { ok: boolean; reason?: string }>;
}
