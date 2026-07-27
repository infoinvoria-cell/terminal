import "server-only";

/**
 * Tactical returns stay disabled until each local engine has exact trade-level
 * parity with a TradingView export on the same instrument.
 */
export type SleeveReturns = {
  QQQ_PINE_2_EMA: Record<string, number>;
  COPPER_HG: Record<string, number>;
  CHF_6S: Record<string, number>;
};

export function loadSleeveReturns(): SleeveReturns {
  return {
    QQQ_PINE_2_EMA: {},
    COPPER_HG: {},
    CHF_6S: {},
  };
}
