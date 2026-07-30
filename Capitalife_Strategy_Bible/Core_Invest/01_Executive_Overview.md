# Core Invest Executive Overview

Stand: 2026-07-30

Core Invest v2.0 ist eine eingefrorene Zielallokation aus acht Komponenten. Das Modell ist nicht produktionsgeeignet: Vier passive Komponenten sind historisch berechenbar, vier Strategy-Sleeves besitzen nur TradingView-Referenzwerte ohne exakte Trade-by-Trade-Parität.

- ETF-Core: QQQ 45%, GLD 25%, SPMO 5%, SPY 5%
- Strategy-Sleeves: QQQ Pine 1, QQQ Pine 2 EMA, Copper/HG und CHF/6S je 5%
- Rebalancing-Ziel: quartalsweise, 10 bps Kostenannahme, 20% relatives Toleranzband
- Status: `blocked_engine_parity_not_live`
- Aggregat-Backtest: nicht validiert
- Rolling Walk-Forward: nicht validiert
- echte Live-Daten: nicht verifiziert

Source of Truth: `src/lib/core-invest/core-invest-model.ts`.
