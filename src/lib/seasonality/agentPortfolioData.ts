// Auto-generated from seasonality_agent output — 2026-07-28
// Source: seasonality_agent/output/top_patterns.json + entry_exit_rules.csv
// Do not edit manually; re-run the agent and update this file from its outputs.

export interface AgentPattern {
  rank: number;
  asset: string;
  category: string;
  hypothesis: string;
  direction: "long" | "short";
  win_rate: number;
  avg_return: number;
  sortino: number;
  n_obs: number;
  oos_win_rate: number;
  p_value: number;
  tier: "bonferroni" | "fdr" | "watchlist";
  regime_required: string;
  conditional_win_rate: number;
  // Next signal window (calendar dates from agent)
  next_entry: string;
  next_exit: string;
  // Entry/exit rules (only for tier=fdr; watchlist entries are research-only)
  entry_rule: string;
  exit_rule: string;
  rationale_class: string;
  side: string;
}

export const AGENT_PORTFOLIO_GENERATED = "2026-07-28";
export const AGENT_PORTFOLIO_N = 20;

export const AGENT_PATTERNS: AgentPattern[] = [
  {
    rank: 1, asset: "LBS=F", category: "weekday", hypothesis: "Do-Effekt",
    direction: "long", win_rate: 0.957, avg_return: 0.0034, sortino: 9.97, n_obs: 23,
    oos_win_rate: 1.0, p_value: 2.86e-6, tier: "fdr", regime_required: "trend=bull",
    conditional_win_rate: 0.957,
    next_entry: "2026-07-30", next_exit: "2026-07-30",
    entry_rule: "Exposure NUR an: Donnerstag (Open) — Excess vs. Durchschnittstag",
    exit_rule: "Glattstellen am Close des jeweiligen Donnerstag",
    rationale_class: "sentiment_weekday", side: "LONG",
  },
  {
    rank: 2, asset: "HYG", category: "calendar", hypothesis: "Nov letzte 5 HT",
    direction: "long", win_rate: 0.789, avg_return: 0.0078, sortino: 1.71, n_obs: 19,
    oos_win_rate: 0.833, p_value: 0.00961, tier: "fdr", regime_required: "trend=bear",
    conditional_win_rate: 1.0,
    next_entry: "2026-11-24", next_exit: "2026-11-30",
    entry_rule: "Close des 5.-letzten Handelstags im Nov",
    exit_rule: "Close des letzten Handelstags im Nov",
    rationale_class: "liquidity_month_boundary", side: "LONG",
  },
  {
    rank: 3, asset: "PA=F", category: "quarter", hypothesis: "Jan OpEx (3. Fr ±3HT)",
    direction: "long", win_rate: 0.75, avg_return: 0.0602, sortino: 1.60, n_obs: 28,
    oos_win_rate: 0.714, p_value: 0.00627, tier: "fdr", regime_required: "trend=bull",
    conditional_win_rate: 0.75,
    next_entry: "2027-01-12", next_exit: "2027-01-20",
    entry_rule: "Close 3 HT vor dem 3. Freitag im Jan",
    exit_rule: "Close 3 HT nach dem 3. Freitag im Jan",
    rationale_class: "liquidity_options_expiry", side: "LONG",
  },
  {
    rank: 4, asset: "BZ=F", category: "weekday", hypothesis: "Mo-Di",
    direction: "short", win_rate: 0.789, avg_return: 0.0015, sortino: 1.55, n_obs: 19,
    oos_win_rate: 0.833, p_value: 0.00961, tier: "fdr", regime_required: "trend=bear",
    conditional_win_rate: 1.0,
    next_entry: "2026-07-27", next_exit: "2026-07-27",
    entry_rule: "Exposure NUR an: Montag, Dienstag (Open) — Excess vs. Durchschnittstag",
    exit_rule: "Glattstellen am Close des jeweiligen Montag, Dienstag",
    rationale_class: "sentiment_weekday", side: "SHORT",
  },
  {
    rank: 5, asset: "SHY", category: "quarter", hypothesis: "Q1 Window Dressing (letzte 5 HT)",
    direction: "long", win_rate: 0.708, avg_return: 0.001, sortino: 1.26, n_obs: 24,
    oos_win_rate: 0.714, p_value: 0.03196, tier: "fdr", regime_required: "rate=rising",
    conditional_win_rate: 0.857,
    next_entry: "2027-03-25", next_exit: "2027-03-31",
    entry_rule: "Close des 5.-letzten Handelstags in Q1",
    exit_rule: "Close des letzten Handelstags in Q1",
    rationale_class: "liquidity_quarter_rebalance", side: "LONG",
  },
  {
    rank: 6, asset: "RB=F", category: "weekday", hypothesis: "Mo-Di",
    direction: "short", win_rate: 0.808, avg_return: 0.0022, sortino: 1.22, n_obs: 26,
    oos_win_rate: 0.667, p_value: 0.00125, tier: "fdr", regime_required: "none",
    conditional_win_rate: 0.808,
    next_entry: "2026-07-27", next_exit: "2026-07-27",
    entry_rule: "Exposure NUR an: Montag, Dienstag (Open) — Excess vs. Durchschnittstag",
    exit_rule: "Glattstellen am Close des jeweiligen Montag, Dienstag",
    rationale_class: "sentiment_weekday", side: "SHORT",
  },
  {
    rank: 7, asset: "COPX", category: "quarter", hypothesis: "Q4 Ende (letzte 10 HT)",
    direction: "long", win_rate: 0.812, avg_return: 0.0334, sortino: 1.22, n_obs: 16,
    oos_win_rate: 0.833, p_value: 0.01064, tier: "fdr", regime_required: "vol=low",
    conditional_win_rate: 1.0,
    next_entry: "2026-12-18", next_exit: "2026-12-31",
    entry_rule: "Close des 10.-letzten Handelstags in Q4",
    exit_rule: "Close des letzten Handelstags in Q4",
    rationale_class: "liquidity_quarter_rebalance", side: "LONG",
  },
  {
    rank: 8, asset: "BZ=F", category: "calendar", hypothesis: "Feb ganzer Monat",
    direction: "long", win_rate: 0.737, avg_return: 0.0528, sortino: 1.13, n_obs: 19,
    oos_win_rate: 0.714, p_value: 0.03178, tier: "fdr", regime_required: "trend=bear",
    conditional_win_rate: 1.0,
    next_entry: "2027-02-01", next_exit: "2027-02-26",
    entry_rule: "Close des 1. Handelstags im Feb",
    exit_rule: "Close des letzten Handelstags im Feb",
    rationale_class: "seasonal_sentiment", side: "LONG",
  },
  {
    rank: 9, asset: "SHY", category: "calendar", hypothesis: "Aug letzte 5 HT",
    direction: "long", win_rate: 0.875, avg_return: 0.001, sortino: 0.86, n_obs: 24,
    oos_win_rate: 0.833, p_value: 0.000139, tier: "fdr", regime_required: "vol=high",
    conditional_win_rate: 1.0,
    next_entry: "2026-08-25", next_exit: "2026-08-31",
    entry_rule: "Close des 5.-letzten Handelstags im Aug",
    exit_rule: "Close des letzten Handelstags im Aug",
    rationale_class: "liquidity_month_boundary", side: "LONG",
  },
  {
    rank: 10, asset: "PL=F", category: "quarter", hypothesis: "Jan OpEx (3. Fr ±3HT)",
    direction: "long", win_rate: 0.69, avg_return: 0.0168, sortino: 0.85, n_obs: 29,
    oos_win_rate: 0.857, p_value: 0.03071, tier: "fdr", regime_required: "trend=bull",
    conditional_win_rate: 0.75,
    next_entry: "2027-01-12", next_exit: "2027-01-20",
    entry_rule: "Close 3 HT vor dem 3. Freitag im Jan",
    exit_rule: "Close 3 HT nach dem 3. Freitag im Jan",
    rationale_class: "liquidity_options_expiry", side: "LONG",
  },
  {
    rank: 11, asset: "ZM=F", category: "calendar", hypothesis: "Okt ganzer Monat",
    direction: "long", win_rate: 0.769, avg_return: 0.0523, sortino: 0.83, n_obs: 26,
    oos_win_rate: 0.833, p_value: 0.00468, tier: "fdr", regime_required: "none",
    conditional_win_rate: 0.769,
    next_entry: "2026-10-01", next_exit: "2026-10-30",
    entry_rule: "Close des 1. Handelstags im Okt",
    exit_rule: "Close des letzten Handelstags im Okt",
    rationale_class: "seasonal_sentiment", side: "LONG",
  },
  {
    rank: 12, asset: "IWM", category: "calendar", hypothesis: "Mai letzte 5 HT",
    direction: "long", win_rate: 0.692, avg_return: 0.0138, sortino: 0.78, n_obs: 26,
    oos_win_rate: 0.857, p_value: 0.03776, tier: "fdr", regime_required: "rate=rising",
    conditional_win_rate: 0.857,
    next_entry: "2027-05-25", next_exit: "2027-05-31",
    entry_rule: "Close des 5.-letzten Handelstags im Mai",
    exit_rule: "Close des letzten Handelstags im Mai",
    rationale_class: "liquidity_month_boundary", side: "LONG",
  },
  {
    rank: 13, asset: "6S=F", category: "calendar", hypothesis: "Dez letzte 5 HT",
    direction: "long", win_rate: 0.72, avg_return: 0.0058, sortino: 0.78, n_obs: 25,
    oos_win_rate: 0.667, p_value: 0.02164, tier: "fdr", regime_required: "trend=bull",
    conditional_win_rate: 0.917,
    next_entry: "2026-12-25", next_exit: "2026-12-31",
    entry_rule: "Close des 5.-letzten Handelstags im Dez",
    exit_rule: "Close des letzten Handelstags im Dez",
    rationale_class: "liquidity_month_boundary", side: "LONG",
  },
  {
    rank: 14, asset: "TLT", category: "calendar", hypothesis: "Feb letzte 5 HT",
    direction: "long", win_rate: 0.792, avg_return: 0.0106, sortino: 0.74, n_obs: 24,
    oos_win_rate: 1.0, p_value: 0.00331, tier: "fdr", regime_required: "trend=bear",
    conditional_win_rate: 1.0,
    next_entry: "2027-02-22", next_exit: "2027-02-26",
    entry_rule: "Close des 5.-letzten Handelstags im Feb",
    exit_rule: "Close des letzten Handelstags im Feb",
    rationale_class: "liquidity_month_boundary", side: "LONG",
  },
  {
    rank: 15, asset: "SHY", category: "calendar", hypothesis: "Jul letzte 5 HT",
    direction: "long", win_rate: 0.783, avg_return: 0.0011, sortino: 0.74, n_obs: 23,
    oos_win_rate: 0.833, p_value: 0.00531, tier: "fdr", regime_required: "vol=high",
    conditional_win_rate: 1.0,
    next_entry: "2026-07-27", next_exit: "2026-07-31",
    entry_rule: "Close des 5.-letzten Handelstags im Jul",
    exit_rule: "Close des letzten Handelstags im Jul",
    rationale_class: "liquidity_month_boundary", side: "LONG",
  },
  {
    rank: 16, asset: "BTC-USD", category: "calendar", hypothesis: "Nov letzte 5 HT",
    direction: "long", win_rate: 0.917, avg_return: 0.0519, sortino: 10.0, n_obs: 12,
    oos_win_rate: 0.833, p_value: 0.00317, tier: "watchlist", regime_required: "none",
    conditional_win_rate: 0.917,
    next_entry: "2026-11-24", next_exit: "2026-11-30",
    entry_rule: "Close des 5.-letzten Handelstags im Nov",
    exit_rule: "Close des letzten Handelstags im Nov",
    rationale_class: "liquidity_month_boundary", side: "LONG",
  },
  {
    rank: 17, asset: "BND", category: "calendar", hypothesis: "Jul ganzer Monat",
    direction: "long", win_rate: 0.895, avg_return: 0.0079, sortino: 5.32, n_obs: 19,
    oos_win_rate: 0.833, p_value: 0.000364, tier: "watchlist", regime_required: "none",
    conditional_win_rate: 0.895,
    next_entry: "2027-07-01", next_exit: "2027-07-30",
    entry_rule: "Close des 1. Handelstags im Jul",
    exit_rule: "Close des letzten Handelstags im Jul",
    rationale_class: "seasonal_sentiment", side: "LONG",
  },
  {
    rank: 18, asset: "USO", category: "quarter", hypothesis: "Q2 Window Dressing (letzte 5 HT)",
    direction: "long", win_rate: 0.762, avg_return: 0.0189, sortino: 1.75, n_obs: 21,
    oos_win_rate: 0.714, p_value: 0.01330, tier: "watchlist", regime_required: "none",
    conditional_win_rate: 0.762,
    next_entry: "2027-06-24", next_exit: "2027-06-30",
    entry_rule: "Close des 5.-letzten Handelstags in Q2",
    exit_rule: "Close des letzten Handelstags in Q2",
    rationale_class: "liquidity_quarter_rebalance", side: "LONG",
  },
  {
    rank: 19, asset: "PALL", category: "calendar", hypothesis: "Jun Turn-of-Month",
    direction: "long", win_rate: 0.765, avg_return: 0.0143, sortino: 1.68, n_obs: 17,
    oos_win_rate: 0.857, p_value: 0.02452, tier: "watchlist", regime_required: "trend=bull",
    conditional_win_rate: 0.8,
    next_entry: "2027-06-30", next_exit: "2027-07-05",
    entry_rule: "Close des letzten Handelstags im Jun",
    exit_rule: "Close des 3. Handelstags im Jul",
    rationale_class: "liquidity_turn_of_month", side: "LONG",
  },
  {
    rank: 20, asset: "ZS=F", category: "calendar", hypothesis: "Jul Mitte (HT8-12)",
    direction: "short", win_rate: 0.72, avg_return: 0.0358, sortino: 1.68, n_obs: 25,
    oos_win_rate: 0.667, p_value: 0.02164, tier: "watchlist", regime_required: "vol=low",
    conditional_win_rate: 0.875,
    next_entry: "2027-07-12", next_exit: "2027-07-16",
    entry_rule: "Close des 8. Handelstags im Jul",
    exit_rule: "Close des 12. Handelstags im Jul",
    rationale_class: "seasonal_sentiment", side: "SHORT",
  },
];
