// Auto-generated from seasonality_agent output — 2026-07-28
// Anti-overfit portfolio: max 1 per asset, futures preferred, 0 crypto, max 2 bond ETFs
// Do not edit manually; re-run the agent pipeline and regenerate.

export interface AgentPattern {
  rank: number;
  asset: string;
  asset_type: string;
  category: string;
  category_label: string;
  hypothesis: string;
  direction: "long" | "short";
  tier: "bonferroni" | "fdr" | "watchlist";
  win_rate: number;
  is_win_rate: number;
  oos_win_rate: number;
  avg_return: number;
  sortino: number;
  n_obs: number;
  max_drawdown: number;
  profit_factor: number;
  robustness_score: number;
  decade_consistent: boolean;
  xasset_ratio: number | null;
  best_regime: string;
  next_entry: string;
  next_exit: string;
  rationale_text: string;
}

export const AGENT_PORTFOLIO_GENERATED = "2026-07-28";
export const AGENT_PORTFOLIO_N = 20;

export const AGENT_PATTERNS: AgentPattern[] = [
  {
    rank: 1, asset: "LBS=F", asset_type: "Lumber Future",
    category: "weekday", category_label: "Wochentag-Effekt",
    hypothesis: "Do-Effekt", direction: "long", tier: "fdr",
    win_rate: 0.957, is_win_rate: 0.95, oos_win_rate: 1.0,
    avg_return: 0.0034, sortino: 9.97, n_obs: 23,
    max_drawdown: 0.0003, profit_factor: 230.2, robustness_score: 1.0,
    decade_consistent: true, xasset_ratio: 0.2, best_regime: "trend=bull",
    next_entry: "2026-07-30", next_exit: "2026-07-30",
    rationale_text: "Lumber Futures: Bausektor-Saisonalität — Frühling/Sommer Baubeginn treibt Holzpreise. Do-Effekt: Wochenmitte-Momentum durch Bauauftrags-Meldungen und Lagerdaten (Donnerstag ist der US-Holzmarkt-Reporttag).",
  },
  {
    rank: 2, asset: "HYG", asset_type: "Bond ETF",
    category: "calendar", category_label: "Kalender-Saisonalität",
    hypothesis: "Nov letzte 5 HT", direction: "long", tier: "fdr",
    win_rate: 0.789, is_win_rate: 0.769, oos_win_rate: 0.833,
    avg_return: 0.0078, sortino: 1.71, n_obs: 19,
    max_drawdown: 0.0125, profit_factor: 10.36, robustness_score: 0.933,
    decade_consistent: true, xasset_ratio: 0.83, best_regime: "trend=bear",
    next_entry: "2026-11-24", next_exit: "2026-11-30",
    rationale_text: "High-Yield Corporate Bond ETF: Pensionsfonds und Bond-Allokator rebalancieren am Monatsende und -anfang in Risikoanlagen. Dezember/November-Effekt durch Jahresend-Rebalancing und Carry-Demand vor dem Jahreswechsel.",
  },
  {
    rank: 3, asset: "ZS=F", asset_type: "Soja Future",
    category: "calendar", category_label: "Kalender-Saisonalität",
    hypothesis: "Jul Mitte (HT8-12)", direction: "short", tier: "watchlist",
    win_rate: 0.72, is_win_rate: 0.737, oos_win_rate: 0.667,
    avg_return: 0.0358, sortino: 1.68, n_obs: 25,
    max_drawdown: 0.0355, profit_factor: 8.24, robustness_score: 1.0,
    decade_consistent: true, xasset_ratio: 0.5, best_regime: "vol=low",
    next_entry: "2027-07-12", next_exit: "2027-07-16",
    rationale_text: "Soybean Futures (CBOT): Juli-Mitte ist kritische Pollination-Phase für US-Soja. USDA Crop Progress Reports treiben Volatilität. Hitze/Trockenheit-Premium wird in der 2. Julihälfte eingepreist.",
  },
  {
    rank: 4, asset: "SB=F", asset_type: "Zucker Future",
    category: "calendar", category_label: "Kalender-Saisonalität",
    hypothesis: "Sep letzte 5 HT", direction: "long", tier: "watchlist",
    win_rate: 0.692, is_win_rate: 0.7, oos_win_rate: 0.667,
    avg_return: 0.0258, sortino: 1.62, n_obs: 26,
    max_drawdown: 0.0574, profit_factor: 7.7, robustness_score: 0.958,
    decade_consistent: true, xasset_ratio: 0.0, best_regime: "rate=rising",
    next_entry: "2026-09-24", next_exit: "2026-09-30",
    rationale_text: "Sugar Futures (NYBOT): Ende September/Oktober ist die brasilianische Zuckerrohrernte (Center-South). Marktakteure reduzieren Long-Positionen vor dem Erntehöhepunkt.",
  },
  {
    rank: 5, asset: "PA=F", asset_type: "Palladium Fut",
    category: "quarter", category_label: "Quartal / OpEx",
    hypothesis: "Jan OpEx (3. Fr ±3HT)", direction: "long", tier: "fdr",
    win_rate: 0.75, is_win_rate: 0.762, oos_win_rate: 0.714,
    avg_return: 0.0602, sortino: 1.6, n_obs: 28,
    max_drawdown: 0.1012, profit_factor: 9.99, robustness_score: 0.94,
    decade_consistent: true, xasset_ratio: 0.83, best_regime: "trend=bull",
    next_entry: "2027-01-12", next_exit: "2027-01-20",
    rationale_text: "Palladium Futures (NYMEX): Januar OpEx — Optionsmarkt-induzierte Hedging-Nachfrage von Automobilherstellern (Katalysatoren). Januar ist traditionell Jahres-Budgetierungsmonat für die Autoindustrie.",
  },
  {
    rank: 6, asset: "BZ=F", asset_type: "Brent Future",
    category: "weekday", category_label: "Wochentag-Effekt",
    hypothesis: "Mo-Di", direction: "short", tier: "fdr",
    win_rate: 0.789, is_win_rate: 0.769, oos_win_rate: 0.833,
    avg_return: 0.0015, sortino: 1.55, n_obs: 19,
    max_drawdown: 0.0025, profit_factor: 8.73, robustness_score: 1.0,
    decade_consistent: true, xasset_ratio: 0.75, best_regime: "trend=bear",
    next_entry: "2026-07-27", next_exit: "2026-07-28",
    rationale_text: "Brent Crude Futures (ICE): Mo-Di Wochenbeginn-Effekt — Ölmarkt verarbeitet Wochenend-Geopolitik und API/EIA-Inventar-Erwartungen. Short-Signal zeigt Überreaktionen zu Wochenbeginn.",
  },
  {
    rank: 7, asset: "ZW=F", asset_type: "Weizen Future",
    category: "calendar", category_label: "Kalender-Saisonalität",
    hypothesis: "Sep Mitte (HT8-12)", direction: "long", tier: "watchlist",
    win_rate: 0.846, is_win_rate: 0.85, oos_win_rate: 0.833,
    avg_return: 0.0264, sortino: 1.5, n_obs: 26,
    max_drawdown: 0.0542, profit_factor: 11.41, robustness_score: 0.784,
    decade_consistent: true, xasset_ratio: 0.25, best_regime: "vol=high",
    next_entry: "2026-09-10", next_exit: "2026-09-16",
    rationale_text: "Wheat Futures (CBOT): September-Mitte — Sommerweizenernte in den USA ist abgeschlossen, Winter-Weizen-Bestellung beginnt. USDA Crop Report (Sept) setzt Jahres-Nachfragebild.",
  },
  {
    rank: 8, asset: "CL=F", asset_type: "WTI Crude Fut",
    category: "weekday", category_label: "Wochentag-Effekt",
    hypothesis: "Mo-Di", direction: "short", tier: "watchlist",
    win_rate: 0.692, is_win_rate: 0.65, oos_win_rate: 0.833,
    avg_return: 0.002, sortino: 1.33, n_obs: 26,
    max_drawdown: 0.0035, profit_factor: 6.62, robustness_score: 1.0,
    decade_consistent: true, xasset_ratio: 0.75, best_regime: "vol=low",
    next_entry: "2026-07-27", next_exit: "2026-07-28",
    rationale_text: "WTI Crude Futures (NYMEX): Mo-Di Short-Signal — EIA Weekly Petroleum Status Report erscheint mittwochs; Montag/Dienstag sind Positioning-Tage vor dem Report.",
  },
  {
    rank: 9, asset: "SHY", asset_type: "Treasury ETF",
    category: "quarter", category_label: "Quartal / OpEx",
    hypothesis: "Q1 Window Dressing (letzte 5 HT)", direction: "long", tier: "fdr",
    win_rate: 0.708, is_win_rate: 0.706, oos_win_rate: 0.714,
    avg_return: 0.001, sortino: 1.26, n_obs: 24,
    max_drawdown: 0.0022, profit_factor: 7.68, robustness_score: 0.912,
    decade_consistent: true, xasset_ratio: 0.83, best_regime: "rate=rising",
    next_entry: "2027-03-25", next_exit: "2027-03-31",
    rationale_text: "iShares 1-3 Year Treasury ETF: Q1 Window Dressing — Institutionelle Anleger fügen kurzfristige Treasuries zum Quartalsende Q1 ein (Bilanzkosmetik). Niedriges Zinsrisiko, hohe Liquidität.",
  },
  {
    rank: 10, asset: "RB=F", asset_type: "Benzin Future",
    category: "weekday", category_label: "Wochentag-Effekt",
    hypothesis: "Mo-Di", direction: "short", tier: "fdr",
    win_rate: 0.808, is_win_rate: 0.85, oos_win_rate: 0.667,
    avg_return: 0.0022, sortino: 1.22, n_obs: 26,
    max_drawdown: 0.002, profit_factor: 8.25, robustness_score: 1.0,
    decade_consistent: true, xasset_ratio: 0.75, best_regime: "vix=high",
    next_entry: "2026-07-27", next_exit: "2026-07-28",
    rationale_text: "RBOB Gasoline Futures (NYMEX): Mo-Di Short-Effekt — Benzin-Crack-Spread wird vor wöchentlichen EIA-Daten (Mi) aggressiv gehandelt. Wochenstart zeigt systematische Überreaktionen.",
  },
  {
    rank: 11, asset: "^STI", asset_type: "SGX Index",
    category: "weekday", category_label: "Wochentag-Effekt",
    hypothesis: "Mo-Di", direction: "short", tier: "watchlist",
    win_rate: 0.658, is_win_rate: 0.656, oos_win_rate: 0.667,
    avg_return: 0.0005, sortino: 1.22, n_obs: 38,
    max_drawdown: 0.0016, profit_factor: 5.81, robustness_score: 1.0,
    decade_consistent: true, xasset_ratio: 0.38, best_regime: "trend=bear",
    next_entry: "2026-07-27", next_exit: "2026-07-28",
    rationale_text: "Singapore Straits Times Index: Mo-Di Short — Asiatische Märkte reagieren auf US-Wochenendbewegungen mit Übertreibung. ^STI ist Proxy für Asien-Stimmung; Mo-Di Reversion-Signal.",
  },
  {
    rank: 12, asset: "COPX", asset_type: "Kupfer Miner ETF",
    category: "quarter", category_label: "Quartal / OpEx",
    hypothesis: "Q4 Ende (letzte 10 HT)", direction: "long", tier: "fdr",
    win_rate: 0.812, is_win_rate: 0.8, oos_win_rate: 0.833,
    avg_return: 0.0334, sortino: 1.22, n_obs: 16,
    max_drawdown: 0.0432, profit_factor: 8.22, robustness_score: 1.0,
    decade_consistent: true, xasset_ratio: 0.83, best_regime: "vol=low",
    next_entry: "2026-12-18", next_exit: "2026-12-31",
    rationale_text: "Global X Copper Miners ETF: Q4-Ende (letzte 10 HT) — Tax-Loss-Harvesting und Jahresend-Rebalancing in Rohstoff-Minern. Kupfer-Minenaktien werden zum Jahresende systematisch ausgesondert.",
  },
  {
    rank: 13, asset: "ZT=F", asset_type: "2Y Treasury Fut",
    category: "calendar", category_label: "Kalender-Saisonalität",
    hypothesis: "Jun Turn-of-Month", direction: "short", tier: "watchlist",
    win_rate: 0.704, is_win_rate: 0.7, oos_win_rate: 0.714,
    avg_return: 0.0013, sortino: 1.21, n_obs: 27,
    max_drawdown: 0.0024, profit_factor: 6.55, robustness_score: 0.763,
    decade_consistent: true, xasset_ratio: null, best_regime: "rate=rising",
    next_entry: "2027-06-30", next_exit: "2027-07-05",
    rationale_text: "2-Year Treasury Futures (CBOT): Juni Turn-of-Month — Fed-Meeting-Zyklus: Zinserwartungen werden zum Monatswechsel neu eingepreist. 2J-Treasury ist der direkteste Kanal.",
  },
  {
    rank: 14, asset: "6N=F", asset_type: "NZD Future",
    category: "quarter", category_label: "Quartal / OpEx",
    hypothesis: "Q4 Window Dressing (letzte 5 HT)", direction: "long", tier: "watchlist",
    win_rate: 0.72, is_win_rate: 0.737, oos_win_rate: 0.667,
    avg_return: 0.0082, sortino: 1.17, n_obs: 25,
    max_drawdown: 0.0142, profit_factor: 7.88, robustness_score: 0.944,
    decade_consistent: true, xasset_ratio: 0.83, best_regime: "vol=low",
    next_entry: "2026-12-25", next_exit: "2026-12-31",
    rationale_text: "NZD/USD Futures (CME): Q4 Window Dressing — Neuseeländischer Dollar wird von Rohstoff-Fonds zum Jahresende rebalanced. RBNZ-Zinszyklus und NZ-Milchwirtschaft-Saisonalität.",
  },
  {
    rank: 15, asset: "DBB", asset_type: "Basismetall ETF",
    category: "weekday", category_label: "Wochentag-Effekt",
    hypothesis: "Mo-Di", direction: "short", tier: "watchlist",
    win_rate: 0.737, is_win_rate: 0.692, oos_win_rate: 0.833,
    avg_return: 0.0005, sortino: 1.04, n_obs: 19,
    max_drawdown: 0.0012, profit_factor: 5.78, robustness_score: 1.0,
    decade_consistent: true, xasset_ratio: null, best_regime: "vix=low",
    next_entry: "2026-07-27", next_exit: "2026-07-28",
    rationale_text: "Invesco DB Base Metals ETF: Mo-Di Short — Industriemetalle (Al, Cu, Zn) reagieren auf Wochenend-China-Daten mit Montags-Volatilität. Short-Übertreibung wird in der Woche abgebaut.",
  },
  {
    rank: 16, asset: "PL=F", asset_type: "Platin Future",
    category: "quarter", category_label: "Quartal / OpEx",
    hypothesis: "Jan OpEx (3. Fr ±3HT)", direction: "long", tier: "fdr",
    win_rate: 0.69, is_win_rate: 0.636, oos_win_rate: 0.857,
    avg_return: 0.0168, sortino: 0.85, n_obs: 29,
    max_drawdown: 0.0412, profit_factor: 4.62, robustness_score: 0.875,
    decade_consistent: true, xasset_ratio: 0.83, best_regime: "trend=bull",
    next_entry: "2027-01-12", next_exit: "2027-01-20",
    rationale_text: "Platinum Futures (NYMEX): Januar OpEx — Automobilindustrie-Hedging parallel zu PA=F. Platin wird für Dieselkatalysatoren benötigt; Jahresstart-Budgetierung treibt OpEx-Effekte.",
  },
  {
    rank: 17, asset: "ZM=F", asset_type: "Sojaschrot Fut",
    category: "calendar", category_label: "Kalender-Saisonalität",
    hypothesis: "Okt ganzer Monat", direction: "long", tier: "fdr",
    win_rate: 0.769, is_win_rate: 0.75, oos_win_rate: 0.833,
    avg_return: 0.0523, sortino: 0.83, n_obs: 26,
    max_drawdown: 0.1443, profit_factor: 6.21, robustness_score: 0.937,
    decade_consistent: true, xasset_ratio: 0.75, best_regime: "rate=falling",
    next_entry: "2026-10-01", next_exit: "2026-10-30",
    rationale_text: "Soybean Meal Futures (CBOT): Oktober ganzer Monat — Sojaschrot ist primäres Tierfuttermittel. Oktober ist Ernte-Abschluss und beginnendes Demand-Season für Viehfutterkäufer.",
  },
  {
    rank: 18, asset: "IWM", asset_type: "Russell2000 ETF",
    category: "calendar", category_label: "Kalender-Saisonalität",
    hypothesis: "Mai letzte 5 HT", direction: "long", tier: "fdr",
    win_rate: 0.692, is_win_rate: 0.632, oos_win_rate: 0.857,
    avg_return: 0.0138, sortino: 0.78, n_obs: 26,
    max_drawdown: 0.0328, profit_factor: 4.23, robustness_score: 1.0,
    decade_consistent: true, xasset_ratio: 0.81, best_regime: "rate=rising",
    next_entry: "2027-05-25", next_exit: "2027-05-31",
    rationale_text: "iShares Russell 2000 ETF: Mai letzte 5 HT — 'Sell in May' trifft Small-Caps überproportional. Institutionelle Rotation aus Wachstum/Small-Cap in Large-Cap und Anleihen zum Sommerstart.",
  },
  {
    rank: 19, asset: "6S=F", asset_type: "CHF Future",
    category: "calendar", category_label: "Kalender-Saisonalität",
    hypothesis: "Dez letzte 5 HT", direction: "long", tier: "fdr",
    win_rate: 0.72, is_win_rate: 0.737, oos_win_rate: 0.667,
    avg_return: 0.0058, sortino: 0.78, n_obs: 25,
    max_drawdown: 0.0165, profit_factor: 4.17, robustness_score: 0.75,
    decade_consistent: true, xasset_ratio: 0.83, best_regime: "trend=bull",
    next_entry: "2026-12-25", next_exit: "2026-12-31",
    rationale_text: "CHF/USD Futures (CME): Dezember letzte 5 HT — Jahresend-Safe-Haven-Demand für den Schweizer Franken. SNB-Politik und CHF-Repatriation von Schweizer Institutionen zum Jahresabschluss.",
  },
  {
    rank: 20, asset: "ZN=F", asset_type: "10Y Treasury Fut",
    category: "calendar", category_label: "Kalender-Saisonalität",
    hypothesis: "Aug letzte 5 HT", direction: "long", tier: "fdr",
    win_rate: 0.8, is_win_rate: 0.842, oos_win_rate: 0.667,
    avg_return: 0.003, sortino: 0.67, n_obs: 25,
    max_drawdown: 0.0082, profit_factor: 5.04, robustness_score: 0.8,
    decade_consistent: true, xasset_ratio: 1.0, best_regime: "vol=low",
    next_entry: "2026-08-25", next_exit: "2026-08-31",
    rationale_text: "10-Year Treasury Futures (CBOT): August letzte 5 HT — Sommerend-Saisonalität: Investoren positionieren sich vor dem September (historisch volatilster Monat) in sichere Anleihen.",
  },
];
