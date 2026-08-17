# Sentinel Connect — Local Setup Guide

Branch: `feat/sentinel-connect-omniroute`  
Date: 2026-08-17  

---

## Quick Start

### 1. Provider API Keys

Set in `.env.local` (never committed):

```env
# Free inference — required for Connect to route externally
GROQ_API_KEY=...           # groq/compound, openai/gpt-oss-120b, qwen/qwen3.6-27b
MISTRAL_API_KEY=...        # mistral-small-latest
COHERE_API_KEY=...         # command-r-plus-08-2024
CEREBRAS_API_KEY=...       # gemma-4-31b (402 = quota exhausted on free plan)

# Local Qwen router (Layer 1) — optional but recommended
OLLAMA_API_URL=http://localhost:11434

# Paid inference — OFF by default, uncomment to enable
# SENTINEL_ALLOW_PAID_API=true
# ANTHROPIC_API_KEY=...
# OPENAI_API_KEY=...
```

### 2. Ollama + Qwen3 (Layer 1 Router)

**Already installed** on Jeroen's machine at `C:\Users\joris\AppData\Local\Programs\Ollama\ollama.exe`.

```powershell
# Start Ollama (if not running)
& "C:\Users\joris\AppData\Local\Programs\Ollama\ollama.exe" serve

# Pull Qwen3:1.7b if not present (1.27 GB, fits RTX 3050 Ti 4GB VRAM)
ollama pull qwen3:1.7b

# Verify
curl http://localhost:11434/api/tags
```

Ollama auto-starts on machine boot with the Ollama tray app. If unavailable, Connect falls back silently to Layer 0 heuristic routing.

---

## Architecture: 3-Layer Routing

```
User message
      │
      ▼
Layer 0: Heuristic (<5ms)
  - credential/path patterns → LOCAL_ONLY immediately
  - word count < 4 → LOCAL_ONLY
  - tool-first (trade count, status) → LOCAL_ONLY
  - no Ollama call needed
      │
      ▼ (non-obvious cases only)
Layer 1: Qwen3:1.7b via Ollama (~1-2s warm)
  - intent classification
  - privacy level (LOCAL_ONLY / REMOTE_REDACTED / REMOTE_SAFE)
  - routing mode selection
  - brain_required flag
  - 4s timeout → fallback to Layer 0 heuristic
      │
      ▼
Layer 2: OmniRoute execution
  - Brain inject (if requiresBrain)
  - Graphify inject (if requiresGraphify)
  - Provider dispatch per routing mode
  - ConnectRun provenance logging
```

---

## Routing Modes

| Mode | Description | Providers |
|---|---|---|
| `LOCAL_ONLY` | No external API call | Local Brain/tools only |
| `FASTEST_FREE` | Cheapest available free provider | Groq compound-mini or Cerebras |
| `SINGLE_BEST` | Best provider for the task | Selected by OmniRoute |
| `REASONER_PLUS_CRITIC` | 2 workers: reasoner + critic | 2 free providers |
| `PARALLEL_ENSEMBLE` | 3-4 workers, local synthesis | 3-4 free providers |
| `FALLBACK_CHAIN` | Try in order until one succeeds | All configured |

---

## Provider Status (2026-08-17)

| Provider | API Test | Model | Notes |
|---|---|---|---|
| **Groq** | ✅ PASS 719ms | `groq/compound-mini` | Compound family, old Llama lineup retired |
| **Mistral** | ✅ PASS 753ms | `mistral-small-latest` | Stable |
| **Cohere** | ✅ PASS 2659ms | `command-r-plus-08-2024` | 2.7s latency — not ideal for FASTEST_FREE |
| **Cerebras** | ⚠️ 402 | `gemma-4-31b` | Quota exhausted on free tier; key valid |
| **Qwen3:1.7b** | ✅ Local | via Ollama | Layer 1 router, ~1s warm, ~9s cold start |
| **Gemini** | ❌ not configured | — | GEMINI_API_KEY not set |
| **OpenRouter** | ❌ not configured | — | OPENROUTER_API_KEY not set |

---

## Qwen3 Routing Accuracy (5/5 test cases)

| Query | Mode | Privacy | Brain | Notes |
|---|---|---|---|---|
| "What is CAGR?" | FASTEST_FREE | REMOTE_SAFE | No | ✅ Generic finance term |
| "my api_key is abc123" | LOCAL_ONLY | LOCAL_ONLY | Yes | ✅ Credential detected |
| "White Swan MaxDD?" | SINGLE_BEST | REMOTE_REDACTED | Yes | ✅ Capitalife private |
| "how many trades active?" | LOCAL_ONLY | REMOTE_SAFE | No | ✅ Tool-first |
| "Compare White Swan vNext" | SINGLE_BEST | REMOTE_REDACTED | Yes | ✅ Capitalife private |

---

## Privacy Levels

| Level | Description | Can go external? |
|---|---|---|
| `LOCAL_ONLY` | Credentials, paths, broker data | **No** — blocked entirely |
| `REMOTE_REDACTED` | Capitalife-specific (White Swan, FSPortfolio, track record) | Only after sanitization |
| `REMOTE_SAFE` | Generic finance/code questions | Yes — full text |

Sanitization replaces: account numbers, local paths, email addresses, CAPITALIFE_BRAIN_PATH.

---

## Settings UI

Navigate to `/settings` → **Sentinel Connect** section shows:
- Provider count (configured / healthy)
- Today's ConnectRun stats (total / local / remote / ensemble)
- Per-provider status (ready / quota blocked / key missing)
- Brain cache status
- Graphify index stats
- .env.local key reference

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/sentinel/connect` | POST | Main orchestration (stream + non-stream) |
| `/api/sentinel/connect/providers` | GET | Safe provider status (no keys) |
| `/api/sentinel/connect/health` | GET | Component health check |

### POST /api/sentinel/connect

```json
{
  "messages": [{"role": "user", "content": "What is CAGR?"}],
  "mode": "auto",
  "stream": false
}
```

Response headers (streaming): `X-Connect-RunId`, `X-Connect-Privacy`, `X-Connect-Route`, `X-Connect-Brain`, `X-Connect-Provider`.

---

## ConnectRun Ledger

Provenance logged to `.runtime/sentinel/connect-runs/runs-YYYY-MM-DD.ndjson`.

Each run: `id`, `timestamp`, `requestPreview` (80 chars), `privacyLevel`, `route`, `brainSources`, `workers`, `synthesisProvider`, `status`.

Rotates at 5MB. Never committed. Contains no raw prompts or responses.

---

## Free Firewall

- **No paid inference by default** (`SENTINEL_ALLOW_PAID_API` not set)
- `QUOTA_RESERVE_RATIO = 0.20` — 20% of free capacity held in reserve
- Circuit breakers: 429→1min (5min after 3x), 402→24h, 5xx→30s
- `deep` mode bypasses quota reserve but not paid firewall
