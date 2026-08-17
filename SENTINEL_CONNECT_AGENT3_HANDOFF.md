# Sentinel Connect — Agent 3 Handoff

Branch: `feat/sentinel-connect-omniroute`  
Commits: `509d347` (Phase 1) → `d34749b` (Phase 2: Qwen router) → `b647efb` (Phase 2: Setup UI)  
Date: 2026-08-17  
Ahead of origin: 0 (all pushed)

---

## What Was Built

### Phase 1 (509d347)
Complete OmniRoute orchestration layer:
- Privacy classifier (LOCAL_ONLY / REMOTE_REDACTED / REMOTE_SAFE)
- Layer 0 heuristic local router
- Parallel ensemble (2-4 workers, local synthesis)
- ConnectRun provenance (NDJSON ledger)
- `/api/sentinel/connect` orchestration endpoint
- `/api/sentinel/connect/providers` — safe status API
- `/api/sentinel/connect/health` — health check
- `ConnectPrivacyBadge.tsx`, `ConnectRouteDetails.tsx` UI components
- 25 unit tests (25/25 pass)
- Architecture docs: SENTINEL_CONNECT_ARCHITECTURE.md, SENTINEL_CONNECT_PRIVACY.md, etc.

### Phase 2 (d34749b + b647efb)
- **qwen-router.ts**: Qwen3:1.7b via Ollama as Layer 1 routing classifier
  - `think=false` + `/no_think` prefix to suppress CoT output
  - 4s timeout, 30s availability cache, schema validation, fallback to heuristic
- **local-router.ts**: wired Layer 0 → Layer 1 (Qwen) → Layer 0 fallback
- **SettingsPage.tsx**: Sentinel Connect section with live provider/brain/graphify status
- **topbar.tsx**: upgraded nav search (icons, categories, aliases)
- Provider model updates: Groq→`groq/compound`, Cerebras→`gemma-4-31b`

---

## File Map

```
src/lib/sentinel/connect/
  connect-types.ts        — shared types (ConnectRoutingMode, ConnectMode)
  privacy-classifier.ts   — classifyPrivacy(), canSendToRemote(), getTextForProvider()
  local-router.ts         — Layer 0 + Layer 1 (Qwen) router
  qwen-router.ts          — Qwen3:1.7b Ollama client + schema validation
  connect-router.ts       — connectChat(), connectStream(), main orchestration
  connect-run.ts          — ConnectRun type, NDJSON ledger, getTodayStats()
  ensemble.ts             — runEnsemble(), runReasonerPlusCritic()

src/app/api/sentinel/connect/
  route.ts                — POST /api/sentinel/connect
  providers/route.ts      — GET /api/sentinel/connect/providers
  health/route.ts         — GET /api/sentinel/connect/health

src/components/sentinel/connect/
  ConnectPrivacyBadge.tsx — LOCAL/SANITIZED REMOTE/REMOTE indicator
  ConnectRouteDetails.tsx — expandable route panel

src/components/settings/SettingsPage.tsx  — Sentinel Connect section

src/lib/sentinel/__tests__/
  connect-privacy.test.ts       — 12 privacy classifier tests
  connect-local-router.test.ts  — 10 local router tests
  connect-run.test.ts           — 3 provenance ledger tests
```

---

## Runtime Requirements

- **Ollama** running at `http://localhost:11434` (auto-detect, graceful fallback)
- **qwen3:1.7b** model pulled (1.27 GB, RTX 3050 Ti VRAM safe)
- Provider keys in `.env.local` (see SENTINEL_CONNECT_LOCAL_SETUP.md)
- Paid inference OFF by default (`SENTINEL_ALLOW_PAID_API` not set)

---

## Integration Points for Agent 3

### Wire Connect into Sentinel UI

The Connect endpoint is ready. To use it from the Sentinel chat UI:

```typescript
// Replace the existing /api/sentinel/chat call with:
const res = await fetch("/api/sentinel/connect", {
  method: "POST",
  body: JSON.stringify({ messages, mode: "auto", stream: true }),
  headers: { "Content-Type": "application/json" },
});

// Read X-Connect-* headers for route details
const runId = res.headers.get("X-Connect-RunId");
const privacy = res.headers.get("X-Connect-Privacy");
const route = res.headers.get("X-Connect-Route");
```

### Show Route Details in Chat

```typescript
import { ConnectPrivacyBadge } from "@/components/sentinel/connect/ConnectPrivacyBadge";
import { ConnectRouteDetails } from "@/components/sentinel/connect/ConnectRouteDetails";

// After response arrives:
<ConnectPrivacyBadge level={privacy} />
<ConnectRouteDetails run={connectRun} />
```

### Mode Selector (optional)

Three user-facing modes: `auto` / `local` / `deep`

```typescript
type ConnectMode = "auto" | "local" | "deep";
```

- `auto`: Qwen decides, respects quota reserve
- `local`: forces LOCAL_ONLY, no external calls
- `deep`: bypasses 20% quota reserve, same privacy rules

---

## Known Issues / Pre-existing

- `sentinel-voice-backend.test.ts` — 10 failures: `invalidateTTSHealthCache is not a function`
  This is a pre-existing issue from the voice integration branch merge, not related to Connect.
  
- `WhiteSwanV7Clean.tsx` — 3 TS errors: Recharts formatter type mismatch
  Pre-existing, not in Connect scope.

- Turbopack warnings (2): `white-swan-robustness/route.ts` uses `path.join`
  Pre-existing, build still passes.

- Cerebras 402: Free plan quota exhausted. Key is valid, fallback to Mistral/Groq.

---

## Tests

```bash
npx vitest run src/lib/sentinel/__tests__/connect-*.test.ts
# → 25/25 PASS

npm run build
# → BUILD_PASS (b647efb head)

npm run audit:github-safe
# → [PASS] github-safe audit clean
```

---

## What Agent 3 Should Do Next

1. **Wire Connect endpoint into SentinelDashboard** — replace `/api/sentinel/chat` or `/api/sentinel/stream` with `/api/sentinel/connect`
2. **Add ConnectPrivacyBadge + ConnectRouteDetails** to the chat message display
3. **Add mode selector** (auto/local/deep) to the Sentinel toolbar
4. **Test end-to-end** with real Brain + real Groq/Mistral
5. **Merge** `feat/sentinel-connect-omniroute` → `main` when E2E is verified
