# Invoria Bridge

Stand: 2026-07-07

## Zweck

Die Bridge bereitet eine spaetere, strikt read-only Verbindung zwischen Capitalife Brain, Invoria Dashboard und Capitalife Terminal vor.

## Rollen

- Capitalife Brain: Source of truth fuer Dokumentation, Governance, Datenraum und freigegebene Referenzdaten.
- Invoria Dashboard: Technische Quelle fuer Monitoring, Trading-Telemetrie und Systemstatus.
- Capitalife Terminal: UI-Schicht fuer spaetere, manuell freigegebene Darstellung.

## Guardrails

- Kein Live-Trading
- Kein Orderrouting
- Kein Writeback in externe Systeme
- Kein Blindimport
- Keine Secrets im Repository
- Bridge standardmaessig deaktiviert

## Relevante Dateien

- `src/config/data-sources.ts`
- `src/lib/data-sources/source-registry.ts`
- `src/lib/invoria/invoria-types.ts`
- `src/lib/invoria/invoria-readonly-adapter.ts`
- `src/lib/capitalife/capitalife-brain-adapter.ts`
