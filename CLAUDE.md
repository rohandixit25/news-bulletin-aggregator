# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

News Bulletin Aggregator - Automatically fetches news bulletins from multiple RSS podcast feeds (ABC, BBC, SBS, CNBC, CommSec, AI News Daily), combines them into a single MP3 file, and delivers via web interface or email. Built with Python Flask, includes profile management for personalised news preferences.

**Location**: All application code is in `/workspace/news_bulletin_aggregator/`

## Running the Application

### Command-Line Mode (Quick Test)
```bash
cd /workspace/news_bulletin_aggregator
python3 main.py
```
This generates a combined bulletin from all sources defined in `main.py` and saves to `output/news_bulletin_YYYY-MM-DD.mp3`.

### Web Interface (Recommended)
```bash
cd /workspace/news_bulletin_aggregator
python3 app.py
```
Then open browser to `http://localhost:5000`

**Web features:**
- Profile management (create profiles for different users)
- Source selection (enable/disable feeds per profile)
- Custom RSS feed addition
- One-click bulletin generation
- Recent files browser with download
- Email delivery to any address

### Mobile Player (iPhone/Android)
```bash
cd /workspace/news_bulletin_aggregator
python3 app.py
```
Then on your iPhone, open Safari and navigate to `http://YOUR_IP:5000/player`

**Mobile features:**
- Progressive Web App (PWA) - install as app icon on home screen
- One-tap playback of latest bulletin
- Lock screen controls (play/pause/skip from locked screen)
- Background playback (continues when switching apps)
- Playback speed control (0.75x to 2.0x)
- Skip forward/back 15 seconds
- No App Store required

**See `IPHONE_SETUP.md` for detailed installation instructions.**

### First-Time Setup

1. **Install dependencies:**
```bash
pip install -r requirements.txt
```

2. **Install ffmpeg** (required for audio processing):
```bash
# Debian/Ubuntu
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg
```

3. **Configure email (optional):**
Create `.env` file from template:
```bash
cp .env.example .env
# Edit .env with SMTP credentials
```

## Architecture

### Component Overview
```
├── main.py                    # CLI script for quick bulletin generation
├── app.py                     # Flask web application (primary interface)
├── email_sender.py            # SMTP email delivery module
├── config.json                # Profile and source configuration
├── requirements.txt           # Python dependencies
├── .env.example               # Environment variable template
├── static/                    # CSS and JavaScript for web UI
│   ├── css/style.css         # Quantium-branded styles
│   └── js/app.js             # Frontend logic
└── templates/
    └── index.html            # Main web interface
```

### Core Architecture

**Orchestrator Pattern:**
```
Flask App (app.py)
    ├── NewsBulletinAggregator (main.py)  → RSS fetching + audio combining
    └── EmailSender (email_sender.py)     → SMTP delivery
```

### Component Responsibilities

**`main.py` - NewsBulletinAggregator Class**
- Fetches latest episodes from RSS podcast feeds using `feedparser`
- Downloads audio enclosures (MP3/M4A) via `requests`
- Combines multiple audio files with 2-second gaps using `pydub`
- Saves to `output/` directory with timestamped filenames
- Can be used standalone (CLI) or imported by Flask app

**`app.py` - Flask Web Application**
- Routes:
  - `GET /` - Main interface with profile selector
  - `POST /api/generate` - Generate bulletin with active profile sources
  - `GET /api/config` - Retrieve configuration
  - `POST /api/config` - Update configuration
  - `POST /api/profiles` - Create new profile
  - `DELETE /api/profiles/<id>` - Delete profile
  - `POST /api/profiles/<id>/switch` - Switch active profile
  - `POST /api/profiles/<id>/sources` - Update profile sources
  - `POST /api/profiles/<id>/custom-source` - Add custom RSS feed
  - `DELETE /api/profiles/<id>/custom-source` - Remove custom feed
  - `GET /api/recent-files` - List generated bulletins
  - `GET /api/download/<filename>` - Download bulletin file
  - `POST /api/email/<filename>` - Email bulletin to recipient

**`email_sender.py` - EmailSender Class**
- SMTP email delivery with TLS encryption
- HTML email formatting with inline CSS
- MP3 attachment support
- Environment-based configuration (`.env` file)
- Configurable sender and recipient addresses

**`config.json` - Configuration Structure**
```json
{
  "active_profile": "profile_id",
  "profiles": {
    "profile_id": {
      "name": "Display Name",
      "sources": {
        "Source Name": {
          "enabled": true,
          "url": "https://feed.url/rss.xml",
          "description": "Feed description",
          "custom": false
        }
      }
    }
  }
}
```

### Key Design Decisions

**Profile-Based Configuration**: Multiple users can have personalised news source selections. Each profile independently tracks enabled/disabled sources and custom feeds. Active profile determines which sources are fetched during generation.

**Web-First Design**: Flask app is the primary interface. CLI script (`main.py`) exists for testing and automation but lacks profile awareness.

**RSS Feed Strategy**: Uses publicly available podcast RSS feeds that update regularly (daily or multiple times daily). No API keys required for news sources themselves.

**Audio Processing**: ffmpeg handles format conversion, pydub provides Python interface. 2-second silence gaps between bulletins for clear separation.

**File Management**: Generated bulletins saved with profile name and timestamp to avoid conflicts. Recent files API shows last 10 bulletins. Output directory excluded from git via `.gitignore`.

## Environment Setup

### Required Files

**`.env` file** (copy from `.env.example`):
```bash
# SMTP Configuration (for email delivery)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
DIGEST_SENDER_EMAIL=your-email@gmail.com
```

**Gmail App Password** (recommended for SMTP):
1. Google Account → Security → Enable 2-Step Verification
2. Security → App passwords → Generate for "Mail"
3. Use 16-character password in `.env` as `SMTP_PASSWORD`

See `EMAIL_SETUP_GUIDE.md` for detailed SMTP configuration instructions.

### Dependencies

**Python packages** (see `requirements.txt`):
- `flask` - Web framework
- `feedparser` - RSS feed parsing
- `requests` - HTTP downloads
- `pydub` - Audio manipulation
- `python-dotenv` - Environment variable loading

**System requirements**:
- Python 3.7+
- ffmpeg (audio processing)

## Customisation

### Adding News Sources

**Via Web UI** (recommended):
1. Select profile
2. Click "Add Custom Source"
3. Enter name, RSS URL, description
4. Enable the new source

**Via `config.json`** (manual):
```json
{
  "Source Name": {
    "enabled": true,
    "url": "https://podcast.rss.url/feed.xml",
    "description": "Brief description (duration)",
    "custom": true
  }
}
```

**Finding RSS feeds:**
- Look for "Subscribe" or "RSS" links on news podcast pages
- Check for `<link rel="alternate" type="application/rss+xml">` in page source
- Most news sites provide podcast RSS feeds for free

### Default News Sources

Currently configured (can be enabled/disabled per profile):
- **ABC News Top Stories**: 60-90 second Australian headlines
- **BBC News 5min**: World news bulletin (5 minutes)
- **SBS News Updates**: Australian/World news (morning/midday/evening)
- **CNBC Business Update**: US market updates (3-5 minutes)
- **CommSec Market Update**: Australian market commentary
- **AI News Daily**: AI technology news (5 minutes)

### Adjusting Audio Processing

**Change silence between bulletins** (`main.py` line 127):
```python
silence = AudioSegment.silent(duration=2000)  # milliseconds
```

**Change audio format** (`main.py` line 136):
```python
combined.export(str(output_path), format='mp3')  # Options: mp3, wav, ogg
```

### Modifying Web Interface

**Styling**: Edit `static/css/style.css` - Uses Quantium brand colours (black #000000, yellow #FFE600)

**Frontend logic**: Edit `static/js/app.js` - Vanilla JavaScript, no framework dependencies

**Layout**: Edit `templates/index.html` - Jinja2 template with Flask integration

## Automation

### Daily Generation with Cron (Linux/macOS)

**Command-line version:**
```bash
crontab -e
# Add:
0 7 * * * cd /workspace/news_bulletin_aggregator && /usr/bin/python3 main.py
```

**Web interface version** (requires API call):
```bash
crontab -e
# Add:
0 7 * * * curl -X POST http://localhost:5000/api/generate
```

**Note**: Web interface must be running for API-based automation.

### Scheduled Email Delivery

Create a script that generates and emails:
```bash
#!/bin/bash
cd /workspace/news_bulletin_aggregator
FILENAME=$(python3 -c "from datetime import datetime; print(f'news_bulletin_{datetime.now().strftime(\"%Y-%m-%d\")}.mp3')")
python3 main.py
curl -X POST http://localhost:5000/api/email/$FILENAME -H "Content-Type: application/json" -d '{"email": "recipient@example.com"}'
```

## Troubleshooting

### "No audio found in latest bulletin"
Some RSS feeds may not include audio enclosures in every episode. The app skips these and continues with other sources. Check feed URL in browser to verify audio links exist.

### "ffmpeg not found"
Install ffmpeg (see First-Time Setup section). pydub requires ffmpeg for audio format conversion.

### RSS Feeds Not Loading
- Check internet connectivity
- Verify RSS URL is correct (test in browser)
- Some feeds may be temporarily unavailable
- Check feed format (must be valid RSS/Atom with audio enclosures)

### SMTP Authentication Failed
- Gmail requires App Password, not regular account password
- Ensure 2-Step Verification is enabled in Google Account
- Verify `SMTP_USERNAME` and `SMTP_PASSWORD` in `.env`
- Check SMTP host/port match your provider

### Web Interface Not Loading
- Ensure Flask app is running: `python3 app.py`
- Check port 5000 is not in use: `lsof -i :5000`
- Verify no firewall blocking localhost:5000

### Profile Changes Not Saving
- Check file permissions on `config.json`
- Verify JSON syntax is valid (use `python3 -m json.tool config.json`)
- Check browser console for JavaScript errors

### Generated File Too Large for Email
Most email providers limit attachments to 25MB. To reduce file size:
- Enable fewer sources per profile
- Use shorter news bulletins (disable 5-minute sources)
- Consider hosting files and sending links instead

## Security Practices

This codebase implements security best practices:

- ✅ Environment variables for credentials (never hardcoded)
- ✅ TLS encryption for SMTP
- ✅ Path traversal prevention in file downloads (`is_relative_to()` check)
- ✅ Input validation on email addresses and filenames
- ✅ Flask secret key for session security
- ✅ Sensitive data excluded from logs
- ✅ `.env` and output files excluded from git
- ✅ HTTPS for external RSS feed requests
- ✅ Content-Type validation for audio downloads

When modifying code, maintain these patterns:
- Never log email addresses, credentials, or file contents
- Validate all user inputs (email addresses, RSS URLs, profile names)
- Use path validation for file operations
- Sanitise filenames to prevent path traversal
- Keep `.env` excluded from version control

## Development Guidelines

### Before Making Changes

1. **Test current functionality**: Run `python3 main.py` and `python3 app.py` to ensure baseline works
2. **Check dependencies**: Verify ffmpeg and Python packages are installed
3. **Review architecture**: Understand component responsibilities before modifying

### Testing Individual Components

**Test RSS fetching:**
```bash
python3 -c "from main import NewsBulletinAggregator; agg = NewsBulletinAggregator(); print(agg.fetch_latest_bulletin('ABC News Top Stories', 'https://www.abc.net.au/feeds/101858056/podcast.xml'))"
```

**Test audio combination:**
```bash
python3 -c "from main import NewsBulletinAggregator; from pathlib import Path; agg = NewsBulletinAggregator(); print(agg.combine_audio_files([Path('output/test1.mp3'), Path('output/test2.mp3')], 'test_combined.mp3'))"
```

**Test email sending:**
```bash
python3 -c "from email_sender import EmailSender; sender = EmailSender(); print(sender.send_bulletin(Path('output/test.mp3'), 'Test Profile', 'recipient@example.com'))"
```

**Test config loading:**
```bash
python3 -c "from app import load_config; import json; print(json.dumps(load_config(), indent=2))"
```

### Code Style

- **Australian English**: colour, organise, centre, analyse
- **Docstrings**: Include for all classes and public methods
- **Type hints**: Optional but encouraged for complex functions
- **Error handling**: Catch specific exceptions, log errors, return None or False on failure
- **Logging**: Use `logger.info()` for progress, `logger.error()` for failures

### Adding New Features

**Example: Add podcast intro music**
1. Add intro MP3 file to `static/audio/intro.mp3`
2. Modify `main.py` → `combine_audio_files()` to prepend intro
3. Add configuration option in `config.json` for intro enable/disable
4. Update web UI with toggle checkbox
5. Test with various profiles
6. Update CLAUDE.md documentation

## Git Workflow

### Current State
- **Branch**: main
- **Last commit**: Initial commit (4e962bd)
- **Untracked**: `qbit/` and `quantium-brand-guidelines/` (reference materials, not used by app)

### Making Commits

Follow standard git workflow:
```bash
git add <files>
git commit -m "Subject line

Detailed description of changes.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

### Protected Files (Never Commit)
- `.env` - Contains SMTP credentials
- `output/*.mp3` - Generated audio files (large)
- `token.json` - OAuth tokens (if added in future)
- `__pycache__/` - Python cache

All protected files are listed in `.gitignore`.

## Future Enhancement Ideas

- **Scheduling UI**: Add web-based cron job configuration
- **Audio effects**: Volume normalisation, compression, EQ
- **Playlist mode**: Generate multiple bulletins with different source combinations
- **Export formats**: Support for other audio formats (OGG, AAC)
- **Cloud storage**: Integration with S3/Dropbox for large files
- **RSS feed validation**: Check feeds before saving
- **Audio preview**: Play samples of each source before combining
- **Batch generation**: Generate bulletins for all profiles at once
- **Analytics**: Track which sources are most popular
- **Mobile app**: React Native or Flutter companion app

## Related Files

- `EMAIL_SETUP_GUIDE.md` - Detailed SMTP configuration instructions
- `README.md` - User-facing documentation
- `.env.example` - Template for environment variables
- `requirements.txt` - Python package dependencies
