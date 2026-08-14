import type { WhiteSwanExecutionEntry } from "@/lib/white-swan/execution-truth";

export type WhiteSwanQuoteStatus = "CURRENT" | "STALE_REFERENCE" | "DATA_PENDING";

export type WhiteSwanQuoteSnapshot = {
  instrument: string;
  price: number | null;
  asOfUtc: string | null;
  source: string | null;
  status: WhiteSwanQuoteStatus;
};

export type WhiteSwanResolvedContract = {
  rootSymbol: string;
  eligibleDeliveryMonths: number[];
  contractSelectionRule: string;
  resolvedExpiry: string | null;
  resolvedContractLabel: string | null;
  resolvedContractStatus: "RESOLVED_FROM_RULE" | "DATA_PENDING";
};

const MONTH_CODES: Record<number, string> = {
  1: "F",
  2: "G",
  3: "H",
  4: "J",
  5: "K",
  6: "M",
  7: "N",
  8: "Q",
  9: "U",
  10: "V",
  11: "X",
  12: "Z",
};

const QUOTE_SNAPSHOTS: Record<string, WhiteSwanQuoteSnapshot> = {
  SPY: {
    instrument: "SPY",
    price: 774.71,
    asOfUtc: "2026-08-12T20:00:00Z",
    source: "Yahoo Finance SPY historical close Aug 12 2026",
    status: "STALE_REFERENCE",
  },
  GLD: {
    instrument: "GLD",
    price: 404.92,
    asOfUtc: "2026-08-12T20:00:00Z",
    source: "Yahoo Finance GLD historical close Aug 12 2026",
    status: "STALE_REFERENCE",
  },
  IWM: {
    instrument: "IWM",
    price: 303.02,
    asOfUtc: "2026-08-12T20:00:00Z",
    source: "Yahoo Finance IWM historical close Aug 12 2026",
    status: "STALE_REFERENCE",
  },
  EEM: {
    instrument: "EEM",
    price: 66.46,
    asOfUtc: "2026-08-12T20:00:00Z",
    source: "Yahoo Finance EEM historical close Aug 12 2026",
    status: "STALE_REFERENCE",
  },
  MES: {
    instrument: "MES=F",
    price: 7769.5,
    asOfUtc: "2026-08-13T17:28:00Z",
    source: "Yahoo Finance MES=F intraday Aug 13 2026",
    status: "CURRENT",
  },
  M2K: {
    instrument: "RTY=F",
    price: 3058.5,
    asOfUtc: "2026-08-13T17:28:00Z",
    source: "Yahoo Finance RTY=F intraday Aug 13 2026",
    status: "CURRENT",
  },
  MME: {
    instrument: "MME Sep26",
    price: 1669.9,
    asOfUtc: "2026-08-10T18:26:00Z",
    source: "ICE MSCI Emerging Markets Index Futures pricing page",
    status: "STALE_REFERENCE",
  },
  "1OZ": {
    instrument: "1OZQ26.CMX",
    price: 4150.75,
    asOfUtc: "2026-08-13T17:28:13Z",
    source: "Yahoo Finance 1OZQ26.CMX intraday Aug 13 2026",
    status: "CURRENT",
  },
};

const ELIGIBLE_MONTHS_BY_ROOT: Record<string, number[]> = {
  M6E: [3, 6, 9, 12],
  FDXS: [3, 6, 9, 12],
  MYM: [3, 6, 9, 12],
  MES: [3, 6, 9, 12],
  M2K: [3, 6, 9, 12],
  MME: [3, 6, 9, 12],
  MZM: [1, 3, 5, 8, 9, 10, 12],
  SB: [3, 5, 7, 10],
  MHG: [3, 5, 7, 9, 12],
  "1OZ": [2, 4, 6, 8, 10, 12],
  MCL: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  MZC: [3, 5, 7, 9, 12],
  MZW: [3, 5, 7, 9, 12],
  MZS: [1, 3, 5, 7, 8, 9, 11],
  CC: [3, 5, 7, 9, 12],
};

function buildContractLabel(rootSymbol: string, year: number, month: number) {
  const yearShort = String(year).slice(-2);
  const monthCode = MONTH_CODES[month];
  return `${rootSymbol} ${monthCode}${yearShort}`;
}

function getNextEligibleMonth(rootSymbol: string, now: Date) {
  const eligibleMonths = ELIGIBLE_MONTHS_BY_ROOT[rootSymbol] ?? [];
  if (eligibleMonths.length === 0) return { eligibleMonths, year: null as number | null, month: null as number | null };
  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();
  for (const month of eligibleMonths) {
    if (month >= currentMonth) return { eligibleMonths, year: currentYear, month };
  }
  return { eligibleMonths, year: currentYear + 1, month: eligibleMonths[0] };
}

export function getWhiteSwanQuoteSnapshot(symbol: string) {
  return QUOTE_SNAPSHOTS[symbol] ?? {
    instrument: symbol,
    price: null,
    asOfUtc: null,
    source: null,
    status: "DATA_PENDING",
  };
}

export function getWhiteSwanExecutionReferenceQuote(entry: WhiteSwanExecutionEntry) {
  if (entry.ibkrSymbol === "MES") return getWhiteSwanQuoteSnapshot("MES");
  if (entry.ibkrSymbol === "M2K") return getWhiteSwanQuoteSnapshot("M2K");
  if (entry.ibkrSymbol === "MME") return getWhiteSwanQuoteSnapshot("MME");
  if (entry.ibkrSymbol === "1OZ" && entry.signalInstrument === "GLD") return getWhiteSwanQuoteSnapshot("1OZ");
  return getWhiteSwanQuoteSnapshot(entry.signalInstrument);
}

export function resolveWhiteSwanCurrentContract(entry: WhiteSwanExecutionEntry, now = new Date("2026-08-13T12:00:00Z")): WhiteSwanResolvedContract {
  const { eligibleMonths, year, month } = getNextEligibleMonth(entry.ibkrSymbol, now);
  if (year == null || month == null) {
    return {
      rootSymbol: entry.ibkrSymbol,
      eligibleDeliveryMonths: eligibleMonths,
      contractSelectionRule: entry.contractMonthRule,
      resolvedExpiry: null,
      resolvedContractLabel: null,
      resolvedContractStatus: "DATA_PENDING",
    };
  }
  return {
    rootSymbol: entry.ibkrSymbol,
    eligibleDeliveryMonths: eligibleMonths,
    contractSelectionRule: entry.contractMonthRule,
    resolvedExpiry: `${year}-${String(month).padStart(2, "0")}`,
    resolvedContractLabel: buildContractLabel(entry.ibkrSymbol, year, month),
    resolvedContractStatus: "RESOLVED_FROM_RULE",
  };
}
