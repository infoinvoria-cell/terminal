# Sentinel TTS — Local Setup

## Prerequisites

Python 3.10+ required.

## Install

```bash
pip install kokoro soundfile fastapi uvicorn numpy
```

## Start

```bash
python scripts/tts/sentinel-tts-server.py
```

Server starts on `http://localhost:5050`.

## Verify

```bash
curl http://localhost:5050/health
curl http://localhost:5050/voices
```

## First synthesis (test)

```bash
curl -X POST http://localhost:5050/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Good evening. Markets are broadly stable.", "voice":"bm_george", "speed":1.0}' \
  --output test.wav
```

## Voices available

| ID         | Label              | Character            | License    |
|------------|--------------------|----------------------|------------|
| bm_george  | Sentinel — George  | British, calm, clear | Apache-2.0 |
| bm_fable   | Sentinel — Fable   | British, measured    | Apache-2.0 |
| bm_daniel  | Sentinel — Daniel  | British, understated | Apache-2.0 |
| bm_lewis   | Sentinel — Lewis   | British, warm        | Apache-2.0 |

## License

Kokoro-82M: Apache-2.0
Model weights: Apache-2.0
Voice styles: Apache-2.0

No per-character or per-minute TTS billing. Fully local inference.

## Environment variables

| Variable          | Default                 | Description           |
|-------------------|-------------------------|-----------------------|
| SENTINEL_TTS_PORT | 5050                    | Server port           |
| SENTINEL_TTS_URL  | http://localhost:5050   | Next.js proxy target  |

Set `SENTINEL_TTS_URL` in `.env.local` if using a non-default port.

## Vercel / Public deployment

The local TTS server is NOT deployed to Vercel. In public mode,
Sentinel falls back to browser native speech synthesis (en-GB).

This is by design: private Sentinel responses must not be sent to
external TTS APIs.
