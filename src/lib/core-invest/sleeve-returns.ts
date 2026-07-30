import "server-only";

/**
 * Tactical returns stay disabled until each local engine has exact trade-level
 * parity with a TradingView export on the same instrument.
 */
export type SleeveReturns = {
  COPPER_HG: Record<string, number>;
  CHF_6S: Record<string, number>;
};

export function loadSleeveReturns(): SleeveReturns {
  return {
    COPPER_HG: {},
    CHF_6S: {},
  };
}
