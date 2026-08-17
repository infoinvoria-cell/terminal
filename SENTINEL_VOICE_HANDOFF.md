# Sentinel Voice — Agent 4 Handoff

Branch: `feat/sentinel-voice-integration`  
Base: `5b68c10` (Agent 3 Mobile Sentinel final)  
Head: `ae1d57b`  
Date: 2026-08-17

---

## What Was Delivered

### 1. TTS Engine Research — FROZEN

| Engine | Verdict | Default Eligible |
|---|---|---|
| Kokoro-82M (Python sidecar) | ✅ PASS — all 4 voices, real audio | **YES** |
| Kokoro-82M (browser, kokoro-js) | ✅ PASS — real audio in real browser tab | Mobile/Vercel path |
| MeloTTS | ❌ FAIL — broken PyPI package (missing requirements.txt) | NO |
| Piper en_GB-alan | ✅ PASS — but clipped audio + unclear voice license | BENCHMARK_ONLY |
| OpenVoice V2 | ⛔ Not attempted — no PyPI, MeloTTS dep broken | FUTURE_OPTION |

**DEFAULT: `kokoro:bm_george` — FINAL.** Real benchmark data in `SENTINEL_VOICE_BENCHMARK.md`.

### 2. New Files

| File | Purpose |
|---|---|
| `src/lib/sentinel/sentinel-voice.ts` | Core voice library — spokenBrief, pronunciation, browser TTS, language detection |
| `src/lib/sentinel/browser-kokoro.ts` | Browser-local Kokoro module (WebGPU/WASM via kokoro-js) |
| `src/hooks/use-sentinel-voice.ts` | Shared hook — Desktop + Mobile, 3-tier backend, status, controls |
| `src/workers/kokoro-browser.worker.ts` | Web Worker — off-main-thread Kokoro model load + synthesis |
| `src/lib/sentinel/__tests__/sentinel-voice.test.ts` | 23 tests — spokenBrief quality, pronunciation, filtering |
| `src/lib/sentinel/__tests__/browser-kokoro.test.ts` | 7 tests — isBrowserKokoroSupported, load, fallback |
| `src/lib/sentinel/__tests__/sentinel-voice-backend.test.ts` | 10 tests — health check, synthesis, cache, audio |
| `sentinel-voice-samples/` | Real synthesized WAVs (George/Fable/Daniel/Lewis + Piper Alan) + voice-lab.html |
| `SENTINEL_VOICE_BENCHMARK.md` | Full benchmark report with real measured numbers |

### 3. MobileSentinelView.tsx — Conflict Resolution

Agent 3's Brain reveal structure was preserved verbatim:
- `onClick` → `setBrainActive`, `BrainConnector`, `SentinelBrainGlobe`, "Brain verbunden" label
- Aurum tap opens Brain panel

Voice integration changes only:
- `speaking={speaking}` → `speaking={voice.status === "speaking"}`
- Removed: German voice helpers, muted/speaking/germanVoices state
- Added: `const voice = useSentinelVoice()`, voice selector, play/pause/stop/replay controls
- Added: auto-speak effect using `prevBusyRef`

### 4. spokenBrief Quality — Executive Briefing Style

`extractSpokenBrief` now:
1. Strips markdown (headings removed entirely, not just `##` marker)
2. Picks priority sentences (contains: remains, status, risk, alert, recommend, action, limit, verdict, conclusion, no immediate, increased, decreased, passes, fails, rejected, approved)
3. Re-sorts to document order
4. Targets 20–45 words, hard cap 60
5. Applies 25+ pronunciation replacements (EUR/USD → "euro dollar", IBKR → "Interactive Brokers", etc.)

`isSpeakableSentence` filters:
- Strings under 3 chars
- Word count < 2 (was `< 3`, lowered to allow "Verdict: NO_ROBUST_EDGE_FOUND.")
- Sentences ending with `:` (dangling label fragments)

### 5. Language-Aware Voice Routing

`detectLanguage(text)` in `sentinel-voice.ts`:
- Returns `"de"` if text contains umlauts/ß or common German words
- Returns `"en"` otherwise

`doSpeak` in `use-sentinel-voice.ts`:
- German → immediately routes to browser SpeechSynthesis with `de-DE` voice (no Kokoro)
- English → 3-tier: local Kokoro sidecar → browser Kokoro Worker → browser SpeechSynthesis en-GB

`speakBrowser` accepts `lang: "en" | "de"` (default `"en"`):
- German path: `lang="de-DE"`, picks best de-DE browser voice
- English path: unchanged (`lang="en-GB"`, picks best en-GB browser voice)

### 6. Backend Priority (unchanged from architecture)

1. **Local Kokoro sidecar** — Desktop/local Capitalife, best quality (~0.5s latency)
2. **Browser-local Kokoro** — Mobile/Vercel, on-device, no localhost needed
3. **Browser SpeechSynthesis** — universal fallback + German language path

`VoiceBackend`: `"local-sidecar" | "browser-kokoro" | "browser-speech" | null`  
`VoiceStatus`: `"idle" | "model_loading" | "generating" | "speaking" | "paused" | "offline" | "error"`

### 7. Test Results

317/317 tests passing (all sentinel voice tests + full suite).

### 8. Build Status

`npm run build` — passes (TypeScript clean, 60/60 static pages generated).  
`npm run audit:github-safe` — PASS.

### 9. npm dependency added

`kokoro-js` — Apache-2.0, browser-local Kokoro synthesis via kokoro-js/transformers.js.  
Must be present in `package.json` / `package-lock.json` on the integration branch.

---

## Remaining Verification (for Agent 3 / manual QA)

- [ ] Real Mobile Sentinel at ~390px: auto-speak fires after answer completes
- [ ] Aurum → Brain tap: still opens BrainConnector panel (regression check)
- [ ] EN answer: Kokoro voice plays (or browser TTS if no sidecar)
- [ ] DE answer: system German voice plays, no Kokoro attempted
- [ ] Play/Pause/Stop/Replay controls respond correctly
- [ ] New answer cancels audio from previous answer
- [ ] Browser Kokoro model cache: verify on real Chrome (Cache Storage failed in sandboxed pane)
- [ ] `kokoro-js` npm package in package.json before merging to main

---

## Push Status

**PUSH_BLOCKED_BY_ENVIRONMENT_POLICY** — auto-mode classifier blocked `git push`.

Branch is committed locally at `ae1d57b`. To push manually:

```bash
cd "C:\Users\joris\Documents\Capitalife Terminal Sentinel Voice Integration"
git push -u origin feat/sentinel-voice-integration
```

Then open a PR: `feat/sentinel-voice-integration` → `main`.
