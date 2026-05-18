# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Repository Overview

News Bulletin Aggregator — a CLI tool that runs daily via GitHub Actions cron and supports **two pipelines**, selected per profile:

1. **Audio-stitch** (default) — fetches audio bulletins from RSS podcast feeds (ABC, BBC, SBS, CNBC, CommSec, AI News Daily), normalises and combines into a single MP3 with chapter markers, uploads to Google Drive. Class: `NewsBulletinAggregator` in `main.py`.

2. **Briefing** (`briefing_mode: true` in profile) — fetches news text from RSS feeds, calls Gemini to curate items for the profile's `topics`, writes a markdown summary, synthesises an audio version with edge-tts (free, neural voices), uploads both `.md` and `.mp3` to Google Drive. Optional pre-upload cleanup of prior bulletins. Class: `BriefingGenerator` in `briefing_generator.py`.

**Location**: `/workspace/news_bulletin_aggregator/`

## Running the Application

### Daily generation (GitHub Actions)
Runs automatically at 18:00 UTC (05:00 AEDT) via `.github/workflows/daily-bulletin.yml`.
Manual trigger: Actions tab > "Daily News Bulletin" > "Run workflow".

### Local generation
```bash
cd /workspace/news_bulletin_aggregator
pip install -r requirements.txt
python3 generate_cli.py --profile rohan
```

### Re-authenticate Google Drive
```bash
python3 generate_cli.py --reauth-gdrive
```
Runs OAuth2 flow (needs browser), prints token JSON for GitHub secret `GDRIVE_TOKEN`.

## Architecture

### File Structure
```
├── generate_cli.py            # CLI entry point — profile selection, reauth
├── main.py                    # NewsBulletinAggregator — RSS fetch, audio combine
├── enhanced_generator.py      # EnhancedBulletinGenerator — parallel downloads, progress, chapters, GDrive upload
├── gdrive_uploader.py         # GDriveUploader — Google Drive API v3 OAuth2 upload
├── config.json                # Runtime config — profiles, sources, schedules, GDrive folder ID
├── requirements.txt           # Python dependencies
├── .github/workflows/
│   └── daily-bulletin.yml     # GitHub Actions cron workflow
└── .gitignore
```

### Core Flow
```
GitHub Actions cron (18:00 UTC daily)
    → python3 generate_cli.py
        → Reads config.json for scheduled profiles
        → EnhancedBulletinGenerator.generate_with_progress()
            → Parallel RSS download (ThreadPoolExecutor, 4 workers)
            → Audio normalisation (pydub dBFS levelling to -20 dBFS)
            → Combine with chapter markers (cumulative time offsets)
            → Export MP3 + metadata JSON
            → GDriveUploader.upload() to folder ID in config
```

### Component Responsibilities

**`generate_cli.py`** — CLI entry point
- `load_config()` — reads config.json directly (no Flask, no fcntl)
- `get_enabled_sources(profile)` — returns ordered enabled sources
- `get_scheduled_profiles(config)` — profiles with schedule.enabled=True
- `generate_for_profile(id, config)` — runs generation for one profile
- `reauth_gdrive()` — OAuth2 flow for Google Drive token refresh

**`main.py`** — NewsBulletinAggregator class
- `fetch_latest_bulletin(source, url)` — download single RSS audio enclosure
- `fetch_bulletins_parallel(max_workers=4)` — concurrent downloads preserving source order
- `normalise_audio(segment, target_dbfs=-20.0)` — loudness normalisation
- `check_feed_staleness(source, url, max_age_hours=12)` — RSS freshness check
- `combine_audio_files(files, output)` — concatenate with 2s silence gaps

**`enhanced_generator.py`** — EnhancedBulletinGenerator (extends NewsBulletinAggregator)
- `generate_with_progress(sources, profile, config)` — generator yielding progress events
- Parallel downloads with per-source progress tracking
- Chapter marker data saved in metadata JSON
- Auto-uploads to Google Drive via `GDriveUploader`

**`gdrive_uploader.py`** — GDriveUploader
- OAuth2 with `drive.file` scope
- Auth priority: `GDRIVE_TOKEN` env var → `gdrive_token.json` file → OAuth flow
- `upload(file_path, folder_name, folder_id)` — uploads to specific Drive folder

## Configuration

### config.json Structure
```json
{
  "gdrive_folder_id": "1JrXPZfRFawvGGp7xOiXDJnfsn3zlXkQz",
  "active_profile": "rohan",
  "profiles": {
    "rohan": {
      "name": "Rohan",
      "sources": {
        "ABC News Top Stories": {
          "enabled": true,
          "url": "https://...",
          "order": 0
        }
      },
      "schedule": {
        "enabled": true,
        "time": "05:00",
        "timezone": "Australia/Sydney"
      }
    }
  }
}
```

### Environment Variables / Secrets

| Variable | Where | Description |
|----------|-------|-------------|
| `GDRIVE_TOKEN` | GitHub secret | JSON string of Google OAuth2 token |
| `GEMINI_API_KEY` | GitHub secret | Required for `briefing_mode: true` profiles. Free key from https://aistudio.google.com/apikey |
| `EDGE_TTS_INSECURE` | Local dev only | Set to `1` in the devcontainer .env to bypass the Quantium MITM proxy's self-signed certs in edge-tts. **Never set in CI.** |

### Google Drive Setup

Bulletins are auto-uploaded to Google Drive after generation.

- **GitHub Actions**: `GDRIVE_TOKEN` secret contains the OAuth2 token JSON
- **Local**: Uses `gdrive_token.json` file (generated by `--reauth-gdrive`)
- **Credentials**: `client_secret_*.json` from Google Cloud Console (gitignored)
- **Folder ID**: Stored in `config.json` as `gdrive_folder_id`

**Important**: The Google OAuth consent screen must be published (not "Testing") to prevent the refresh token from expiring every 7 days.

## Protected Files (Never Commit)
- `.env` — environment variables
- `gdrive_credentials.json` — Google OAuth2 client secret
- `gdrive_token.json` — Google OAuth2 refresh token
- `client_secret_*.json` — Google credentials download
- `output/*.mp3` — Generated audio
- `output/*.json` — Bulletin metadata

All listed in `.gitignore`.

## Code Style
- **Australian English**: normalise, colour, organise, centre, analyse
- **Linter**: ruff (E, W, F, I rules, 88 char line length)
- **Logging**: `logger.info()` for progress, `logger.error()` for failures, `logger.warning()` for non-fatal issues
- **Error handling**: Catch specific exceptions, log with context
- **Security**: Env vars for secrets, JSON deserialisation only (no pickle)
