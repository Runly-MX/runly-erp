"""Hosted Whisper (Groq) engine for runly-transcriber.

Used only when a transcript was requested with engine GROQ (a per-company
opt-in resolved by the API) and GROQ_API_KEY is set on this container. Any
failure here is reported through the exceptions below so main.py can fall back
to the local faster-whisper model for just the affected chunk: a transcript is
never lost because the hosted service is rate-limited or down.

Audio goes out as small mono Opus chunks (never video), so a one hour meeting
is a handful of ~2 MB uploads instead of one oversized file.
"""

import os
import subprocess
import time
from pathlib import Path

import requests

GROQ_URL = os.environ.get("GROQ_TRANSCRIPTION_URL", "https://api.groq.com/openai/v1/audio/transcriptions")
GROQ_WHISPER_MODEL = os.environ.get("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo")
# 10 minute chunks: ~1.8 MB at 24 kbps, far below the upload cap, and a failed
# chunk only costs ten minutes of local fallback work.
CHUNK_SECONDS = int(os.environ.get("TRANSCRIBER_GROQ_CHUNK_SECONDS", "600"))
OPUS_BITRATE = os.environ.get("TRANSCRIBER_GROQ_BITRATE", "24k")  # below ~16k speech degrades
REQUEST_TIMEOUT_S = int(os.environ.get("TRANSCRIBER_GROQ_TIMEOUT_S", "180"))
# Longest wait for a rate-limit reset we are willing to sit through per chunk.
MAX_RATE_WAIT_S = int(os.environ.get("TRANSCRIBER_GROQ_MAX_RATE_WAIT_S", "120"))
MAX_RETRIES = int(os.environ.get("TRANSCRIBER_GROQ_RETRIES", "3"))


class GroqUnavailable(Exception):
    """Hosted engine cannot serve this chunk (rate limit, outage, bad request); use the local model."""


def is_available():
    return bool(os.environ.get("GROQ_API_KEY"))


def model_label():
    return f"groq-{GROQ_WHISPER_MODEL}"


def split_audio(audio_path: Path, workdir: Path, ffmpeg="ffmpeg"):
    """Cut the audio into Opus chunks; returns [(chunk_path, offset_seconds)]."""
    pattern = workdir / "groq_chunk_%03d.ogg"
    try:
        subprocess.run(
            [
                ffmpeg, "-y", "-i", str(audio_path), "-vn", "-ac", "1", "-ar", "16000",
                "-c:a", "libopus", "-b:a", OPUS_BITRATE, "-application", "voip",
                "-f", "segment", "-segment_time", str(CHUNK_SECONDS), "-reset_timestamps", "1",
                str(pattern),
            ],
            check=True, capture_output=True, timeout=900,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise GroqUnavailable(f"No se pudo preparar el audio para el motor externo: {error}") from error
    chunks = sorted(workdir.glob("groq_chunk_*.ogg"))
    if not chunks:
        raise GroqUnavailable("El audio no produjo ningún fragmento para el motor externo.")
    return [(path, index * CHUNK_SECONDS) for index, path in enumerate(chunks)]


def _retry_after_seconds(response):
    raw = response.headers.get("retry-after")
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 20.0


def transcribe_chunk(chunk_path: Path, language, prompt, sleep=time.sleep, post=requests.post):
    """One chunk -> list of {start, end, text} in chunk-relative seconds.

    Retries rate limits and server errors a few times, then raises
    GroqUnavailable. A 4xx other than 429 is not retried: it would fail the same way.
    """
    api_key = os.environ.get("GROQ_API_KEY", "")
    data = {
        "model": GROQ_WHISPER_MODEL,
        "response_format": "verbose_json",
        "temperature": "0",
        "timestamp_granularities[]": "segment",
    }
    if language:
        data["language"] = language
    if prompt:
        data["prompt"] = prompt

    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            with open(chunk_path, "rb") as audio:
                response = post(
                    GROQ_URL,
                    headers={"Authorization": f"Bearer {api_key}"},
                    data=data,
                    files={"file": (chunk_path.name, audio, "audio/ogg")},
                    timeout=REQUEST_TIMEOUT_S,
                )
        except requests.RequestException as error:
            last_error = f"red: {error}"
            sleep(min(5 * (attempt + 1), 20))
            continue

        if response.status_code == 200:
            try:
                payload = response.json()
            except ValueError as error:
                raise GroqUnavailable(f"Respuesta ilegible del motor externo: {error}") from error
            return _clean_segments(payload.get("segments") or [])
        if response.status_code == 429:
            wait = _retry_after_seconds(response)
            if wait > MAX_RATE_WAIT_S:
                raise GroqUnavailable(f"Límite de uso del motor externo (reintento en {int(wait)}s).")
            last_error = "límite de uso (429)"
            sleep(wait + 1)
            continue
        if response.status_code >= 500:
            last_error = f"error del servidor ({response.status_code})"
            sleep(min(5 * (attempt + 1), 20))
            continue
        raise GroqUnavailable(f"El motor externo rechazó el audio ({response.status_code}).")
    raise GroqUnavailable(f"El motor externo no respondió tras {MAX_RETRIES + 1} intentos: {last_error}")


def _clean_segments(raw_segments):
    """Keep timing and text; drop segments Whisper itself flags as non-speech."""
    cleaned = []
    for seg in raw_segments:
        text = str(seg.get("text") or "").strip()
        if not text:
            continue
        # Whisper's own hallucination signature on silence/noise: very likely
        # "no speech" and a poor token probability at the same time.
        if float(seg.get("no_speech_prob") or 0) > 0.8 and float(seg.get("avg_logprob") or 0) < -1.0:
            continue
        cleaned.append({"start": float(seg.get("start") or 0), "end": float(seg.get("end") or 0), "text": text})
    return cleaned
