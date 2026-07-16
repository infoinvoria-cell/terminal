# Sentinel Providers

Sentinel laeuft standardmaessig im Local-Only-Modus ueber Ollama. Kostenpflichtige APIs bleiben optional fuer spaeter, sind zur Laufzeit aber standardmaessig deaktiviert.

## Local / Ollama Setup

1. Ollama installieren: [ollama.com](https://ollama.com)
2. Modell laden:
```bash
ollama pull qwen3:14b
```
3. Ollama starten:
```bash
ollama serve
```
4. In `.env.local`:
```env
SENTINEL_PROVIDER_MODE=local
SENTINEL_DEFAULT_PROVIDER=local
SENTINEL_ALLOW_PAID_API=false
SENTINEL_ALLOW_CUSTOM_API=false
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:14b
OLLAMA_THINK=false
SENTINEL_LOCAL_TIMEOUT_MS=30000
```

## OpenAI Setup

Optional. Kein Key im Repo.

```env
OPENAI_API_KEY=
OPENAI_MODEL=
```

- Wenn `OPENAI_API_KEY` fehlt, zeigt Sentinel `key missing`.
- Wenn ein Key vorhanden ist, nutzt Sentinel das konfigurierte Modell oder einen validen Fallback aus der OpenAI-Modellliste.

## Claude / Anthropic Setup

Optional. Kein Key im Repo.

```env
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
```

- Wenn `ANTHROPIC_API_KEY` fehlt, zeigt Sentinel `key missing`.
- Claude ist als Single-Response-Provider vorbereitet.

## Custom Chat API Setup

Für Partner oder spätere externe Chat-KI.

```env
CUSTOM_CHAT_API_URL=
CUSTOM_CHAT_API_KEY=
CUSTOM_CHAT_MODEL=
```

- Erwartet einen POST-Endpunkt mit Chat-Messages.
- Sentinel gibt keine Secrets an den Client zurück.

## Partner Mode

```env
SENTINEL_PARTNER_MODE=true
SENTINEL_REQUIRE_LOCAL_FALLBACK=true
```

- Brain-Pfad wird optional.
- Wenn Brain fehlt, läuft Sentinel in generischem/localem Kontext weiter.
- Kein Capitalife-spezifischer Key oder Pfad ist hart vorausgesetzt.

## Brain Context Mode

Gezielt geladen werden:
- `09_AI/AI_PROJECT_BRAIN_CURRENT.md`
- `09_AI/dashboard_snapshot.json`
- optional `00_Index/Open Issues.md`
- optional `00_Index/Next Actions.md`

Nicht geladen:
- kompletter Vault-Scan
- blindes Rekursivlesen aller Brain-Dateien

Wenn Brain fehlt:
- Status: `Brain missing`
- Meldung: `Brain context unavailable, running generic/local context mode`

## Fallback Regeln

- `auto`: bevorzugter Provider aus ENV, sonst Fallback-Kette
- lokal bleibt Standard
- wenn lokaler Provider ausfällt und API-Provider verfügbar ist, kann der Router ausweichen
- wenn alle Provider fehlen/offline sind:
  `Kein Provider verfügbar. Starte Ollama oder setze OPENAI_API_KEY / ANTHROPIC_API_KEY.`

## Status UI

Sentinel zeigt dezent:
- Active Provider
- Local Status
- OpenAI Status
- Claude Status
- Brain Status
- Router Mode

Keine Keys. Keine ENV-Dumps. Keine große Admin-Tabelle.

## API Routen

- `POST /api/sentinel/chat`
- `GET /api/sentinel/status`
- `GET /api/sentinel/health`

Die Status-Routen geben nur Verfügbarkeit, Modellnamen und Gründe zurück. Keine Secrets.

## Constraints

- Keine Live Execution
- Kein Broker
- Keine Orderausführung
- Keine Finanzportfolioverwaltung
- Keine Secrets committen


## Local-Only Mode

- Standardmodus wegen API-Kosten
- keine OpenAI-, Claude- oder Custom-API-Calls zur Laufzeit
- Ollama ist erforderlich
- empfohlene lokale Modelle: `qwen3:14b`, danach starke installierte `llama`, `mistral`, `gemma` Varianten
- `SENTINEL_ALLOW_PAID_API=false`
- `SENTINEL_ALLOW_CUSTOM_API=false`
- API-Provider bleiben nur als optionale spaetere Erweiterung im Code

Im Local-Only-Modus gilt:
- Router-Kandidatenliste = nur `local`
- Status UI zeigt `Local`, `Brain`, `Mode: local`, `APIs: disabled`
- `CUSTOM_CHAT_API_URL missing` darf nicht sichtbar erscheinen
- Wenn Ollama offline ist: `Lokales Modell offline. Starte Ollama unter http://localhost:11434.`
