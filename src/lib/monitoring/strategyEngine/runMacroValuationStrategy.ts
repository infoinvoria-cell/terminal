export type StrategyPosition = "flat" | "long" | "short";

export type StrategyEngineInputBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  longCond: boolean;
  shortCond: boolean;
  stopLoss?: number | null;
  takeProfit?: number | null;
};

export type StrategyEngineInput = {
  asset: { symbol: string; source: string };
  candles: StrategyEngineInputBar[];
  comparisonCandles?: unknown;
  regimeCandles?: unknown;
  params: Record<string, unknown>;
};

export type StrategyEngineTrade = {
  direction: "long" | "short";
  entryTime: string;
  exitTime: string | null;
  entry: number;
  exit: number | null;
  sl: number | null;
  tp: number | null;
  exitReason: string | null;
  status: "open" | "closed";
};

export type StrategyEngineEvent = {
  time: string;
  type: "long_entry" | "short_entry" | "long_exit" | "short_exit";
  price: number;
  reason: string;
};

export type StrategyEngineBarState = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  longCond: boolean;
  shortCond: boolean;
  positionBefore: StrategyPosition;
  action: "none" | "long_entry" | "short_entry" | "long_exit" | "short_exit" | "reversal";
  positionAfter: StrategyPosition;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  exitPrice: number | null;
  exitReason: string | null;
  ignoredSameDirectionSignal: boolean;
};

export type StrategyEngineOutput = {
  trades: StrategyEngineTrade[];
  events: StrategyEngineEvent[];
  barStates: StrategyEngineBarState[];
  summary: {
    totalTrades: number;
    longTrades: number;
    shortTrades: number;
    ignoredSameDirectionSignals: number;
    reversals: number;
  };
};

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function runMacroValuationStrategy(input: StrategyEngineInput): StrategyEngineOutput {
  const bars = Array.isArray(input.candles) ? input.candles : [];
  const trades: StrategyEngineTrade[] = [];
  const events: StrategyEngineEvent[] = [];
  const barStates: StrategyEngineBarState[] = [];

  let position: StrategyPosition = "flat";
  let ignoredSameDirectionSignals = 0;
  let reversals = 0;
  let currentTrade: StrategyEngineTrade | null = null;
  let currentSl: number | null = null;
  let currentTp: number | null = null;

  for (const bar of bars) {
    const positionBefore = position;
    let action: StrategyEngineBarState["action"] = "none";
    let exitPrice: number | null = null;
    let exitReason: string | null = null;
    let ignoredSameDirectionSignal = false;

    const longCond = Boolean(bar.longCond);
    const shortCond = Boolean(bar.shortCond);
    const close = Number(bar.close);
    const low = Number(bar.low);
    const high = Number(bar.high);
    const sl = finite(bar.stopLoss);
    const tp = finite(bar.takeProfit);

    if ((position as StrategyPosition) === "long" && longCond) {
      ignoredSameDirectionSignals += 1;
      ignoredSameDirectionSignal = true;
    }
    if ((position as StrategyPosition) === "short" && shortCond) {
      ignoredSameDirectionSignals += 1;
      ignoredSameDirectionSignal = true;
    }

    const closeCurrent = (reason: string, px: number, evtType: "long_exit" | "short_exit") => {
      position = "flat";
      action = evtType;
      exitPrice = px;
      exitReason = reason;
      events.push({ time: bar.time, type: evtType, price: px, reason });
      if (currentTrade) {
        currentTrade.exitTime = bar.time;
        currentTrade.exit = px;
        currentTrade.exitReason = reason;
        currentTrade.status = "closed";
        trades.push(currentTrade);
        currentTrade = null;
      }
      currentSl = null;
      currentTp = null;
    };

    const openTrade = (dir: "long" | "short", evtType: "long_entry" | "short_entry") => {
      position = dir;
      action = evtType;
      events.push({ time: bar.time, type: evtType, price: close, reason: "strategy_entry" });
      currentTrade = {
        direction: dir,
        entryTime: bar.time,
        exitTime: null,
        entry: close,
        exit: null,
        sl,
        tp,
        exitReason: null,
        status: "open",
      };
      currentSl = sl;
      currentTp = tp;
    };

    // 1) Risk exits on current position.
    if ((position as StrategyPosition) === "long" && currentTrade) {
      const hitSl = currentSl != null && low <= currentSl;
      const hitTp = currentTp != null && high >= currentTp;
      if (hitSl || hitTp) {
        if (hitSl && hitTp) {
          // Conservative tie-breaker for OHLC-only bars.
          closeCurrent("stop_loss", Number(currentSl), "long_exit");
        } else if (hitSl) {
          closeCurrent("stop_loss", Number(currentSl), "long_exit");
        } else if (hitTp) {
          closeCurrent("take_profit", Number(currentTp), "long_exit");
        }
      }
    } else if ((position as StrategyPosition) === "short" && currentTrade) {
      const hitSl = currentSl != null && high >= currentSl;
      const hitTp = currentTp != null && low <= currentTp;
      if (hitSl || hitTp) {
        if (hitSl && hitTp) {
          closeCurrent("stop_loss", Number(currentSl), "short_exit");
        } else if (hitSl) {
          closeCurrent("stop_loss", Number(currentSl), "short_exit");
        } else if (hitTp) {
          closeCurrent("take_profit", Number(currentTp), "short_exit");
        }
      }
    }

    // 2) Entries / reversals with pyramiding=0 semantics.
    if (position === "flat") {
      if (longCond) {
        openTrade("long", "long_entry");
      } else if (shortCond) {
        openTrade("short", "short_entry");
      }
    } else if (position === "long" && shortCond) {
      reversals += 1;
      closeCurrent("reversal", close, "long_exit");
      openTrade("short", "short_entry");
      action = "reversal";
    } else if (position === "short" && longCond) {
      reversals += 1;
      closeCurrent("reversal", close, "short_exit");
      openTrade("long", "long_entry");
      action = "reversal";
    }

    barStates.push({
      time: bar.time,
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close,
      longCond,
      shortCond,
      positionBefore,
      action,
      positionAfter: position,
      entryPrice: (currentTrade as StrategyEngineTrade | null)?.entry ?? null,
      stopLoss: currentSl,
      takeProfit: currentTp,
      exitPrice,
      exitReason,
      ignoredSameDirectionSignal,
    });
  }

  if (currentTrade) {
    trades.push(currentTrade);
  }

  return {
    trades,
    events,
    barStates,
    summary: {
      totalTrades: trades.length,
      longTrades: trades.filter((t) => t.direction === "long").length,
      shortTrades: trades.filter((t) => t.direction === "short").length,
      ignoredSameDirectionSignals,
      reversals,
    },
  };
}
