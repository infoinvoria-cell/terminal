# Data and Methodology

Verwendete Quellen:

- `src/data/capitalife/core-invest.config.json`: Zielgewichte und Constraints
- `public/generated/core-invest/parity-report.json`: Komponenten-Parität
- `.capitalife-cache/market-data/tradingview/history/*`: lokale Referenz-OHLC
- `public/generated/monitoring/mobile/HG1.json` und `6S1.json`: Futures-Referenzreihen
- `src/data/capitalife/core-invest-paper.config.json`: abgelehnte Aggregatreferenz

OHLC wird zentral auf nicht-finite und nicht-positive Werte, Bereichsfehler, Duplikate, Sortierung, Ausreißer, Zukunftszeitpunkte und große Kalenderlücken geprüft. Original, Korrektur/Quarantäne, Methode und Flag werden zurückgegeben.

Nicht belegt sind Total-Return-Parität aller ETFs, vollständige Corporate-Action-Historie und exakte Futures-Roll-/Point-Value-Parität.
