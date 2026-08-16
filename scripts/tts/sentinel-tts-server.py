"""
Sentinel Voice — Local TTS Sidecar
Engine: Kokoro-82M (Apache-2.0)
Voices: bm_george, bm_fable, bm_daniel, bm_lewis (British male)

Usage:
  pip install kokoro soundfile fastapi uvicorn numpy
  python scripts/tts/sentinel-tts-server.py

Endpoints:
  POST /synthesize  { text, voice, speed }  → audio/wav
  GET  /voices                               → voice list
  GET  /health                               → health/status

Caching:
  In-memory LRU cache for identical (voice, text, speed) requests.
"""

import hashlib
import io
import json
import logging
import os
import time
from collections import OrderedDict
from typing import Any

import numpy as np
import soundfile as sf
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [Sentinel TTS] %(message)s")
log = logging.getLogger("sentinel-tts")

# ── Kokoro pipeline (lazy load) ────────────────────────────────────────────────

_pipeline = None
_pipeline_lang = None

KOKORO_VOICES = [
    {"id": "bm_george", "label": "Sentinel — George", "lang": "en-GB", "gender": "male", "available": True},
    {"id": "bm_fable",  "label": "Sentinel — Fable",  "lang": "en-GB", "gender": "male", "available": True},
    {"id": "bm_daniel", "label": "Sentinel — Daniel", "lang": "en-GB", "gender": "male", "available": True},
    {"id": "bm_lewis",  "label": "Sentinel — Lewis",  "lang": "en-GB", "gender": "male", "available": True},
]

VALID_VOICES = {v["id"] for v in KOKORO_VOICES}
SAMPLE_RATE = 24000


def get_pipeline(lang: str = "en-gb"):
    global _pipeline, _pipeline_lang
    if _pipeline is not None and _pipeline_lang == lang:
        return _pipeline
    try:
        from kokoro import KPipeline
        log.info(f"Loading Kokoro pipeline (lang={lang})...")
        start = time.time()
        _pipeline = KPipeline(lang_code=lang)
        _pipeline_lang = lang
        log.info(f"Kokoro loaded in {time.time()-start:.2f}s")
        return _pipeline
    except ImportError:
        log.error("Kokoro not installed. Run: pip install kokoro")
        return None
    except Exception as e:
        log.error(f"Failed to load Kokoro: {e}")
        return None


# ── Audio cache ────────────────────────────────────────────────────────────────

MAX_CACHE = 100
_cache: OrderedDict[str, bytes] = OrderedDict()


def cache_key(voice: str, text: str, speed: float) -> str:
    raw = f"{voice}|{speed:.3f}|{text}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def get_cached(key: str) -> bytes | None:
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    return None


def set_cached(key: str, data: bytes) -> None:
    _cache[key] = data
    _cache.move_to_end(key)
    while len(_cache) > MAX_CACHE:
        _cache.popitem(last=False)


# ── FastAPI ────────────────────────────────────────────────────────────────────

app = FastAPI(title="Sentinel TTS", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class SynthRequest(BaseModel):
    text: str
    voice: str = "bm_george"
    speed: float = 1.0


@app.get("/health")
def health() -> JSONResponse:
    pipeline = get_pipeline()
    return JSONResponse({
        "status": "ok" if pipeline else "degraded",
        "engine": "kokoro-82m",
        "voices": len(KOKORO_VOICES),
        "cache_entries": len(_cache),
        "model_loaded": pipeline is not None,
    })


@app.get("/voices")
def voices() -> JSONResponse:
    pipeline = get_pipeline()
    available = pipeline is not None
    return JSONResponse({
        "voices": [
            {**v, "available": available}
            for v in KOKORO_VOICES
        ],
        "default": "bm_george",
        "engine": "kokoro-82m",
        "license": "Apache-2.0",
        "status": "ok" if available else "model_not_loaded",
    })


@app.post("/synthesize")
def synthesize(req: SynthRequest) -> Response:
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "text is required")

    voice = req.voice if req.voice in VALID_VOICES else "bm_george"
    speed = max(0.7, min(1.3, req.speed))

    # Cache hit
    key = cache_key(voice, text, speed)
    cached = get_cached(key)
    if cached:
        log.info(f"Cache hit: {voice}, {len(text)} chars")
        return Response(content=cached, media_type="audio/wav")

    # Synthesize
    pipeline = get_pipeline()
    if pipeline is None:
        raise HTTPException(503, "Kokoro pipeline not loaded")

    try:
        log.info(f"Synthesizing: voice={voice}, speed={speed:.2f}, chars={len(text)}")
        t0 = time.time()

        audio_chunks = []
        generator = pipeline(text, voice=voice, speed=speed, split_pattern=r"\n+")
        for _gs, _ps, audio in generator:
            if audio is not None and len(audio) > 0:
                audio_chunks.append(audio)

        if not audio_chunks:
            raise HTTPException(500, "No audio generated")

        combined = np.concatenate(audio_chunks)
        elapsed = time.time() - t0
        duration = len(combined) / SAMPLE_RATE
        log.info(f"Generated {duration:.2f}s audio in {elapsed:.2f}s (RTF={elapsed/duration:.3f})")

        # Write to WAV
        buf = io.BytesIO()
        sf.write(buf, combined, SAMPLE_RATE, format="WAV", subtype="PCM_16")
        wav_bytes = buf.getvalue()

        set_cached(key, wav_bytes)
        return Response(content=wav_bytes, media_type="audio/wav")

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Synthesis error: {e}")
        raise HTTPException(500, f"Synthesis failed: {e}")


if __name__ == "__main__":
    port = int(os.environ.get("SENTINEL_TTS_PORT", "5050"))
    log.info(f"Starting Sentinel TTS server on port {port}")
    # Pre-load model
    get_pipeline()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
