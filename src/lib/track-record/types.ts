export type TrackRecordSourceKind =
  | "broker_raw"
  | "myfxbook"
  | "darwinex_darwin"
  | "internal_computed";

export type TrackRecordProvider = "historical" | "myfxbook" | "darwinex";

export type SyncMode = "mock" | "live";

export type SyncHealth = "ok" | "stale" | "error" | "idle";

export type VerificationBadge =
  | "Broker"
  | "Myfxbook verifiziert"
  | "Darwinex verifiziert"
  | "intern berechnet"
  | "Daten veraltet"
  | "Quellenabweichung";

export type RawSnapshotRow = {
  source: TrackRecordSourceKind;
  provider: TrackRecordProvider;
  accountOrDarwinId: string;
  fetchedAtUtc: string;
  apiVersion: string | null;
  payloadHash: string;
  payload: unknown;
};

export type AccountRow = {
  source: TrackRecordSourceKind;
  provider: TrackRecordProvider;
  providerAccountId: string;
  accountLabel: string | null;
  broker: string | null;
  brokerTimezone: string | null;
  currency: string | null;
  accountNumberMasked: string | null;
  darwinTicker: string | null;
  isDemo: boolean | null;
  firstSeenAtUtc: string;
  lastSeenAtUtc: string;
};

export type DailyEquityRow = {
  source: TrackRecordSourceKind;
  provider: TrackRecordProvider;
  providerAccountId: string;
  dateUtc: string;
  equity: number | null;
  balance: number | null;
  floatingPl: number | null;
  brokerLocalDate: string | null;
  brokerTimezone: string | null;
};

export type DailyReturnRow = {
  source: TrackRecordSourceKind;
  provider: TrackRecordProvider;
  providerAccountId: string;
  dateUtc: string;
  returnPct: number | null;
  profit: number | null;
  brokerLocalDate: string | null;
  brokerTimezone: string | null;
};

export type MonthlyReturnRow = {
  source: TrackRecordSourceKind;
  provider: TrackRecordProvider;
  providerAccountId: string;
  monthUtc: string;
  returnPct: number;
  sourceDocument: string;
  calculationVersion: string;
};

export type OpenPositionRow = {
  source: TrackRecordSourceKind;
  provider: TrackRecordProvider;
  providerAccountId: string;
  providerPositionId: string;
  symbol: string | null;
  direction: string | null;
  openedAtUtc: string | null;
  openedAtLocal: string | null;
  brokerTimezone: string | null;
  size: number | null;
  sizeUnit: string | null;
  openPrice: number | null;
  currentPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  profit: number | null;
  pips: number | null;
  status: "open";
};

export type OpenOrderRow = {
  source: TrackRecordSourceKind;
  provider: TrackRecordProvider;
  providerAccountId: string;
  providerOrderId: string;
  symbol: string | null;
  direction: string | null;
  createdAtUtc: string | null;
  createdAtLocal: string | null;
  brokerTimezone: string | null;
  size: number | null;
  sizeUnit: string | null;
  orderPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  status: "pending";
};

export type ClosedTradeRow = {
  source: TrackRecordSourceKind;
  provider: TrackRecordProvider;
  providerAccountId: string;
  stableTradeId: string;
  providerTradeId: string | null;
  symbol: string | null;
  direction: string | null;
  openedAtUtc: string | null;
  openedAtLocal: string | null;
  closedAtUtc: string | null;
  closedAtLocal: string | null;
  brokerTimezone: string | null;
  size: number | null;
  sizeUnit: string | null;
  openPrice: number | null;
  closePrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  profit: number | null;
  commission: number | null;
  interest: number | null;
  pips: number | null;
  rawPayloadHash: string;
};

export type CashflowRow = {
  source: TrackRecordSourceKind;
  provider: TrackRecordProvider;
  providerAccountId: string;
  stableCashflowId: string;
  flowType: "deposit" | "withdrawal" | "fee" | "dividend" | "unknown";
  amount: number | null;
  currency: string | null;
  occurredAtUtc: string | null;
  occurredAtLocal: string | null;
  brokerTimezone: string | null;
  note: string | null;
};

export type TrackRecordMetricRow = {
  source: TrackRecordSourceKind;
  provider: TrackRecordProvider;
  providerAccountId: string;
  metricScope: "account" | "darwin";
  metricName: string;
  metricValue: number | string | null;
  metricDateUtc: string | null;
  asOfUtc: string;
  isVerified: boolean;
  calculationSource: string;
};

export type SourceSyncStatusRow = {
  source: TrackRecordSourceKind;
  provider: TrackRecordProvider;
  providerAccountId: string;
  lastAttemptAtUtc: string | null;
  lastSuccessAtUtc: string | null;
  staleAfterUtc: string | null;
  health: SyncHealth;
  message: string | null;
  requestsUsed: number;
  mode: SyncMode;
};

export type TrackRecordSnapshotBundle = {
  rawSnapshots: RawSnapshotRow[];
  accounts: AccountRow[];
  dailyEquity: DailyEquityRow[];
  dailyReturns: DailyReturnRow[];
  monthlyReturns: MonthlyReturnRow[];
  openPositions: OpenPositionRow[];
  openOrders: OpenOrderRow[];
  closedTrades: ClosedTradeRow[];
  cashflows: CashflowRow[];
  metrics: TrackRecordMetricRow[];
  syncStatus: SourceSyncStatusRow[];
  unavailable: string[];
};

export type TrackRecordOverview = {
  generatedAtUtc: string;
  historical: {
    monthlySource: string;
    statementSource: string;
    myfxbookVisibleSource: string;
    officialKpisSource: string;
    baselinePeriod: string;
    firstReliableDate: string | null;
    lastReliableDate: string | null;
    monthlyReturnCount: number;
    monthlyReturns: Array<{ month: string; returnPct: number }>;
    normalizedClosedTradeCount: number;
    visibleAccount2TradeCount: number;
    historicalDataQuality: "complete" | "partial" | "insufficient";
    account1: {
      statementAvailableLocally: boolean;
      broker: string | null;
      currency: string | null;
      statementGenerated: string | null;
      statementPeriodFirstClose: string | null;
      statementPeriodLastClose: string | null;
      totalClosedTrades: number;
      rawRowsTotal: number;
      balanceOperationsTotal: number;
      depositCount: number;
      withdrawalCount: number;
      otherBalanceCount: number;
      sourceFormat: string | null;
      sourceFileCount: number;
      sourceFiles: string[];
      legacyPartialTradeCount: number;
      legacyPartialOverlap: number;
      winningTrades: number;
      losingTrades: number;
      flatTrades: number;
      winRatePct: number | null;
      winRateIncludesFlatTrades: boolean;
      grossProfit: number | null;
      grossLoss: number | null;
      profitFactor: number | null;
      netTradingPnl: number | null;
      commissionTotal: number | null;
      swapTotal: number | null;
      avgHoldHours: number | null;
      medianHoldHours: number | null;
      tradesPerMonth: number | null;
      tradesPerYear: number | null;
    };
    importAudit: {
      monthly: {
        count: number;
        duplicateCount: number;
        sorted: boolean;
        finitePercentValues: boolean;
        firstMonth: string | null;
        lastMonth: string | null;
        hash: string;
      };
      partialTrades: {
        count: number;
        duplicateCount: number;
        sorted: boolean;
        invalidCount: number;
        firstCloseLocal: string | null;
        lastCloseLocal: string | null;
        symbols: string[];
        costRows: number;
        accountCount: number;
        hash: string;
        classification: string;
      };
    };
    official: {
      combinedReturnPct: number;
      compoundedReturnPct: number;
      maxDrawdownPct: number;
      annualizedReturnPct: number;
    };
  };
  capabilities: {
    supabaseConfigured: boolean;
    productiveDatabaseSchemaAvailable: boolean;
    historicalPersistenceVerified: boolean;
    myfxbookCredentialsPresent: boolean;
    darwinexCredentialsPresent: boolean;
    myfxbookAccountIdPresent: boolean;
    darwinexProductIdPresent: boolean;
    vercelDetected: boolean;
    vercelStaticIpConfigured: boolean;
  };
  live: {
    syncRows: SourceSyncStatusRow[];
    accountRows: AccountRow[];
    metrics: TrackRecordMetricRow[];
    badges: VerificationBadge[];
  };
  readiness: {
    completed: number;
    total: number;
    percent: number;
    blockers: string[];
  };
  notes: string[];
};
