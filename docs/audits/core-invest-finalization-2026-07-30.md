# Core Invest Finalization Audit

## Ausgangslage

Das Repository enthielt zwei widersprüchliche Portfoliomodelle: die eingefrorene 8-Komponenten-v2.0-Allokation und ein älteres 5-Komponenten-FSPortfolio. Zusätzlich wurde eine einzelne QQQ-Pine-Reihe in Analytics als vollständiger Core-Invest-Backtest verwendet. Die Bibel zeigte Kennzahlen eines wegen Engine-Parität abgelehnten Laufs als OOS-validiert.

## Finale Komponenten

Die kanonische Zielallokation bleibt unverändert:

- QQQ Passive 45%
- GLD 25%
- SPMO 5%
- SPY 5%
- QQQ Pine 1 5%
- QQQ Pine 2 EMA 5%
- Copper/HG 5%
- CHF/6S 5%

Summe: 100%. Vier passive Komponenten sind historisch berechenbar, vier Strategy-Sleeves nur TV-Referenz.

## Datenqualität

Die Core-Invest-OHLC-Route verwendet nun die zentrale Quality-Pipeline. Sie protokolliert nicht-finite oder nicht-positive Werte, Range-Reparaturen, Ausreißer, Zukunftswerte, unsortierte Eingaben, Duplikate und große Kalenderlücken.

Futures-Validierung:

- HG1!: WARN, 47 verdächtige Nicht-Roll-Gaps
- 6S1!: OK mit vier verdächtigen Sprüngen

## Berechnung und Portfolioaufbau

Das Zielmodell sieht quartalsweises Rebalancing, 10 bps Kosten und ein relatives Toleranzband von 20% vor. Der vorhandene FSPortfolio-Code aggregierte dagegen täglich mit konstanten Gewichten und setzte Transaktionskosten auf null. Seine Ergebnisse wurden deshalb nicht als kanonischer v2.0-Backtest übernommen.

## Historische Ergebnisse und Walk Forward

Ein abgelehnter Referenzlauf meldet für 2019-2026 CAGR 17,11%, Sharpe 1,152, Max Drawdown -21,73%, Calmar 0,7874 und 60% WF Beat Rate. Status: `REJECTED_ENGINE_PARITY`. Die Werte sind nur Quellenregister-Evidenz, keine validierten Portfolio-KPIs.

Rolling-Walk-Forward, Out-of-Sample-Validierung und Aggregat-Robustheit sind nicht abgeschlossen. Vier Trade-Exports und eine einheitliche Engine fehlen.

## Backtest-/Live-Parität

Parity-Report: 8 Komponenten, 4 ready, 4 `tv_reference_only`, `liveReady=false`. Analytics Backtest und Live zeigen deshalb keine simulierte Aggregatkurve und einen expliziten Blockerstatus.

## IBKR

Nicht bereit. ETF-`conId`, Börsen-/Währungsdetails, Fractional-/Rundungsregeln sowie Futures-Verfall, Roll, Multiplikator und Margin sind offen. `HG1!` und `6S1!` sind nicht ausführbare Continuous Contracts.

## Änderungen pro Seite

- Komponentenseite: aggregierte KPI-Felder zeigen `nicht validiert`.
- Monitoring/Invest: kanonische Config-API liefert acht Komponenten und Validation-Status; OHLC enthält Quality-Nachweis.
- Analytics Backtest: falscher QQQ-Pine-Aggregatfallback entfernt.
- Analytics Live: altes 5-Komponenten-Forwardmodell nicht mehr als v2.0-Live dargestellt.
- Bibel: „Approved“ und abgelehnte OOS-Kennzahlen entfernt.
- INNO: separate Core-Invest-Karte, Quellen und Blocker auf Desktop/Mobile ergänzt.
- Mobile Preview: Desktop-Routen werden jetzt synchron auf die jeweiligen `/m/...`-Seiten abgebildet.

## Behobene Bugs

1. Abgelehnte Aggregatmetriken wurden als validiert dargestellt.
2. Einzelne QQQ-Pine-Reihe wurde als Portfolio-Backtest bezeichnet.
3. Altes 5-Komponenten-Modell konnte als v2.0-Live/Backtest erscheinen.
4. Cloud Config API lieferte nur HTTP 503.
5. Core-Invest-OHLC filterte Qualitätsfehler vor der zentralen Auswertung.
6. INNO enthielt keinen separaten Core-Invest-Bereich.
7. Analytics berechnete clientseitig trotz serverseitigem Blocker weiterhin eine scheinbare Live-Performance.
8. Die Mobile Preview leitete Bibel, Analytics, Komponenten und Monitoring auf falsche Mobile-Seiten um.

## Tests

- 39/39 Unit-/Regressionstests bestanden
- Core-Invest-Gewichte, Komponentenanzahl und Config-Parität getestet
- Backtest-/Live-Blockerparität getestet
- Desktop-/Mobile-INNO-Datenquelle gemeinsam
- OHLC-Sortierung, Duplikate und Gaps getestet
- Strategy-Proof: 8/8 und 100%
- Produktionsbuild bestanden

## Browser-Abnahme

- Lokale Anwendung: `http://localhost:3000`
- Desktop-Komponenten: acht Komponenten, passive Reihen als `Historisch`, aggregierte KPIs als `nicht validiert`
- Desktop-INNO: separate Core-Invest-v2.0-Karte mit Zielallokation und Blockern
- Desktop-Analytics: keine unbelegte Live-/Forward-Serie, keine Portfolio-KPIs, Status `Validation blockiert`
- Mobile-INNO: `/m/about/inno` in der Phone Preview mit sichtbarem Modus `INNO Vorbereitung`

Nachweise:

- `docs/audits/core-invest-components-desktop-2026-07-30.jpg`
- `docs/audits/core-invest-inno-desktop-2026-07-30.jpg`
- `docs/audits/core-invest-analytics-blocked-desktop-2026-07-30.jpg`
- `docs/audits/core-invest-inno-mobile-2026-07-30.jpg`

## Vorher/Nachher

| Bereich | Vorher | Nachher |
|---|---|---|
| Portfolio-KPIs | scheinbar validiert | `nicht validiert` |
| Analytics Backtest | QQQ Pine als Portfolio | explizit blockiert |
| Analytics Live | abweichendes 5er-Modell | explizit blockiert |
| Config API | 503 | read-only 8er-Modell |
| Bibel | Approved/OOS | Validation blockiert |
| INNO | Core Invest fehlte | separat dokumentiert |

## Abschlussklassifikation

- Vollständig implementiert: kanonischer Status, Zielgewichte, Config API, UI-Abgrenzung, OHLC-Qualität, Source-of-Truth-Dokumentation.
- Historisch validiert: vier passive Asset-Reihen, nicht das Gesamtportfolio.
- Out-of-sample validiert: nein.
- Technisch live-fähig: nein.
- Mit echten Live-Daten verifiziert: nein.
- Durch Daten blockiert: vier Trade-Exports, Total-Return-/Roll-/Kostenparität.
- Durch externe Credentials blockiert: Broker-/IBKR-Livepositionen und Marktdatenberechtigungen.
- Produktionsgeeignet: nein.
