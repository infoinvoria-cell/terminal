"""
Real Kokoro benchmark — synthesizes actual audio for bm_george/fable/daniel/lewis
and writes WAV files + a JSON report with real timing measurements.

Usage:
  .venv-tts/Scripts/python.exe scripts/tts/benchmark-kokoro.py
"""
import json
import os
import time
import traceback

import numpy as np
import soundfile as sf

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "sentinel-voice-samples")
os.makedirs(OUT_DIR, exist_ok=True)

VOICES = ["bm_george", "bm_fable", "bm_daniel", "bm_lewis"]
SAMPLE_RATE = 24000

TEXT = (
    "Good evening. Markets are broadly stable, but volatility is beginning to rise. "
    "The DAX remains the primary risk contributor. EUR slash USD is trading near "
    "one point one eight. Interactive Brokers reports no immediate action required."
)

report = {"engine": "kokoro-82m", "results": []}

try:
    t_import0 = time.time()
    from kokoro import KPipeline
    t_import = time.time() - t_import0
    report["import_time_sec"] = round(t_import, 3)

    t_load0 = time.time()
    pipeline = KPipeline(lang_code="b")  # 'b' = British English in Kokoro
    t_load = time.time() - t_load0
    report["model_load_time_sec"] = round(t_load, 3)
    report["model_load_error"] = None
except Exception as e:
    report["model_load_error"] = f"{type(e).__name__}: {e}"
    report["traceback"] = traceback.format_exc()
    pipeline = None

if pipeline is not None:
    for voice in VOICES:
        entry = {"voice": voice}
        try:
            t0 = time.time()
            chunks = []
            gen = pipeline(TEXT, voice=voice, speed=1.0, split_pattern=r"\n+")
            first_chunk_time = None
            for _gs, _ps, audio in gen:
                if first_chunk_time is None:
                    first_chunk_time = time.time() - t0
                if audio is not None and len(audio) > 0:
                    chunks.append(audio)
            total_time = time.time() - t0

            if not chunks:
                entry["status"] = "FAIL"
                entry["error"] = "no audio chunks produced"
                report["results"].append(entry)
                continue

            combined = np.concatenate(chunks)
            duration_sec = len(combined) / SAMPLE_RATE
            rms = float(np.sqrt(np.mean(combined.astype(np.float64) ** 2)))
            peak = float(np.max(np.abs(combined)))

            out_path = os.path.join(OUT_DIR, f"kokoro-{voice.replace('bm_', '')}.wav")
            sf.write(out_path, combined, SAMPLE_RATE, subtype="PCM_16")
            file_size = os.path.getsize(out_path)

            entry.update({
                "status": "PASS",
                "first_chunk_latency_sec": round(first_chunk_time, 3) if first_chunk_time else None,
                "total_synth_time_sec": round(total_time, 3),
                "audio_duration_sec": round(duration_sec, 3),
                "rtf": round(total_time / duration_sec, 4) if duration_sec > 0 else None,
                "sample_rate": SAMPLE_RATE,
                "rms": round(rms, 5),
                "peak": round(peak, 5),
                "silent": rms < 0.001,
                "clipped": peak >= 0.999,
                "file_path": out_path,
                "file_size_bytes": file_size,
            })
        except Exception as e:
            entry["status"] = "FAIL"
            entry["error"] = f"{type(e).__name__}: {e}"
            entry["traceback"] = traceback.format_exc()
        report["results"].append(entry)

report_path = os.path.join(OUT_DIR, "kokoro-benchmark-report.json")
with open(report_path, "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2)

print(json.dumps(report, indent=2))
