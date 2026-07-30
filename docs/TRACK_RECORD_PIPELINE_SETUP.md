# Track Record Pipeline

## Datenbasis

- Monatsrenditen: `src/data/capitalife/performance-monthly.json`
- Lokales MT4-Statement: `src/data/capitalife/account1-mt4-trades.json`
- Sichtbare Myfxbook-Historie: `src/data/capitalife/account2-myfxbook-visible-trades.json`
- KPI-Anker: `src/data/capitalife/white-swan-combined-evidence.json` und `src/data/capitalife/white-swan-official-kpis.json`

Historische Werte werden normalisiert, aber nicht überschrieben. Live-Importe werden append-only ergänzt. Fehlende, git-ignorierte Rohdateien führen im Cloud-Build zu einer expliziten Datenlücke und nicht zu erfundenen Ersatzdaten.

## Server-Umgebung

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TRACK_RECORD_SYNC_MODE=mock
TRACK_RECORD_SYNC_TOKEN=
TRACK_RECORD_ALLOW_UNAUTHENTICATED_LOCAL=0

MYFXBOOK_EMAIL=
MYFXBOOK_PASSWORD=
MYFXBOOK_ACCOUNT_ID=
MYFXBOOK_BROKER_TIMEZONE=Europe/Berlin

DARWINEX_ACCESS_TOKEN=
DARWINEX_CLIENT_ID=
DARWINEX_CLIENT_SECRET=
DARWINEX_REFRESH_TOKEN=
DARWINEX_PRODUCT_ID=
DARWINEX_TOKEN_URL=
DARWINEX_INFO_URL=
DARWINEX_HISTORY_URL=
DARWINEX_QUOTES_URL=
DARWINEX_INVESTOR_URL=

VERCEL_STATIC_IPS_ENABLED=false
```

Alle Provider-Werte sind server-only. `MYFXBOOK_BROKER_TIMEZONE` muss ein IANA-Zeitzonenname sein. Darwinex-URLs müssen aus dem für den Account freigeschalteten offiziellen API-Store-Produkt stammen; die Anwendung rät keine Endpunkte.

## Schema und Migration

Die idempotente Migration liegt unter `supabase/migrations/20260730_track_record_pipeline.sql`. Vor einem Persistenzlauf:

1. Zielschema und vorhandene Policies sichern.
2. Migration zuerst gegen eine nicht-produktive Kopie ausführen.
3. Prüfen, dass `anon` und `authenticated` keine Track-Record-Tabellen lesen können.
4. Historischen Sync mit `persist=0` ausführen und Counts/Hashes prüfen.
5. Erst danach `persist=1` gegen die bestätigte Zielinstanz ausführen.

`supabase/schema.sql` enthält denselben service-role-only Zielzustand. Die Pipeline verwendet:

- `track_record_raw_snapshots`
- `accounts`
- `daily_equity`
- `daily_returns`
- `monthly_returns`
- `open_positions`
- `open_orders`
- `closed_trades`
- `cashflows`
- `track_record_metrics`
- `source_sync_status`
- `ohlc_quality_events`

Raw Snapshots und historische Serien sind unveränderlich. Provider-Status und aktuell offene Positionen/Orders dürfen anhand stabiler Schlüssel aktualisiert werden.

Der lokale Read-only-Verbindungstest am 2026-07-30 wurde von der konfigurierten Instanz mit HTTP 401 abgewiesen. Deshalb wurden weder Backup noch Migration oder Persistenz gegen eine produktive Datenbank ausgeführt. Die UI bleibt bis zu einem erfolgreichen Persistenz- und Count-Test auf `Produktive DB-Migration ausstehend`.

## API

- Übersicht: `GET /api/track-record/overview`
- Sync: `POST /api/track-record/sync?provider=historical|myfxbook|darwinex|all&mode=mock|live&persist=0|1`

Der Sync benötigt `Authorization: Bearer <TRACK_RECORD_SYNC_TOKEN>` oder `x-track-record-token`. Ein tokenloser lokaler Lauf ist nur außerhalb Vercel und nur mit `TRACK_RECORD_ALLOW_UNAUTHENTICATED_LOCAL=1` möglich.

```bash
curl -X POST "http://localhost:3000/api/track-record/sync?provider=historical&mode=live&persist=0" ^
  -H "x-track-record-token: <TRACK_RECORD_SYNC_TOKEN>"
```

Für Live-Provider zuerst immer `persist=0`, Antworten und Account-/Product-Zuordnung prüfen und erst danach `persist=1` ausführen.

## Betrieb

- Myfxbook Account, Trades und Orders: alle 10 Minuten
- Myfxbook Daily Data: täglich und nach relevanten Updates
- Darwinex Snapshot: alle 30 Minuten
- Darwinex historische Daten oder berechtigte FTP-Daten: täglich
- Kennzahlen: nach jedem erfolgreichen Import

Myfxbook-Sessions sind IP-gebunden. `VERCEL_STATIC_IPS_ENABLED=true` darf nur gesetzt werden, wenn feste ausgehende IPs tatsächlich eingerichtet und geprüft wurden. Andernfalls läuft der Myfxbook-Sync in einem separaten Worker mit fester Egress-IP; das Terminal liest ausschließlich aus Supabase/API.

Der vorhandene `worker/` ist die geeignete Deployment-Grenze, benötigt für Myfxbook aber noch Provider-Aufruf, Scheduler und denselben DB-Importvertrag. Secrets bleiben ausschließlich in der Worker-Umgebung.

## Grenzen

- `get-history` liefert nur die letzten 50 Myfxbook-Transaktionen. Vollständigkeit entsteht durch regelmäßige, deduplizierte append-only Importe.
- Exakte Myfxbook-UTC-Normalisierung setzt die korrekte Broker-IANA-Zeitzone voraus.
- Darwinex-Capabilities hängen von Product-ID und API-Berechtigungen ab; nicht berechtigte Daten bleiben `nicht verfügbar`.
- Der aktuelle Sync-Lock ist instanzlokal. Für mehrere parallele Worker ist vor Produktivbetrieb ein DB-basierter Lease/Lock erforderlich.
- Ein erfolgreiches Mock-Ergebnis ist kein Live-Nachweis und erzeugt keine Verifizierungsbadges.
