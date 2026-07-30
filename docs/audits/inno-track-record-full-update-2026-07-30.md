# INNO Track Record Full Update

Stand: 2026-07-30

## Executive Summary

Die INNO-Ansicht verwendet auf Desktop und Mobile nun dieselbe zentrale Track-Record-Übersicht. Die lokal verfügbare Historie wird append-only normalisiert und klar von Myfxbook-, Darwinex-, Broker- und intern berechneten Daten getrennt. Live-Verbindungen sind technisch vorbereitet, aber mangels Credentials und nachgewiesener fester Myfxbook-Egress-IP nicht mit echten Providerdaten verifiziert.

## Datenarchitektur

Die Pipeline besteht aus Provider-Collectoren, normalisierten Typen, zentraler Metrikberechnung, Repository, Service und zwei Server-Routen. Raw Snapshots enthalten Quelle, Abrufzeit, maskierte Provider-ID, unveränderte fachliche Antwort, API-Version und Hash. Secrets, Session-IDs, Kontonummern und Personendaten werden nicht öffentlich ausgegeben.

Normalisierte Tabellen:

- Accounts
- tägliche Equity und Renditen
- Monatsrenditen
- offene Positionen und Orders
- geschlossene Trades und Cashflows
- Kennzahlen und Sync-Status
- unveränderliche Raw Snapshots

## Historische Quellen und Import

- Zeitraum der Monatsdaten: 2024-04-11 bis 2026-07-01
- Monatsrenditen: 28
- Lokal normalisierte Teil-Statement-Trades: 89
- Sichtbare Account-2-Myfxbook-Trades: nur wenn die lokale, git-ignorierte Datei vorhanden ist
- Letztes belastbares historisches Datum: automatisch aus den vorhandenen Quellen

Bewertung: historischer Import im Anwendungsmodell vollständig implementiert, aber nicht produktiv in Supabase persistiert. Die vollständige Brokerhistorie, tägliche Equity, vollständige Cashflows und lückenlose Kosten sind nicht vorhanden.

## Live-Provider

### Myfxbook

Implementiert sind Login, Accountübersicht, offene Trades, offene Orders, History, Daily Gain und Data Daily. History-Datensätze werden stabil dedupliziert und append-only gespeichert. Broker-Lokalzeiten werden über eine konfigurierte IANA-Zeitzone nach UTC normalisiert. Login-Sessions werden nicht gespeichert oder geloggt.

Status: durch Credentials und feste Egress-IP blockiert. `get-history` umfasst nur die letzten 50 Transaktionen; ein vollständiger Bestand benötigt regelmäßige Worker-Syncs.

Benötigt:

- `MYFXBOOK_EMAIL`
- `MYFXBOOK_PASSWORD`
- `MYFXBOOK_ACCOUNT_ID`
- `MYFXBOOK_BROKER_TIMEZONE`
- feste ausgehende Worker-IP

### Darwinex

Implementiert sind separater DARWIN-Datenstatus, Quote-/Return-Normalisierung, Capability-Fehler, Access Token oder OAuth Refresh und explizite offizielle API-Store-URLs.

Status: durch Credentials, Product-ID und freigeschaltete Endpoint-URLs blockiert. Investor-Daten werden nicht mit Traderkonto- oder DARWIN-Daten vermischt.

Benötigt:

- `DARWINEX_PRODUCT_ID`
- `DARWINEX_ACCESS_TOKEN` oder OAuth Client/Secret/Refresh Token
- `DARWINEX_TOKEN_URL`
- `DARWINEX_INFO_URL`
- `DARWINEX_HISTORY_URL`
- optionale berechtigte Quotes-/Investor-URLs

## Credentials und Infrastruktur

Bei der Prüfung waren keine Myfxbook- oder Darwinex-Credentials, keine Account-/Product-ID und kein Track-Record-Sync-Token gesetzt. Eine feste Vercel-Egress-IP war nicht nachgewiesen. Vorhandene Supabase-Konfiguration ist kein Nachweis, dass das neue Schema bereits auf der richtigen produktiven Instanz angewendet wurde.

Der vorhandene separate Worker ist die richtige Grenze für Myfxbook mit fester IP. Vor Produktivbetrieb fehlen dort Provider-Scheduler, DB-basierter Lease/Lock und ein kontrollierter Schema-/Persistenztest.

## Berechnungsmethoden

- Gesamtperformance: geometrische Verknüpfung der Monatsrenditen
- Annualisierung: `(1 + Gesamtrendite)^(1 / Kalenderjahre) - 1`
- Volatilität: Sample-Standardabweichung täglicher Renditen mal `sqrt(252)`
- Sharpe: annualisierter Mittelwert geteilt durch annualisierte Volatilität
- Sortino: annualisierte Rendite relativ zur Downside-Abweichung
- Drawdown: Rückgang vom jeweils höchsten Equity-Wert
- Calmar: annualisierte Rendite geteilt durch maximalen Drawdown

Die Werte enthalten Quelle, Zeitraum, Methode und Berechnungsversion.

## Performance und Risiko

| Kennzahl | Wert | Einordnung |
|---|---:|---|
| dokumentierte kombinierte Performance | 97,2 % | Sekundär-/Berichtsanker |
| dokumentierte komponierte Performance | 114,6 % | Sekundär-/Berichtsanker |
| geometrisch aus 28 Monatswerten | 114,48 % | intern berechnet |
| dokumentierte Annualisierung | 35,2 % | Berichtsanker |
| aus 97,2 % über 2,2204 Jahre | 35,77 % | intern neu berechnet |
| aus 114,48 % über denselben Zeitraum | 41,01 % | monatlich geometrischer CAGR |
| dokumentierter Max Drawdown | -11,76 % | Berichtsanker |
| dokumentierte Sharpe | 1,6 | Berichtsanker |
| dokumentierter Calmar | 3,0 | Berichtsanker |

35,2 und 35,77 Prozent werden nicht als derselbe Rechenwert ausgegeben: 35,2 ist der dokumentierte Berichtswert, dessen ursprüngliche Formel und Randmonatsbehandlung nicht belegt sind. 35,77 ist die reproduzierbare Neuberechnung aus 97,2 Prozent über 2024-04-11 bis 2026-07-01 (`2,2204` Kalenderjahre). 41,01 Prozent ist ein nicht direkt vergleichbarer Alternativwert aus der geometrischen Verkettung aller 28 Monatswerte, einschließlich der beiden unvollständigen Randperioden. Eine eigenständige Cashflow-Bereinigung ist für diese Monatsreihe nicht nachweisbar.

Win Rate 29,21 Prozent und Profit Factor 0,9345 beziehen sich ausschließlich auf die lokal vorhandene Account-1-Teilperiode mit 89 Trades. Sie dürfen nicht als Kennzahl des vollständigen kombinierten Track Records verwendet werden.

## Kosten und Datenlücken

Kommissionen, Swaps und sonstige Kosten werden nur verwendet, wenn sie pro Transaktion belegt sind. Es fehlen vollständige Broker-Rohdaten, tägliche Equity, vollständige Ein-/Auszahlungen, lückenlose Kosten, offene historische Positionen und ein vollständiger Account-2-Export. Daher werden keine simulierten Equity- oder Drawdown-Kurven angezeigt.

## INNO- und CTO-Bereitschaft

Desktop und Mobile laden dieselbe serverseitige Übersicht und dasselbe Runtime-Modell. Providerstatus, Datenalter, Historienstatus, Konflikte und Bereitschaft werden dynamisch abgeleitet. Mock-Daten erzeugen weder `Live` noch Verifizierungsbadges.

Aktueller Status:

- Historische Basis: vorhanden, aber partiell
- Myfxbook: nicht konfiguriert
- Darwinex: nicht konfiguriert
- letzter erfolgreicher Live-Sync: keiner
- Datenqualität: partiell
- CTO-Bereitschaft: blockiert durch Live-Evidenz, Rohdaten, feste IP und produktive Persistenz

## Tests

- historischer Import und Monatsanzahl
- Append-only-/Deduplizierungsverhalten
- echte Kalenderannualisierung
- Drawdown und Providertrennung
- IANA-Zeitzone inklusive Sommerzeit
- OHLC-Qualitätsereignisse
- Desktop-/Mobile-Konsistenz
- Mock-/Live-Trennung und fehlende Credentials

Ergebnis nach der finalen lokalen Fachprüfung: 44/44 Tests bestanden. Build und Safe-Predeploy werden nach dem finalen Stand erneut ausgeführt.

## Deployment

Es wurde keine produktive Datenbankmigration und kein Live-Provider-Sync ausgeführt, weil Zielinstanz, Credentials und feste Egress-IP nicht ausreichend belegt sind. Es wurden keine Secrets geschrieben oder geloggt.

Reihenfolge für die Inbetriebnahme:

1. Ziel-Supabase und Backup bestätigen, Schema kontrolliert anwenden.
2. Historischen Import mit `persist=0`, dann `persist=1` prüfen.
3. Worker mit fester Egress-IP bereitstellen.
4. Myfxbook-Credentials, Account-ID und Broker-Zeitzone setzen.
5. Darwinex-Product-ID, OAuth und offizielle API-Store-URLs setzen.
6. Provider einzeln mit `persist=0` gegen Originalantworten prüfen.
7. Persistenz, DB-Lock, Cron, Fehler- und Stale-Monitoring aktivieren.
8. INNO Desktop und Mobile mit echten Daten im Browser abnehmen.

## Abschlussklassifikation

- Vollständig implementiert: zentrale Typen, Historiennormalisierung, Import-Integritätsprüfung, Metriken, Providertrennung, APIs, UI-Modell, Desktop/Mobile-Konsistenz, Sicherheitsredaktion und idempotente service-role-only Migration.
- Mit echten Daten verifiziert: lokale 28 Monatswerte und 89 Teil-Statement-Trades.
- Technisch vorbereitet: Myfxbook, Darwinex, Supabase-Persistenz, Worker-Übergabe, Sync-Status.
- Durch Credentials blockiert: beide Live-Provider.
- Durch feste IP blockiert: produktiver Myfxbook-Sync.
- Durch produktive DB-Migration blockiert: persistierter historischer Import und produktiver Sync-Status.
- Durch fehlende Rohdaten blockiert: vollständige Equity-/Drawdown-Kurven, Cashflow-/Kostenanalyse und vollständige Trade-Kennzahlen.
