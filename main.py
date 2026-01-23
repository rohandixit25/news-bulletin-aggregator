#!/usr/bin/env python3
"""
News Bulletin Aggregator - Combines daily news bulletins into one audio file
"""

import os
import logging
from datetime import datetime
import feedparser
import requests
from pydub import AudioSegment
from pathlib import Path

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

        # News sources with RSS feed URLs (short bulletins: 1-5 minutes)
        self.news_sources = {
            'ABC News Top Stories': 'https://www.abc.net.au/feeds/101858056/podcast.xml',  # 60-90 seconds
            'BBC News 5min': 'https://podcast.voice.api.bbci.co.uk/rss/audio/p002vsmz?api_key=Wbek5zSqxz0Hk1blo5IBqbd9SCWIfNbT',  # 5 minutes
            'SBS News Updates': 'https://feeds.sbs.com.au/sbs-news-update',  # Morning/Midday/Evening bulletins
            'CNBC Business Update': 'https://feeds.simplecast.com/oloBAvaH',  # Market open/midday/close updates
            'CommSec Market Update': 'https://www.omnycontent.com/d/playlist/820f09cf-2ace-4180-a92d-aa4c0008f5fb/7ce30ada-3515-4538-a131-afef0177d550/1b3da022-8454-4155-8336-afef0177d567/podcast.rss',  # Australian market updates
            'AI News Daily': 'https://ai-news-daily.podigee.io/feed/mp3'  # 5 minute AI news briefing
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
            logger.info(f"Downloading from {source_name}: {latest_entry.get('title', 'Unknown')}")
            response = requests.get(audio_url, timeout=60)
            response.raise_for_status()

            # Save to temp directory
            file_extension = audio_url.split('.')[-1].split('?')[0]
            if file_extension not in ['mp3', 'wav', 'm4a', 'aac']:
                file_extension = 'mp3'

            filename = self.temp_dir / f"{source_name.replace(' ', '_')}.{file_extension}"
            filename.write_bytes(response.content)

            logger.info(f"Downloaded {source_name} bulletin: {filename}")
            return filename

        except Exception as e:
            logger.error(f"Error fetching {source_name}: {str(e)}")
            return None

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

        # Fetch latest bulletins from all sources
        downloaded_files = []
        for source_name, feed_url in self.news_sources.items():
            audio_file = self.fetch_latest_bulletin(source_name, feed_url)
            if audio_file:
                downloaded_files.append(audio_file)

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
        print(f"\n✅ Success! Your combined news bulletin is ready:")
        print(f"   {result}")
    else:
        print("\n❌ Failed to generate bulletin. Check logs for details.")


if __name__ == '__main__':
    main()
