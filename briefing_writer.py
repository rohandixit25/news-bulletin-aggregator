#!/usr/bin/env python3
"""
Use Gemini to turn raw news items into a curated briefing.

Returns:
    {
        "markdown": "...full prose summary for human reading...",
        "script":   "...spoken-word script for TTS...",
        "chosen":   [items selected and used],
    }
"""

import json
import logging
import os
import re
import time

logger = logging.getLogger(__name__)

# Gemini free tier. flash-lite-latest is the most reliably-available alias on the
# free tier as of May 2026 (gemini-2.5-flash-lite returns frequent 503s).
DEFAULT_MODEL = "gemini-flash-lite-latest"

# Bound LLM output to protect cost + audio length (CWE-400)
MAX_OUTPUT_TOKENS = 4000

# Retry transient 503/429 — Gemini free tier hits these regularly
RETRY_ATTEMPTS = 4
RETRY_BASE_DELAY_SECS = 3


def _build_prompt(items: list[dict], topics: list[str], audience: str) -> str:
    """Compose the prompt sent to Gemini."""
    topics_block = "\n".join(f"- {t}" for t in topics)
    items_block = "\n".join(
        f"[{i}] ({it['source']}, {it.get('age_hours', '?')}h) {it['title']} — {it.get('summary', '')[:300]}"
        for i, it in enumerate(items)
    )
    return f"""You are writing a daily news briefing for {audience}.

TOPICS OF INTEREST:
{topics_block}

NEWS ITEMS (each on its own line, prefixed by index):
{items_block}

YOUR TASK
1. Pick the 6-10 most relevant items for the topics above. Skip noise, opinion pieces, listicles, share-price-only updates, and items already covered by another item.
2. Group selected items by topic and write two pieces of output:
   a. A **markdown summary** (~400-600 words) with H2 headings per topic, then short bullet points. Include a one-sentence "Top of mind" lead at the top. Use Australian English. Include the source name in brackets after each bullet, e.g. "(BBC)".
   b. A **spoken script** (~400-500 words, 3-4 minutes when read aloud) that flows naturally for audio. No bullet points. No URLs. Start with "Good morning. Here's your news briefing for today." End with "That's all for today's briefing."
3. Use the item indices you picked.

OUTPUT FORMAT
Respond with a JSON object only — no markdown fences, no commentary — with this exact shape:
{{
  "chosen_indices": [int, int, ...],
  "markdown": "...",
  "script": "..."
}}
"""


def _extract_json(text: str) -> dict:
    """
    Pull a JSON object out of Gemini's response.

    Gemini occasionally returns valid JSON followed by trailing text or a
    second partial object. Use raw_decode to parse only the first complete
    object and ignore the rest. Also handles markdown code fences.
    """
    text = text.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    # Find the first '{' and parse from there with raw_decode
    start = text.find("{")
    if start == -1:
        raise json.JSONDecodeError("No JSON object found", text, 0)

    decoder = json.JSONDecoder()
    obj, _end = decoder.raw_decode(text[start:])
    return obj


def write_briefing(
    items: list[dict],
    topics: list[str],
    audience: str = "a busy reader",
    model: str = DEFAULT_MODEL,
) -> dict:
    """
    Call Gemini to pick relevant items and write a briefing.

    Returns dict with keys: markdown, script, chosen.
    Raises RuntimeError on failure (no Gemini key, parse failure, etc.).
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY not set. Get one free at https://aistudio.google.com/apikey"
        )

    if not items:
        raise RuntimeError("No news items provided to briefing writer")

    # Lazy import so generate_cli.py boots fast even without google-genai installed
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    prompt = _build_prompt(items, topics, audience)

    logger.info(
        "Calling Gemini (%s) with %d items, %d topics", model, len(items), len(topics)
    )

    response = None
    last_err: Exception | None = None
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    max_output_tokens=MAX_OUTPUT_TOKENS,
                    temperature=0.4,
                    response_mime_type="application/json",
                ),
            )
            break
        except Exception as e:
            last_err = e
            msg = str(e)
            transient = any(code in msg for code in ("503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED"))
            if not transient or attempt == RETRY_ATTEMPTS:
                raise
            delay = RETRY_BASE_DELAY_SECS * attempt
            logger.warning("Gemini attempt %d hit transient error; retrying in %ds: %s", attempt, delay, msg[:120])
            time.sleep(delay)

    if response is None:
        raise RuntimeError(f"Gemini failed after {RETRY_ATTEMPTS} attempts: {last_err}")

    raw = response.text or ""
    if not raw.strip():
        raise RuntimeError("Gemini returned empty response")

    try:
        parsed = _extract_json(raw)
    except json.JSONDecodeError as e:
        logger.error("Gemini response not valid JSON: %s\nResponse:\n%s", e, raw[:500])
        raise RuntimeError("Gemini response was not valid JSON") from e

    # Validate shape (CWE-20 — improper input validation)
    if not all(k in parsed for k in ("chosen_indices", "markdown", "script")):
        raise RuntimeError(f"Gemini response missing keys; got: {list(parsed.keys())}")

    chosen_indices = [
        i for i in parsed["chosen_indices"] if isinstance(i, int) and 0 <= i < len(items)
    ]
    chosen = [items[i] for i in chosen_indices]

    return {
        "markdown": str(parsed["markdown"]),
        "script": str(parsed["script"]),
        "chosen": chosen,
    }
