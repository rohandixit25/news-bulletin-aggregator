#!/usr/bin/env python3
"""
Briefing generator — fetches news, writes a curated summary with Gemini,
synthesises an audio version with edge-tts, and uploads both to Google Drive.

Distinct from `NewsBulletinAggregator` (which stitches RSS audio enclosures);
this pipeline is for profiles with `briefing_mode: true` in config.json.
"""

import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Generator

from briefing_writer import write_briefing
from news_fetcher import fetch_all
from tts_edge import synthesise

logger = logging.getLogger(__name__)


def _slug(text: str) -> str:
    """Filesystem-safe slug from a profile or topic name."""
    cleaned = re.sub(r"[^a-z0-9_-]", "", text.lower().replace(" ", "_"))
    return cleaned or "briefing"


class BriefingGenerator:
    """LLM-curated daily news briefing (markdown + MP3)."""

    def __init__(self, output_dir: str = "./output"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

    def generate_with_progress(
        self,
        enabled_sources: dict[str, str],
        profile_name: str,
        config: dict | None = None,
    ) -> Generator[dict, None, None]:
        """
        Mirrors NewsBulletinAggregator.generate_with_progress signature.

        Yields stage events; on completion includes filename, size, metadata.

        enabled_sources here = {feed_name: feed_url} — same shape as the audio
        aggregator. Profile config keys consumed:
            - topics:        list[str]  — topics for the LLM curation prompt
            - audience:      str        — who the briefing is for (sets tone)
            - voice:         str        — edge-tts voice id (en-AU-NatashaNeural default)
            - briefing_folder_id: str   — Drive folder ID for this briefing
            - briefing_cleanup:   bool  — delete prior bulletins before uploading
            - briefing_keep_newest: int — keep N newest matching files (default 0)
        """
        config = config or {}
        profiles = config.get("profiles", {})
        profile_data = next(
            (p for p in profiles.values() if p.get("name") == profile_name), {}
        )

        topics = profile_data.get("topics") or ["World news"]
        audience = profile_data.get("audience", "a busy reader")
        voice = profile_data.get("voice", "en-AU-NatashaNeural")
        folder_id = profile_data.get("briefing_folder_id") or config.get("gdrive_folder_id")
        cleanup = bool(profile_data.get("briefing_cleanup", False))
        keep_newest = int(profile_data.get("briefing_keep_newest", 0))

        slug = _slug(profile_name)
        date_str = datetime.now().strftime("%Y-%m-%d")
        md_path = self.output_dir / f"{slug}_briefing_{date_str}.md"
        mp3_path = self.output_dir / f"{slug}_briefing_{date_str}.mp3"
        meta_path = self.output_dir / f"{slug}_briefing_{date_str}.json"
        name_prefix = f"{slug}_briefing_"

        # Stage 1 — fetch news
        yield {
            "stage": "fetching",
            "message": f"Fetching news from {len(enabled_sources)} feeds...",
            "progress": 5,
        }
        try:
            items = fetch_all(enabled_sources, max_age_hours=36)
        except Exception as e:
            yield {"stage": "error", "message": f"Fetch failed: {e}", "progress": 5}
            return

        if not items:
            yield {
                "stage": "error",
                "message": "No fresh news items found in any feed",
                "progress": 10,
            }
            return

        yield {
            "stage": "fetching",
            "message": f"Got {len(items)} items across feeds",
            "progress": 20,
        }

        # Stage 2 — Gemini curation
        yield {
            "stage": "writing",
            "message": f"Calling Gemini to curate for {len(topics)} topics...",
            "progress": 30,
        }
        try:
            briefing = write_briefing(items, topics, audience=audience)
        except Exception as e:
            yield {"stage": "error", "message": f"Writer failed: {e}", "progress": 30}
            return

        chosen = briefing["chosen"]
        markdown = briefing["markdown"]
        script = briefing["script"]

        md_path.write_text(
            f"# News briefing — {datetime.now().strftime('%A, %d %B %Y')}\n\n"
            f"_For: {profile_name}_\n\n{markdown}\n",
            encoding="utf-8",
        )
        yield {
            "stage": "writing",
            "message": f"Selected {len(chosen)} items, wrote {len(markdown)} char summary",
            "progress": 55,
        }

        # Stage 3 — TTS
        yield {
            "stage": "synthesising",
            "message": "Generating audio with edge-tts...",
            "progress": 65,
        }
        try:
            synthesise(script, mp3_path, voice=voice)
        except Exception as e:
            yield {"stage": "error", "message": f"TTS failed: {e}", "progress": 65}
            return

        yield {
            "stage": "synthesising",
            "message": f"Audio ready ({mp3_path.stat().st_size // 1024} KB)",
            "progress": 85,
        }

        # Stage 4 — upload (with optional cleanup)
        upload_summary = self._upload(
            folder_id=folder_id,
            files=[md_path, mp3_path],
            cleanup=cleanup,
            cleanup_prefix=name_prefix,
            keep_newest=keep_newest,
        )

        # Save metadata
        metadata = {
            "profile": profile_name,
            "topics": topics,
            "generated_at": datetime.now().isoformat(),
            "items_total": len(items),
            "items_chosen": [
                {"source": c["source"], "title": c["title"], "link": c.get("link")}
                for c in chosen
            ],
            "files_uploaded": upload_summary,
            "voice": voice,
        }
        meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

        yield {
            "stage": "complete",
            "message": (
                f"Briefing ready — {len(chosen)} items, "
                f"{mp3_path.stat().st_size // 1024} KB audio, "
                f"uploaded {sum(1 for v in upload_summary.values() if v)} file(s)"
            ),
            "progress": 100,
            "filename": mp3_path.name,
            "size": mp3_path.stat().st_size,
            "metadata": metadata,
        }

    def _upload(
        self,
        folder_id: str | None,
        files: list[Path],
        cleanup: bool,
        cleanup_prefix: str,
        keep_newest: int,
    ) -> dict[str, str | None]:
        """Upload files to Drive, with optional pre-upload cleanup."""
        if not folder_id:
            logger.warning("No briefing_folder_id configured — skipping upload")
            return {f.name: None for f in files}

        try:
            from gdrive_uploader import GDriveUploader
        except Exception as e:
            logger.error("GDrive uploader unavailable: %s", e)
            return {f.name: None for f in files}

        uploader = GDriveUploader()
        result: dict[str, str | None] = {}

        if cleanup:
            try:
                deleted = uploader.cleanup_folder(
                    folder_id=folder_id,
                    name_prefix=cleanup_prefix,
                    keep_newest=keep_newest,
                )
                logger.info("Pre-upload cleanup: removed %s file(s)", deleted)
            except Exception as e:
                logger.warning("Cleanup failed (continuing with upload): %s", e)

        for path in files:
            try:
                file_id = uploader.upload(path, folder_id=folder_id)
                result[path.name] = file_id
            except Exception as e:
                logger.error("Upload failed for %s: %s", path.name, e)
                result[path.name] = None

        return result
