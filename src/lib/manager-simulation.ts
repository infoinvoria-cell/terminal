import type { InstrumentType, ParsedReportTrade } from "@/lib/mt-report-parser";

const BASE_CAPITAL = 1_000;
const SCALING_FACTOR = 5;
const MANAGER_FEE_RATE = 0.25;
const INVESTOR_PROFIT_SHARE_RATE = 0.75;
const SIMULATION_MIN_START = new Date(2024, 0, 1, 0, 0, 0, 0).getTime();

const MULTIPLIER_OPTIONS = [1, 1.5, 2] as const;

const SUB_IB_SEEDS = [
  { id: "sub-max", name: "Max", splitPct: 50 },
  { id: "sub-nova", name: "Nova", splitPct: 40 },
  { id: "sub-vertex", name: "Vertex", splitPct: 45 },
] as const;

const INVESTOR_SEEDS = [
  {
    id: "investor-a",
    name: "Investor A",
    accountId: "ACC-A1001",
    capital: 10_000,
    multiplier: 1.0,
    subIbId: "sub-max",
  },
  {
    id: "investor-b",
    name: "Investor B",
    accountId: "ACC-B1002",
    capital: 20_000,
    multiplier: 1.5,
    subIbId: "sub-max",
  },
  {
    id: "investor-c",
    name: "Investor C",
    accountId: "ACC-C1003",
    capital: 20_000,
    multiplier: 2.0,
    subIbId: "sub-max",
  },
  {
    id: "investor-d",
    name: "Investor D",
    accountId: "ACC-D1004",
    capital: 15_000,
    multiplier: 1.0,
    subIbId: "sub-max",
  },
  {
    id: "investor-e",
    name: "Investor E",
    accountId: "ACC-E1005",
    capital: 50_000,
    multiplier: 1.5,
    subIbId: "sub-max",
  },
  {
    id: "investor-f",
    name: "Investor F",
    accountId: "ACC-F1006",
    capital: 30_000,
    multiplier: 1.5,
    subIbId: "sub-max",
  },
  {
    id: "investor-g",
    name: "Investor G",
    accountId: "ACC-G1007",
    capital: 25_000,
    multiplier: 1.0,
    subIbId: "sub-max",
  },
  {
    id: "investor-h",
    name: "Investor H",
    accountId: "ACC-H1008",
    capital: 40_000,
    multiplier: 1.5,
    subIbId: "sub-max",
  },
  {
    id: "investor-i",
    name: "Investor I",
    accountId: "ACC-I1009",
    capital: 35_000,
    multiplier: 2.0,
    subIbId: "sub-nova",
  },
  {
    id: "investor-j",
    name: "Investor J",
    accountId: "ACC-J1010",
    capital: 45_000,
    multiplier: 1.0,
    subIbId: "sub-nova",
  },
  {
    id: "investor-k",
    name: "Investor K",
    accountId: "ACC-K1011",
    capital: 50_000,
    multiplier: 1.5,
    subIbId: "sub-nova",
  },
  {
    id: "investor-l",
    name: "Investor L",
    accountId: "ACC-L1012",
    capital: 28_000,
    multiplier: 2.0,
    subIbId: "sub-nova",
  },
  {
    id: "investor-m",
    name: "Investor M",
    accountId: "ACC-M1013",
    capital: 32_000,
    multiplier: 1.0,
    subIbId: "sub-nova",
  },
  {
    id: "investor-n",
    name: "Investor N",
    accountId: "ACC-N1014",
    capital: 38_000,
    multiplier: 1.5,
    subIbId: "sub-nova",
  },
  {
    id: "investor-o",
    name: "Investor O",
    accountId: "ACC-O1015",
    capital: 42_000,
    multiplier: 2.0,
    subIbId: "sub-vertex",
  },
  {
    id: "investor-p",
    name: "Investor P",
    accountId: "ACC-P1016",
    capital: 55_000,
    multiplier: 1.0,
    subIbId: "sub-vertex",
  },
  {
    id: "investor-q",
    name: "Investor Q",
    accountId: "ACC-Q1017",
    capital: 60_000,
    multiplier: 1.5,
    subIbId: "sub-vertex",
  },
  {
    id: "investor-r",
    name: "Investor R",
    accountId: "ACC-R1018",
    capital: 26_000,
    multiplier: 2.0,
    subIbId: "sub-vertex",
  },
  {
    id: "investor-s",
    name: "Investor S",
    accountId: "ACC-S1019",
    capital: 33_000,
    multiplier: 1.0,
    subIbId: "sub-vertex",
  },
  {
    id: "investor-t",
    name: "Investor T",
    accountId: "ACC-T1020",
    capital: 47_000,
    multiplier: 1.5,
    subIbId: "sub-vertex",
  },
] as const;

export type NewInvestorInput = {
  name: string;
  accountId: string;
  capital: number;
  multiplier: number;
};

export type SimInvestor = {
  id: string;
  name: string;
  accountId: string;
  capital: number;
  multiplier: number;
  subIbId: string;
};

export type SimSubIb = {
  id: string;
  name: string;
  splitPct: number;
};

export type SimBaseTrade = {
  id: string;
  ticket: string;
  closeTimeMs: number;
  monthKey: string;
  lotSize: number;
  symbol: string;
  instrument: InstrumentType;
  profit: number;
  commissionPerTrade: number;
};

export type SimInvestorTradeResult = {
  investorId: string;
  monthKey: string;
  startingBalance: number;
  previousHigh: number;
  monthlyHigh: number;
  profitAboveHigh: number;
  grossProfit: number;
  managerFee: number;
  investorProfit: number;
  endingBalance: number;
  appliedReturnPct: number;
};

export type SimTradeMonth = {
  id: string;
  key: string;
  dateMs: number;
  baseReturnPct: number;
  investorResults: SimInvestorTradeResult[];
  totalGrossProfit: number;
  totalManagerFee: number;
  totalInvestorProfit: number;
  aggregatedEquity: number;
};

export type SimCommission = {
  id: string;
  monthKey: string;
  dateMs: number;
  investorId: string;
  subIbId: string;
  forexLots: number;
  indicesLots: number;
  totalLots: number;
  forexCommission: number;
  indicesCommission: number;
  commissionTotal: number;
  managerShare: number;
  subIbShare: number;
};

export type SimulationState = {
  baseTrades: SimBaseTrade[];
  investors: SimInvestor[];
  subIBs: SimSubIb[];
  trades: SimTradeMonth[];
  commissions: SimCommission[];
};

export type OverviewMetrics = {
  managerName: string;
  totalAum: number;
  riskAdjustedAum: number;
  totalProfitGross: number;
  investorProfitSplit: number;
  managerProfitSplit: number;
  totalCommissionGenerated: number;
  managerCommissionShare: number;
  subIbCommissionShare: number;
  ibRevenue: number;
  combinedRevenue: number;
  managerOwnRevenue: number;
};

export type InvestorMetric = {
  investorId: string;
  name: string;
  accountId: string;
  subIbId: string;
  subIbName: string;
  capital: number;
  multiplier: number;
  currentEquity: number;
  grossProfit: number;
  profitSplitPaid: number;
  netProfit: number;
  totalCommissionGenerated: number;
  commissionToManager: number;
  commissionToSubIb: number;
  totalLots: number;
};

export type SubIbMetric = {
  subIbId: string;
  name: string;
  splitPct: number;
  investorsCount: number;
  totalAum: number;
  generatedCommission: number;
  theirShare: number;
  managerShare: number;
  profitSplitContribution: number;
};

export type RevenueSeriesPoint = {
  key: string;
  label: string;
  dateMs: number;
  profitSplitRevenue: number;
  ibCommissionGenerated: number;
  managerIbShare: number;
  subIbShare: number;
  totalRevenueGenerated: number;
};

export type EquitySeriesPoint = {
  key: string;
  label: string;
  dateMs: number;
  aggregatedEquity: number;
};

export type CommissionGrowthPoint = {
  key: string;
  label: string;
  dateMs: number;
  generated: number;
  managerShare: number;
  subIbShare: number;
  cumulativeGenerated: number;
};

export type CommissionAssetPoint = {
  name: "Forex" | "Indices";
  generated: number;
};

export type MultiplierImpactPoint = {
  name: string;
  multiplier: number;
  effectiveReturnPct: number;
  netProfit: number;
};

export type MonthlyStat = {
  key: string;
  label: string;
  dateMs: number;
  totalProfit: number;
  investorProfit: number;
  managerProfit: number;
  totalCommissions: number;
  managerCommissions: number;
  subIbCommissions: number;
};

export type SimulationOutput = {
  investors: {
    name: string;
    capital: number;
    multiplier: number;
    totalProfit: number;
    totalFeesPaid: number;
    equity: number;
  }[];
  manager: {
    profitFromSplit: number;
    ibRevenue: number;
    totalRevenue: number;
  };
  subIB: {
    name: "Max";
    revenue: number;
  };
  monthlyStats: MonthlyStat[];
  chartsData: {
    equityCurve: { key: string; label: string; equity: number }[];
    monthlyRevenue: RevenueSeriesPoint[];
    commissionBreakdown: {
      byAssetType: CommissionAssetPoint[];
      manager: number;
      subIb: number;
      total: number;
    };
  };
};

export type SimulationMetrics = {
  overview: OverviewMetrics;
  investorMetrics: InvestorMetric[];
  subIbMetrics: SubIbMetric[];
  monthlyRevenueSeries: RevenueSeriesPoint[];
  equityCurveSeries: EquitySeriesPoint[];
  commissionGrowthSeries: CommissionGrowthPoint[];
  commissionByAssetType: CommissionAssetPoint[];
  profitDistributionSeries: { name: string; netProfit: number }[];
  multiplierImpactSeries: MultiplierImpactPoint[];
  monthlyStats: MonthlyStat[];
  simulationOutput: SimulationOutput;
};

export function createInitialSimulationState(
  reportTrades: ParsedReportTrade[],
  now = new Date()
): SimulationState {
  const baseTrades = reportTradesToBaseTrades(reportTrades).filter(
    (trade) => trade.closeTimeMs >= SIMULATION_MIN_START
  );
  const subIBs: SimSubIb[] = SUB_IB_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    splitPct: seed.splitPct,
  }));
  const investors: SimInvestor[] = INVESTOR_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    accountId: seed.accountId,
    capital: seed.capital,
    multiplier: seed.multiplier,
    subIbId: seed.subIbId,
  }));

  const computed = recomputeSimulation(baseTrades, investors, subIBs, now);
  return {
    baseTrades,
    investors,
    subIBs,
    trades: computed.trades,
    commissions: computed.commissions,
  };
}

export function createInvestorFromInput(
  input: NewInvestorInput,
  subIbId: string
): SimInvestor | null {
  const cleanName = input.name.trim();
  const cleanAccountId = input.accountId.trim().toUpperCase();
  const capital = Number(input.capital);
  if (!cleanName || !cleanAccountId || !Number.isFinite(capital) || capital <= 0) {
    return null;
  }

  return {
    id: `investor-${toSlug(cleanAccountId)}-${hashString(
      `${cleanAccountId}-${capital}-${Date.now()}`
    ).toString(36)}`,
    name: cleanName,
    accountId: cleanAccountId,
    capital: round2(capital),
    multiplier: normalizeMultiplier(input.multiplier),
    subIbId,
  };
}

export function recomputeSimulation(
  baseTrades: SimBaseTrade[],
  investors: SimInvestor[],
  subIBs: SimSubIb[],
  now = new Date()
): Pick<SimulationState, "trades" | "commissions"> {
  const commissions: SimCommission[] = [];
  const monthProfitByInvestor = new Map<string, Map<string, number>>();
  const monthBaseProfit = new Map<string, number>();

  const monthKeys = enumerateMonthKeys(baseTrades, now);
  const monthDateByKey = new Map(
    monthKeys.map((key) => [key, monthKeyToDateMs(key)] as const)
  );

  for (const trade of baseTrades) {
    if (!monthDateByKey.has(trade.monthKey)) continue;
    monthBaseProfit.set(
      trade.monthKey,
      round2((monthBaseProfit.get(trade.monthKey) ?? 0) + trade.profit)
    );

    for (const investor of investors) {
      const scaleFactor =
        (investor.capital / BASE_CAPITAL) * investor.multiplier * SCALING_FACTOR;
      const scaledProfit = round2(trade.profit * scaleFactor);
      const monthlyInvestorMap =
        monthProfitByInvestor.get(trade.monthKey) ?? new Map<string, number>();
      monthlyInvestorMap.set(
        investor.id,
        round2((monthlyInvestorMap.get(investor.id) ?? 0) + scaledProfit)
      );
      monthProfitByInvestor.set(trade.monthKey, monthlyInvestorMap);

      const scaledLots = round4(trade.lotSize * scaleFactor);
      const scaledCommission = round2(trade.commissionPerTrade * scaleFactor);
      const subIb = findSubIb(subIBs, investor.subIbId);
      const subIbShareRate = clamp(subIb.splitPct / 100, 0, 1);
      const managerShare = round2(scaledCommission * (1 - subIbShareRate));
      const subIbShare = round2(scaledCommission - managerShare);

      commissions.push({
        id: `${trade.id}-${investor.id}`,
        monthKey: trade.monthKey,
        dateMs: trade.closeTimeMs,
        investorId: investor.id,
        subIbId: subIb.id,
        forexLots: trade.instrument === "forex" ? scaledLots : 0,
        indicesLots: trade.instrument === "indices" ? scaledLots : 0,
        totalLots: scaledLots,
        forexCommission: trade.instrument === "forex" ? scaledCommission : 0,
        indicesCommission: trade.instrument === "indices" ? scaledCommission : 0,
        commissionTotal: scaledCommission,
        managerShare,
        subIbShare,
      });
    }
  }

  const equityByInvestor = new Map(investors.map((investor) => [investor.id, investor.capital]));
  const trades: SimTradeMonth[] = [];

  for (const monthKey of monthKeys) {
    const dateMs = monthDateByKey.get(monthKey) ?? Date.now();
    const monthlyInvestorMap = monthProfitByInvestor.get(monthKey) ?? new Map();
    const investorResults: SimInvestorTradeResult[] = [];
    let totalGrossProfit = 0;
    let totalManagerFee = 0;
    let totalInvestorProfit = 0;
    let aggregatedEquity = 0;

    for (const investor of investors) {
      const startingBalance = round2(
        equityByInvestor.get(investor.id) ?? investor.capital
      );
      const previousHigh = startingBalance;
      const grossProfit = round2(monthlyInvestorMap.get(investor.id) ?? 0);
      const grossEndEquity = round2(startingBalance + grossProfit);
      const profitAboveHigh = round2(Math.max(0, grossEndEquity - previousHigh));
      const managerFee = round2(profitAboveHigh * MANAGER_FEE_RATE);
      const investorProfit = round2(grossProfit - managerFee);
      const endingBalance = round2(startingBalance + investorProfit);
      const monthlyHigh = round2(Math.max(previousHigh, endingBalance));
      const appliedReturnPct =
        startingBalance > 0 ? round4((grossProfit / startingBalance) * 100) : 0;

      equityByInvestor.set(investor.id, endingBalance);
      totalGrossProfit = round2(totalGrossProfit + grossProfit);
      totalManagerFee = round2(totalManagerFee + managerFee);
      totalInvestorProfit = round2(totalInvestorProfit + investorProfit);
      aggregatedEquity = round2(aggregatedEquity + endingBalance);

      investorResults.push({
        investorId: investor.id,
        monthKey,
        startingBalance,
        previousHigh,
        monthlyHigh,
        profitAboveHigh,
        grossProfit,
        managerFee,
        investorProfit,
        endingBalance,
        appliedReturnPct,
      });
    }

    const baseProfit = monthBaseProfit.get(monthKey) ?? 0;
    const baseReturnPct =
      BASE_CAPITAL > 0 ? round4((baseProfit / BASE_CAPITAL) * 100) : 0;

    trades.push({
      id: monthKey,
      key: monthKey,
      dateMs,
      baseReturnPct,
      investorResults,
      totalGrossProfit,
      totalManagerFee,
      totalInvestorProfit,
      aggregatedEquity,
    });
  }

  return { trades, commissions };
}

export function deriveSimulationMetrics(
  investors: SimInvestor[],
  subIBs: SimSubIb[],
  trades: SimTradeMonth[],
  commissions: SimCommission[]
): SimulationMetrics {
  const investorCore = new Map(
    investors.map((investor) => [
      investor.id,
      {
        investorId: investor.id,
        name: investor.name,
        accountId: investor.accountId,
        subIbId: investor.subIbId,
        subIbName: findSubIb(subIBs, investor.subIbId).name,
        capital: investor.capital,
        multiplier: investor.multiplier,
        currentEquity: investor.capital,
        grossProfit: 0,
        profitSplitPaid: 0,
        netProfit: 0,
        totalCommissionGenerated: 0,
        commissionToManager: 0,
        commissionToSubIb: 0,
        totalLots: 0,
      },
    ])
  );

  for (const month of trades) {
    for (const result of month.investorResults) {
      const current = investorCore.get(result.investorId);
      if (!current) continue;
      current.currentEquity = result.endingBalance;
      current.grossProfit = round2(current.grossProfit + result.grossProfit);
      current.profitSplitPaid = round2(current.profitSplitPaid + result.managerFee);
      current.netProfit = round2(current.netProfit + result.investorProfit);
    }
  }

  for (const commission of commissions) {
    const current = investorCore.get(commission.investorId);
    if (!current) continue;
    current.totalLots = round4(current.totalLots + commission.totalLots);
    current.totalCommissionGenerated = round2(
      current.totalCommissionGenerated + commission.commissionTotal
    );
    current.commissionToManager = round2(
      current.commissionToManager + commission.managerShare
    );
    current.commissionToSubIb = round2(
      current.commissionToSubIb + commission.subIbShare
    );
  }

  const investorMetrics: InvestorMetric[] = investors.map((investor) => {
    const current = investorCore.get(investor.id)!;
    return {
      ...current,
      currentEquity: round2(current.currentEquity),
    };
  });

  const subIbCommissions = new Map<
    string,
    { generated: number; subShare: number; managerShare: number }
  >();
  for (const commission of commissions) {
    const current = subIbCommissions.get(commission.subIbId) ?? {
      generated: 0,
      subShare: 0,
      managerShare: 0,
    };
    subIbCommissions.set(commission.subIbId, {
      generated: round2(current.generated + commission.commissionTotal),
      subShare: round2(current.subShare + commission.subIbShare),
      managerShare: round2(current.managerShare + commission.managerShare),
    });
  }

  const subIbProfitContribution = new Map<string, number>();
  for (const month of trades) {
    for (const result of month.investorResults) {
      const investor = investors.find((item) => item.id === result.investorId);
      if (!investor) continue;
      subIbProfitContribution.set(
        investor.subIbId,
        round2(
          (subIbProfitContribution.get(investor.subIbId) ?? 0) + result.managerFee
        )
      );
    }
  }

  const subIbMetrics: SubIbMetric[] = subIBs.map((subIb) => {
    const assignedInvestors = investorMetrics.filter(
      (investor) => investor.subIbId === subIb.id
    );
    const commission = subIbCommissions.get(subIb.id) ?? {
      generated: 0,
      subShare: 0,
      managerShare: 0,
    };
    return {
      subIbId: subIb.id,
      name: subIb.name,
      splitPct: subIb.splitPct,
      investorsCount: assignedInvestors.length,
      totalAum: round2(
        assignedInvestors.reduce((sum, investor) => sum + investor.capital, 0)
      ),
      generatedCommission: commission.generated,
      theirShare: commission.subShare,
      managerShare: commission.managerShare,
      profitSplitContribution: subIbProfitContribution.get(subIb.id) ?? 0,
    };
  });

  const revenueMap = new Map<string, RevenueSeriesPoint>();
  for (const month of trades) {
    revenueMap.set(month.key, {
      key: month.key,
      label: monthLabel(month.dateMs),
      dateMs: month.dateMs,
      profitSplitRevenue: month.totalManagerFee,
      ibCommissionGenerated: 0,
      managerIbShare: 0,
      subIbShare: 0,
      totalRevenueGenerated: month.totalManagerFee,
    });
  }

  for (const commission of commissions) {
    const existing = revenueMap.get(commission.monthKey);
    if (!existing) continue;
    existing.ibCommissionGenerated = round2(
      existing.ibCommissionGenerated + commission.commissionTotal
    );
    existing.managerIbShare = round2(existing.managerIbShare + commission.managerShare);
    existing.subIbShare = round2(existing.subIbShare + commission.subIbShare);
    existing.totalRevenueGenerated = round2(
      existing.profitSplitRevenue + existing.ibCommissionGenerated
    );
  }

  const monthlyRevenueSeries = [...revenueMap.values()].sort(
    (a, b) => a.dateMs - b.dateMs
  );
  const equityCurveSeries: EquitySeriesPoint[] = trades.map((month) => ({
    key: month.key,
    label: monthLabel(month.dateMs),
    dateMs: month.dateMs,
    aggregatedEquity: month.aggregatedEquity,
  }));

  let cumulativeCommission = 0;
  const commissionGrowthSeries: CommissionGrowthPoint[] = monthlyRevenueSeries.map(
    (month) => {
      cumulativeCommission = round2(cumulativeCommission + month.ibCommissionGenerated);
      return {
        key: month.key,
        label: month.label,
        dateMs: month.dateMs,
        generated: month.ibCommissionGenerated,
        managerShare: month.managerIbShare,
        subIbShare: month.subIbShare,
        cumulativeGenerated: cumulativeCommission,
      };
    }
  );

  const totalAum = round2(
    investorMetrics.reduce((sum, investor) => sum + investor.capital, 0)
  );
  const riskAdjustedAum = round2(
    investorMetrics.reduce(
      (sum, investor) => sum + investor.capital * investor.multiplier,
      0
    )
  );
  const totalProfitGross = round2(
    trades.reduce((sum, month) => sum + month.totalGrossProfit, 0)
  );
  const managerProfitSplit = round2(
    trades.reduce((sum, month) => sum + month.totalManagerFee, 0)
  );
  const investorProfitSplit = round2(
    trades.reduce((sum, month) => sum + month.totalInvestorProfit, 0)
  );
  const totalCommissionGenerated = round2(
    commissions.reduce((sum, commission) => sum + commission.commissionTotal, 0)
  );
  const managerCommissionShare = round2(
    commissions.reduce((sum, commission) => sum + commission.managerShare, 0)
  );
  const subIbCommissionShare = round2(
    commissions.reduce((sum, commission) => sum + commission.subIbShare, 0)
  );
  const managerOwnRevenue = round2(managerProfitSplit + managerCommissionShare);
  const combinedRevenue = managerOwnRevenue;

  const totalForexCommission = round2(
    commissions.reduce((sum, commission) => sum + commission.forexCommission, 0)
  );
  const totalIndicesCommission = round2(
    commissions.reduce((sum, commission) => sum + commission.indicesCommission, 0)
  );
  const commissionByAssetType: CommissionAssetPoint[] = [
    { name: "Forex", generated: totalForexCommission },
    { name: "Indices", generated: totalIndicesCommission },
  ];

  const monthlyStats: MonthlyStat[] = trades.map((month) => {
    const revenue = revenueMap.get(month.key);
    return {
      key: month.key,
      label: monthLabel(month.dateMs),
      dateMs: month.dateMs,
      totalProfit: month.totalGrossProfit,
      investorProfit: month.totalInvestorProfit,
      managerProfit: month.totalManagerFee,
      totalCommissions: revenue?.ibCommissionGenerated ?? 0,
      managerCommissions: revenue?.managerIbShare ?? 0,
      subIbCommissions: revenue?.subIbShare ?? 0,
    };
  });

  const simulationOutput: SimulationOutput = {
    investors: investorMetrics.map((investor) => ({
      name: investor.name,
      capital: investor.capital,
      multiplier: investor.multiplier,
      totalProfit: investor.netProfit,
      totalFeesPaid: investor.profitSplitPaid,
      equity: investor.currentEquity,
    })),
    manager: {
      profitFromSplit: managerProfitSplit,
      ibRevenue: managerCommissionShare,
      totalRevenue: managerOwnRevenue,
    },
    subIB: {
      name: "Max",
      revenue: subIbCommissionShare,
    },
    monthlyStats,
    chartsData: {
      equityCurve: equityCurveSeries.map((point) => ({
        key: point.key,
        label: point.label,
        equity: point.aggregatedEquity,
      })),
      monthlyRevenue: monthlyRevenueSeries,
      commissionBreakdown: {
        byAssetType: commissionByAssetType,
        manager: managerCommissionShare,
        subIb: subIbCommissionShare,
        total: totalCommissionGenerated,
      },
    },
  };

  return {
    overview: {
      managerName: "Jeroen G.",
      totalAum,
      riskAdjustedAum,
      totalProfitGross,
      investorProfitSplit,
      managerProfitSplit,
      totalCommissionGenerated,
      managerCommissionShare,
      subIbCommissionShare,
      ibRevenue: totalCommissionGenerated,
      combinedRevenue,
      managerOwnRevenue,
    },
    investorMetrics,
    subIbMetrics,
    monthlyRevenueSeries,
    equityCurveSeries,
    commissionGrowthSeries,
    commissionByAssetType,
    profitDistributionSeries: investorMetrics.map((investor) => ({
      name: investor.name,
      netProfit: investor.netProfit,
    })),
    multiplierImpactSeries: investorMetrics.map((investor) => ({
      name: investor.name,
      multiplier: investor.multiplier,
      effectiveReturnPct:
        investor.capital > 0 ? round4((investor.netProfit / investor.capital) * 100) : 0,
      netProfit: investor.netProfit,
    })),
    monthlyStats,
    simulationOutput,
  };
}

function reportTradesToBaseTrades(reportTrades: ParsedReportTrade[]): SimBaseTrade[] {
  return reportTrades
    .map((trade) => ({
      id: trade.id,
      ticket: trade.ticket,
      closeTimeMs: trade.closeTimeMs,
      monthKey: monthKeyFromMs(trade.closeTimeMs),
      lotSize: trade.lotSize,
      symbol: trade.symbol,
      instrument: trade.instrument,
      profit: trade.profit,
      commissionPerTrade: trade.commissionPerTrade,
    }))
    .sort((a, b) => a.closeTimeMs - b.closeTimeMs);
}

function enumerateMonthKeys(baseTrades: SimBaseTrade[], now: Date) {
  const nowStart = startOfMonthMs(now.getTime());
  const firstTradeMs = baseTrades[0]?.closeTimeMs ?? nowStart;
  const lastTradeMs = baseTrades[baseTrades.length - 1]?.closeTimeMs ?? nowStart;
  const startMs = Math.max(startOfMonthMs(firstTradeMs), SIMULATION_MIN_START);
  const endMs = Math.max(nowStart, startOfMonthMs(lastTradeMs));

  const out: string[] = [];
  const cursor = new Date(startMs);
  const end = new Date(endMs);
  while (cursor <= end) {
    out.push(monthKeyFromMs(cursor.getTime()));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

function startOfMonthMs(valueMs: number) {
  const date = new Date(valueMs);
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0).getTime();
}

function monthKeyFromMs(valueMs: number) {
  const date = new Date(valueMs);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthKeyToDateMs(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
}

function monthLabel(dateMs: number) {
  return new Date(dateMs).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

function normalizeMultiplier(value: number) {
  const allowed = [...MULTIPLIER_OPTIONS];
  if (allowed.includes(value as (typeof MULTIPLIER_OPTIONS)[number])) {
    return value as (typeof MULTIPLIER_OPTIONS)[number];
  }
  let closest = allowed[0]!;
  let minDistance = Math.abs(value - closest);
  for (const option of allowed) {
    const distance = Math.abs(value - option);
    if (distance < minDistance) {
      minDistance = distance;
      closest = option;
    }
  }
  return closest;
}

function findSubIb(subIBs: SimSubIb[], requestedId: string): SimSubIb {
  if (!subIBs.length) {
    return { id: "sub-max", name: "Max", splitPct: 50 };
  }
  return (
    subIBs.find((subIb) => subIb.id === requestedId) ??
    subIBs[0] ?? { id: "sub-max", name: "Max", splitPct: 50 }
  );
}

function toSlug(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "entity"
  );
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

export const __simulationConstants = {
  baseCapital: BASE_CAPITAL,
  scalingFactor: SCALING_FACTOR,
  managerFeeRate: MANAGER_FEE_RATE,
  investorProfitShareRate: INVESTOR_PROFIT_SHARE_RATE,
};
