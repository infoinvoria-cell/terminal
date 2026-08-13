export type InfoLang = "en" | "de";

export type ModelInfoContent = {
  purpose: Record<InfoLang, string>;
  data: string;
  method: Record<InfoLang, string>;
  math: string;
  interpretation: Record<InfoLang, string>;
  source?: string;
};

export const MODEL_INFO: Record<string, ModelInfoContent> = {
  equity: {
    purpose: {
      en: "Price-indexed equity curve rebased to 100. Reveals compounding dynamics and drawdown periods.",
      de: "Auf 100 normierte Equity-Kurve. Zeigt Zinseszins-Dynamik und Drawdown-Phasen.",
    },
    data: "Strategy or portfolio cumulative return series from the analytics engine.",
    method: {
      en: "Cumulative compound return. Every gain is reinvested.",
      de: "Kumulierter Zinseszins-Return. Jeder Gewinn wird reinvestiert.",
    },
    math: "E₀ = 100,  Eₜ = Eₜ₋₁ × (1 + rₜ)",
    interpretation: {
      en: "Rising slope = compounding gains. Steepness encodes CAGR. Pullbacks show drawdowns in real scale.",
      de: "Steigende Kurve = Zinseszins. Neigung entspricht dem CAGR. Rückschläge zeigen reale Drawdowns.",
    },
  },
  "mc-paths": {
    purpose: {
      en: "10,000 Monte Carlo forward simulations. Quantifies path uncertainty and sequence risk.",
      de: "10.000 Monte-Carlo-Simulationen. Quantifiziert Pfadunsicherheit und Sequenzrisiko.",
    },
    data: "Historical monthly returns extracted from the selected equity curve.",
    method: {
      en: "Stationary Bootstrap (Politis & Romano 1994). Geometrically-distributed block lengths preserve autocorrelation.",
      de: "Stationary Bootstrap (Politis & Romano 1994). Geometrisch verteilte Block-Längen erhalten Autokorrelation.",
    },
    math: "Block length ~ Geom(1/b̄), b̄ = max(2, ⌊n^⅓⌋). Path = compounded drawn blocks × 10,000 runs.",
    interpretation: {
      en: "White band = median path. Outer bands = P10 / P90 envelope. Fan width = forward uncertainty.",
      de: "Weißes Band = Medianpfad. Äußere Bänder = P10/P90. Fan-Breite = Zukunftsunsicherheit.",
    },
  },
  drawdown: {
    purpose: {
      en: "Running peak-to-trough loss over time. Shows how long and deep each drawdown persists.",
      de: "Laufender Verlust vom Höchststand. Zeigt Tiefe und Dauer jedes Drawdowns.",
    },
    data: "Equity curve (derived from cumulative return series).",
    method: {
      en: "Rolling peak tracking: at each point, compare current value to running maximum.",
      de: "Laufendes Peak-Tracking: Vergleich des aktuellen Werts mit dem bisherigen Maximum.",
    },
    math: "DDₜ = Eₜ / max(E₀ … Eₜ) − 1",
    interpretation: {
      en: "Depth shows worst loss from prior peak. Width shows persistence before full recovery.",
      de: "Tiefe = maximaler Verlust. Breite = Zeit bis zur vollständigen Erholung.",
    },
  },
  "mc-outcome": {
    purpose: {
      en: "Distribution of 10,000 simulated terminal portfolio values at the full horizon.",
      de: "Verteilung von 10.000 simulierten Endwerten über den gesamten Horizont.",
    },
    data: "Monte Carlo simulation path endpoints at horizon month H.",
    method: {
      en: "Frequency histogram of H-month endpoint values across all 10,000 paths.",
      de: "Häufigkeitshistogramm der Endwerte aller 10.000 Pfade nach H Monaten.",
    },
    math: "P10 / P50 / P90 quantiles from sorted path endpoints",
    interpretation: {
      en: "Distribution right of 100 = positive expectation. Wider spread = greater outcome uncertainty.",
      de: "Verteilung rechts von 100 = positive Erwartung. Breitere Streuung = höhere Ergebnisungewissheit.",
    },
  },
  "return-dist": {
    purpose: {
      en: "Frequency distribution of all historical monthly returns.",
      de: "Häufigkeitsverteilung aller historischen Monatsrenditen.",
    },
    data: "Monthly returns derived from the equity curve (N-1 observations).",
    method: {
      en: "Fixed-width histogram with 30 bins across the full return range.",
      de: "Histogramm mit 30 festen Klassen über den gesamten Renditebereich.",
    },
    math: "bin width = (rₘₐₓ − rₘᵢₙ) / 30,  freq = count / n",
    interpretation: {
      en: "Negative skew = fat left tail. High excess kurtosis = fat tails vs. a normal distribution.",
      de: "Negative Schiefe = dicker linker Tail. Hohe Kurtosis = dickere Ränder als Normalverteilung.",
    },
  },
  "tail-risk": {
    purpose: {
      en: "Historical Value-at-Risk and Conditional VaR at 95% confidence.",
      de: "Historisches Value-at-Risk und Conditional VaR auf 95%-Niveau.",
    },
    data: "Monthly returns sorted ascending (empirical distribution, no parametric assumption).",
    method: {
      en: "Historical simulation: empirical quantile. No normal or parametric assumption.",
      de: "Historische Simulation: Empirisches Quantil. Keine Normal- oder Parametrikannahme.",
    },
    math: "VaR₉₅ = 5th-percentile return;  CVaR₉₅ = E[r | r < VaR₉₅]",
    interpretation: {
      en: "CVaR = average loss in the worst 5% of months. More conservative and coherent than VaR alone.",
      de: "CVaR = Durchschnittsverlust in den schlechtesten 5% der Monate. Konservativer als VaR allein.",
    },
  },
  rolling: {
    purpose: {
      en: "Rolling 12-month Sharpe ratio, annualised volatility, and return over time.",
      de: "Rollierender 12-Monats-Sharpe, annualisierte Volatilität und Rendite.",
    },
    data: "Equity curve with a 12-month rolling window (requires ≥13 monthly observations).",
    method: {
      en: "Annualised statistics recomputed at every monthly step within the rolling window.",
      de: "Annualisierte Statistiken, an jedem Monatspunkt im rollierenden Fenster neu berechnet.",
    },
    math: "Sharpe = (mean / std) × √12;   Vol = std × √12 × 100",
    interpretation: {
      en: "Sharpe > 1 = healthy risk-adjusted return. Vol spikes mark stress regimes. Negative = losing year.",
      de: "Sharpe > 1 = gutes Risiko-Rendite-Verhältnis. Volatilitätsspitzen zeigen Stressphasen.",
    },
  },
  "dd-recovery": {
    purpose: {
      en: "Drawdown depth vs. duration scatter. Third axis = recovery duration for resolved events.",
      de: "Drawdown-Tiefe vs. Dauer-Streudiagramm. Dritte Achse = Erholungsdauer.",
    },
    data: "Individual drawdown events detected and extracted from the equity curve.",
    method: {
      en: "Event detection: enter at peak breach, mark trough, exit at full recovery (or ongoing).",
      de: "Ereigniserkennung: Einstieg bei Peakunterschreitung, Tief, Austritt bei vollständiger Erholung.",
    },
    math: "Depth = (trough / peak − 1) × 100;  Duration = calendar days from peak to trough",
    interpretation: {
      en: "Lower-right = deep prolonged drawdowns. Cluster near origin = shallow quick recovery. Gold = still open.",
      de: "Rechts unten = tiefe, lang andauernde Drawdowns. Nahe Ursprung = schnelle Erholung. Gold = offen.",
    },
  },
  regression: {
    purpose: {
      en: "OLS regression of strategy monthly returns against the S&P 500 benchmark.",
      de: "OLS-Regression der Strategie-Monatsrenditen gegen den S&P 500.",
    },
    data: "Monthly returns of strategy and S&P 500 on matched observation dates.",
    method: {
      en: "Ordinary Least Squares. Requires both strategy and benchmark series on the same dates.",
      de: "Kleinste Quadrate (OLS). Erfordert deckungsgleiche Daten von Strategie und Benchmark.",
    },
    math: "y = α + βx;   β = Cov(r_s, r_b) / Var(r_b);   IR = α / σ(ε) × √12",
    interpretation: {
      en: "β > 1 = amplified market exposure. α > 0 = excess return above benchmark. IR measures consistency.",
      de: "β > 1 = verstärkte Marktabhängigkeit. α > 0 = Mehrrendite gegenüber Benchmark. IR = Konsistenz.",
    },
  },
  "dyn-correlation": {
    purpose: {
      en: "Rolling 36-month Pearson correlation with the S&P 500. Shows regime changes in market coupling.",
      de: "Rollierender 36-Monats-Pearson-Korrelation mit dem S&P 500. Zeigt Regime-Wechsel.",
    },
    data: "Monthly returns of strategy and S&P 500 benchmark on matched observation dates.",
    method: {
      en: "Pearson correlation computed within a 36-month rolling window, advanced monthly.",
      de: "Pearson-Korrelation im 36-Monats-Rollfenster, monatlich fortgeschrieben.",
    },
    math: "ρ = Σ(xᵢ−x̄)(yᵢ−ȳ) / √[Σ(xᵢ−x̄)² · Σ(yᵢ−ȳ)²]",
    interpretation: {
      en: "Near 0 = uncorrelated, diversifying. Near ±1 = strongly correlated or anti-correlated to market.",
      de: "Nahe 0 = unkorrelliert, diversifizierend. Nahe ±1 = stark mit dem Markt verbunden.",
    },
  },
  "correlation-matrix": {
    purpose: {
      en: "Pairwise correlation matrix of all component monthly returns within the portfolio or group.",
      de: "Paarweise Korrelationsmatrix aller Komponenten-Monatsrenditen im Portfolio oder Gruppe.",
    },
    data: "Monthly returns for each component, aligned on common observation dates.",
    method: {
      en: "Pairwise Pearson on common dates. Matrix is symmetric; diagonal = 1.",
      de: "Paarweise Pearson auf gemeinsamen Datumsreihen. Matrix ist symmetrisch, Diagonale = 1.",
    },
    math: "ρᵢⱼ = Cov(rᵢ, rⱼ) / (σᵢ · σⱼ)",
    interpretation: {
      en: "White = positive correlation. Gray = near-zero. Gold = negative. Low off-diagonal = diversification.",
      de: "Weiß = positive Korrelation. Grau = nahe null. Gold = negativ. Niedriges Off-Diagonal = Diversifikation.",
    },
  },
  "efficient-frontier": {
    purpose: {
      en: "Long-only mean-variance efficient frontier with 1,200-sample feasible-set cloud.",
      de: "Long-only Mean-Varianz-Effizienzlinie mit 1.200-Stichproben-Machbarkeitscloud.",
    },
    data: "Monthly returns of each component aligned on common observation dates.",
    method: {
      en: "LONG-ONLY SIMPLEX (wᵢ ≥ 0, Σwᵢ = 1). Frontier via projected-gradient descent. Cloud = Dirichlet samples.",
      de: "Long-Only-Simplex (wᵢ ≥ 0, Σwᵢ = 1). Frontier via Gradientenprojektion. Cloud = Dirichlet-Stichproben.",
    },
    math: "min wᵀΣw s.t. wᵀμ = μ*, Σwᵢ = 1, wᵢ ≥ 0",
    interpretation: {
      en: "White line = optimized long-only frontier. Min-Vol = lowest variance. Max-Sharpe = best risk-adj. return. rf = 0.",
      de: "Weiße Linie = optimale Long-only-Frontier. Min-Vol = geringstes Risiko. Max-Sharpe = bestes Sharpe.",
    },
  },
  pca: {
    purpose: {
      en: "Principal Component Analysis of component return co-movements.",
      de: "Hauptkomponentenanalyse der gemeinsamen Renditebewegungen aller Komponenten.",
    },
    data: "Monthly returns matrix of all portfolio or group components (aligned dates).",
    method: {
      en: "Eigendecomposition of the covariance matrix (Jacobi iterations on symmetric matrix).",
      de: "Eigenwertzerlegung der Kovarianzmatrix (Jacobi-Iterationen auf symmetrischer Matrix).",
    },
    math: "Σv = λv;   PC₁ explains max(λᵢ / Σλ) fraction of total variance",
    interpretation: {
      en: "PC1 = dominant shared driver across components. Loadings show each component's contribution.",
      de: "PC1 = dominanter gemeinsamer Faktor. Ladungen zeigen den Beitrag jeder Komponente.",
    },
  },
  "var-surface": {
    purpose: {
      en: "VaR and CVaR across an 8-confidence × 7-horizon grid. Full empirical tail risk surface.",
      de: "VaR und CVaR über ein 8-Konfidenz × 7-Horizont-Raster. Vollständige empirische Tail-Risk-Fläche.",
    },
    data: "Monthly returns; compounded for multi-month horizons using overlapping sliding windows.",
    method: {
      en: "HISTORICAL EMPIRICAL — no sqrt(T) parametric scaling. R_H(t) = compound product over H months.",
      de: "Historisch-Empirisch — kein sqrt(T)-parametrisches Skalieren. R_H(t) = Produkt über H Monate.",
    },
    math: "VaR(c,H) = (1−c) quantile of {R_H};   CVaR(c,H) = E[R_H | R_H < VaR]",
    interpretation: {
      en: "Negative values = losses. CVaR ≤ VaR always. Longer horizons compound tail risk non-linearly.",
      de: "Negative Werte = Verluste. CVaR ≤ VaR stets. Längere Horizonte kumulieren Tail-Risiken nicht-linear.",
    },
  },
  "rolling-risk-surface": {
    purpose: {
      en: "Rolling volatility surface across 6 window lengths over the full history.",
      de: "Rollierende Volatilitätsfläche über 6 Fensterlängen über die gesamte Historie.",
    },
    data: "Equity curve monthly returns. Windows: 6, 9, 12, 18, 24, 36 months.",
    method: {
      en: "Annualised volatility computed at each monthly step per window. Color = rolling Sharpe.",
      de: "Annualisierte Volatilität pro Fensterlänge und Monat. Farbe = rollierendes Sharpe.",
    },
    math: "Vol(w,t) = std(r_{t−w…t}) × √12;   Sharpe(w,t) = mean / std × √12",
    interpretation: {
      en: "Height = annualised vol. Color = Sharpe quality. Spikes = high-stress regimes. Flat low = calm return.",
      de: "Höhe = annualisierte Vol. Farbe = Sharpe-Qualität. Spitzen = Stressphasen. Flach = stabile Rendite.",
    },
  },
  "mc-quantile-surface": {
    purpose: {
      en: "3D surface of Monte Carlo quantile paths across the simulation horizon.",
      de: "3D-Fläche der Monte-Carlo-Quantilpfade über den gesamten Simulationshorizont.",
    },
    data: "10,000 Monte Carlo paths (stationary bootstrap) from the selected strategy or portfolio.",
    method: {
      en: "19 quantile slices (5%–95% in 5% steps) rendered as a continuous mesh surface.",
      de: "19 Quantilscheiben (5%–95% in 5%-Schritten) als kontinuierliche Mesh-Fläche.",
    },
    math: "Q(p, t) = p-th percentile of path values at month t across 10,000 simulations",
    interpretation: {
      en: "Surface widening over time = growing uncertainty. Gold (low) → white (high) encodes return level.",
      de: "Sich weitende Fläche = wachsende Unsicherheit. Gold (niedrig) → Weiß (hoch) = Renditeniveau.",
    },
  },
  "trade-expectancy": {
    purpose: {
      en: "Per-trade profitability breakdown: expectancy, win rate, profit factor, PnL histogram.",
      de: "Trade-genaue Rentabilitätsanalyse: Erwartungswert, Trefferquote, Profit-Faktor, PnL-Histogramm.",
    },
    data: "Trade-level records from backtrader output JSON. Raw recorded PnL in backtrader output units.",
    method: {
      en: "Summary statistics + PnL histogram (20 bins). Values are RAW backtrader units (not normalized).",
      de: "Kennzahlen + PnL-Histogramm (20 Klassen). Werte in RAW-Backtrader-Einheiten (nicht normiert).",
    },
    math: "E[trade] = WR × AvgWin − (1−WR) × |AvgLoss|;   PF = ΣWins / Σ|Losses|",
    interpretation: {
      en: "Positive expectancy = required for long-run profitability. Profit factor > 1.5 = robust edge.",
      de: "Positiver Erwartungswert = Voraussetzung für langfristige Rentabilität. PF > 1.5 = robuster Edge.",
    },
  },
  "lln-convergence": {
    purpose: {
      en: "Running win rate convergence — Law of Large Numbers verification across trade history.",
      de: "Laufende Trefferquoten-Konvergenz — Verifikation des Gesetzes der großen Zahlen.",
    },
    data: "Trade-level PnL records sorted chronologically by entry date.",
    method: {
      en: "Cumulative win rate after each trade with ±1σ Wilson confidence interval.",
      de: "Kumulative Trefferquote nach jedem Trade mit ±1σ-Wilson-Konfidenzintervall.",
    },
    math: "WR_n = wins_n / n;   σ_n = √(WR_n(1−WR_n)/n)",
    interpretation: {
      en: "Stable convergence = consistent edge. Persistent drift may signal regime change or overfit.",
      de: "Stabile Konvergenz = konsistenter Edge. Anhaltende Drift = möglicher Regimewechsel oder Überfit.",
    },
  },
  "path-dependency": {
    purpose: {
      en: "Distribution of cumulative PnL across 500 randomly shuffled trade sequences.",
      de: "Verteilung des kumulierten PnL über 500 zufällig neu geordnete Trade-Sequenzen.",
    },
    data: "Trade-level PnL records, randomly reordered 500 times (permutation bootstrap).",
    method: {
      en: "Reshuffle trade order 500×, compute cumulative PnL sum for each permutation.",
      de: "Trade-Reihenfolge 500× zufällig mischen, kumulierten PnL jeder Permutation berechnen.",
    },
    math: "Path_k = cumsum(σₖ(PnL vector)), k = 1 … 500",
    interpretation: {
      en: "Tight fan = path-independent. Wide fan = order-sensitive (clustering or momentum effects).",
      de: "Enger Fan = reihenfolgeunabhängig. Breiter Fan = reihenfolgesensitiv (Clustering oder Momentum).",
    },
  },
};
