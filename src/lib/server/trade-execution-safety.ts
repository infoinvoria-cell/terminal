export type TradingSafetyState = {
  globalTradingDisabled: boolean;
  paperTradingEnabled: boolean;
  liveTradingEnabled: boolean;
  manualTicketEnabled: boolean;
  paperOrderSubmissionAllowed: boolean;
  liveOrderSubmissionAllowed: boolean;
};

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

export function getTradingSafetyState(): TradingSafetyState {
  const globalTradingDisabled = parseBooleanEnv("GLOBAL_TRADING_DISABLED", true);
  const paperTradingEnabled = parseBooleanEnv("PAPER_TRADING_ENABLED", false);
  const liveTradingEnabled = parseBooleanEnv("LIVE_TRADING_ENABLED", false);
  const manualTicketEnabled = parseBooleanEnv("MANUAL_TICKET_ENABLED", true);

  return {
    globalTradingDisabled,
    paperTradingEnabled,
    liveTradingEnabled,
    manualTicketEnabled,
    paperOrderSubmissionAllowed: !globalTradingDisabled && paperTradingEnabled,
    liveOrderSubmissionAllowed: !globalTradingDisabled && liveTradingEnabled,
  };
}
