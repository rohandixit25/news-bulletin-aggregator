#!/usr/bin/env python3
"""
Standalone CLI for generating news bulletins without Flask.

Usage:
    python3 generate_cli.py                     # Generate for all scheduled profiles
    python3 generate_cli.py --profile rohan     # Generate for a specific profile
    python3 generate_cli.py --reauth-gdrive     # Re-authenticate Google Drive OAuth2

Designed for GitHub Actions cron or local use — no Flask, APScheduler, or gunicorn needed.
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

# Security: credentials loaded from env vars or local files, never hardcoded (CWE-798)
from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent
CONFIG_FILE = BASE_DIR / "config.json"


def load_config() -> dict:
    """Load config.json without Flask or fcntl locking (safe for single-process CLI)."""
    if not CONFIG_FILE.exists():
        logger.error("config.json not found at %s", CONFIG_FILE)
        sys.exit(1)

    # Security: use json.load (safe deserialisation), not pickle (CWE-502)
    with open(CONFIG_FILE, "r") as f:
        return json.load(f)


def get_enabled_sources(profile_data: dict) -> dict[str, str]:
    """
    Return {source_name: url} for enabled sources, respecting 'order' key.

    Only includes sources where enabled=True.
    """
    sources = profile_data.get("sources", {})
    # Sort by order key, then filter to enabled
    sorted_sources = sorted(
        sources.items(),
        key=lambda item: item[1].get("order", 999),
    )
    return {
        name: info["url"]
        for name, info in sorted_sources
        if info.get("enabled")
    }


def get_scheduled_profiles(config: dict) -> list[str]:
    """Return profile IDs that have schedule.enabled=True."""
    profiles = config.get("profiles", {})
    return [
        pid
        for pid, pdata in profiles.items()
        if pdata.get("schedule", {}).get("enabled")
    ]


def generate_for_profile(profile_id: str, config: dict) -> str | None:
    """
    Generate a bulletin for a single profile.

    Returns the output filename on success, None on failure.
    """
    profiles = config.get("profiles", {})
    if profile_id not in profiles:
        logger.error("Profile '%s' not found in config.json", profile_id)
        return None

    profile_data = profiles[profile_id]
    profile_name = profile_data.get("name", profile_id)
    enabled_sources = get_enabled_sources(profile_data)

    if not enabled_sources:
        logger.warning(
            "Profile '%s' has no enabled sources — skipping", profile_name
        )
        return None

    logger.info(
        "Generating bulletin for '%s' with %d sources: %s",
        profile_name,
        len(enabled_sources),
        ", ".join(enabled_sources.keys()),
    )

    # Import here to avoid loading pydub/feedparser unless actually generating
    from enhanced_generator import EnhancedBulletinGenerator

    generator = EnhancedBulletinGenerator(output_dir=str(BASE_DIR / "output"))
    filename = None

    for event in generator.generate_with_progress(
        enabled_sources, profile_name, config=config
    ):
        stage = event.get("stage", "")
        message = event.get("message", "")
        progress = event.get("progress", 0)

        if stage == "error":
            logger.error("[%d%%] %s", progress, message)
            return None
        elif stage == "warning":
            logger.warning("[%d%%] %s", progress, message)
        elif stage == "complete":
            filename = event.get("filename")
            duration = event.get("metadata", {}).get("total_duration", 0)
            logger.info(
                "Bulletin complete: %s (%.1f seconds)", filename, duration
            )
        else:
            logger.info("[%d%%] %s", progress, message)

    return filename


def reauth_gdrive() -> None:
    """
    Run Google Drive OAuth2 flow to get a fresh token.

    Prints the token JSON so it can be copied into a GitHub Actions secret.
    Saves to gdrive_token.json for local use.
    """
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        logger.error(
            "google-auth-oauthlib not installed. "
            "Run: pip3 install google-auth-oauthlib"
        )
        sys.exit(1)

    token_file = BASE_DIR / "gdrive_token.json"
    scopes = ["https://www.googleapis.com/auth/drive.file"]

    # Find credentials file: prefer client_secret_*.json (clean Google download),
    # fall back to gdrive_credentials.json. Validate JSON before using.
    creds_file = None
    candidates = list(BASE_DIR.glob("client_secret_*.json"))
    search_order = candidates + [BASE_DIR / "gdrive_credentials.json"]

    for candidate in search_order:
        if not candidate.exists():
            continue
        try:
            with open(candidate, "r") as f:
                json.load(f)  # validate JSON is parseable
            creds_file = candidate
            logger.info("Using credentials file: %s", creds_file.name)
            break
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Skipping %s (invalid JSON): %s", candidate.name, e)

    if creds_file is None:
        logger.error(
            "No valid Google OAuth credentials found. Expected one of:\n"
            "  - client_secret_*.json (download from Google Cloud Console)\n"
            "  - gdrive_credentials.json",
        )
        sys.exit(1)

    logger.info("Starting Google Drive OAuth2 flow on port 8090...")
    logger.info("A browser window will open — log in and authorise Google Drive access.")

    flow = InstalledAppFlow.from_client_secrets_file(str(creds_file), scopes)
    creds = flow.run_local_server(
        host="localhost",
        bind_addr="0.0.0.0",
        port=8090,
        open_browser=True,
        prompt="consent",
        access_type="offline",
    )

    # Save token locally
    token_json = creds.to_json()
    with open(token_file, "w") as f:
        f.write(token_json)
    logger.info("Token saved to %s", token_file)

    # Print for GitHub Actions secret
    print("\n" + "=" * 60)
    print("Copy the JSON below into your GitHub Actions secret GDRIVE_TOKEN:")
    print("=" * 60)
    print(token_json)
    print("=" * 60)


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Generate news bulletins (standalone, no Flask required)",
    )
    parser.add_argument(
        "--profile",
        type=str,
        default=None,
        help="Profile ID to generate for (default: all scheduled profiles)",
    )
    parser.add_argument(
        "--reauth-gdrive",
        action="store_true",
        help="Re-authenticate Google Drive and print token for GitHub secret",
    )
    args = parser.parse_args()

    # Load .env if present (for GDRIVE_TOKEN, etc.)
    load_dotenv(BASE_DIR / ".env")

    if args.reauth_gdrive:
        reauth_gdrive()
        return

    config = load_config()

    # Determine which profiles to generate
    if args.profile:
        profile_ids = [args.profile]
    else:
        profile_ids = get_scheduled_profiles(config)
        if not profile_ids:
            logger.warning("No profiles have schedule.enabled=True")
            sys.exit(0)
        logger.info("Scheduled profiles: %s", ", ".join(profile_ids))

    # Generate for each profile
    success_count = 0
    for pid in profile_ids:
        filename = generate_for_profile(pid, config)
        if filename:
            success_count += 1

    if success_count == 0:
        logger.error("No bulletins were generated successfully")
        sys.exit(1)

    logger.info(
        "Done — %d/%d bulletins generated", success_count, len(profile_ids)
    )


if __name__ == "__main__":
    main()
