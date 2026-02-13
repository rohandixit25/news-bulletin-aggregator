# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Repository Overview

News Bulletin Aggregator — a consumer-grade daily news briefing app. Fetches audio bulletins from RSS podcast feeds (ABC, BBC, SBS, CNBC, CommSec, AI News Daily), combines them into a single normalised MP3 with chapter markers, uploads to Google Drive, and serves via a dark-themed PWA with integrated audio player. Deployed on Render with external cron-triggered generation.

**Location**: `/workspace/news_bulletin_aggregator/`
**Live URL**: `https://news-bulletin-aggregator.onrender.com`
**Render tier**: Free (spins down after 15 min inactivity)

## Running the Application

### Local Development
```bash
cd /workspace/news_bulletin_aggregator
pip install -r requirements.txt
python3 app.py
```
Opens at `http://localhost:5000`. Uses Flask dev server with `use_reloader=False` (required for APScheduler compatibility).

### Production (Render)
Uses gunicorn via Dockerfile:
```
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--timeout", "300", "--threads", "4", "app:app"]
```

### CLI Mode (Quick Test)
```bash
python3 main.py
```
Generates a combined bulletin from hardcoded sources in `main.py` to `output/news_bulletin_YYYY-MM-DD.mp3`. No profile awareness — use the web app instead.

## Architecture

### File Structure
```
├── app.py                     # Flask web app — routes, config, API endpoints
├── main.py                    # NewsBulletinAggregator — RSS fetch, audio combine, staleness check
├── enhanced_generator.py      # EnhancedBulletinGenerator — parallel downloads, progress, chapters, GDrive upload
├── scheduler.py               # BulletinScheduler — APScheduler cron wrapper
├── gdrive_uploader.py         # GDriveUploader — Google Drive API v3 OAuth2 upload
├── email_sender.py            # EmailSender — SMTP delivery with attachment
├── config.json                # Runtime config — profiles, sources, schedules, GDrive folder ID
├── Dockerfile                 # Production container (python:3.11-slim + ffmpeg + gunicorn)
├── requirements.txt           # Python dependencies
├── .env.example               # Environment variable template
├── static/
│   ├── css/style.css          # Dark theme unified styles
│   ├── js/app.js              # Unified SPA — tabs, player, sources, settings
│   └── manifest.json          # PWA manifest
└── templates/
    └── index.html             # Single-page tabbed app (Player | Sources | Settings)
```

### Core Flow
```
External cron (cron-job.org)
    → POST /api/generate/trigger?token=CRON_SECRET
        → EnhancedBulletinGenerator.generate_with_progress()
            → Parallel RSS download (ThreadPoolExecutor, 4 workers)
            → Audio normalisation (pydub dBFS levelling to -20 dBFS)
            → Combine with chapter markers (cumulative time offsets)
            → Export MP3 + metadata JSON
            → GDriveUploader.upload() to folder ID in config
```

### Component Responsibilities

**`app.py`** — Flask web application (903 lines)
- `require_profile` decorator — DRY profile validation for all profile endpoints
- `get_mp3_files(limit)` — helper for sorted MP3 file listing
- `load_config()` / `save_config()` — JSON config with `fcntl.flock()` file locking
- Config auto-migration: adds `order` to sources, `schedule` to profiles
- Module-level scheduler initialisation (works under both dev server and gunicorn)

**`main.py`** — NewsBulletinAggregator class
- `fetch_latest_bulletin(source, url)` — download single RSS audio enclosure
- `fetch_bulletins_parallel(max_workers=4)` — concurrent downloads preserving source order
- `normalise_audio(segment, target_dbfs=-20.0)` — loudness normalisation
- `check_feed_staleness(source, url, max_age_hours=12)` — RSS freshness check
- `combine_audio_files(files, output)` — concatenate with 2s silence gaps

**`enhanced_generator.py`** — EnhancedBulletinGenerator (extends NewsBulletinAggregator)
- `generate_with_progress(sources, profile)` — generator yielding SSE-compatible progress events
- Parallel downloads with per-source progress tracking
- Chapter marker data saved in metadata JSON
- Auto-uploads to Google Drive via `GDriveUploader`
- Falls back to local folder copy if Drive API unavailable

**`scheduler.py`** — BulletinScheduler (wraps APScheduler BackgroundScheduler)
- `init_app(flask_app)` — loads schedules from config, starts scheduler
- `add_schedule(profile_id, time_str, timezone)` — CronTrigger job
- Time format validation: `re.match(r'^\d{2}:\d{2}$', time_str)`
- Note: APScheduler only fires if the process stays alive — Render free tier spins down, so use external cron instead

**`gdrive_uploader.py`** — GDriveUploader
- OAuth2 with `drive.file` scope
- Auth priority: `GDRIVE_TOKEN` env var → `gdrive_token.json` file → OAuth flow
- `upload(file_path, folder_name, folder_id)` — uploads to specific Drive folder
- Config stores `gdrive_folder_id` to avoid creating duplicate folders

## API Endpoints

### Generation
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/generate` | Synchronous generation (returns when done) |
| GET | `/api/generate/stream` | SSE stream with per-source progress events |
| POST/GET | `/api/generate/trigger?token=X` | Background generation for external cron |

### Profiles
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/profiles` | List or create profiles |
| DELETE | `/api/profiles/<id>` | Delete profile |
| POST | `/api/profiles/<id>/switch` | Switch active profile |
| POST | `/api/profiles/<id>/sources` | Update profile sources |
| POST/DELETE | `/api/profiles/<id>/custom-source` | Add/remove custom RSS feed |
| POST | `/api/profiles/<id>/sources/reorder` | Reorder sources (drag-and-drop) |
| GET | `/api/profiles/<id>/staleness` | Check RSS feed freshness |
| GET/PUT | `/api/profiles/<id>/schedule` | Get/update schedule |

### Bulletins
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/latest-bulletin` | Most recent bulletin metadata |
| GET | `/api/recent-files` | Last 10 bulletins |
| GET | `/api/download/<filename>` | Download MP3 |
| GET | `/api/bulletin/<filename>/metadata` | Chapter markers + generation metadata |
| POST | `/api/email/<filename>` | Email bulletin to recipient |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/config` | Raw config get/set |
| GET/POST | `/api/device/<id>/profile` | Device-profile mapping |
| GET | `/api/schedules` | Active scheduler jobs |
| POST | `/api/cleanup` | Delete old bulletins |
| GET | `/api/storage-info` | Disk usage |
| POST | `/api/test-source` | Test an RSS feed |

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
          "description": "...",
          "order": 0,
          "custom": false
        }
      },
      "schedule": {
        "enabled": true,
        "time": "05:00",
        "timezone": "Australia/Sydney"
      }
    }
  },
  "device_profiles": { "device_xxx": "rohan" }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | No | Flask secret key (auto-generated if missing) |
| `CRON_SECRET` | Recommended | Auth token for `/api/generate/trigger` |
| `GDRIVE_TOKEN` | For Render | JSON string of Google OAuth2 token |
| `SMTP_HOST` | For email | SMTP server (default: smtp.gmail.com) |
| `SMTP_PORT` | For email | SMTP port (default: 587) |
| `SMTP_USERNAME` | For email | SMTP username |
| `SMTP_PASSWORD` | For email | SMTP password (Gmail App Password) |
| `DIGEST_SENDER_EMAIL` | For email | Sender address |

### Google Drive Setup

Bulletins are auto-uploaded to Google Drive after generation.

**Local development**: Uses `gdrive_credentials.json` + `gdrive_token.json` (OAuth2 Desktop app flow)

**Render deployment**: Set `GDRIVE_TOKEN` env var containing the JSON contents of `gdrive_token.json`

The target Drive folder ID is stored in `config.json` as `gdrive_folder_id` to prevent duplicate folder creation.

## Deployment (Render)

### Setup
1. Push to GitHub
2. Create Web Service on Render, connect repo
3. Set environment: Docker, branch main
4. Add env vars: `CRON_SECRET`, `GDRIVE_TOKEN`
5. Deploy

### Daily Cron
Render free tier spins down after 15 min. Use an external cron service (e.g., cron-job.org) to trigger generation:
- URL: `https://news-bulletin-aggregator.onrender.com/api/generate/trigger?token=YOUR_CRON_SECRET`
- Method: GET
- Schedule: `0 18 * * *` (UTC) = 5:00 AM Sydney time (AEDT, UTC+11)
- Adjust for daylight saving: AEST (UTC+10) would be `0 19 * * *`

### Updating
```bash
git add <files> && git commit -m "message" && git push
```
Render auto-deploys from main branch.

## Web UI

Single-page dark-themed app with 3 tabs:

- **Player**: Audio player with chapter markers, lock screen controls (Media Session API), wake lock, speed control, skip ±15s, position persistence
- **Sources**: Drag-and-drop source ordering (HTML5 DnD + touch fallback for iOS), enable/disable toggles, staleness badges, add custom sources, generate button with SSE progress
- **Settings**: Profile management, schedule config (time + timezone), recent bulletins, storage management, email

**Design**: Dark theme (`#000006` bg, `#FFE600` accent, `#44d5a3` turquoise), Roboto font, mobile-first, PWA installable

## Code Patterns

### Profile Validation
All profile endpoints use the `@require_profile` decorator which loads config and returns 404 if profile missing:
```python
@app.route('/api/profiles/<profile_id>/...')
@require_profile
def my_endpoint(profile_id, config=None):
    # config is pre-loaded, profile_id is validated
```

### File Listing
Use `get_mp3_files(limit=None)` instead of manually globbing OUTPUT_DIR.

### Config Locking
`load_config()` uses `fcntl.LOCK_SH`, `save_config()` uses `fcntl.LOCK_EX`. Always use these functions — never read/write config.json directly.

### Filename Sanitisation
Profile names in filenames use: `re.sub(r'[^a-z0-9_]', '', name.replace(' ', '_').lower())`

## Protected Files (Never Commit)
- `.env` — SMTP credentials
- `gdrive_credentials.json` — Google OAuth2 client secret
- `gdrive_token.json` — Google OAuth2 refresh token
- `client_secret_*.json` — Google credentials download
- `output/*.mp3` — Generated audio
- `output/*.json` — Bulletin metadata

All listed in `.gitignore`.

## Code Style
- **Australian English**: normalise, colour, organise, centre, analyse
- **Logging**: `logger.info()` for progress, `logger.error()` for failures, `logger.warning()` for non-fatal issues
- **Error handling**: Catch specific exceptions, log internally, return user-friendly JSON responses
- **Security**: Path traversal prevention via `is_relative_to()`, input validation with regex, env vars for secrets
