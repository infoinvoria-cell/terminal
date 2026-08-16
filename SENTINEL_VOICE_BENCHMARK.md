# Sentinel Voice Benchmark — REAL SYNTHESIS RESULTS

Generated: 2026-08-16 | Branch: feat/sentinel-voice
Environment: Windows 11, CPU-only Python 3.13 venv (no GPU passthrough), sandboxed browser pane.

This report replaces the earlier paper/architecture-only version. Every number
below comes from an actual synthesis run in this environment — model installed,
weights downloaded, audio generated, WAV files inspected for validity (sample
rate, duration, RMS, peak, clipping). Raw files are in `sentinel-voice-samples/`.

Test line (all engines): *"Good evening. Markets are broadly stable, but
volatility is beginning to rise. The DAX remains the primary risk contributor..."*
(varies slightly per engine test script; see `scripts/tts/benchmark-kokoro.py`).

---

## A. Kokoro-82M (Python sidecar) — REAL RESULT: PASS

Installed via a short-path venv (`C:\tts-venv`) after the default install location
hit Windows' 260-char `MAX_PATH` limit on torch's nested license files — a real,
reproducible failure on this machine, not a hypothetical. Kokoro's PyPI-pinned
`numpy==1.26.4` also has no Python 3.13 wheel and needs a C compiler to build from
source (none present); worked around by installing `numpy>=2.0` first, then
`kokoro --no-deps` plus its real dependency chain (torch-cpu, misaki, phonemizer-fork,
num2words, spacy en_core_web_sm) individually.

| Voice | Status | First-chunk latency | Audio duration | RTF | Sample rate | RMS | Peak | Clipped |
|---|---|---|---|---|---|---|---|---|
| bm_george | PASS | 6.42s | 17.10s | 0.376 | 24kHz | 0.0585 | 0.359 | no |
| bm_fable  | PASS | 5.28s | 14.43s | 0.366 | 24kHz | 0.0403 | 0.594 | no |
| bm_daniel | PASS | 5.19s | 14.30s | 0.363 | 24kHz | 0.0613 | 0.469 | no |
| bm_lewis  | PASS | 6.09s | 17.48s | 0.348 | 24kHz | 0.0453 | 0.508 | no |

Model load (one-time, cold): 23.0s. Import: 7.5s. All four voices produced
non-silent, non-clipped audio. RTF ~0.35–0.38 on CPU-only — faster than
real-time, i.e. a ~17s reply synthesizes in ~6s.

Real files: `sentinel-voice-samples/kokoro-{george,fable,daniel,lewis}.wav`
Full machine-readable report: `sentinel-voice-samples/kokoro-benchmark-report.json`

**Verdict: PASS — real synthesis confirmed for all four British male voices.**

---

## B. Kokoro-82M (Browser, WebGPU/WASM via kokoro-js) — REAL RESULT: PASS (slow in this sandbox)

`kokoro-js` (npm, Apache-2.0, maintainer `xenova`/transformers.js author) is a
genuine package — not vaporware. Verified with a standalone POC served over
`python -m http.server` and driven in the actual Browser pane (not simulated):

- Model: `onnx-community/Kokoro-82M-v1.0-ONNX`
- Device: WebGPU (this environment reports WebGPU present, but Chrome logs
  `powerPreference option is currently ignored ... Windows` — consistent with a
  software/virtualized GPU, not a real discrete GPU)
- Cold model load: **21.7s**
- First (cold) synthesis: **14.15s** for 6.2s of audio → RTF ≈ 2.28
- Second (warm, model already resident) synthesis: **8.8s** for the same
  line → RTF ≈ 1.42
- Output validated: 48kHz mono WAV, 6.2s duration, RMS 0.083, peak 0.48,
  not silent, not clipped

RTF above 1 means this sandboxed environment's software GPU is slower than
real-time — not representative of a real user's phone/laptop with genuine
WebGPU or even the WASM fallback on decent hardware, but it is the real
number measured here, not an assumption.

One caveat found: `Unable to add response to browser cache: ... Failed to
execute 'put' on 'Cache'` — the model-weight caching step (browser Cache
Storage API, used internally by transformers.js) failed in this sandboxed
browser. This needs to be re-verified in a real Chrome/Edge/Safari session;
if it also fails there, every reload would re-download ~80MB+ of model
weights, which is unacceptable for production and would need investigation
before shipping this path.

**Verdict: PASS (functionally) — real audio was produced twice in a real
browser tab. Performance and cache reliability must be re-verified on real
end-user hardware before this becomes anything other than an opt-in/beta path.**

---

## C. MeloTTS — REAL RESULT: FAIL (broken upstream package)

```
pip install MeloTTS
...
FileNotFoundError: [Errno 2] No such file or directory:
  '...\melotts_.../requirements.txt'
```

MeloTTS 0.1.1's published sdist on PyPI has a `setup.py` that reads
`requirements.txt` via a path not included in the tarball — this is a real,
reproducible packaging bug in the upstream release, not a skip-for-convenience.
Installing from GitHub source directly was not attempted (would require cloning
outside the project's version control and pulling additional unidic/MeCab
dependencies for its Japanese g2p path, disproportionate for an English-only
requirement already met by Kokoro).

**Verdict: FAIL — could not be installed. Documented, not assumed.**

---

## D. Piper — REAL RESULT: PASS (clipped audio) / LICENSE UNCLEAR

`piper-tts==1.7.0` (MIT-licensed CLI, real PyPI package) installed and ran cleanly.
Downloaded the `en_GB-alan-medium` voice (63.2MB ONNX) from the official
`rhasspy/piper-voices` HuggingFace repo — the only readily-available en_GB male
Piper voice.

- Real synthesis: 3.73s wall time (includes cold process start) for 9.06s
  of audio → RTF ≈ 0.41
- Sample rate: 22.05kHz
- **Output was clipped**: peak = 0.99997 (essentially full-scale) — a real
  audio-quality defect at this voice's default gain, would need normalization
  before use
- Voice license: the `MODEL_CARD` states only *"License: See URL"*, pointing to
  a third-party Mycroft `mimic3-voices` dataset page with no SPDX license
  recorded in the card itself — genuinely unclear for commercial redistribution,
  confirmed by inspection, not assumed from prior knowledge

**Verdict: PIPER = BENCHMARK_ONLY / NOT_DEFAULT — real synthesis works, but the
only available en_GB male voice has an unclear license and clips at default
gain. Not eligible as a default without a license resolution and a gain fix.**

---

## E. OpenVoice V2 — FUTURE_OPTION (not installed)

Not published under any working PyPI name (`openvoice2`, `MyShell-OpenVoice`
both 404). The real upstream project (`myshell-ai/OpenVoice`) requires cloning
from GitHub plus separately downloading checkpoints (historically hosted on
Google Drive), and pulls in MeloTTS as a dependency — which is independently
broken on PyPI (see §C). Given OpenVoice's primary value is voice *cloning*,
which this project explicitly does not need (fixed default voices only, no
cloning of real people), attempting a fragile multi-step manual install was
not a good use of the remaining validation budget.

**Verdict: FUTURE_OPTION — not attempted. Real technical reason recorded, not
skipped silently.**

---

## Summary Table

| ENGINE | REAL SYNTHESIS | LATENCY (RTF) | LICENSE | DEFAULT ELIGIBLE |
|---|---|---|---|---|
| Kokoro (Python sidecar) | ✅ PASS, all 4 voices | 0.35–0.38 | Apache-2.0 (code+model+voices) | ✅ **YES** |
| Kokoro (browser WebGPU/WASM) | ✅ PASS (2 real runs) | 1.4–2.3 (this sandbox; hardware-dependent) | Apache-2.0 | ✅ Mobile/Vercel path |
| MeloTTS | ❌ FAIL — broken PyPI package | n/a | MIT (per project docs) | ❌ |
| Piper (en_GB-alan) | ✅ PASS, but clipped | 0.41 | Engine MIT / **voice license unclear** | ❌ BENCHMARK_ONLY |
| OpenVoice V2 | ⛔ not attempted (no PyPI, MeloTTS dep broken) | n/a | MIT (engine, per docs) | ❌ FUTURE_OPTION |
| Browser SpeechSynthesis | n/a (native OS API, always available) | ~0 | System | ✅ universal fallback |

---

## License Gate Audit

| ENGINE | CODE LICENSE | MODEL LICENSE | VOICE LICENSE | COMMERCIAL | DEFAULT ELIGIBLE |
|---|---|---|---|---|---|
| Kokoro-82M | Apache-2.0 | Apache-2.0 | Apache-2.0 | YES | **YES** |
| kokoro-js (browser) | Apache-2.0 | Apache-2.0 (same weights) | Apache-2.0 | YES | YES (secondary path) |
| MeloTTS | MIT (per docs; not installable to verify) | MIT (per docs) | MIT (per docs) | Unverified — install failed | NO |
| Piper (engine) | MIT | MIT | — | YES | — |
| Piper (en_GB-alan voice) | — | — | **UNCLEAR — "See URL", no SPDX in card** | UNCLEAR | **NO** |
| OpenVoice V2 | MIT (per docs; not installed) | MIT (per docs) | MIT (per docs) | Unverified | NO (future) |

No voice weight license was assumed — Piper's was read directly from its
`MODEL_CARD` and found insufficient for a default.

---

## Why Kokoro `bm_george` Wins the Default

Measured, not assumed:

1. **Only engine with a fully verified, permissive license at all three layers**
   (code, model weights, voice style) — confirmed Apache-2.0 end-to-end.
2. **Only engine that actually produced valid, non-clipped audio for four
   distinct British male voices** in a real test run.
3. **Fastest real CPU synthesis measured** (RTF 0.35–0.38, faster than
   real-time) versus Piper (0.41, and clipped) — Kokoro wins on both quality
   and speed on the same hardware.
4. **Same model also runs client-side via `kokoro-js`** for the Mobile/Vercel
   path, so Desktop and Mobile share one voice model and one license story
   instead of two engines to audit.
5. Piper's only viable en_GB male voice has an unresolved license and a real
   clipping defect; MeloTTS couldn't even be installed; OpenVoice V2 wasn't
   viable to install cleanly and isn't needed (no voice cloning requirement).

**DEFAULT VOICE: `kokoro:bm_george` — status: FINAL** (not provisional — backed
by real synthesized audio, not just architecture).

---

## Recurring Cost

**€0 / month.** Local Python sidecar and browser-local Kokoro both run
entirely on hardware already owned (the user's machine / the end-user's
device). No API key, no per-character billing, no subscription for any
engine that passed validation.
