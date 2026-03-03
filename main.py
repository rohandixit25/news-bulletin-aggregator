#!/usr/bin/env python3
"""
News Bulletin Aggregator - Combines daily news bulletins into one audio file
"""

import logging
import time
from calendar import timegm
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import feedparser
import requests
from pydub import AudioSegment

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class NewsBulletinAggregator:
    """Fetches and combines news bulletins from multiple sources"""

    def __init__(self, output_dir='./output'):
        """
        Initialise the aggregator

        Args:
            output_dir: Directory to save downloaded and combined audio files
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

        # Temporary directory for downloaded files
        self.temp_dir = self.output_dir / 'temp'
        self.temp_dir.mkdir(exist_ok=True)

        # News sources with RSS feed URLs (short bulletins: 1-5 min)
        self.news_sources = {
            'ABC News Top Stories': (  # 60-90 seconds
                'https://www.abc.net.au/feeds/101858056/podcast.xml'
            ),
            'BBC News 5min': (  # 5 minutes
                'https://podcast.voice.api.bbci.co.uk/rss/audio/'
                'p002vsmz?api_key=Wbek5zSqxz0Hk1blo5IBqbd9SCWIfNbT'
            ),
            'SBS News Updates': (  # Morning/Midday/Evening
                'https://feeds.sbs.com.au/sbs-news-update'
            ),
            'CNBC Business Update': (  # Market updates
                'https://feeds.simplecast.com/oloBAvaH'
            ),
            'CommSec Market Update': (  # AU market updates
                'https://www.omnycontent.com/d/playlist/'
                '820f09cf-2ace-4180-a92d-aa4c0008f5fb/'
                '7ce30ada-3515-4538-a131-afef0177d550/'
                '1b3da022-8454-4155-8336-afef0177d567/'
                'podcast.rss'
            ),
            'AI News Daily': (  # 5 minute AI news
                'https://ai-news-daily.podigee.io/feed/mp3'
            ),
        }

    def fetch_latest_bulletin(self, source_name, feed_url):
        """
        Fetch the latest audio bulletin from an RSS feed

        Args:
            source_name: Name of the news source
            feed_url: URL of the RSS feed

        Returns:
            Path to downloaded audio file, or None if failed
        """
        try:
            logger.info(f"Fetching latest bulletin from {source_name}...")
            feed = feedparser.parse(feed_url)

            if not feed.entries:
                logger.warning(f"No entries found in {source_name} feed")
                return None

            # Get the latest entry
            latest_entry = feed.entries[0]

            # Find audio enclosure
            audio_url = None
            for enclosure in latest_entry.get('enclosures', []):
                if 'audio' in enclosure.get('type', ''):
                    audio_url = enclosure.get('href') or enclosure.get('url')
                    break

            if not audio_url:
                logger.warning(f"No audio found in latest {source_name} bulletin")
                return None

            # Download the audio file
            title = latest_entry.get('title', 'Unknown')
            logger.info("Downloading from %s: %s", source_name, title)
            response = requests.get(audio_url, timeout=60)
            response.raise_for_status()

            # Save to temp directory
            url_path = urlparse(audio_url).path
            file_extension = url_path.rsplit('.', 1)[-1] if '.' in url_path else 'mp3'
            if file_extension not in ['mp3', 'wav', 'm4a', 'aac']:
                file_extension = 'mp3'

            safe_name = source_name.replace(' ', '_')
            filename = self.temp_dir / f"{safe_name}.{file_extension}"
            filename.write_bytes(response.content)

            logger.info(f"Downloaded {source_name} bulletin: {filename}")
            return filename

        except Exception as e:
            logger.error(f"Error fetching {source_name}: {str(e)}")
            return None

    @staticmethod
    def normalise_audio(segment, target_dbfs=-20.0):
        """
        Normalise an audio segment to target loudness level.

        Args:
            segment: pydub AudioSegment
            target_dbfs: Target loudness in dBFS (default -20.0)

        Returns:
            Normalised AudioSegment
        """
        current_dbfs = segment.dBFS
        if current_dbfs == float('-inf'):
            return segment
        gain_needed = target_dbfs - current_dbfs
        return segment.apply_gain(gain_needed)

    def fetch_bulletins_parallel(self, max_workers=4):
        """
        Fetch bulletins from all sources in parallel using ThreadPoolExecutor.

        Args:
            max_workers: Maximum concurrent downloads

        Returns:
            List of (source_name, file_path) tuples preserving source identity,
            ordered by self.news_sources key order.
        """
        results = {}

        def _fetch(source_name, feed_url):
            audio_file = self.fetch_latest_bulletin(source_name, feed_url)
            return source_name, audio_file

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(_fetch, name, url): name
                for name, url in self.news_sources.items()
            }
            for future in as_completed(futures):
                try:
                    source_name, audio_file = future.result()
                    if audio_file:
                        results[source_name] = audio_file
                except Exception as e:
                    source_name = futures[future]
                    logger.error(f"Parallel fetch error for {source_name}: {str(e)}")

        # Preserve original source ordering
        ordered = []
        for name in self.news_sources:
            if name in results:
                ordered.append((name, results[name]))
        return ordered

    def check_feed_staleness(self, source_name, feed_url, max_age_hours=12):
        """
        Check if an RSS feed's latest entry is stale.

        Args:
            source_name: Name of the news source
            feed_url: URL of the RSS feed
            max_age_hours: Hours after which a feed is considered stale

        Returns:
            Dict with {stale: bool, age_hours: float, latest_title: str}
        """
        try:
            feed = feedparser.parse(feed_url)
            if not feed.entries:
                return {'stale': True, 'age_hours': None, 'latest_title': None}

            latest = feed.entries[0]
            title = latest.get('title', 'Unknown')

            published = latest.get('published_parsed') or latest.get('updated_parsed')
            if published:
                entry_timestamp = timegm(published)
                age_hours = (time.time() - entry_timestamp) / 3600
                return {
                    'stale': age_hours > max_age_hours,
                    'age_hours': round(age_hours, 1),
                    'latest_title': title
                }
            else:
                return {'stale': False, 'age_hours': None, 'latest_title': title}

        except Exception as e:
            logger.error(f"Staleness check failed for {source_name}: {str(e)}")
            return {'stale': True, 'age_hours': None, 'latest_title': None}

    def combine_audio_files(self, audio_files, output_filename):
        """
        Combine multiple audio files into one

        Args:
            audio_files: List of paths to audio files
            output_filename: Name for the combined output file

        Returns:
            Path to combined audio file
        """
        if not audio_files:
            raise ValueError("No audio files to combine")

        logger.info(f"Combining {len(audio_files)} audio files...")

        combined = AudioSegment.empty()

        for audio_file in audio_files:
            try:
                logger.info(f"Adding {audio_file.name}...")
                audio = AudioSegment.from_file(str(audio_file))
                audio = self.normalise_audio(audio)
                combined += audio

                # Add 2 second silence between bulletins
                silence = AudioSegment.silent(duration=2000)
                combined += silence

            except Exception as e:
                logger.error(f"Error processing {audio_file}: {str(e)}")
                continue

        # Save combined file
        output_path = self.output_dir / output_filename
        combined.export(str(output_path), format='mp3')

        logger.info(f"Combined audio saved to {output_path}")
        logger.info(f"Total duration: {len(combined) / 1000 / 60:.1f} minutes")

        return output_path

    def cleanup_temp_files(self):
        """Remove temporary downloaded files"""
        for file in self.temp_dir.iterdir():
            if file.is_file():
                file.unlink()
        logger.info("Cleaned up temporary files")

    def generate_daily_bulletin(self):
        """Main method to generate combined daily bulletin"""
        logger.info("Starting news bulletin aggregation...")

        # Fetch latest bulletins from all sources in parallel
        results = self.fetch_bulletins_parallel()
        downloaded_files = [file_path for _, file_path in results]

        if not downloaded_files:
            logger.error("No audio files were downloaded successfully")
            return None

        # Combine all bulletins
        today = datetime.now().strftime('%Y-%m-%d')
        output_filename = f"news_bulletin_{today}.mp3"

        combined_file = self.combine_audio_files(downloaded_files, output_filename)

        # Cleanup
        self.cleanup_temp_files()

        logger.info(f"✅ Daily bulletin ready: {combined_file}")
        return combined_file


def main():
    """Main entry point"""
    aggregator = NewsBulletinAggregator()
    result = aggregator.generate_daily_bulletin()

    if result:
        print("\n✅ Success! Your combined news bulletin is ready:")
        print(f"   {result}")
    else:
        print("\n❌ Failed to generate bulletin. Check logs for details.")


if __name__ == '__main__':
    main()
