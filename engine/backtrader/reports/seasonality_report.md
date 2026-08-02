# Seasonality Validierung — 2026-08-01

## Methodik

- **Engine:** Backtrader 1.9.78, Python 3.13
- **Daten:** TradingView Daily OHLC Exports (1970–2026, je nach Asset)
- **Kapitalisierung:** 100.000 USD, 95% Position Sizing
- **Kosten:** 10 bps Kommission, kein separater Slippage-Aufschlag
- **Rollover:** 50 USD pro Trade pauschal
- **Walk-Forward:** IS 5 Jahre, OOS 1 Jahr, 1-Jahr-Schritt
- **Stress-Perioden:** GFC 2008, EUR Krise 2011, USD Rally 2014, COVID 2020, Zinsanstieg 2022
- **Monte Carlo:** 500 Bootstrap-Simulationen auf Trade-Returns (Seed 42)

## Zusammenfassung

| Muster | Asset | Dir | Grade | Score | Sharpe | CAGR% | MaxDD% | WR% | WF% | Stress | MC p5 | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Chicago Wheat | ZW1! | LONG | **A** | **90** | 0.60 | 3.14 | -7.76 | 76.8 | 73.1 | 4/5 | 2.75 | Live-tauglich |
| Cocoa | CC1! | LONG | **B** | **60** | 0.21 | 1.46 | -23.54 | 63.0 | 62.8 | 5/5 | -0.35 | Paper Trading |
| S&P 500 E-mini | ES1! | LONG | **B** | **60** | 0.11 | 0.38 | -13.14 | 75.0 | 72.0 | 4/5 | -0.98 | Paper Trading |
| Soybean Meal | ZM1! | LONG | **C** | **40** | 0.04 | 0.13 | -16.55 | 52.6 | 53.8 | 3/5 | -1.47 | Weitere Forschung |
| RBOB Gasoline | RB1! | LONG | D | 30 | 0.02 | 0.11 | -18.16 | 55.0 | 52.6 | 1/5 | -1.37 | Verwerfen |
| Gold | GC1! | LONG | D | 30 | 0.08 | 0.23 | -13.23 | 50.0 | 48.9 | 3/5 | -1.38 | Verwerfen |
| Cotton #2 | CT1! | LONG | D | 30 | 0.14 | 0.56 | -12.03 | 55.6 | 56.0 | 1/5 | -0.58 | Verwerfen |
| Natural Gas | NG1! | SHORT | D | 20 | -0.22 | -3.62 | -79.69 | 36.1 | 34.4 | 5/5 | -3.01 | Verwerfen |
| Sugar #11 | SB1! | SHORT | D | 20 | -0.15 | -1.08 | -46.54 | 40.7 | 39.2 | 4/5 | -2.72 | Verwerfen |
| Palladium | PA1! | SHORT | D | 0 | -0.40 | -2.11 | -58.67 | 38.1 | 37.8 | 0/5 | -4.06 | Verwerfen |

## Scoring-Kriterien (0–100)

| Kriterium | Punkte | Schwelle |
|---|---|---|
| Sharpe > 1.0 | +20 | (>0.5: +10) |
| WF Effizienz > 70% | +20 | (>50%: +10) |
| Stress Tests bestanden >= 4/5 | +20 | (>=3: +10) |
| Nach Kosten profitabel | +20 | |
| Monte Carlo p5 Sharpe > 0 | +20 | (>-0.5: +10) |

Grade: A (80-100), B (60-79), C (40-59), D (<40)

## Empfehlungen

### Live-tauglich (Grade A)
- **ZW1! (Chicago Wheat)** — Einziges Muster mit konsistentem Edge. Sharpe 0.60, Walk-Forward 73%, 76.8% Trefferquote. Robust in 4/5 Stressphasen. Monte Carlo p5 Sharpe positiv (2.75). CAGR 3.14% nach Kosten.

### Paper Trading (Grade B)
- **CC1! (Cocoa)** — Alle 5 Stresstests bestanden, WR 63%, aber Monte Carlo p5 Sharpe leicht negativ (-0.35). MaxDD -23.5% ist erhöht.
- **ES1! (S&P 500 E-mini)** — Santa Claus Rally. WR 75%, WF 72%. Aber nur 28 Jahre Daten, Sharpe nahe 0.

### Weitere Forschung (Grade C)
- **ZM1! (Soybean Meal)** — Knapp profitabel, aber kein verlässlicher Edge. WR 52.6%, Sharpe 0.04.

### Verwerfen (Grade D)
- **RB1!, GC1!, CT1!** — Marginal profitabel, aber kein statistisch signifikanter Edge (Sharpe < 0.15, Monte Carlo negativ).
- **NG1!, SB1!** — Netto-Verlierer. SHORT-Anomalien nicht reproduzierbar.
- **PA1!** — Score 0. Alle Dimensionen negativ. Geldvernichtung.

## Kritische Befunde

1. **6 von 10 Mustern sind statistisch wertlos** — Sharpe < 0.15 oder negativ.
2. **Nur 1 Muster (ZW1) ist live-tauglich** — Rest braucht entweder weitere Forschung oder Verwerfen.
3. **ZM1 hat Daten** — Der Terminal-Status "no_data_source" ist falsch. 14.146 Bars seit 1970 vorhanden.
4. **SHORT-Muster scheitern systematisch** — NG1, SB1, PA1 alle verlustreich. Hinweis auf strukturellen Long-Bias in Commodities.
5. **Kosten-Drag ist bei schwachen Mustern fatal** — RB1 und GC1 verlieren ihren marginalen Edge durch 10 bps Kosten fast vollständig.

## Datenquellen

| Asset | Bars | Zeitraum |
|---|---|---|
| RB1! | 10.470 | 1984-12-03 → 2026-07-29 |
| ZW1! | 14.256 | 1970-01-05 → 2026-07-29 |
| GC1! | 12.974 | 1975-01-02 → 2026-07-31 |
| NG1! | 9.130 | 1990-04-03 → 2026-07-31 |
| SB1! | 13.716 | 1971-10-04 → 2026-07-02 |
| CC1! | 11.679 | 1979-12-19 → 2026-07-02 |
| PA1! | 10.299 | 1985-08-26 → 2026-07-29 |
| ZM1! | 14.146 | 1970-01-05 → 2026-07-29 |
| CT1! | 13.523 | 1972-08-22 → 2026-07-02 |
| ES1! | 7.307 | 1997-09-09 → 2026-07-31 |
