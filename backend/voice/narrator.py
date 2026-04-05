"""
backend/voice/narrator.py

Two-step AI Anchor pipeline:
  1. Gemini reframes the synthesis rationale as a crisp news-anchor script.
  2. ElevenLabs TTS converts the script to an MP3 saved locally.

Usage:
    from backend.voice.narrator import generate_debate_audio
    audio_path = await generate_debate_audio(debate_id, event, rationale)
    # returns e.g. "backend/voice/audio/1712345678.mp3" or None on failure
"""
import asyncio
import logging
import os
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

# Audio files are stored here, served as static files via FastAPI
AUDIO_DIR = Path("backend/voice/audio")


def _ensure_audio_dir() -> None:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Step 1: Gemini — rationale → anchor script
# ---------------------------------------------------------------------------

ANCHOR_SYSTEM_PROMPT = (
    "You are a professional Indian financial news anchor on CNBC TV18. "
    "Rewrite the market analysis below into exactly 3 concise, authoritative sentences "
    "as if you are reading live on air. "
    "Be direct and factual. Use plain text only — no markdown, no bullet points, no headers. "
    "Speak in present tense. Start with the event."
)


async def generate_anchor_script(event: str, rationale: str, api_key: str) -> str | None:
    """Call Gemini Flash to produce a clean anchor-style script."""
    try:
        import google.generativeai as genai  # lazy import — not everyone has this

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-3-flash-preview")

        prompt = (
            f"{ANCHOR_SYSTEM_PROMPT}\n\n"
            f"Event: {event}\n\n"
            f"Analysis: {rationale}"
        )

        # Run the blocking SDK call in a thread so we don't block the event loop
        response = await asyncio.to_thread(model.generate_content, prompt)
        script = response.text.strip()
        logger.info(f"[Narrator] Anchor script generated ({len(script)} chars)")
        return script

    except ImportError:
        logger.warning("[Narrator] google-generativeai not installed — skipping Gemini step")
        # Fallback: use rationale directly
        return rationale[:600]
    except Exception as exc:
        logger.error(f"[Narrator] Gemini error: {exc}")
        return rationale[:600]  # graceful fallback


# ---------------------------------------------------------------------------
# Step 2: ElevenLabs — script → MP3
# ---------------------------------------------------------------------------

ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"


async def generate_voice(
    debate_id: str,
    script: str,
    api_key: str,
    voice_id: str,
) -> str | None:
    """
    POST `script` to ElevenLabs TTS, save the resulting MP3.
    Returns the relative path to the MP3, or None on failure.
    """
    _ensure_audio_dir()
    out_path = AUDIO_DIR / f"{debate_id}.mp3"

    # If already generated (e.g. user clicks Play twice), return existing file
    if out_path.exists():
        logger.info(f"[Narrator] Audio already exists: {out_path}")
        return str(out_path)

    url = ELEVENLABS_TTS_URL.format(voice_id=voice_id)
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": script,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.55,
            "similarity_boost": 0.80,
            "style": 0.20,
            "use_speaker_boost": True,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()

        out_path.write_bytes(resp.content)
        logger.info(f"[Narrator] MP3 saved → {out_path} ({len(resp.content)} bytes)")
        return str(out_path)

    except httpx.HTTPStatusError as exc:
        logger.error(f"[Narrator] ElevenLabs HTTP {exc.response.status_code}: {exc.response.text[:200]}")
        return None
    except Exception as exc:
        logger.error(f"[Narrator] ElevenLabs error: {exc}")
        return None


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

async def generate_debate_audio(
    debate_id: str,
    event: str,
    rationale: str,
    gemini_api_key: str,
    elevenlabs_api_key: str,
    voice_id: str,
) -> tuple[str | None, str | None]:
    """
    Full pipeline: rationale → Gemini anchor script → ElevenLabs MP3.

    Returns:
        (audio_path, anchor_script) — either can be None on failure.
    """
    if not elevenlabs_api_key:
        logger.warning("[Narrator] ELEVENLABS_API_KEY not set — voice generation skipped")
        return None, None

    # Step 1: Generate anchor script
    script = await generate_anchor_script(event, rationale, gemini_api_key)
    if not script:
        return None, None

    # Step 2: Convert to voice
    audio_path = await generate_voice(debate_id, script, elevenlabs_api_key, voice_id)
    return audio_path, script
