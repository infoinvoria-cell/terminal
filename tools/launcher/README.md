# Capitalife Desktop Launcher

Der Launcher startet das Capitalife Terminal lokal, prueft die wichtigsten lokalen Abhaengigkeiten und oeffnet danach `http://localhost:3000`.

## Dateien

- `start-capitalife-dashboard.ps1`: Hauptlauncher mit Checks, Logging und Browser-Start
- `start-capitalife-dashboard.bat`: Windows-Wrapper fuer Doppelklick und Shortcut
- `create-desktop-shortcut.ps1`: erstellt `Capitalife Dashboard.lnk` auf dem Desktop des aktuellen Users
- `capitalife.ico`: Desktop-Icon auf Basis des vorhandenen Capitalife-Brandings
- `logs/`: Launcher- und Next-Dev-Logs

## Checks

- Dashboard-Projektpfad und `package.json`
- `Capitalife Brain` Pfad
- `.env.local` vorhanden oder Warnung
- `node --version` und `npm --version`
- `http://localhost:3000`
- `http://localhost:3000/api/sentinel/health`
- `http://localhost:3000/api/market-data/status`
- `http://127.0.0.1:11434/api/tags`
- Invoria-Dashboard-Pfad
- TradingView-Cache-Pfad

## Pfad-Konfiguration

Der Launcher leitet den Repo-Root aus dem eigenen Skript-Pfad ab. Die Nachbar-Pfade
werden per ENV aufgeloest; ohne ENV wird der jeweilige Ordner **neben** dem Repo erwartet.

| ENV-Variable | Fallback (neben dem Repo) |
|---|---|
| `CAPITALIFE_BRAIN_PATH` | `../Capitalife Brain` |
| `INVORIA_DASHBOARD_PATH` | `../Invoria Dashboard` |
| `INVORIA_MONITORING_CACHE_DIR` | `../.capitalife-cache/invoria-monitoring` |
| `TRADINGVIEW_CACHE_DIR` | `../.capitalife-cache/market-data/tradingview` |

Fehlende Pfade fuehren zu einer Warnung, nicht zum Abbruch.

## Shortcut neu erstellen

```powershell
npm run create-shortcut
```

Alternativ:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/launcher/create-desktop-shortcut.ps1
```

## Fehlerbehebung

- `npm install`
- `npm run dev`
- Ollama lokal starten
- `.env.local` auf notwendige lokale Konfiguration pruefen

## Hinweis

- keine Orders
- keine Execution
- keine Live-Trading-Freigabe
- nur lokaler Start und technische Checks
