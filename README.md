# News Bulletin Aggregator

Automatically downloads and combines daily news bulletins from multiple sources (ABC, BBC, SBS, CNBC, CommSec, AI News) into a single audio file. Features web interface with profile management and mobile Progressive Web App for iPhone.

## Features

### Audio Aggregation
- ✅ Fetches latest bulletins from 6 configurable news sources
- ✅ Combines them into one continuous audio file
- ✅ Simple, no API keys required for news sources
- ✅ Saves as MP3 for easy playback on any device

### Web Interface
- ✅ Profile management - customise sources for different users
- ✅ Enable/disable sources per profile
- ✅ Add custom RSS podcast feeds
- ✅ One-click bulletin generation
- ✅ Email delivery with attachments
- ✅ Recent files browser

### Mobile App (PWA)
- ✅ Install as app icon on iPhone home screen
- ✅ One-tap playback of latest bulletin
- ✅ Lock screen controls (play/pause/skip)
- ✅ Background playback
- ✅ Playback speed control (0.75x - 2.0x)
- ✅ Works offline once loaded

## Requirements

- Python 3.7+
- ffmpeg (for audio processing)

## Installation

### 1. Install ffmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Debian/Ubuntu:**
```bash
sudo apt-get install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/download.html

### 2. Install Python dependencies

```bash
cd /workspace/news_bulletin_aggregator
pip install -r requirements.txt
```

## Usage

### Option 1: Web Interface (Recommended)

Start the web server:

```bash
python3 app.py
```

Then open your browser to `http://localhost:5000` to:
- Configure your news source preferences
- Create profiles for different users
- Generate bulletins with one click
- Email bulletins to yourself
- Download recent files

### Option 2: Command Line (Quick Test)

Run the aggregator directly:

```bash
python3 main.py
```

This will:
1. Fetch the latest bulletin from each news source
2. Download the audio files
3. Combine them into one MP3 file
4. Save to `output/news_bulletin_YYYY-MM-DD.mp3`

### Option 3: Mobile Player (iPhone)

1. Start the web server: `python3 app.py`
2. On your iPhone, open Safari and go to `http://YOUR_IP:5000/player`
3. Tap "Share" → "Add to Home Screen"
4. Tap the new app icon to instantly play your latest bulletin

**See `IPHONE_SETUP.md` for complete mobile setup instructions.**

## Output

Generated bulletins are saved in the `output/` directory:

```
output/rohan_2026-01-23_08-30-00.mp3
output/news_bulletin_2026-01-23.mp3
```

Access via:
- **Web interface**: Recent files section with download button
- **Mobile player**: Automatically loads latest bulletin
- **Direct file**: Transfer via AirDrop or file sharing

## Customisation

### Change News Sources

Edit `main.py` lines 34-39 to add/remove news sources:

```python
self.news_sources = {
    'ABC News': 'https://www.abc.net.au/news/feed/51120/rss.xml',
    'SBS News': 'https://www.sbs.com.au/news/podcast/feed',
    'BBC News': 'https://podcasts.files.bbci.co.uk/p02nq0gn.rss',
    'CNBC': 'https://www.cnbc.com/id/100727362/device/rss/rss.html'
}
```

### Adjust Silence Between Bulletins

Edit `main.py` line 115 to change the gap between bulletins (currently 2 seconds):

```python
silence = AudioSegment.silent(duration=2000)  # milliseconds
```

## Automation

### Run Daily with Cron (Linux/macOS)

Add to crontab to run every day at 7 AM:

```bash
crontab -e
```

Add this line:
```
0 7 * * * cd /workspace/news_bulletin_aggregator && /usr/bin/python3 main.py
```

### Run Daily with Task Scheduler (Windows)

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger to Daily at your preferred time
4. Action: Start a program
5. Program: `python`
6. Arguments: `main.py`
7. Start in: `C:\path\to\news_bulletin_aggregator`

## Troubleshooting

### "No audio found in latest bulletin"

Some RSS feeds may not have audio enclosures. The script will skip these and continue with other sources.

### "ffmpeg not found"

Install ffmpeg (see Installation section above). pydub requires ffmpeg for audio processing.

### Feeds Not Loading

Some news sources may change their RSS feed URLs. Check the source website for updated podcast/RSS feed URLs.

## News Source Details

- **ABC News**: Australian Broadcasting Corporation news bulletins
- **SBS News**: Special Broadcasting Service news podcasts
- **BBC News**: British Broadcasting Corporation global news
- **CNBC**: Business and financial news

All sources provide free podcast RSS feeds with regular updates (typically daily or multiple times per day).
