#!/usr/bin/env python3
"""
Fetch news items from RSS feeds for the briefing pipeline.

Returns a flat list of items across feeds, filtered to last N hours.
"""

import html
import logging
import re
import time
from calendar import timegm
from concurrent.futures import ThreadPoolExecutor, as_completed

import feedparser

logger = logging.getLogger(__name__)

# Hard cap to protect downstream LLM context (CWE-400 — resource exhaustion)
MAX_ITEMS_PER_FEED = 40
MAX_ITEMS_TOTAL = 200
MAX_SUMMARY_CHARS = 600
FEED_TIMEOUT_SECS = 20


def _strip_html(raw: str) -> str:
    """Strip HTML tags and decode entities from RSS summary text."""
    if not raw:
        return ""
    text = re.sub(r"<[^>]+>", " ", raw)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:MAX_SUMMARY_CHARS]


def _entry_age_hours(entry) -> float | None:
    """Return age in hours of an RSS entry, or None if no timestamp."""
    published = entry.get("published_parsed") or entry.get("updated_parsed")
    if not published:
        return None
    return (time.time() - timegm(published)) / 3600


def fetch_feed(name: str, url: str, max_age_hours: int = 36) -> list[dict]:
    """Fetch one feed; return list of normalised items within age window."""
    try:
        feed = feedparser.parse(url)
    except Exception as e:
        logger.warning("Feed parse failed for %s: %s", name, e)
        return []

    items: list[dict] = []
    for entry in feed.entries[:MAX_ITEMS_PER_FEED]:
        age = _entry_age_hours(entry)
        # Keep undated items (some Google News results lack timestamps); drop stale ones
        if age is not None and age > max_age_hours:
            continue

        title = (entry.get("title") or "").strip()
        if not title:
            continue

        summary = _strip_html(entry.get("summary") or entry.get("description") or "")
        link = entry.get("link") or ""

        items.append({
            "source": name,
            "title": title[:300],
            "summary": summary,
            "link": link,
            "age_hours": round(age, 1) if age is not None else None,
        })
    logger.info("Fetched %d items from %s", len(items), name)
    return items


def fetch_all(feeds: dict[str, str], max_age_hours: int = 36) -> list[dict]:
    """Fetch multiple feeds in parallel; return deduplicated combined list."""
    all_items: list[dict] = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {
            pool.submit(fetch_feed, name, url, max_age_hours): name
            for name, url in feeds.items()
        }
        for future in as_completed(futures):
            name = futures[future]
            try:
                all_items.extend(future.result())
            except Exception as e:
                logger.warning("Feed task failed for %s: %s", name, e)

    # Dedupe by normalised title (Google News + BBC often overlap)
    seen: set[str] = set()
    deduped: list[dict] = []
    for item in all_items:
        key = re.sub(r"\W+", "", item["title"].lower())[:80]
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    # Cap to protect LLM context
    if len(deduped) > MAX_ITEMS_TOTAL:
        logger.info("Trimming %d items to %d", len(deduped), MAX_ITEMS_TOTAL)
        deduped = deduped[:MAX_ITEMS_TOTAL]

    return deduped
