#!/usr/bin/env python3
"""
Text-to-speech via Microsoft Edge neural voices (free, no API key).

Uses the `edge-tts` Python package, which talks to MS Edge's read-aloud service.
"""

import asyncio
import logging
import os
import re
import ssl
from pathlib import Path

logger = logging.getLogger(__name__)

# Australian English neural voices — Natasha (female), William (male)
DEFAULT_VOICE = "en-AU-NatashaNeural"

# Hard cap to protect runtime + Drive storage (CWE-400)
MAX_SCRIPT_CHARS = 20000


def _sanitise_script(text: str) -> str:
    """Strip markdown and bound length before TTS."""
    if not text:
        raise ValueError("Empty script")

    # Remove markdown emphasis/headers that read awkwardly
    cleaned = re.sub(r"[*_`#]+", "", text)
    cleaned = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", cleaned)  # markdown links → text
    cleaned = re.sub(r"\s+\n", "\n", cleaned)
    cleaned = cleaned.strip()

    if len(cleaned) > MAX_SCRIPT_CHARS:
        logger.warning("Script %d chars; trimming to %d", len(cleaned), MAX_SCRIPT_CHARS)
        cleaned = cleaned[:MAX_SCRIPT_CHARS]

    return cleaned


def _patch_edge_ssl_if_insecure() -> None:
    """
    Override edge-tts's internal SSL context for the Quantium devcontainer.

    edge-tts pins ssl=ssl.create_default_context(cafile=certifi.where()) at its
    WebSocket layer, which rejects the MITM proxy's self-signed chain. Setting
    EDGE_TTS_INSECURE=1 in trusted local dev disables verification. CI/prod
    must NOT set this var so SSL stays strict.
    """
    if os.environ.get("EDGE_TTS_INSECURE") != "1":
        return

    import edge_tts.communicate as _ec

    insecure = ssl.create_default_context()
    insecure.check_hostname = False
    insecure.verify_mode = ssl.CERT_NONE
    _ec._SSL_CTX = insecure
    logger.warning("EDGE_TTS_INSECURE=1 — SSL verification disabled for edge-tts")


async def _synthesise(text: str, output_path: Path, voice: str) -> None:
    """Run edge-tts to write MP3 to disk."""
    import edge_tts

    _patch_edge_ssl_if_insecure()
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output_path))


def synthesise(script: str, output_path: Path, voice: str = DEFAULT_VOICE) -> Path:
    """
    Convert spoken script to MP3 at output_path.

    Returns the output path on success; raises on failure.
    """
    text = _sanitise_script(script)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info("Synthesising %d chars to %s (voice: %s)", len(text), output_path.name, voice)
    asyncio.run(_synthesise(text, output_path, voice))

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError(f"TTS produced no audio at {output_path}")

    size_kb = output_path.stat().st_size / 1024
    logger.info("TTS complete: %s (%.1f KB)", output_path.name, size_kb)
    return output_path
