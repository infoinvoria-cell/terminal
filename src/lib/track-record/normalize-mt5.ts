/**
 * MT5 snapshot normalizer.
 * Reads account_2 snapshot + history via the existing mt5-snapshot-reader
 * and maps deals to NormalizedTrackRecord types.
 * Server-only. Never logs credential values.
 */

import { readMt5Snapshot } from "./mt5-snapshot-reader";
import type {
  NormalizedAccountSnapshot,
  NormalizedTrade,
  NormalizedCashFlow,
  NormalizedOpenPosition,
  TradeSide,
  CashFlowType,
} from "./normalized-types";
import type { Mt5DealRaw, Mt5PositionRaw } from "./mt5-snapshot-reader";

// ── Public types ──────────────────────────────────────────────────────────────

export interface Mt5NormalizeResult {
  account: NormalizedAccountSnapshot | null;
  closedTrades: NormalizedTrade[];
  openPositions: NormalizedOpenPosition[];
  cashFlows: NormalizedCashFlow[];
  warnings: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCOUNT_ID = "account_2";
const SOURCE = "mt5_python" as const;
const SOURCE_FRESH_WINDOW = 86_400; // 24 h

// deal_type numeric codes
const DEAL_TYPE_BUY    = 0;
const DEAL_TYPE_SELL   = 1;
const DEAL_TYPE_BALANCE = 2;
const DEAL_TYPE_CREDIT  = 3;
const DEAL_TYPE_FEE_RANGE_LO = 4;
const DEAL_TYPE_FEE_RANGE_HI = 8;
const DEAL_TYPE_ADJ_LO = 9;
const DEAL_TYPE_ADJ_HI = 10;

// deal_entry codes
const ENTRY_IN     = 0;
const ENTRY_OUT    = 1;
const ENTRY_IN_OUT = 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

function epochToUtc(epoch: number): string {
  return new Date(epoch * 1000).toISOString().replace(".000Z", "Z");
}

function positionTypeSide(pt: string): TradeSide {
  return pt === "sell" ? "sell" : "buy";
}

function dealTypeToSide(dealType: number): TradeSide {
  return dealType === DEAL_TYPE_SELL ? "sell" : "buy";
}

function dealTypeToCashFlowType(dealType: number, profit: number): CashFlowType {
  if (dealType === DEAL_TYPE_BALANCE) return profit >= 0 ? "deposit" : "withdrawal";
  if (dealType === DEAL_TYPE_CREDIT)  return "credit";
  if (dealType >= DEAL_TYPE_FEE_RANGE_LO && dealType <= DEAL_TYPE_FEE_RANGE_HI) return "fee";
  if (dealType >= DEAL_TYPE_ADJ_LO   && dealType <= DEAL_TYPE_ADJ_HI)           return "adjustment";
  return "other";
}

function isTradeDeal(dealType: number): boolean {
  return dealType === DEAL_TYPE_BUY || dealType === DEAL_TYPE_SELL;
}

function isCashFlowDeal(dealType: number): boolean {
  return !isTradeDeal(dealType);
}

// ── Main normalizer ───────────────────────────────────────────────────────────

export function normalizeMt5(snapshotPath: string): Mt5NormalizeResult {
  const warnings: string[] = [];
  const closedTrades: NormalizedTrade[] = [];
  const openPositions: NormalizedOpenPosition[] = [];
  const cashFlows: NormalizedCashFlow[] = [];

  // ── Read snapshot via existing reader ─────────────────────────────────────
  let snapshotResult: ReturnType<typeof readMt5Snapshot>;
  try {
    snapshotResult = readMt5Snapshot(snapshotPath);
  } catch (err) {
    return {
      account: null,
      closedTrades: [],
      openPositions: [],
      cashFlows: [],
      warnings: [`mt5: snapshot read failed — ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const { snapshot, history } = snapshotResult;
  const nowEpoch = Math.floor(Date.now() / 1000);

  const account: NormalizedAccountSnapshot = {
    accountId:      ACCOUNT_ID,
    platform:       "MT5",
    broker:         snapshot.broker,
    loginMasked:    snapshot.login_masked,
    server:         snapshot.server,
    currency:       snapshot.currency,
    balance:        snapshot.balance,
    equity:         snapshot.equity,
    floatingProfit: snapshot.profit,
    margin:         snapshot.margin,
    freeMargin:     snapshot.margin_free,
    marginLevel:    snapshot.margin_level,
    leverage:       snapshot.leverage,
    connected:      snapshot.connected,
    generatedAtUtc:  snapshot.generated_at_utc,
    generatedAtEpoch:snapshot.generated_at_epoch,
    source:         SOURCE,
    sourceFresh:    nowEpoch - snapshot.generated_at_epoch <= SOURCE_FRESH_WINDOW,
  };

  // ── Open positions from snapshot ──────────────────────────────────────────
  const openPositionTickets = new Set<number>();
  for (const pos of snapshot.positions ?? []) {
    openPositionTickets.add(pos.ticket);
    openPositions.push(normalizePosition(pos));
  }

  // ── Process deals ─────────────────────────────────────────────────────────
  if (!history || !Array.isArray(history.deals) || history.deals.length === 0) {
    warnings.push("mt5: no deal history available");
    return { account, closedTrades, openPositions, cashFlows, warnings };
  }

  const seenDealTickets = new Set<number>();

  // Separate trade deals from cash-flow deals; deduplicate
  const tradeDeals: Mt5DealRaw[] = [];
  const cashFlowDeals: Mt5DealRaw[] = [];

  for (const deal of history.deals) {
    const t = Number(deal.ticket);
    if (seenDealTickets.has(t)) {
      warnings.push(`mt5: duplicate deal ticket ${t} — skipped`);
      continue;
    }
    seenDealTickets.add(t);

    if (isTradeDeal(deal.deal_type)) {
      tradeDeals.push(deal);
    } else {
      cashFlowDeals.push(deal);
    }
  }

  // ── Cash flows ────────────────────────────────────────────────────────────
  for (const deal of cashFlowDeals) {
    const cfType = dealTypeToCashFlowType(deal.deal_type, deal.profit);
    cashFlows.push({
      id:           `${ACCOUNT_ID}_${deal.ticket}`,
      accountId:    ACCOUNT_ID,
      sourceTicket: deal.ticket,
      type:         cfType,
      timeUtc:      epochToUtc(deal.time_epoch),
      timeEpoch:    deal.time_epoch,
      amount:       deal.profit,
      currency:     account.currency,
      comment:      deal.comment,
      source:       SOURCE,
    });
  }

  // ── Group trade deals by position_id ──────────────────────────────────────
  // position_id → { inDeals: [], outDeals: [] }
  const positionGroups = new Map<number, { inDeals: Mt5DealRaw[]; outDeals: Mt5DealRaw[] }>();

  for (const deal of tradeDeals) {
    const pid = deal.position_id;
    if (!positionGroups.has(pid)) {
      positionGroups.set(pid, { inDeals: [], outDeals: [] });
    }
    const grp = positionGroups.get(pid)!;
    if (deal.deal_entry === ENTRY_IN) {
      grp.inDeals.push(deal);
    } else if (deal.deal_entry === ENTRY_OUT || deal.deal_entry === ENTRY_IN_OUT) {
      grp.outDeals.push(deal);
    } else {
      grp.outDeals.push(deal); // treat unknown entry as out
    }
  }

  // ── Build NormalizedTrades from position groups ───────────────────────────
  const usedTradeIds = new Set<string>();

  for (const [positionId, grp] of positionGroups) {
    const { inDeals, outDeals } = grp;

    // No OUT deals → position still open; open position from snapshot handles it
    if (outDeals.length === 0) {
      // Already captured from snapshot positions — nothing to add as a trade
      if (!openPositionTickets.has(positionId)) {
        warnings.push(`mt5: position_id ${positionId} has IN deal but no OUT deal and no snapshot position`);
      }
      continue;
    }

    // Derive the IN deal (first by time)
    const inDeal = inDeals.sort((a, b) => a.time_epoch - b.time_epoch)[0] ?? null;

    // Each OUT deal → one NormalizedTrade (partial close support)
    for (const outDeal of outDeals) {
      const tradeId = `${ACCOUNT_ID}_${outDeal.ticket}`;
      if (usedTradeIds.has(tradeId)) {
        warnings.push(`mt5: trade id collision on deal ${outDeal.ticket} — skipped`);
        continue;
      }
      usedTradeIds.add(tradeId);

      const dealIds: number[] = [];
      if (inDeal) dealIds.push(inDeal.ticket);
      dealIds.push(outDeal.ticket);

      const grossProfit = outDeal.profit;
      const commission  = outDeal.commission;
      const swap        = outDeal.swap;
      const fees        = outDeal.fee;
      const netProfit   = grossProfit + commission + swap + fees;

      // Side is determined by the OUT deal's type
      // (BUY deal closes a SELL position and vice versa — we store the original position side)
      // In MT5: IN deal type 0 = BUY position opened, IN deal type 1 = SELL position opened
      const positionSide: TradeSide = inDeal ? dealTypeToSide(inDeal.deal_type) : dealTypeToSide(outDeal.deal_type === DEAL_TYPE_BUY ? DEAL_TYPE_SELL : DEAL_TYPE_BUY);

      closedTrades.push({
        id:             tradeId,
        accountId:      ACCOUNT_ID,
        sourceTicket:   outDeal.ticket,
        platform:       "MT5",
        broker:         account.broker,
        symbol:         outDeal.symbol || (inDeal?.symbol ?? ""),
        side:           positionSide,
        volume:         outDeal.volume,
        openTimeUtc:    inDeal ? epochToUtc(inDeal.time_epoch) : epochToUtc(outDeal.time_epoch),
        openTimeEpoch:  inDeal ? inDeal.time_epoch : outDeal.time_epoch,
        closeTimeUtc:   epochToUtc(outDeal.time_epoch),
        closeTimeEpoch: outDeal.time_epoch,
        openPrice:      inDeal ? inDeal.price : 0,
        closePrice:     outDeal.price,
        stopLoss:       0, // not available per-deal in MT5
        takeProfit:     0,
        grossProfit,
        commission,
        swap,
        fees,
        netProfit,
        magicNumber:    outDeal.magic,
        comment:        outDeal.comment,
        status:         "closed",
        source:         SOURCE,
        sourceDealIds:  dealIds,
      });
    }
  }

  return { account, closedTrades, openPositions, cashFlows, warnings };
}

// ── Open position normalizer ──────────────────────────────────────────────────

function normalizePosition(pos: Mt5PositionRaw): NormalizedOpenPosition {
  return {
    id:            `${ACCOUNT_ID}_${pos.ticket}`,
    accountId:     ACCOUNT_ID,
    sourceTicket:  pos.ticket,
    symbol:        pos.symbol,
    side:          positionTypeSide(pos.position_type),
    volume:        pos.volume,
    openTimeUtc:   epochToUtc(pos.open_time_epoch),
    openTimeEpoch: pos.open_time_epoch,
    openPrice:     pos.open_price,
    currentPrice:  pos.current_price,
    stopLoss:      pos.stop_loss,
    takeProfit:    pos.take_profit,
    swap:          pos.swap,
    floatingProfit:pos.profit,
    source:        SOURCE,
  };
}
