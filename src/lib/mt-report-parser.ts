export type InstrumentType = "forex" | "indices";

export type ParsedReportTrade = {
  id: string;
  ticket: string;
  openTimeMs: number;
  closeTimeMs: number;
  type: "buy" | "sell";
  lotSize: number;
  symbol: string;
  instrument: InstrumentType;
  profit: number;
  sourceCommission: number;
  commissionPerTrade: number;
};

export type ParsedBalanceRow = {
  id: string;
  ticket: string;
  timeMs: number;
  type: string;
  comment: string;
  amount: number;
};

export type ParsedReportSnapshot = {
  trades: ParsedReportTrade[];
  balanceRows: ParsedBalanceRow[];
};

const FOREX_COMMISSION_PER_LOT = 8;
const INDICES_COMMISSION_PER_LOT = 0.8;

type HeaderIndexMap = {
  ticket: number;
  openTime: number;
  closeTime: number;
  type: number;
  size: number;
  item: number;
  commission: number;
  tradePl: number;
};

const BALANCE_TYPE_TOKENS = ["balance", "credit", "deposit", "withdraw"];

export function parseMtReportSnapshot(content: string): ParsedReportSnapshot {
  const rows = extractRows(content);
  if (!rows.length) return { trades: [], balanceRows: [] };

  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(cell));
    return (
      normalized.some((cell) => cell.includes("ticket")) &&
      normalized.some((cell) => cell.includes("type"))
    );
  });
  if (headerRowIndex < 0) return { trades: [], balanceRows: [] };

  const headerIndex = mapHeaders(rows[headerRowIndex] ?? []);
  if (!headerIndex) return { trades: [], balanceRows: [] };

  const trades: ParsedReportTrade[] = [];
  const balanceRows: ParsedBalanceRow[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    const typeRaw = getCell(cells, headerIndex.type).toLowerCase();
    if (!typeRaw) continue;

    if (typeRaw === "buy" || typeRaw === "sell") {
      const parsedTrade = parseTradeRow(cells, headerIndex, i, typeRaw);
      if (parsedTrade) trades.push(parsedTrade);
      continue;
    }

    if (BALANCE_TYPE_TOKENS.some((token) => typeRaw.includes(token))) {
      const parsedBalance = parseBalanceRow(cells, headerIndex, i, typeRaw);
      if (parsedBalance) balanceRows.push(parsedBalance);
    }
  }

  return {
    trades: trades.sort((a, b) => a.closeTimeMs - b.closeTimeMs),
    balanceRows: balanceRows.sort((a, b) => a.timeMs - b.timeMs),
  };
}

export function parseMtReportHtml(content: string): ParsedReportTrade[] {
  return parseMtReportSnapshot(content).trades;
}

export function classifyInstrument(symbol: string): InstrumentType {
  return symbol.trim().startsWith(".") ? "indices" : "forex";
}

function parseTradeRow(
  cells: string[],
  headerIndex: HeaderIndexMap,
  rowIndex: number,
  type: "buy" | "sell"
): ParsedReportTrade | null {
  const lotSize = parseNumber(getCell(cells, headerIndex.size));
  const closeTimeMs = parseDateMs(getCell(cells, headerIndex.closeTime));
  const openTimeMs = parseDateMs(getCell(cells, headerIndex.openTime));
  const profit = parseNumber(getCell(cells, headerIndex.tradePl));
  const sourceCommission = parseNumber(getCell(cells, headerIndex.commission));
  const symbol = getCell(cells, headerIndex.item).trim().toLowerCase();

  if (
    !Number.isFinite(lotSize) ||
    lotSize <= 0 ||
    !Number.isFinite(closeTimeMs) ||
    !Number.isFinite(openTimeMs) ||
    !Number.isFinite(profit) ||
    !symbol
  ) {
    return null;
  }

  const ticket = getCell(cells, headerIndex.ticket).trim() || `ticket-${rowIndex + 1}`;
  const instrument = classifyInstrument(symbol);
  const commissionPerTrade = round2(
    lotSize *
      (instrument === "forex" ? FOREX_COMMISSION_PER_LOT : INDICES_COMMISSION_PER_LOT)
  );

  return {
    id: `${ticket}-${closeTimeMs}`,
    ticket,
    openTimeMs,
    closeTimeMs,
    type,
    lotSize: round4(lotSize),
    symbol,
    instrument,
    profit: round2(profit),
    sourceCommission: Number.isFinite(sourceCommission) ? round2(sourceCommission) : 0,
    commissionPerTrade,
  };
}

function parseBalanceRow(
  cells: string[],
  headerIndex: HeaderIndexMap,
  rowIndex: number,
  typeRaw: string
): ParsedBalanceRow | null {
  const ticket = getCell(cells, headerIndex.ticket).trim() || `balance-${rowIndex + 1}`;
  const openTimeMs = parseDateMs(getCell(cells, headerIndex.openTime));
  const closeTimeMs = parseDateMs(getCell(cells, headerIndex.closeTime));
  const timeMs = Number.isFinite(closeTimeMs)
    ? closeTimeMs
    : Number.isFinite(openTimeMs)
      ? openTimeMs
      : NaN;
  const amount = parseNumber(getCell(cells, cells.length - 1));
  const commentCandidate =
    getCell(cells, headerIndex.item).trim() || getCell(cells, headerIndex.size).trim();

  if (!Number.isFinite(timeMs) || !Number.isFinite(amount)) return null;

  return {
    id: `${ticket}-${timeMs}`,
    ticket,
    timeMs,
    type: typeRaw,
    comment: commentCandidate || typeRaw,
    amount: round2(amount),
  };
}

function extractRows(html: string): string[][] {
  const out: string[][] = [];
  const cleanHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const rowMatch of cleanHtml.matchAll(rowRegex)) {
    const rowRaw = rowMatch[1] ?? "";
    const cells: string[] = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    for (const cellMatch of rowRaw.matchAll(cellRegex)) {
      const rawCell = cellMatch[1] ?? "";
      const text = decodeHtml(stripTags(rawCell))
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      cells.push(text);
    }
    if (cells.length) out.push(cells);
  }
  return out;
}

function mapHeaders(headers: string[]): HeaderIndexMap | null {
  const normalized = headers.map((header) => normalizeHeader(header));
  const ticket = findIndex(normalized, ["ticket"]);
  const openTime = findIndex(normalized, ["opentime", "opendate", "opent"]);
  const closeTime = findIndex(normalized, ["closetime", "closedate", "close"]);
  const type = findIndex(normalized, ["type"]);
  const size = findIndex(normalized, ["size", "lots", "lot"]);
  const item = findIndex(normalized, ["item", "symbol", "instrument"]);
  const commission = findIndex(normalized, ["commission"]);
  const tradePl = findIndex(normalized, ["tradepl", "tradep/l", "profit"]);

  if (
    ticket < 0 ||
    openTime < 0 ||
    closeTime < 0 ||
    type < 0 ||
    size < 0 ||
    item < 0 ||
    commission < 0 ||
    tradePl < 0
  ) {
    return null;
  }

  return {
    ticket,
    openTime,
    closeTime,
    type,
    size,
    item,
    commission,
    tradePl,
  };
}

function findIndex(headers: string[], candidates: string[]) {
  for (const candidate of candidates) {
    const index = headers.findIndex((header) => header.includes(candidate));
    if (index >= 0) return index;
  }
  return -1;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9/]+/g, "");
}

function getCell(cells: string[], index: number) {
  if (index < 0 || index >= cells.length) return "";
  return cells[index] ?? "";
}

function parseDateMs(rawValue: string) {
  const value = rawValue.trim();
  if (!value) return NaN;

  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/[.]/g, "-")
    .replace(/\//g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return NaN;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  const parsed = new Date(year, month - 1, day, hour, minute, second, 0).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseNumber(rawValue: string) {
  let value = rawValue
    .replace(/\u00a0/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "")
    .trim();

  if (!value || value === "-" || value === "," || value === ".") return NaN;

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      value = value.replace(/\./g, "").replace(",", ".");
    } else {
      value = value.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const decimals = value.length - lastComma - 1;
    if (decimals > 0 && decimals <= 2) {
      value = value.replace(",", ".");
    } else {
      value = value.replace(/,/g, "");
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function stripTags(input: string) {
  return input.replace(/<[^>]*>/g, "");
}

function decodeHtml(input: string) {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
