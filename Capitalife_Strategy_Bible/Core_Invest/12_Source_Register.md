# Source Register

| Quelle | Zweck | Qualität |
|---|---|---|
| `src/lib/core-invest/core-invest-model.ts` | kanonische UI-/API-Zielstruktur | Source of Truth für Status und Gewichtung |
| `src/data/capitalife/core-invest.config.json` | eingefrorene 8-Komponenten-Konfiguration | Forschungs-/Zielkonfiguration |
| `public/generated/core-invest/parity-report.json` | Komponenten-Parität | reproduzierbarer Statusbericht |
| `src/data/capitalife/core-invest-paper.config.json` | historische Aggregatreferenz | abgelehnt wegen Engine-Parität |
| `src/data/capitalife/fsportfolio-live-core.config.json` | älteres 5-Komponenten-Modell | nicht kanonisch für v2.0 |
| `src/data/capitalife/fsportfolio/backtests/qqq-invest-pine-series.json` | QQQ-Pine-Sleeve | keine Aggregatquelle |
| `public/generated/monitoring/futures-validation.json` | HG-/6S-Datenqualität | Warnungen offen |
| `src/lib/market-data/ohlc-quality.ts` | zentrale OHLC-Qualität | getestet |
| `scripts/core-invest-parity-report.mjs` | Parity-Generator | reproduzierbar |

Berechnungsversion: Core Invest model v2.0 / audit 2026-07-30.
