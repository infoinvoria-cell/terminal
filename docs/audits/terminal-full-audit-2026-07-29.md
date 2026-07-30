# Capitalife Terminal Full Audit

Stand: 2026-07-30  
Audit-Solltermin: 2026-07-29

## Executive Summary

Der Build und die vorhandenen Tests waren bereits lauffähig, der fachliche Audit hat jedoch mehrere relevante Integritätsprobleme gefunden. Kritisch waren eine clientseitig veröffentlichte Preview-Passwortvariable, unzutreffende Track-Record-Annualisierung, mögliche Speicherung einer Myfxbook-Session und geratenen Darwinex-URLs. Diese Ursachen wurden im Code behoben und durch Tests beziehungsweise Build geprüft.

Nicht als abgeschlossen gelten die Live-Provider-Verifikation, die produktive Supabase-Migration, die feste Myfxbook-Egress-IP, eine vollständige Brokerhistorie, eine visuelle Browserabnahme und die regulatorisch-technische IBKR-Freigabe.

## Umfang

- 34 Seiten und 93 API-Routen
- Desktop- und Mobile-INNO-Routen
- Track-Record-Datenmodell, Provider, Repository und APIs
- OHLC-Monitoring und Futures-Qualitätsberichte
- White-Swan- und Core-Invest-Validierung
- Worker, Provider-Konfiguration und Vercel-Betriebsgrenzen
- Preview-Gate und öffentliche Env-Vorlage

Der vollständige Brain-Kontext konnte nicht geladen werden, weil `CAPITALIFE_BRAIN_PATH` nicht gesetzt ist. Der lokale Graphify-Index und die Repository-Quellen wurden verwendet.

## Findings und Änderungen

| Schwere | Finding | Ursache | Änderung | Status |
|---|---|---|---|---|
| kritisch | Preview-Passwort im Client-Bundle | `NEXT_PUBLIC_*` und clientseitiger Vergleich | serverseitige Gate-Route, Constant-Time-Vergleich, öffentliche Client-Variable entfernt | durch Tests/Build bestätigt |
| hoch | Track-Record-Annualisierung fachlich falsch | Datenpunktzahl statt realer Zeitspanne; Proxy-Sharpe | Kalenderzeit-CAGR, annualisierte Volatilität, Sharpe, Sortino und Calmar zentral implementiert | Unit-Test bestätigt |
| hoch | Myfxbook-Session konnte in Raw Snapshot landen | unveränderte Login-Antwort | Session vor Persistenz redigiert; Fehler-URLs ohne Query | Code/Test geprüft |
| hoch | Darwinex-Endpunkte waren nicht belegt | angenommene URL-Struktur | offizielle, explizit konfigurierte URLs zwingend; OAuth-Refresh ergänzt | Build/Test bestätigt, live offen |
| hoch | OHLC-Reparaturen waren nicht zentral nachvollziehbar | lokale Filter-/Repair-Logik | zentrale Quality-Pipeline mit Quarantäne, Original/Korrektur, Methode und Event-Schema | Datenqualitätstest bestätigt |
| mittel | Historische Daten wurden nicht normalisiert genutzt | statische UI- und Provider-Sichten | append-only Historienbundle und zentrale Übersicht | Importtest bestätigt |
| mittel | Myfxbook-Zeit wurde wie UTC behandelt | Broker-Lokalzeit ohne IANA-Konvertierung | IANA-Zeitzonenkonvertierung nach UTC | DST-Test bestätigt |
| mittel | Open Orders und Cashflows fehlten im Modell | History pauschal als Trades behandelt | eigene Tabellen und Normalisierung | Test/Build bestätigt |
| mittel | Desktop/Mobile nutzten doppelte Statuslogik | getrennte statische Inhalte | gemeinsames INNO-Runtime-Modell | Konsistenztest bestätigt |
| mittel | White-Swan-Validator erwartete veraltete Struktur | feste 28 Komponenten und alte Gewichte | kanonische aktive Anzahl und aktuelle Gewichte | Validator bestätigt |
| mittel | Core-Invest-Sleeves waren zu positiv markiert | TV-Referenz als live-validiert | vier Sleeves auf partielle Validierung zurückgestuft | Parity-Bericht bestätigt |

## Quantitative Prüfung

Die neue zentrale Metrikberechnung verwendet sortierte, datumsdeduplizierte Reihen. Renditen werden geometrisch verknüpft. Annualisierung verwendet die tatsächliche Zeit zwischen erstem und letztem Datenpunkt. Volatilität und Sharpe basieren auf Sample-Standardabweichung und 252 Handelstagen. Drawdown wird gegen die High-Water-Mark berechnet.

Manuell nachrechenbare Regressionstests decken Annualisierung, Drawdown, Zeitzone, historischen Import, Quellenabgrenzung und OHLC-Reparatur ab.

## White Swan

- Kanonischer Stand: White Swan v1.3, sechs aktive Sleeves, Validator-Konsistenz 100 Prozent.
- Das aggregierte Live-Ergebnis ist damit nicht automatisch institutionell oder live validiert.
- Im Repository sind sieben saisonale Research-Muster auffindbar, nicht zehn.
- Für diese Muster fehlen ein vollständiger unabhängiger Datensatz, Multiple-Testing-Korrektur, belastbarer Walk-Forward-Nachweis und vollständige Kostenparität.
- Einstufung aller auffindbaren Saisonmuster: weiterer Forward-Test nötig.
- Für drei angeforderte Muster existiert keine prüfbare Repository-Evidenz; sie werden nicht erfunden.

## Core Invest

Der Parity-Bericht umfasst acht Komponenten. Vier passive Komponenten sind bereit, vier TV-Referenz-Sleeves sind nur partiell validiert. Gesamtstatus: nicht live-ready. Desktop und Mobile greifen für die geprüfte INNO-Track-Record-Sicht auf dasselbe zentrale Modell zu.

## OHLC-Datenqualität

Die zentrale Pipeline quarantänisiert nicht-finite, nicht-positive und robuste Ausreißer, repariert nachvollziehbar inkonsistente High-/Low-Bereiche und protokolliert Original, Korrektur, Methode, Quelle und Flags.

Der vorhandene Futures-Bericht bleibt fachlich offen:

- `HG1!`: Warnstatus, 47 verdächtige Nicht-Roll-Gaps; 23 weitere Gaps als wahrscheinliche Rolls klassifiziert.
- `6S1!`: Gesamturteil OK, aber vier verdächtige Sprünge und frühe Session-Lücken.

Damit sind die Reihen nicht pauschal fehlerfrei; die neue Pipeline verhindert nur eine stille Weiterverarbeitung erkannter Defekte.

## IBKR-Bereitschaft

Nicht produktionsbereit. Contract Mapping, `conId`, Tick Size, Multiplikator, Handelskalender, Rollregeln, Margin, Währungskonvertierung und Rundung sind nicht für alle Zielinstrumente vollständig belegt. QQQ, DAX, 6E und 6B bleiben vorläufig. CFDs werden nicht als freigegebene Zielinstrumente behandelt.

## Live-Datenarchitektur

Der separate `worker/` verwendet offizielle Providerpfade für Twelve Data, Finnhub und FRED sowie optional Alpaca/Barchart. Der Signal-Trigger nutzt aktuell Twelve Data und Finnhub als Realtime-Bestätigung. Eine exakt aus drei produktiv bestätigten Realtime-APIs bestehende Kette ist im Code nicht nachweisbar.

Zusätzlich existiert eine undokumentierte TradingView-Websocket-Nutzung. Ohne Lizenz-/Nutzungsnachweis darf sie nicht als offiziell freigegebener Standardfeed gelten. Keine neue Scraping- oder undokumentierte Integration wurde ergänzt.

## Vorher/Nachher

| Kennzahl/Verhalten | Vorher | Nachher |
|---|---|---|
| Annualisierung | nach Datenpunktzahl | nach realer Kalenderzeit |
| Sharpe | nicht annualisierter Proxy | annualisiert mit 252 Handelstagen |
| Myfxbook Login Snapshot | Session potenziell enthalten | Session redigiert |
| Darwinex URLs | angenommene Defaults | explizite offizielle Konfiguration |
| OHLC Defekte | teilweise still gefiltert/repariert | Quality Event plus Quarantäne/Repair |
| Core TV-Sleeves | `live_validated` | `partial_validation` |
| Gate Secret | clientseitig lesbar | serverseitiger Vergleich |

## Testnachweise

- `npm test`: 33/33 Tests bestanden
- `npm run validate:strategy-proof`: White Swan 6/6 und Core Invest 8/8 konsistent
- `npm run audit:encoding`: bestanden
- `npm run audit:github-safe`: bestanden
- `npm run build`: bestanden
- `npm run safe:predeploy`: bestanden

Die letzten vier Nachweise werden nach Abschluss aller Dokumentationsänderungen erneut ausgeführt.

## Offene Entscheidungen

1. Offizielle Berechtigung und zulässige Nutzung des TradingView-Feeds klären.
2. Drei verbindliche Realtime-Quellen mit Instrumentabdeckung, SLA und Fallback festlegen.
3. Vollständige zehn Saisonmuster samt Rohdaten und Hypothesenregister bereitstellen.
4. IBKR-Instrumentenstamm und regulatorische Freigabe abschließen.
5. Produktive Supabase-Migration und verteilten Sync-Lock kontrolliert einrichten.
6. Browserabnahme wiederholen; der In-App-Browser blockierte lokale/private URLs mit `ERR_BLOCKED_BY_CLIENT`.

## Betroffene Bereiche

Track Record, INNO Desktop/Mobile, OHLC Monitoring, White-Swan-Validator, Core-Invest-Status, Preview-Gate, Supabase-Schema, Env-Vorlage und Betriebsdokumentation.
